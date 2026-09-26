// IA de combate a pie (Los Devueltos y la policía): acercarse, avisar, disparar a ráfagas,
// cubrirse detrás de algo y flanquear. Justa: no acierta desde lejos y avisa antes del primer tiro.
// Si no te ve, va por las calles (no en línea recta contra las paredes).
import * as THREE from 'three';
import type { Game } from '../core/game';
import type { Npc } from '../actors/npc';
import type { Combat } from '../combat/combat';
import type { Roads } from './roads';
import { WEAPONS, type WeaponId } from '../combat/weapons';
import { makeGunMesh } from '../combat/gunModels';
import { SOLID, G } from '../core/physics';
import { fx as rnd } from '../core/rng';

export interface CombatBrain {
  side: 'police' | 'gang';
  weapon: WeaponId;
  mode: 'approach' | 'engage' | 'cover' | 'flank' | 'arrest' | 'idle' | 'patrol';
  los: boolean;
  losTimer: number;
  telegraph: number; // cuenta atrás del aviso antes de disparar
  warned: boolean;
  fireTimer: number;
  burst: number;
  modeTimer: number;
  goal: THREE.Vector3 | null;
  lastHurt: number;
  /** Solo quiere detener (policía con pocas sirenas). */
  arrestOnly: boolean;
  aggro: boolean; // ya ha detectado al jugador
  home: THREE.Vector3 | null; // punto de patrulla
  shouted: number;
  /** Ruta por las calles cuando no ve al jugador. */
  path: THREE.Vector3[] | null;
  pathTimer: number;
  /** Si no te ve, va a este punto en vez de a donde estás (la policía: donde te vieron por última vez). */
  hunt: THREE.Vector3 | null;
  /** Control de carretera: no se aleja de aquí salvo que estés cerca. */
  holdAt: THREE.Vector3 | null;
  /** Multiplicador de daño de sus disparos (el jefe pega más). */
  dmgMul: number;
  /** Puntería propia (si no, la de su bando). La policía la sube con las sirenas. */
  acc: number | null;
  /** Distancia desde la que se para a disparar (si no, la de su arma). Con muchas sirenas se acercan más. */
  engageRange: number | null;
}

const SHOUTS_POLICE = ['¡Alto, policía!', '¡Al suelo, repartidor!', '¡Manos donde pueda verlas!', '¡Documentación y paquetes!'];
const SHOUTS_GANG = ['¡Ese paquete es nuestro!', '¡Devuélvenos la mercancía!', '¡A por el repartidor!', '¡Te vamos a devolver al remitente!'];
/** Aviso justo antes de empezar a disparar (para que se note que van a disparar). */
const WARN_POLICE = ['¡Alto o disparo!', '¡Policía! ¡Quieto!', '¡Suelta el arma!'];
const WARN_GANG = ['¡Ahí está!', '¡Te tengo, repartidor!', '¡Quieto ahí!', '¡Firma aquí… con plomo!'];
/** Último aviso gritado por cualquiera (para que no griten seis a la vez). */
let lastWarn = -99;

/** Daño de sus armas respecto al del jugador (los enemigos pegan bastante menos: justo). */
const DMG_GANG = 0.27;
const DMG_POLICE = 0.29;
/**
 * Puntería: probabilidad de que un disparo vaya a darte (de cerca y quieto). Luego baja con la
 * distancia y si te mueves. Los que fallan pasan silbando cerca (se ven las trazadoras), no a un metro de ti.
 */
const ACC_GANG = 0.4;
const ACC_POLICE = 0.46;
const tmpSide = new THREE.Vector3();

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
const tmpGo = new THREE.Vector3();
const tmpMuzzle = new THREE.Vector3();
const tmpAim = new THREE.Vector3();
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

export function makeCombatBrain(side: 'police' | 'gang', weapon: WeaponId): CombatBrain {
  return {
    side, weapon, mode: 'idle', los: false, losTimer: rnd.next() * 0.3, telegraph: 0, warned: false, fireTimer: 0, burst: 0,
    modeTimer: 0, goal: null, lastHurt: -99, arrestOnly: false, aggro: false, home: null, shouted: 0,
    path: null, pathTimer: 0, hunt: null, holdAt: null, dmgMul: 1, acc: null, engageRange: null,
  };
}

