// Policía y nivel de búsqueda (1 a 5 sirenas).
// Sube si te ven robar coches, disparar, atropellar o destrozar. Se pierde escapando de su vista
// un rato o pasando por el taller de pintura del Polígono. Si te pillan: pierdes el efectivo y las armas pequeñas.
import * as THREE from 'three';
import type { Game, System } from '../core/game';
import type { Npc } from '../actors/npc';
import type { Poi } from '../core/contracts';
import type { Vehicle } from '../vehicles/vehicle';
import type { VehicleManager } from '../vehicles/manager';
import type { NpcManager } from '../actors/npcManager';
import type { Traffic, CarBrain } from './traffic';
import { Roads } from './roads';
import { makeCombatBrain, updateCombatant, armNpc, type CombatBrain } from './combatant';
import { randomLookFor } from '../actors/looks';
import { Rng, fx as rnd } from '../core/rng';
import { SOLID } from '../core/physics';
import type { Game as GameT } from '../core/game';

const HEAT_LEVELS = [0, 1, 3, 6, 10, 15];
/** Puntería de los agentes según las sirenas (ver combatant.ts). */
const POLICE_ACC = [0.46, 0.46, 0.46, 0.48, 0.55, 0.62];
/** Calor por cada disparo tuyo (antes 1: con defenderte de una emboscada llegabas a 5 sirenas). */
const HEAT_SHOT = 0.3;
/** Sin un policía delante, los disparos (la gente llamando) no pasan de 2 sirenas. */
const HEAT_CAP_UNSEEN_SHOTS = HEAT_LEVELS[3] - 0.01;
/** Por disparar, como mucho 1 de calor cada 2,5 s (una ráfaga de subfusil no dispara la búsqueda). */
const SHOT_HEAT_MAX = 1;
const SHOT_HEAT_REFILL = SHOT_HEAT_MAX / 2.5;
/** Tiroteo con la banda (defenderte o asaltarles): sin testigos no pasa de 1 sirena y con policía delante, de 2. */
const HEAT_CAP_GANG_UNSEEN = HEAT_LEVELS[2] - 0.01;
const HEAT_CAP_GANG_SEEN = HEAT_LEVELS[3] - 0.01;
/** Distancia a la que un enfrentamiento con la banda cuenta como «tiroteo con la banda». */
const GANG_FIGHT_DIST = 60;
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpE = new THREE.Vector3();
const tmpT = new THREE.Vector3();
const tmpF = new THREE.Vector3();
const tmpS = new THREE.Vector3();
/** Solo para remount() (offscreen() usa tmpF y tmpT). */
const tmpRP = new THREE.Vector3();
const tmpRD = new THREE.Vector3();

interface Unit extends ChaseNav {
  car: Vehicle;
  crew: Npc[];
  onFoot: boolean;
  roadblock: boolean;
  /** Los agentes vuelven andando a su coche (te has ido en coche): ver remount(). */
  returning?: boolean;
  /** Segundos que llevan volviendo al coche. */
  returnT?: number;
  /** Segundos hasta poder volver al coche (tras bajarse por un atasco, no se suben enseguida al mismo). */
  remountCool?: number;
}

/** Estado del «vigilante de atascos» de un coche perseguidor. */
export interface UnstickState {
  t: number;
  tries: number;
}

/**
 * Coches de persecución (policía y banda) que se quedan clavados contra una pared o en un giro
 * imposible: marcha atrás un momento (maniobra en tres tiempos). Devuelve true si, tras varios intentos,
 * sigue atascado (entonces conviene retirarlo si nadie lo ve).
 * El tiempo parado cuenta también durante las marchas atrás: antes no contaba, y un coche que reculaba
 * sin moverse (cuesta arriba o contra un bordillo) volvía a recular sin fin y no se daba nunca por atascado.
 */
export function unstickCar(car: Vehicle, brain: CarBrain, s: UnstickState, dt: number): boolean {
  const sp = Math.abs(car.speed);
  if (sp < 1.2) s.t += dt;
  else if (sp > 4) {
    s.t = 0;
    s.tries = 0;
  }
  if (s.t > 2.2 && brain.reverse <= 0) {
    s.t = 0;
    s.tries++;
    brain.reverse = 1.1 + rnd.next() * 0.7;
    brain.revT = 0;
  }
  return s.tries >= 3;
}

/** Estado de navegación de un coche perseguidor. */
export interface ChaseNav {
  route: THREE.Vector3[];
  routeTimer: number;
  /** Va directo al objetivo (lo ve o está muy cerca) en vez de por la ruta de calles. */
  direct?: boolean;
  unstick: UnstickState;
  /**
   * Segundos hasta poder hacer otra vez la maniobra de «media vuelta» (marcha atrás con el objetivo
   * detrás). Entre una y otra avanza girando: así sale una maniobra en tres tiempos de verdad y no
   * una marcha atrás eterna.
   */
  turnCool?: number;
}

const tmpN = new THREE.Vector3();
const tmpL = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();

/** Ruta por calles empezando por el cruce que el coche tiene delante (así no intenta dar la vuelta en mitad de una calle). */
function chaseRoute(roads: Roads, car: Vehicle, carPos: THREE.Vector3, target: THREE.Vector3): THREE.Vector3[] {
  const ne = roads.nearestEdge(carPos, true);
  if (!ne || ne.dist > 12) return roads.route(carPos, target, true);
  const e = roads.g.edges[ne.edge];
  const a = roads.g.nodes[e.a].pos, b = roads.g.nodes[e.b].pos;
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  const ahead = (b.x - a.x) * fx + (b.z - a.z) * fz > 0 ? b : a;
  return roads.route(ahead, target, true);
}

