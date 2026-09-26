// IA de combate a pie (Los Devueltos y la policía): acercarse, avisar, disparar a ráfagas,
// cubrirse detrás de algo y flanquear. Justa: no acierta desde lejos y avisa antes del primer tiro.
import * as THREE from 'three';
import type { Game } from '../core/game';
import type { Npc } from '../actors/npc';
import type { Combat } from '../combat/combat';
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
}

const SHOUTS_POLICE = ['¡Alto, policía!', '¡Al suelo, repartidor!', '¡Manos donde pueda verlas!', '¡Documentación y paquetes!'];
const SHOUTS_GANG = ['¡Ese paquete es nuestro!', '¡Devuélvenos la mercancía!', '¡A por el repartidor!', '¡Te vamos a devolver al remitente!'];

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpDir = new THREE.Vector3();

export function makeCombatBrain(side: 'police' | 'gang', weapon: WeaponId): CombatBrain {
  return {
    side, weapon, mode: 'idle', los: false, losTimer: 0, telegraph: 0, warned: false, fireTimer: 0, burst: 0,
    modeTimer: 0, goal: null, lastHurt: -99, arrestOnly: false, aggro: false, home: null, shouted: 0,
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
    const hit = game.physics.raycast(eye, dir, len - 0.5, SOLID, npc.collider);
    b.los = !hit && len < 70;
    if (b.los && dist < 45) b.aggro = true;
  }
  if (!b.aggro) {
    npc.aiming = false;
    return;
  }

  const def = WEAPONS[b.weapon];
  const range = Math.min(def.range * 0.8, b.side === 'police' ? 38 : 34);
  b.modeTimer -= dt;
  b.fireTimer -= dt;

  // gritar de vez en cuando
  if (game.time.elapsed - b.shouted > 6 && dist < 30 && rnd.next() < dt * 0.6) {
    b.shouted = game.time.elapsed;
    const list = b.side === 'police' ? SHOUTS_POLICE : SHOUTS_GANG;
    game.events.emit('npc:shout' as any, { npc, text: list[Math.floor(rnd.next() * list.length)] } as any);
    game.mod.audio?.say(npc.position, 4, npc.voice, 0.7);
  }

  // arresto: la policía con pocas sirenas va a por ti sin disparar
  if (b.arrestOnly) {
    npc.aiming = false;
    if (dist > 1.4) npc.goTo(target.clone().setY(npc.position.y), dist > 6);
    else {
      npc.stop();
      npc.face(target);
    }
    return;
  }

  // decidir modo
  const recentlyHurt = game.time.elapsed - b.lastHurt < 1.5;
  if (b.modeTimer <= 0) {
    if (!b.los || dist > range) {
      b.mode = 'approach';
      b.modeTimer = 1.2;
    } else if (recentlyHurt && rnd.next() < 0.6) {
      const cover = findCover(game, npc.position, target);
      if (cover) {
        b.mode = 'cover';
        b.goal = cover;
        b.modeTimer = 2 + rnd.next() * 1.5;
      } else {
        b.mode = 'flank';
        b.goal = flankPoint(npc.position, target);
        b.modeTimer = 1.5;
      }
    } else if (rnd.next() < 0.25) {
      b.mode = 'flank';
      b.goal = flankPoint(npc.position, target);
      b.modeTimer = 1.4 + rnd.next();
    } else {
      b.mode = 'engage';
      b.modeTimer = 1.5 + rnd.next() * 1.5;
    }
  }

  switch (b.mode) {
    case 'approach':
      npc.aiming = false;
      b.warned = false;
      npc.goTo(target.clone().setY(npc.position.y), true);
      break;
    case 'cover':
    case 'flank':
      if (b.goal) npc.goTo(b.goal, true);
      npc.aiming = b.mode === 'flank';
      if (b.mode === 'flank') tryShoot(game, npc, b, target, dist, combat, 0.5);
      break;
    case 'engage':
      npc.stop();
      npc.face(target);
      npc.aiming = true;
      tryShoot(game, npc, b, target, dist, combat, 1);
      break;
  }
}

function tryShoot(game: Game, npc: Npc, b: CombatBrain, target: THREE.Vector3, dist: number, combat: Combat, rateK: number) {
  if (!b.los) return;
  // aviso antes del primer disparo
  if (!b.warned) {
    if (b.telegraph <= 0) b.telegraph = 0.8;
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
  b.fireTimer = b.burst > 0 ? baseDelay : 1.1 + rnd.next() * 1.2;
  const muzzle = npc.rig.handWorldPosition(new THREE.Vector3());
  // dispersión: cuanto más lejos y si vas en coche rápido, más fallan
  const v = game.mod.vehicles?.current;
  const moving = v ? Math.min(2, Math.abs(v.speed) / 12) : 0;
  const spreadMul = 2.2 + dist / 7 + moving * 2;
  // disparan a un punto algo desviado, no al centro exacto
  const aim = target.clone();
  aim.x += (rnd.next() - 0.5) * 0.8;
  aim.y += (rnd.next() - 0.5) * 0.6;
  aim.z += (rnd.next() - 0.5) * 0.8;
  npc.shotPulse = true;
  // daño reducido para NPCs (justo)
  const npcDef = { ...def, damage: def.damage * (b.side === 'police' ? 0.45 : 0.4) };
  combat.fire({ kind: 'npc', npc, exclude: npc.collider }, npcDef, muzzle, aim, spreadMul);
}

/** Busca un sitio a cubierto: un punto cercano desde el que no se ve al objetivo. */
export function findCover(game: Game, from: THREE.Vector3, threat: THREE.Vector3): THREE.Vector3 | null {
  const world = game.world;
  let best: THREE.Vector3 | null = null;
  let bestD = Infinity;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + rnd.next() * 0.3;
    const r = 3 + rnd.next() * 5;
    const c = new THREE.Vector3(from.x + Math.cos(a) * r, 0, from.z + Math.sin(a) * r);
    if (!world.isLand(c.x, c.z)) continue;
    c.y = world.heightAt(c.x, c.z);
    const eye = new THREE.Vector3(c.x, c.y + 1.1, c.z);
    // no meterse dentro de un edificio
    const inside = game.physics.raycast(eye.clone().setY(eye.y + 20), new THREE.Vector3(0, -1, 0), 19.5, G.STATIC);
    if (inside) continue;
    const dir = threat.clone().sub(eye);
    const hit = game.physics.raycast(eye, dir, dir.length() - 0.5, SOLID | G.VEHICLE);
    if (hit && hit.distance < 4) {
      const d = c.distanceTo(from);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
  }
  return best;
}

export function flankPoint(from: THREE.Vector3, threat: THREE.Vector3): THREE.Vector3 {
  const to = threat.clone().sub(from).setY(0).normalize();
  const side = rnd.next() < 0.5 ? 1 : -1;
  const perp = new THREE.Vector3(-to.z * side, 0, to.x * side);
  return from.clone().addScaledVector(perp, 4 + rnd.next() * 4).addScaledVector(to, rnd.next() * 3);
}