/** Arma visible en la mano del NPC. */
export function armNpc(npc: Npc, weapon: WeaponId) {
  const m = makeGunMesh(weapon);
  if (m) npc.rig.attach('handR', m);
  const def = WEAPONS[weapon];
  npc.weapon = def.hold === 'none' ? 'none' : def.hold;
}

/** Punto de mira del jugador (pecho), a pie o en vehículo. */
export function playerAimPoint(game: Game, out: THREE.Vector3): THREE.Vector3 {
  const p = game.mod.player;
  const v = game.mod.vehicles?.current;
  if (v) return v.getPosition(out);
  return out.copy(p.position).setY(p.position.y + 1.2);
}

function flatDist(a: THREE.Vector3, b: THREE.Vector3) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function updateCombatant(game: Game, npc: Npc, dt: number) {
  const b = npc.brain as CombatBrain;
  if (!b || !npc.alive || npc.busy || npc.vehicle) {
    npc.aiming = false;
    return;
  }
  const p = game.mod.player;
  if (!p || p.state === 'dead') {
    npc.aiming = false;
    npc.stop();
    return;
  }
  const combat = game.mod.combat as Combat;
  const target = playerAimPoint(game, tmpV);
  const eye = tmpV2.copy(npc.position).setY(npc.position.y + 1.5);
  const dist = eye.distanceTo(target);

  // línea de visión (cada 0,35 s)
  b.losTimer -= dt;
  if (b.losTimer <= 0) {
    b.losTimer = 0.35;
    const dir = tmpDir.copy(target).sub(eye);
    const len = dir.length();
    const hit = len < 70 ? game.physics.raycast(eye, dir, len - 0.5, SOLID, npc.collider) : null;
    b.los = len < 70 && !hit;
    if (b.los && dist < 45) b.aggro = true;
  }
  if (!b.aggro) {
    npc.aiming = false;
    return;
  }

  const def = WEAPONS[b.weapon];
  const range = b.engageRange ?? Math.min(def.range * 0.8, b.side === 'police' ? 36 : 32);
  b.modeTimer -= dt;
  b.fireTimer -= dt;

  // gritar de vez en cuando
  if (game.time.elapsed - b.shouted > 6 && dist < 30 && rnd.next() < dt * 0.6) {
    b.shouted = game.time.elapsed;
    const list = b.side === 'police' ? SHOUTS_POLICE : SHOUTS_GANG;
    game.events.emit('npc:shout' as any, { npc, text: list[Math.floor(rnd.next() * list.length)] } as any);
    game.mod.audio?.say(npc.position, 4, npc.voice, 0.7);
  }

  // control de carretera: si el jugador no está cerca del control, se quedan en su sitio (a cubierto tras el coche)
  if (b.holdAt && flatDist(b.holdAt, target) > 30) {
    if (flatDist(npc.position, b.holdAt) > 2) {
      const wp = nextWaypoint(game, npc, b, b.holdAt, dt);
      if (wp) npc.goTo(tmpGo.copy(wp).setY(npc.position.y), true);
      else npc.stop();
    } else {
      npc.stop();
      npc.face(target);
    }
    // desde su puesto devuelven el fuego también de más lejos (fallan mucho a esa distancia, pero no eres invisible)
    npc.aiming = b.los && dist < Math.max(range, 45) && !b.arrestOnly;
    if (npc.aiming && flatDist(npc.position, b.holdAt) <= 2) tryShoot(game, npc, b, target, dist, combat, 0.7);
    return;
  }

  // arresto: la policía con pocas sirenas va a por ti sin disparar
  if (b.arrestOnly) {
    npc.aiming = false;
    if (dist > 1.4) {
      const wp = nextWaypoint(game, npc, b, b.hunt && !b.los ? b.hunt : target, dt);
      if (wp) npc.goTo(tmpGo.copy(wp).setY(npc.position.y), dist > 6);
      else npc.stop();
    } else {
      npc.stop();
      npc.face(target);
    }
    return;
  }

  // atascado contra una pared en medio de una maniobra: cambiar de plan
  if (npc.blockedTime > 0.8 && (b.mode === 'flank' || b.mode === 'cover')) {
    npc.blockedTime = 0;
    b.modeTimer = 0;
    b.mode = 'engage';
  }

  // decidir modo
  const recentlyHurt = game.time.elapsed - b.lastHurt < 1.5;
  if (b.modeTimer <= 0) {
    if (!b.los || dist > range) {
      b.mode = 'approach';
      b.modeTimer = 1.2;
    } else if (recentlyHurt && rnd.next() < 0.6) {
      const cover = findCover(game, npc.position, target);
      const flank = cover ? null : flankPoint(npc.position, target, game);
      if (cover) {
        b.mode = 'cover';
        b.goal = cover;
        b.modeTimer = 2 + rnd.next() * 1.5;
      } else if (flank) {
        b.mode = 'flank';
        b.goal = flank;
        b.modeTimer = 1.5;
      } else {
        b.mode = 'engage';
        b.modeTimer = 1.2 + rnd.next();
      }
    } else if (rnd.next() < 0.25) {
      const flank = flankPoint(npc.position, target, game);
      b.mode = flank ? 'flank' : 'engage';
      b.goal = flank;
      b.modeTimer = 1.4 + rnd.next();
    } else {
      b.mode = 'engage';
      b.modeTimer = 1.5 + rnd.next() * 1.5;
    }
  }

  switch (b.mode) {
    case 'approach': {
      npc.aiming = false;
      b.warned = false;
      const wp = nextWaypoint(game, npc, b, b.hunt && !b.los ? b.hunt : target, dt);
      if (wp && flatDist(npc.position, wp) > 1) npc.goTo(tmpGo.copy(wp).setY(npc.position.y), true);
      else {
        // ha llegado a donde te vio y no te ve: mira alrededor
        npc.stop();
        npc.heading += dt * 1.2;
      }
      break;
    }
    case 'cover':
    case 'flank':
      if (b.goal) npc.goTo(b.goal, true);
      npc.aiming = b.mode === 'flank';
      if (b.mode === 'flank') tryShoot(game, npc, b, target, dist, combat, 0.5);
      break;
    case 'engage':
      // con arma de fuego, a quemarropa no: se aparta unos pasos (disparando) y luego sigue
      if (def.mode !== 'melee' && dist < 3.5) {
        const away = new THREE.Vector3().copy(npc.position).sub(target).setY(0);
        if (away.lengthSq() < 0.01) away.set(rnd.next() - 0.5, 0, rnd.next() - 0.5);
        const side = tmpDir.set(-away.z, 0, away.x).normalize().multiplyScalar(rnd.next() < 0.5 ? -2 : 2);
        away.normalize().multiplyScalar(3.5).add(side).add(npc.position);
        if (reachable(game, npc.position, away)) {
          away.y = game.world.heightAt(away.x, away.z);
          b.mode = 'flank';
          b.goal = away;
          b.modeTimer = 1;
          break;
        }
      }
      npc.stop();
      npc.face(target);
      npc.aiming = true;
      tryShoot(game, npc, b, target, dist, combat, 1);
      break;
  }
}