/**
 * Conduce un coche perseguidor (policía o furgoneta morada) hacia `target`: por las calles si no lo ve,
 * directo si lo ve o está muy cerca (con un poco de predicción si vas en coche). Hace maniobras
 * cuando el objetivo queda detrás en una calle estrecha y detecta atascos.
 * Devuelve true si está atascado sin remedio.
 */
export function driveChaseCar(game: GameT, roads: Roads, car: Vehicle, brain: CarBrain, nav: ChaseNav, target: THREE.Vector3, lead: number, dt: number): boolean {
  const carPos = car.getPosition(tmpN);
  const dist = carPos.distanceTo(target);
  nav.routeTimer -= dt;
  if (nav.routeTimer <= 0 || (!nav.direct && !nav.route.length)) {
    nav.routeTimer = 1.5;
    let direct = dist < 18;
    if (!direct && dist < 45) {
      const o = tmpL.copy(carPos).setY(carPos.y + 1);
      const d = tmpT.copy(target).setY(target.y + 1).sub(o);
      direct = !game.physics.raycast(o, d, Math.max(0.1, d.length() - 2), SOLID);
    }
    nav.direct = direct;
    if (!direct) nav.route = chaseRoute(roads, car, carPos, target);
  }
  const ct = brain.chaseTarget!;
  if (nav.direct) {
    ct.copy(target);
    const pv = game.mod.vehicles?.current as Vehicle | undefined;
    if (pv && lead > 0) {
      const lv = pv.body.linvel();
      ct.x += lv.x * lead;
      ct.z += lv.z * lead;
    }
  } else {
    while (nav.route.length > 1 && nav.route[0].distanceTo(carPos) < 10) nav.route.shift();
    ct.copy(nav.route[0] ?? target);
  }
  brain.mode = 'chase';
  game.mod.traffic?.drive(car, dt);
  // por la ruta de calles: frenar antes de cada cruce según lo cerrado que sea el giro. Si no, a toda
  // pastilla se pasaba el cruce, la ruta nueva salía del siguiente y acababa dando vueltas por media isla
  if (!nav.direct && nav.route.length > 1 && brain.reverse <= 0) {
    const a = nav.route[0], b = nav.route[1];
    const ax = a.x - carPos.x, az = a.z - carPos.z, bx = b.x - a.x, bz = b.z - a.z;
    const turn = Math.abs(Math.atan2(ax * bz - az * bx, ax * bx + az * bz));
    const corner = 14 * THREE.MathUtils.clamp(1.05 - turn * 0.42, 0.3, 1);
    const cap = Math.sqrt(corner * corner + 7 * Math.max(0, Math.hypot(ax, az) - 6));
    if (car.speed > cap + 1.5) {
      car.controls.throttle = -1;
      car.controls.boost = false;
    } else if (car.speed > cap) car.controls.throttle = Math.min(car.controls.throttle, 0);
  }
  // el objetivo le queda detrás y tiene una pared delante (o va muy lento): marcha atrás girando.
  // Después, un rato hacia delante girando antes de volver a recular (maniobra en tres tiempos): antes
  // volvía a recular en el mismo frame en que acababa, y en una cuesta o contra un bordillo se quedaba
  // reculando a 0 km/h para siempre (patrullas paradas en La Colina).
  nav.turnCool = Math.max(0, (nav.turnCool ?? 0) - dt);
  if (brain.reverse <= 0 && nav.turnCool <= 0) {
    car.getQuaternion(tmpQ).invert();
    tmpL.copy(ct).sub(carPos).applyQuaternion(tmpQ);
    const ang = Math.abs(Math.atan2(tmpL.x, tmpL.z));
    if (ang > 1.5 && tmpL.length() > 6) {
      const h = car.heading;
      const fwd = tmpT.set(Math.sin(h), 0, Math.cos(h));
      const nose = tmpL.copy(carPos).addScaledVector(fwd, car.spec.half.z + 0.2);
      nose.y += 0.4;
      const wall = game.physics.raycast(nose, fwd, 4 + Math.max(0, car.speed) * 0.4, SOLID);
      if (wall || (ang > 2.2 && Math.abs(car.speed) < 2.5)) {
        brain.reverse = 0.9 + rnd.next() * 0.4;
        brain.revT = 0;
        nav.turnCool = brain.reverse + 1.6;
      }
    }
  }
  return unstickCar(car, brain, nav.unstick, dt);
}

/** ¿Está fuera de la vista de la cámara (detrás o tapado por un edificio)? */
export function offscreen(game: GameT, pos: THREE.Vector3): boolean {
  const cam = game.camera.position;
  const fwd = game.camera.getWorldDirection(tmpF);
  const to = tmpT.copy(pos).setY(pos.y + 1).sub(cam);
  const len = to.length();
  if (len < 1) return false;
  if (to.dot(fwd) / len < 0.25) return true;
  return !!game.physics.raycast(cam, to, len - 1, SOLID);
}