/**
 * Siguiente punto hacia `goal`: directo si lo ve o está cerca; si no, por las calles (ruta del grafo).
 */
function nextWaypoint(game: Game, npc: Npc, b: CombatBrain, goal: THREE.Vector3, dt: number): THREE.Vector3 | null {
  const d = flatDist(npc.position, goal);
  if (d < 1.2) return null;
  const roads = game.mod.traffic?.roads as Roads | undefined;
  b.pathTimer -= dt;
  // a la vista, muy cerca o muy lejos (nadie lo ve): directo
  if (!roads || (b.los && npc.blockedTime < 0.5) || (d < 8 && npc.blockedTime < 0.5) || d > 120) {
    b.path = null;
    return goal;
  }
  // (como mucho una ruta nueva cada segundo y pico por cabeza: si te ve a ratos, no recalcula sin parar)
  if (!b.path && b.pathTimer > 1.5 && npc.blockedTime <= 1.2) return goal;
  if (!b.path || !b.path.length || b.pathTimer <= 0 || npc.blockedTime > 1.2) {
    b.pathTimer = 3 + rnd.next();
    b.path = roads.route(npc.position, goal);
    // si se ha quedado atascado (una valla, un rincón), primero un rodeo: la dirección más despejada
    // que no le aleje demasiado de donde quiere ir
    if (npc.blockedTime > 1.2) {
      const detour = openDirection(game, npc.position, goal);
      if (detour) b.path.unshift(detour);
      npc.blockedTime = 0;
    }
  }
  const path = b.path;
  while (path.length > 1 && flatDist(path[0], npc.position) < 2.5) path.shift();
  // atajo: si ya se ve el siguiente punto de la ruta, saltarse el actual
  if (path.length > 1 && game.time.frame % 20 === npc.id % 20) {
    const o = tmpA.copy(npc.position).setY(npc.position.y + 0.8);
    const to = tmpB.copy(path[1]).setY(path[1].y + 0.8).sub(o);
    const len = to.length();
    if (len > 0.1 && !game.physics.raycast(o, to, len, G.STATIC)) path.shift();
  }
  // el último punto sigue al objetivo (el jugador se mueve)
  path[path.length - 1].copy(goal);
  return path[0];
}