export class Police implements System {
  name = 'police';
  heat = 0;
  wanted = 0;
  /** Segundos desde que algún policía vio al jugador. */
  unseen = 0;
  readonly lastSeen = new THREE.Vector3();
  private units: Unit[] = [];
  private officers: Npc[] = [];
  private spawnTimer = 0;
  private seeTimer = 0;
  private arrestTimer = 0;
  private rng = new Rng('policia');
  private roads: Roads;
  private roadblockTimer = 10;
  private paintCooldown = 0;
  /** Taller de pintura (se busca una vez). */
  private paintPoi: Poi | null | undefined;
  /** Calor que aún pueden dar los disparos ahora mismo (se recarga poco a poco: ver SHOT_HEAT_MAX). */
  private shotBudget = SHOT_HEAT_MAX;

  constructor(private game: Game) {
    game.mod.police = this;
    this.roads = (game.mod.traffic?.roads as Roads) ?? new Roads(game.world);
    const ev = game.events;
    // crímenes
    ev.on('vehicle:steal' as any, (e: any) => this.crime(e.npc?.police ? 3 : 1, 'robo', true));
    ev.on('weapon:shot' as any, (e: any) => {
      if (e.shooter?.kind !== 'player') return;
      // en las misiones de la historia contra la banda, los tiros no traen a la policía
      if (game.mod.story?.gangMission) return;
      const w = Math.min(e.melee ? 0.15 : HEAT_SHOT, this.shotBudget);
      if (w <= 0.001) return;
      this.shotBudget -= w;
      const gang = this.gangFight();
      this.crime(w, 'disparos', false, 60, gang ? HEAT_CAP_GANG_UNSEEN : HEAT_CAP_UNSEEN_SHOTS, gang ? HEAT_CAP_GANG_SEEN : Infinity);
    });
    ev.on('npc:runover' as any, (e: any) => {
      if (e.vehicle === game.mod.vehicles?.current) this.crime(e.npc.police ? 2 : 0.6, 'atropello', true);
    });
    ev.on('npc:hurt' as any, (e: any) => {
      const n = e.npc as Npc;
      if (e.source?.shooter?.kind === 'player' || e.source?.vehicle === game.mod.vehicles?.current) {
        if (n.police) this.crime(1.5, 'agresión a la autoridad', false, 999);
      }
      const b = n.brain as CombatBrain | undefined;
      // (los de la banda los enfada gang.ts, solo si el golpe es tuyo)
      if (b && 'side' in b && b.side === 'police') {
        b.lastHurt = game.time.elapsed;
        b.aggro = true;
      }
    });
    ev.on('npc:killed' as any, (e: any) => {
      if (e.npc.police) this.crime(2, 'derribar policías', false, 999);
    });
    ev.on('explosion', (e) => {
      if (this.seesPoint(e.pos, 70)) this.crime(0.5, 'explosiones', false);
    });
    ev.on('player:died', () => this.clear());
    ev.on('player:respawn', () => this.clear());
  }

  private get vm(): VehicleManager {
    return this.game.mod.vehicles;
  }
  private get npcs(): NpcManager {
    return this.game.mod.npcs;
  }
  private get traffic(): Traffic | undefined {
    return this.game.mod.traffic;
  }

  /**
   * ¿Hay un enfrentamiento con la banda alrededor del jugador? (alguno de Los Devueltos enfadado cerca,
   * o estás en su territorio). Entonces los disparos cuentan poco: te estás defendiendo o es cosa de bandas.
   */
  private gangFight(): boolean {
    const gang = this.game.mod.gang;
    if (!gang) return false;
    const p = this.game.mod.player;
    const pos = p.state === 'vehicle' && this.vm.current ? this.vm.current.getPosition(tmpF) : p.position;
    const h = gang.hideout;
    if (h && h.door.distanceTo(pos) < GANG_FIGHT_DIST) return true;
    for (const m of gang.members as Npc[]) {
      if (!m.alive || m.removed) continue;
      const b = m.brain as CombatBrain | undefined;
      if (b?.aggro && m.position.distanceTo(pos) < GANG_FIGHT_DIST) return true;
    }
    return false;
  }

  /**
   * Un delito. `needsWitness`: solo cuenta si lo ve la policía (o con probabilidad si lo ve la gente).
   * maxDist: distancia a la que la policía lo oye/ve. capUnseen/capSeen: tope de calor que puede dar
   * este delito sin testigos / con un policía delante (si ya hay más calor, no lo baja).
   */
  crime(weight: number, what: string, needsWitness: boolean, maxDist = 55, capUnseen = Infinity, capSeen = Infinity) {
    const p = this.game.mod.player;
    if (!p) return;
    const pos = p.state === 'vehicle' && this.vm.current ? this.vm.current.getPosition(tmpV) : p.position;
    const seen = this.seesPoint(pos, maxDist);
    if (needsWitness && !seen && this.wanted === 0) {
      // un vecino llama a la policía a veces
      if (rnd.next() > 0.25) return;
    }
    if (!needsWitness && !seen && this.wanted === 0 && weight < 1.5) {
      // disparos sin testigos: la gente llama a veces
      if (rnd.next() > 0.35) return;
    }
    const before = this.wanted;
    const cap = seen ? capSeen : capUnseen;
    if (this.heat < cap) this.heat = Math.min(cap, this.heat + weight);
    this.recalc();
    this.unseen = 0;
    this.lastSeen.copy(pos);
    if (this.wanted > before) {
      this.game.events.emit('wanted', { level: this.wanted });
      if (before === 0) this.game.events.emit('toast', { text: `¡La policía te busca por ${what}!`, color: '#2060ff', time: 2.5 });
    }
  }

  private recalc() {
    let lvl = 0;
    for (let i = 1; i < HEAT_LEVELS.length; i++) if (this.heat >= HEAT_LEVELS[i]) lvl = i;
    this.wanted = Math.min(5, lvl);
  }

  setWanted(level: number) {
    this.heat = HEAT_LEVELS[Math.max(0, Math.min(5, level))];
    this.recalc();
    this.unseen = 0;
    // (la comisaría sabe dónde estás: si no, los agentes buscaban donde te vieron la última vez, que
    // podía ser la otra punta de la isla)
    const p = this.game.mod.player;
    if (p) this.lastSeen.copy(p.state === 'vehicle' && this.vm?.current ? this.vm.current.getPosition(tmpV) : p.position);
    this.game.events.emit('wanted', { level: this.wanted });
  }

  /** ¿Algún policía (a pie o en coche) ve este punto? */
  seesPoint(pt: THREE.Vector3, maxDist = 60): boolean {
    const target = tmpS.copy(pt).setY(pt.y + 1);
    for (const o of this.officers) {
      if (!o.alive || o.vehicle || o.busy) continue;
      if (this.look(tmpE.copy(o.position).setY(o.position.y + 1.6), target, maxDist)) return true;
    }
    for (const u of this.units) {
      // solo cuentan los coches con un policía al volante (no el que conduces tú ni uno vacío)
      if (u.car.destroyed || u.car.disposed || u.car === this.vm.current || u.car.driver?.kind !== 'npc') continue;
      const e = u.car.getPosition(tmpE);
      e.y += 0.8;
      if (this.look(e, target, maxDist)) return true;
    }
    return false;
  }

  /** ¿Desde `eye` se ve `target` (a menos de maxDist y sin paredes en medio)? */
  private look(eye: THREE.Vector3, target: THREE.Vector3, maxDist: number): boolean {
    const d = eye.distanceTo(target);
    if (d > maxDist) return false;
    const dir = tmpV2.copy(target).sub(eye);
    return !this.game.physics.raycast(eye, dir, d - 0.8, SOLID);
  }

  /** Borra la búsqueda y retira a la policía. */
  clear() {
    this.heat = 0;
    this.wanted = 0;
    this.arrestTimer = 0;
    (this.game.hud as any).arrest = 0;
    this.game.events.emit('wanted', { level: 0 });
    for (const u of this.units) this.despawnUnit(u);
    this.units = [];
    for (const o of this.officers) if (!o.removed) this.npcs.remove(o);
    this.officers = [];
  }

  private despawnUnit(u: Unit) {
    for (const n of u.crew) if (!n.removed) this.npcs.remove(n);
    if (!u.car.destroyed && u.car !== this.vm.current) this.vm.remove(u.car);
  }

  private wantedUnits(): number {
    return [0, 1, 2, 3, 4, 6][this.wanted];
  }

  /** Hacia dónde va el jugador (para poner los controles por delante). */
  private playerHeading(out: THREE.Vector3): THREE.Vector3 {
    const v = this.vm.current;
    if (v) {
      const lv = v.body.linvel();
      if (Math.hypot(lv.x, lv.z) > 4) return out.set(lv.x, 0, lv.z).normalize();
      return out.set(Math.sin(v.heading), 0, Math.cos(v.heading));
    }
    const p = this.game.mod.player;
    if (p.velocity.lengthSq() > 4) return out.set(p.velocity.x, 0, p.velocity.z).normalize();
    return this.game.mod.cameraRig?.forwardXZ(out) ?? out.set(0, 0, -1);
  }

  /**
   * Elige una calle donde aparecer: fuera de la vista de la cámara y, para los controles, por delante
   * de hacia donde va el jugador. Devuelve null si no encuentra sitio libre.
   */
  private pickSpot(roadblock: boolean): { eid: number; dir: 1 | -1; pos: THREE.Vector3 } | null {
    const p = this.game.mod.player;
    const focus = this.vm.current ? this.vm.current.getPosition(new THREE.Vector3()) : p.position.clone();
    let edges = this.roads.edgesInRing(focus, roadblock ? 55 : 90, roadblock ? 105 : 160);
    const ahead = this.playerHeading(new THREE.Vector3());
    if (roadblock) {
      // solo calles de delante (de hacia donde vas), y de más de 12 m para que quepa el coche cruzado
      edges = edges.filter((id) => {
        const e = this.roads.g.edges[id];
        if (this.roads.length(id) < 12) return false;
        const m = tmpV.lerpVectors(this.roads.g.nodes[e.a].pos, this.roads.g.nodes[e.b].pos, 0.5).sub(focus).setY(0).normalize();
        return m.dot(ahead) > 0.35;
      });
    }
    if (!edges.length) return null;
    let best: { eid: number; dir: 1 | -1; pos: THREE.Vector3 } | null = null;
    let bestScore = -Infinity;
    for (let i = 0; i < 10; i++) {
      const eid = edges[Math.floor(rnd.next() * edges.length)];
      const e = this.roads.g.edges[eid];
      // que salga mirando hacia el jugador (si no, lo primero que hace es dar la vuelta y se atasca)
      const a = this.roads.g.nodes[e.a].pos, b = this.roads.g.nodes[e.b].pos;
      const dir: 1 | -1 = b.distanceToSquared(focus) < a.distanceToSquared(focus) ? 1 : -1;
      const pos = this.roads.lanePoint(eid, dir, 0.5, roadblock ? 0 : e.width / 4, new THREE.Vector3());
      if (this.vm.nearest(pos, 8)) continue;
      let score = offscreen(this.game, pos) ? 2 : 0;
      if (roadblock) score += 2.5 * tmpV.copy(pos).sub(focus).setY(0).normalize().dot(ahead);
      score += rnd.next() * 0.5;
      if (score > bestScore) {
        bestScore = score;
        best = { eid, dir, pos };
      }
    }
    return best;
  }