function tryShoot(game: Game, npc: Npc, b: CombatBrain, target: THREE.Vector3, dist: number, combat: Combat, rateK: number) {
  if (!b.los) return;
  // aviso antes del primer disparo
  if (!b.warned) {
    if (b.telegraph <= 0) {
      b.telegraph = 0.8;
      const now = game.time.elapsed;
      if (now - lastWarn > 1.5 && now - b.shouted > 3) {
        lastWarn = b.shouted = now;
        const list = b.side === 'police' ? WARN_POLICE : WARN_GANG;
        game.events.emit('npc:shout' as any, { npc, text: list[Math.floor(rnd.next() * list.length)] } as any);
        game.mod.audio?.say(npc.position, 3, npc.voice, 0.8);
      }
    }
    b.telegraph -= game.time.dt;
    npc.aiming = true;
    if (b.telegraph > 0) return;
    b.warned = true;
  }
  if (b.fireTimer > 0) return;
  const def = WEAPONS[b.weapon];
  // ráfagas: los enemigos disparan más lento que el jugador
  const baseDelay = Math.max(0.28, 1 / def.rate) / rateK;
  if (b.burst <= 0) {
    b.burst = def.auto ? 3 + Math.floor(rnd.next() * 3) : 1 + Math.floor(rnd.next() * 2);
  }
  b.burst--;
  b.fireTimer = b.burst > 0 ? baseDelay : 1.5 + rnd.next() * 1.6;
  const muzzle = npc.rig.handWorldPosition(tmpMuzzle);
  // ¿este disparo va a dar? Depende de la distancia y de si te mueves (corriendo o en coche fallan más)
  const p = game.mod.player;
  const v = game.mod.vehicles?.current;
  let chance = (b.acc ?? (b.side === 'police' ? ACC_POLICE : ACC_GANG)) * THREE.MathUtils.clamp(1.15 - dist / 40, 0.2, 1);
  if (v) chance *= 1 - Math.min(0.65, Math.abs(v.speed) / 28);
  else {
    const sp = Math.hypot(p.velocity.x, p.velocity.z);
    chance *= sp > 5 ? 0.55 : sp > 2 ? 0.75 : 1;
  }
  const aim = tmpAim.copy(target);
  let spreadMul: number;
  if (rnd.next() < chance) {
    // a dar: al cuerpo, con un poco de temblor
    aim.x += (rnd.next() - 0.5) * 0.3;
    aim.y += (rnd.next() - 0.5) * 0.4;
    aim.z += (rnd.next() - 0.5) * 0.3;
    spreadMul = def.pellets > 1 ? 2.5 : 0.6;
  } else {
    // fallo: pasa cerca, por un lado o por encima
    const fire = tmpDir.copy(target).sub(muzzle).setY(0).normalize();
    const side = tmpSide.set(-fire.z, 0, fire.x).multiplyScalar((rnd.next() < 0.5 ? -1 : 1) * (0.9 + rnd.next() * 1.1));
    aim.add(side);
    aim.y += (rnd.next() - 0.25) * 1.2;
    spreadMul = def.pellets > 1 ? 3 : 1.5;
  }
  npc.shotPulse = true;
  // daño reducido para NPCs (justo)
  const npcDef = { ...def, damage: def.damage * (b.side === 'police' ? DMG_POLICE : DMG_GANG) * b.dmgMul };
  combat.fire({ kind: 'npc', npc, exclude: npc.collider }, npcDef, muzzle, aim, spreadMul);
}