  private spawnUnit(roadblock = false): boolean {
    const spot = this.pickSpot(roadblock);
    if (!spot) return false;
    const { eid, dir, pos } = spot;
    const kind = this.wanted >= 4 && rnd.next() < (roadblock ? 0.6 : 0.4) ? 'policevan' : 'police';
    const heading = this.roads.heading(eid, dir) + (roadblock ? Math.PI / 2 : 0);
    const car = this.vm.spawn(kind, pos, heading);
    car.sirenOn = true;
    const crewN = kind === 'policevan' ? 3 : 2;
    const crew: Npc[] = [];
    for (let i = 0; i < crewN; i++) {
      const n = this.npcs.spawn('policia', randomLookFor(this.rng, 'policia'), pos);
      n.police = true;
      n.hostile = true;
      n.killable = true;
      n.health = n.maxHealth = 70;
      n.transient = false;
      n.brain = makeCombatBrain('police', this.wanted >= 4 ? (rnd.next() < 0.5 ? 'smg' : 'shotgun') : 'pistol');
      armNpc(n, (n.brain as CombatBrain).weapon);
      crew.push(n);
    }
    crew[0].enterVehicle(car);
    // los demás van dentro, invisibles hasta que bajan
    for (let i = 1; i < crew.length; i++) crew[i].rideAlong(car);
    const brain: CarBrain = { edge: eid, dir, t: 0.5, next: null, cruise: 20, blocked: 0, stuck: 0, reverse: 0, honked: 0, mode: 'chase', chaseTarget: new THREE.Vector3() };
    (car as any).brain = brain;
    const unit: Unit = { car, crew, route: [], routeTimer: 0, onFoot: roadblock, roadblock, unstick: { t: 0, tries: 0 } };
    if (roadblock) {
      (car as any).brain = undefined;
      this.dismount(unit);
    }
    this.units.push(unit);
    return true;
  }

  /** Los agentes bajan del coche. `stuck`: porque el coche se ha atascado (tardan en volver a subir). */
  private dismount(u: Unit, stuck = false) {
    u.onFoot = true;
    u.returning = false;
    if (stuck) u.remountCool = 12;
    const car = u.car;
    // control: los agentes se ponen detrás del coche (el lado que no da al jugador) y se quedan ahí
    let side0 = 1;
    if (u.roadblock) {
      const p = this.game.mod.player.position;
      const a = this.vm.doorPoint(car, tmpV, 1).distanceToSquared(p);
      const b = this.vm.doorPoint(car, tmpV, -1).distanceToSquared(p);
      side0 = a > b ? 1 : -1;
    }
    u.crew.forEach((n, i) => {
      if (n.removed) return;
      const side = u.roadblock ? side0 : i % 2 === 0 ? 1 : -1;
      const out = this.vm.doorPoint(car, new THREE.Vector3(), side);
      if (u.roadblock) {
        // repartidos a lo largo del coche
        const f = (i - (u.crew.length - 1) / 2) * 1.6;
        out.x += Math.sin(car.heading) * f;
        out.z += Math.cos(car.heading) * f;
      }
      if (n.vehicle) n.leaveVehicle(out);
      else {
        n.position.copy(out);
        n.position.y = this.game.world.heightAt(out.x, out.z);
        n.rig.root.visible = true;
        n.collider.setEnabled(true);
        n.setState('idle');
        this.game.scene.add(n.rig.root);
      }
      if (u.roadblock && n.brain) (n.brain as CombatBrain).holdAt = n.position.clone();
      if (!this.officers.includes(n)) this.officers.push(n);
    });
    car.controls.throttle = 0;
    car.controls.handbrake = true;
  }

  update(dt: number) {
    const g = this.game;
    const p = g.mod.player;
    if (!p || !g.world) return;
    g.hud.wanted = this.wanted;
    this.shotBudget = Math.min(SHOT_HEAT_MAX, this.shotBudget + SHOT_HEAT_REFILL * dt);
    this.paintCooldown -= dt;
    this.checkPaintShop();

    if (this.wanted === 0) {
      // (si te acababan de pillar, que no se quede el cartel de «te están deteniendo»)
      this.arrestTimer = 0;
      (g.hud as any).arrest = 0;
      // retirar lo que quede lejos
      for (let i = this.units.length - 1; i >= 0; i--) {
        const u = this.units[i];
        if (u.car.disposed || u.car === this.vm.current) {
          for (const n of u.crew) if (!n.removed && n.position.distanceTo(p.position) > 60) this.npcs.remove(n);
          this.units.splice(i, 1);
          continue;
        }
        if (u.car.getPosition(tmpV).distanceTo(p.position) > 70) {
          this.despawnUnit(u);
          this.units.splice(i, 1);
        } else {
          u.car.sirenOn = false;
          (u.car as any).brain = undefined;
        }
      }
      for (let i = this.officers.length - 1; i >= 0; i--) {
        const o = this.officers[i];
        if (o.removed || o.position.distanceTo(p.position) > 60) {
          if (!o.removed) this.npcs.remove(o);
          this.officers.splice(i, 1);
        } else {
          o.aiming = false;
          o.stop();
        }
      }
      return;
    }

    // ¿te ven?
    this.seeTimer -= dt;
    if (this.seeTimer <= 0) {
      this.seeTimer = 0.4;
      const pos = p.state === 'vehicle' && this.vm.current ? this.vm.current.getPosition(tmpV) : p.position;
      if (this.seesPoint(pos, 75)) {
        this.unseen = 0;
        this.lastSeen.copy(pos);
      }
    }
    this.unseen += dt;
    const loseTime = 9 + this.wanted * 4;
    (g.hud as any).wantedSearching = this.unseen > 2;
    if (this.unseen > loseTime) {
      this.heat = HEAT_LEVELS[this.wanted - 1] ?? 0;
      this.recalc();
      this.unseen = loseTime * 0.55;
      g.events.emit('wanted', { level: this.wanted });
      if (this.wanted === 0) g.events.emit('toast', { text: 'Has despistado a la policía', color: '#2ec4b6' });
    }

    // unidades
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      dropRemoved(u.crew);
      if (u.car.disposed) {
        // el coche ya no existe: los agentes siguen a pie
        for (const n of u.crew) if (!this.officers.includes(n)) this.officers.push(n);
        this.units.splice(i, 1);
        continue;
      }
      let alive = false;
      for (const n of u.crew) if (n.alive) alive = true;
      const carIsMine = u.car === this.vm.current;
      // (tras dropRemoved, el primero de la tripulación es uno que sigue existiendo)
      const ref = carIsMine ? u.crew[0]?.position ?? p.position : u.car.getPosition(tmpV);
      const far = ref.distanceTo(p.position) > 220;
      if (far) {
        this.despawnUnit(u);
        this.units.splice(i, 1);
        continue;
      }
      if (u.car.destroyed && !u.onFoot) this.dismount(u);
      if ((!alive && u.onFoot) || carIsMine || u.car.destroyed) {
        // sin agentes (o se lo has robado): el coche se queda aparcado y la unidad se disuelve
        if (!u.car.destroyed && !carIsMine) {
          (u.car as any).brain = undefined;
          u.car.sirenOn = false;
          this.traffic?.parked.push(u.car);
        }
        for (const n of u.crew) if (n.alive && !n.vehicle && !this.officers.includes(n)) this.officers.push(n);
        this.units.splice(i, 1);
        continue;
      }
      if (u.onFoot && !u.roadblock) this.remount(u, dt);
      if (!u.onFoot && this.driveUnit(u, dt)) {
        // atascado sin remedio y nadie lo ve: se retira (luego aparece otra patrulla en un sitio mejor)
        this.despawnUnit(u);
        this.units.splice(i, 1);
      }
    }
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 2.5;
      if (this.units.filter((u) => !u.roadblock).length < this.wantedUnits()) this.spawnUnit(false);
    }
    // controles de carretera a partir de 3 sirenas
    if (this.wanted >= 3) {
      this.roadblockTimer -= dt;
      if (this.roadblockTimer <= 0) {
        // si no hay sitio bueno ahora, se vuelve a intentar enseguida
        if (this.units.filter((u) => u.roadblock).length < this.wanted - 2) this.roadblockTimer = this.spawnUnit(true) ? 25 - this.wanted * 2 : 2;
        else this.roadblockTimer = 3;
      }
    }

    // policías a pie
    const officers = this.officers;
    for (let i = officers.length - 1; i >= 0; i--) {
      // (un disparo de este bucle puede matarte, y entonces clear() vacía la lista: se para aquí)
      if (officers !== this.officers) break;
      const o = officers[i];
      if (!o) continue;
      if (o.removed) {
        officers.splice(i, 1);
        continue;
      }
      const b = o.brain as CombatBrain;
      if (b) {
        // con 1-2 sirenas intentan detenerte sin disparar (también si vas en coche)
        b.arrestOnly = this.wanted <= 2;
        b.aggro = true;
        // si hace rato que no te ven, van a donde te vieron por última vez (no saben dónde estás)
        b.hunt = this.unseen > 3 ? this.lastSeen : null;
        // con 4-5 sirenas son los especiales: se acercan más y afinan más
        b.acc = POLICE_ACC[this.wanted];
        b.engageRange = this.wanted >= 4 ? (this.wanted >= 5 ? 22 : 28) : null;
        // (los que vuelven andando a su coche no se paran a pelear: ver remount)
        if (b.returning) continue;
      }
      updateCombatant(g, o, dt);
      // volver al coche si el jugador se va en vehículo y está lejos
    }
    this.checkArrest(dt);
  }

  /** Conduce una patrulla. Devuelve true si está atascada sin remedio (y no se ve). */
  private driveUnit(u: Unit, dt: number): boolean {
    const g = this.game;
    const p = g.mod.player;
    const car = u.car;
    const brain = (car as any).brain as CarBrain | undefined;
    if (!brain || car.destroyed) {
      if (!u.onFoot) this.dismount(u);
      return false;
    }
    const driver = car.driver && car.driver.kind === 'npc' ? car.driver.npc : null;
    if (!driver) {
      if (!u.onFoot) this.dismount(u);
      return false;
    }
    const target = this.unseen < 3 ? (p.state === 'vehicle' && this.vm.current ? this.vm.current.getPosition(tmpV) : tmpV.copy(p.position)) : tmpV.copy(this.lastSeen);
    const carPos = car.getPosition(tmpV2);
    const dist = carPos.distanceTo(target);
    // bajarse cerca si el jugador va a pie o está parado
    const playerSlow = p.state === 'foot' || (this.vm.current && Math.abs(this.vm.current.speed) < 3);
    // (o si se ha atascado ya cerca: mejor a pie que empujando una esquina; antes era a 50 m y se
    // quedaban a medio camino; o si le tapa un control de los suyos, que corta la calle entera)
    const stuck = u.unstick.tries > 0;
    if ((dist < 14 && playerSlow) || (stuck && dist < 30 && playerSlow) || (stuck && dist < 60 && this.policeCarNear(u))) {
      this.dismount(u, true);
      return false;
    }
    // por calles si no te ve; directo (con algo de predicción) si te ve o está cerca
    const hopeless = driveChaseCar(g, this.roads, car, brain, u, target, this.unseen < 3 ? 0.5 : 0, dt);
    if (!hopeless) return false;
    // atascado sin remedio: si nadie lo ve, se retira (y sale otra patrulla en un sitio mejor);
    // si se ve y vas a pie, siguen andando (antes se quedaban mirando dentro del coche)
    if (dist > 45 && offscreen(g, carPos)) return true;
    if (playerSlow && dist < 100) this.dismount(u, true);
    return false;
  }

  /**
   * ¿Tiene al lado el coche de un control de carretera (que corta la calle entera) u otra patrulla
   * (dos coches morro con morro en una calle estrecha no salen nunca)?
   */
  private policeCarNear(u: Unit): boolean {
    const pos = u.car.getPosition(tmpE);
    for (const o of this.units) {
      if (o === u || o.car.disposed) continue;
      const r = o.roadblock ? 14 : 8;
      if (o.car.getPosition(tmpS).distanceToSquared(pos) < r * r) return true;
    }
    return false;
  }

  /**
   * Agentes a pie de una patrulla (no de un control) cuando te vas en coche o te alejas: vuelven a su
   * coche y siguen la persecución. Antes se quedaban a pie para siempre, el coche parado y, como la
   * unidad seguía contando, no salía ninguna patrulla nueva.
   */
  private remount(u: Unit, dt: number) {
    const g = this.game;
    const car = u.car;
    const p = g.mod.player;
    u.remountCool = Math.max(0, (u.remountCool ?? 0) - dt);
    if (car.destroyed || car.disposed || car === this.vm.current || car.driver || car.sinking) {
      this.releaseReturning(u);
      return;
    }
    const cur = this.vm.current;
    const ppos = cur ? cur.getPosition(tmpRP) : p.position;
    let nearest = Infinity;
    let anyAlive = false;
    for (const n of u.crew) {
      if (!n.alive) continue;
      anyAlive = true;
      nearest = Math.min(nearest, n.position.distanceTo(ppos));
    }
    if (!anyAlive) return;
    // te vas en coche, o estás ya muy lejos (a pie no te alcanzan): a por el coche
    // (si estás parado en un coche, mejor ir a por ti andando que volver al suyo)
    const leaving = p.state === 'vehicle' && cur && Math.abs(cur.speed) > 6 && nearest > 15;
    const gone = nearest > 90;
    if (!u.returning) {
      if (u.remountCool > 0 || !(leaving || gone)) return;
      u.returning = true;
      u.returnT = 0;
    }
    // vuelves hacia ellos (o te bajas cerca): se olvidan del coche y a por ti
    if (nearest < 18 && !(leaving && nearest > 10)) {
      this.releaseReturning(u);
      u.remountCool = 6;
      return;
    }
    u.returnT = (u.returnT ?? 0) + dt;
    for (const n of u.crew) {
      const b = n.brain as CombatBrain | undefined;
      if (b) b.returning = true;
    }
    const door = this.vm.doorPoint(car, tmpRD);
    let lead: Npc | null = null;
    for (const n of u.crew) {
      if (!n.alive || n.busy) continue;
      n.aiming = false;
      const d = n.position.distanceTo(door);
      if (d < 2.8 || (u.returnT > 14 && offscreen(g, n.position) && offscreen(g, door))) {
        lead = n;
        break;
      }
      n.goTo(door, true);
    }
    if (!lead && u.returnT > 25) {
      // no hay manera de llegar al coche: se quedan a pie
      this.releaseReturning(u);
      u.remountCool = 20;
      return;
    }
    if (!lead) return;
    // ¡arriba! el primero conduce y los que estén cerca van dentro; los que estén lejos siguen a pie
    const crew: Npc[] = [];
    lead.enterVehicle(car);
    crew.push(lead);
    for (const n of u.crew) {
      if (n === lead || !n.alive || n.busy) continue;
      if (n.position.distanceTo(door) > 25) continue;
      n.rideAlong(car);
      crew.push(n);
    }
    for (const n of u.crew) {
      const b = n.brain as CombatBrain | undefined;
      if (b) b.returning = false;
    }
    for (const n of crew) {
      const i = this.officers.indexOf(n);
      if (i >= 0) this.officers.splice(i, 1);
      const b = n.brain as CombatBrain | undefined;
      if (b) b.holdAt = null;
    }
    u.crew.length = 0;
    u.crew.push(...crew);
    u.onFoot = false;
    u.returning = false;
    u.route = [];
    u.routeTimer = 0;
    u.unstick.t = 0;
    u.unstick.tries = 0;
    u.turnCool = 0;
    car.sirenOn = true;
    car.controls.handbrake = false;
    const ne = this.roads.nearestEdge(car.getPosition(tmpE), true);
    const brain: CarBrain = { edge: ne?.edge ?? 0, dir: 1, t: 0.5, next: null, cruise: 20, blocked: 0, stuck: 0, reverse: 0, honked: 0, mode: 'chase', chaseTarget: new THREE.Vector3() };
    (car as any).brain = brain;
  }

  /** Los que volvían al coche dejan de hacerlo (y vuelven a pelear). */
  private releaseReturning(u: Unit) {
    if (!u.returning) return;
    u.returning = false;
    for (const n of u.crew) {
      const b = n.brain as CombatBrain | undefined;
      if (b) b.returning = false;
      if (n.alive && !n.busy) n.stop();
    }
  }

  private checkArrest(dt: number) {
    const g = this.game;
    const p = g.mod.player;
    if (p.state === 'dead') {
      // pillado (o muerto): el cartel de «te están deteniendo» se quita ya, no encima de «¡TE HAN PILLADO!»
      this.arrestTimer = 0;
      (g.hud as any).arrest = 0;
      return;
    }
    let near = false;
    const pos = p.state === 'vehicle' && this.vm.current ? this.vm.current.getPosition(tmpV) : p.position;
    const slow = p.state === 'foot' ? p.velocity.length() < 2.2 : Math.abs(this.vm.current?.speed ?? 99) < 1.2;
    if (slow && this.wanted <= 3) {
      for (const o of this.officers) {
        if (o.alive && !o.busy && o.position.distanceTo(pos) < (p.state === 'vehicle' ? 3 : 1.8)) {
          near = true;
          break;
        }
      }
    }
    this.arrestTimer = near ? this.arrestTimer + dt : Math.max(0, this.arrestTimer - dt * 2);
    (g.hud as any).arrest = this.arrestTimer > 0.1 ? Math.min(1, this.arrestTimer / 2) : 0;
    if (this.arrestTimer > 2) {
      this.arrestTimer = 0;
      g.events.emit('player:busted' as any, {} as any);
    }
  }

  /** Taller de pintura: entra con un vehículo y quita la búsqueda por dinero. */
  private checkPaintShop() {
    const g = this.game;
    const v = this.vm?.current;
    if (!v || this.paintCooldown > 0) return;
    // (se busca una vez: los sitios del mapa no cambian)
    const poi = (this.paintPoi ??= g.world.pois.find((x) => x.kind === 'paint') ?? null);
    if (!poi) return;
    if (v.getPosition(tmpV).distanceTo(poi.door) > 7) return;
    if (Math.abs(v.speed) > 6) return;
    this.paintCooldown = 8;
    const price = 150 + this.wanted * 150;
    if (this.wanted === 0) {
      g.events.emit('toast', { text: 'Pintamóvil Exprés: sin búsqueda no hay prisa. Vuelve cuando te persigan.', time: 2.5 });
      return;
    }
    const eco = g.mod.economy;
    if (eco && !eco.spend(price, 'pintura')) return;
    const colors = ['#e63946', '#2a9d8f', '#f4a261', '#6d597a', '#06d6a0', '#ff7b54', '#1d3557', '#ffd23f'];
    const c = colors[Math.floor(rnd.next() * colors.length)];
    repaint(v, c);
    g.mod.particles?.emit('smoke', v.getPosition(tmpV), { count: 20, color: [c, '#ffffff'], scale: 1.5 });
    g.mod.audio?.play('spray');
    this.clear();
    g.events.emit('toast', { text: `¡Pintado nuevo por ${price} €! La policía ya no te reconoce.`, color: c, time: 3 });
  }
}