/** Punto de rodeo: mira en 8 direcciones y elige la más despejada que más le acerque a `goal`. */
function openDirection(game: Game, from: THREE.Vector3, goal: THREE.Vector3): THREE.Vector3 | null {
  const o = tmpA.set(from.x, from.y + 0.7, from.z);
  const gx = goal.x - from.x, gz = goal.z - from.z;
  const gl = Math.hypot(gx, gz) || 1;
  let best: THREE.Vector3 | null = null;
  let bestScore = 0;
  const a0 = rnd.next() * Math.PI * 2;
  for (let i = 0; i < 8; i++) {
    const a = a0 + (i / 8) * Math.PI * 2;
    const d = tmpB.set(Math.cos(a), 0, Math.sin(a));
    const hit = game.physics.raycast(o, d, 10, G.STATIC | G.VEHICLE);
    const free = hit ? hit.distance : 10;
    if (free < 2) continue;
    const toward = (d.x * gx + d.z * gz) / gl;
    const score = free * (1.3 + toward);
    if (score > bestScore) {
      bestScore = score;
      const k = Math.min(free - 0.8, 6);
      best = new THREE.Vector3(from.x + d.x * k, from.y, from.z + d.z * k);
    }
  }
  return best && game.world.isLand(best.x, best.z) ? best : null;
}

/** ¿Se puede ir andando en línea recta de `from` a `to` (sin paredes ni coches en medio)? */
function reachable(game: Game, from: THREE.Vector3, to: THREE.Vector3): boolean {
  if (!game.world.isLand(to.x, to.z)) return false;
  const o = tmpA.set(from.x, from.y + 0.7, from.z);
  const d = tmpB.set(to.x - from.x, 0, to.z - from.z);
  const len = d.length();
  if (len < 0.1) return true;
  return !game.physics.raycast(o, d, len + 0.4, G.STATIC | G.VEHICLE);
}

/** Busca un sitio a cubierto: un punto cercano desde el que no se ve al objetivo. */
export function findCover(game: Game, from: THREE.Vector3, threat: THREE.Vector3): THREE.Vector3 | null {
  const world = game.world;
  let best: THREE.Vector3 | null = null;
  let bestD = Infinity;
  const c = new THREE.Vector3();
  const eye = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const down = new THREE.Vector3(0, -1, 0);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + rnd.next() * 0.3;
    const r = 3 + rnd.next() * 5;
    c.set(from.x + Math.cos(a) * r, 0, from.z + Math.sin(a) * r);
    if (!world.isLand(c.x, c.z)) continue;
    c.y = world.heightAt(c.x, c.z);
    eye.set(c.x, c.y + 1.1, c.z);
    // no meterse dentro de un edificio
    const inside = game.physics.raycast(tmpV2.copy(eye).setY(eye.y + 20), down, 19.5, G.STATIC);
    if (inside) continue;
    dir.copy(threat).sub(eye);
    const hit = game.physics.raycast(eye, dir, dir.length() - 0.5, SOLID | G.VEHICLE);
    if (hit && hit.distance < 4) {
      const d = c.distanceTo(from);
      if (d < bestD && reachable(game, from, c)) {
        bestD = d;
        best = c.clone();
      }
    }
  }
  return best;
}

/** Punto para rodear al jugador por un lado (o null si no hay por dónde). */
export function flankPoint(from: THREE.Vector3, threat: THREE.Vector3, game?: Game): THREE.Vector3 | null {
  const to = new THREE.Vector3().copy(threat).sub(from).setY(0).normalize();
  const first = rnd.next() < 0.5 ? 1 : -1;
  for (const side of [first, -first]) {
    for (const k of [1, 0.55]) {
      const perp = tmpDir.set(-to.z * side, 0, to.x * side);
      const p = from.clone().addScaledVector(perp, (4 + rnd.next() * 4) * k).addScaledVector(to, rnd.next() * 3 * k);
      if (!game) return p;
      if (reachable(game, from, p)) {
        p.y = game.world.heightAt(p.x, p.z);
        return p;
      }
    }
  }
  return null;
}