/** Quita de la lista los que ya no existen, sin crear una lista nueva. */
function dropRemoved(list: Npc[]) {
  let w = 0;
  for (let i = 0; i < list.length; i++) if (!list[i].removed) list[w++] = list[i];
  list.length = w;
}

/** Cambia el color de la carrocería (recolorea los vértices del color antiguo). */
export function repaint(v: Vehicle, color: string) {
  const geo = v.mesh.bodyGeo;
  const col = geo.getAttribute('color') as THREE.BufferAttribute;
  const old = new THREE.Color(v.color);
  const neu = new THREE.Color(color);
  const oldDark = old.clone().multiplyScalar(0.7);
  const neuDark = neu.clone().multiplyScalar(0.7);
  for (let i = 0; i < col.count; i++) {
    const r = col.getX(i), gg = col.getY(i), b = col.getZ(i);
    if (Math.abs(r - old.r) + Math.abs(gg - old.g) + Math.abs(b - old.b) < 0.02) col.setXYZ(i, neu.r, neu.g, neu.b);
    else if (Math.abs(r - oldDark.r) + Math.abs(gg - oldDark.g) + Math.abs(b - oldDark.b) < 0.02) col.setXYZ(i, neuDark.r, neuDark.g, neuDark.b);
  }
  col.needsUpdate = true;
  v.color = color;
}
