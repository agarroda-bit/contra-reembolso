// Tráfico con IA: coches que siguen su carril, frenan ante obstáculos, pitan y se van si están lejos.
import * as THREE from 'three';
import type { Game, System } from '../core/game';
import { Roads } from './roads';
import type { VehicleManager } from '../vehicles/manager';
import type { Vehicle } from '../vehicles/vehicle';
import type { NpcManager } from '../actors/npcManager';
import { CRAZY_TRAFFIC_KINDS, TRAFFIC_KINDS, type VehicleKind } from '../vehicles/types';
import { honk } from '../vehicles/sounds';
import { RAPIER, G, groups } from '../core/physics';
import { fx as rnd, Rng } from '../core/rng';
import { randomLookFor } from '../actors/looks';

export interface CarBrain {
  edge: number;
  dir: 1 | -1;
  t: number;
  next: { edge: number; dir: 1 | -1 } | null;
  cruise: number; // velocidad de crucero (m/s)
  blocked: number; // segundos parado por un obstáculo
  stuck: number;
  reverse: number;
  honked: number;
  /** Modo: seguir la calle, o perseguir/huir (lo usan policía y banda). */
  mode: 'lane' | 'chase' | 'flee' | 'park';
  chaseTarget?: THREE.Vector3;
  /** Segundos que le quedan adelantando por el carril contrario (algo parado delante). */
  bypass?: number;
  /** Segundos seguidos sin avanzar (atasco): si no se ve, se retira. */
  jam?: number;
  /** Intentos de desatascarse ante el mismo obstáculo (alterna marcha atrás y adelantar). */
  tries?: number;
  /** Segundos que lleva la marcha atrás actual (si no se mueve, algo le tapa por detrás: se corta). */
  revT?: number;
  /** Momento (s de juego) de la última marcha atrás contra una pared o un obstáculo quieto. */
  wallAt?: number;
  /** Rodeo por las calles (persecución que choca con la misma pared): cruces que seguir antes de ir directo. */
  detour?: THREE.Vector3[];
  /** Segundos que le quedan al rodeo. */
  detourT?: number;
  /** Adónde iba cuando se planeó el rodeo (si el objetivo se mueve mucho, el rodeo ya no vale). */
  detourGoal?: THREE.Vector3;
  /** Muchas marchas atrás seguidas contra lo mismo sin salir: se retira en cuanto no se vea. */
  hopeless?: boolean;
  /** Veces seguidas que ha tenido que dar marcha atrás contra una pared (carril). */
  walls?: number;
  /** Lado (1 = derecha, −1 = izquierda) hacia el que esquiva tras chocar con algo fijo: alterna en cada intento. */
  dodgeSide?: 1 | -1;
  /** Segundos que le quedan esquivando hacia ese lado (persecución: una farola o una esquina en medio). */
  dodge?: number;
  /** Cuenta atrás para volver a mirar si el objetivo queda tapado por un edificio. */
  lookT?: number;
  /** Segundos que lleva en el mar (persecución): pasado un momento, se recoloca en cuanto no se vea. */
  sunk?: number;
}

const tmpV = new THREE.Vector3();
const tmpT = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpL = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const tmpO = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const frustum = new THREE.Frustum();
const sphere = new THREE.Sphere();
const castRot = { x: 0, y: 0, z: 0, w: 1 };
const castPos = { x: 0, y: 0, z: 0 };
const castVel = { x: 0, y: 0, z: 1 };
/** Caja que se "lanza" por delante de cada coche para ver obstáculos (una por tipo, del ancho del coche). */
const castShapes = new Map<string, RAPIER.Cuboid>();
const OBSTACLES = groups(G.ALL, G.VEHICLE | G.PLAYER | G.NPC | G.STATIC);
/** Probabilidad de que un coche nuevo del tráfico sea un vehículo loco (y cuántos a la vez, como mucho). */
const CRAZY_CHANCE = 0.05;
const CRAZY_MAX = 2;
/** Velocidad de crucero máxima de los locos en el tráfico (el sofá, a lo loco, se sale de la calle). */
const CRAZY_CRUISE: Partial<Record<VehicleKind, number>> = { sofa: 6, forklift: 9, golf: 9 };

/**
 * Esquina de un cruce: el punto donde se cortan el carril de llegada (edge1, dir1) y el de salida
 * (edge2, dir2). Los coches siguen su carril hasta cerca de este punto y giran alrededor de él,
 * sin comerse la acera. Devuelve el ángulo de giro (0 = recto, π = media vuelta).
 */
function laneCorner(R: Roads, e1: number, d1: 1 | -1, e2: number, d2: 1 | -1, out: THREE.Vector3): number {
  const E1 = R.g.edges[e1], E2 = R.g.edges[e2];
  const N = R.g.nodes[d1 === 1 ? E1.b : E1.a].pos;
  const h1 = R.heading(e1, d1), h2 = R.heading(e2, d2);
  const ax = Math.sin(h1), az = Math.cos(h1), bx = Math.sin(h2), bz = Math.cos(h2);
  const o1 = E1.width / 4, o2 = E2.width / 4;
  // carril = eje desplazado a la derecha del sentido de marcha: derecha de (dx, dz) = (−dz, dx)
  const p1x = N.x - az * o1, p1z = N.z + ax * o1;
  const p2x = N.x - bz * o2, p2z = N.z + bx * o2;
  const cr = ax * bz - az * bx;
  const turn = Math.abs(Math.atan2(cr, ax * bx + az * bz));
  if (Math.abs(cr) < 0.2) {
    // casi recto (o media vuelta en un fondo de saco): el final del carril
    if (ax * bx + az * bz > 0) out.set((p1x + p2x) / 2, N.y, (p1z + p2z) / 2);
    else out.set(p1x, N.y, p1z);
    return turn;
  }
  const s1 = THREE.MathUtils.clamp(((p2x - p1x) * bz - (p2z - p1z) * bx) / cr, -10, 10);
  out.set(p1x + ax * s1, N.y, p1z + az * s1);
  return turn;
}

export class Traffic implements System {
  name = 'traffic';
  roads: Roads;
  readonly cars: Vehicle[] = [];
  readonly parked: Vehicle[] = [];
  private spawnTimer = 0;
  private rng = new Rng('trafico');
  enabled = true;

  constructor(private game: Game) {
    game.mod.traffic = this;
    this.roads = new Roads(game.world);
  }

  private get vm(): VehicleManager {
    return this.game.mod.vehicles;
  }
  private get npcs(): NpcManager {
    return this.game.mod.npcs;
  }

  get target(): number {
    return Math.round(16 * this.game.quality.density);
  }

  /** Tipo de coche nuevo para el tráfico: casi siempre uno normal y, muy de vez en cuando, uno loco. */
  private pickKind(): VehicleKind {
    if (this.game.mod.fase >= 9 && rnd.next() < CRAZY_CHANCE) {
      let n = 0;
      for (const c of this.cars) if (CRAZY_TRAFFIC_KINDS.includes(c.spec.kind)) n++;
      const k = CRAZY_TRAFFIC_KINDS[Math.floor(rnd.next() * CRAZY_TRAFFIC_KINDS.length)];
      // como mucho dos a la vez, y nunca dos iguales
      if (n < CRAZY_MAX && !this.cars.some((c) => c.spec.kind === k)) return k;
    }
    return TRAFFIC_KINDS[Math.floor(rnd.next() * TRAFFIC_KINDS.length)];
  }

  /** Crea un coche con conductor en una arista. */
  spawnCar(edge: number, dir: 1 | -1, t: number, kind: VehicleKind = this.pickKind()): Vehicle | null {
    const e = this.roads.g.edges[edge];
    const pos = this.roads.lanePoint(edge, dir, t, e.width / 4, new THREE.Vector3());
    // no aparecer encima de otro vehículo
    if (this.vm.nearest(pos, 7)) return null;
    const v = this.vm.spawn(kind, pos, this.roads.heading(edge, dir));
    const look = randomLookFor(this.rng, 'civil');
    if (kind === 'granny') {
      // la silla la lleva una yaya de verdad: moño gris y rebeca
      look.hair = 'moño';
      look.hairColor = '#d9d9d9';
      look.jacket = this.rng.pick(['#9d4edd', '#6d597a', '#b5838d']);
      look.glasses = true;
      look.height = 0.92;
    } else if (kind === 'forklift' || kind === 'paella') {
      // gorra del puerto o del puesto de paellas
      look.cap = true;
      look.capColor = kind === 'forklift' ? '#ffc300' : '#e63946';
    }
    const driver = this.npcs.spawn('driver', look, pos);
    driver.enterVehicle(v);
    const brain = this.newBrain(edge, dir, t);
    const cap = CRAZY_CRUISE[kind];
    if (cap) brain.cruise = Math.min(brain.cruise, cap);
    (v as any).brain = brain;
    this.cars.push(v);
    return v;
  }

  /** Cerebro nuevo de coche de carril (sin nada de antes: ni atascos, ni rodeos, ni persecuciones). */
  private newBrain(edge: number, dir: 1 | -1, t: number): CarBrain {
    const e = this.roads.g.edges[edge];
    return {
      edge, dir, t, next: null,
      cruise: (e.district === 'centro' || e.district === 'viejo' ? 10 : 13) * (0.85 + rnd.next() * 0.3),
      blocked: 0, stuck: 0, reverse: 0, honked: 0, mode: 'lane',
    };
  }

  /**
   * Sitio para que aparezca un coche: una calle a 70-170 m del jugador y fuera del encuadre (con la
   * cámara lejos del jugador, como en la vista aérea del menú, vale lo que quede lejos de ella).
   */
  private pickSpawn(focus: THREE.Vector3): { edge: number; dir: 1 | -1; t: number } | null {
    const edges = this.roads.edgesInRing(focus, 70, 170);
    if (!edges.length) return null;
    const cam = this.game.camera.position;
    const eid = edges[Math.floor(rnd.next() * edges.length)];
    const dir: 1 | -1 = rnd.next() < 0.5 ? 1 : -1;
    const t = 0.2 + rnd.next() * 0.6;
    const p = this.roads.lanePoint(eid, dir, t, 0, tmpO);
    const camFar = cam.distanceTo(focus) > 50;
    return !this.inView(p, 4) || (camFar && p.distanceTo(cam) > 80) ? { edge: eid, dir, t } : null;
  }

  /**
   * Un coche del tráfico que se ha quedado lejos reaparece en otro sitio con el mismo conductor, en vez
   * de borrarlo y crear otro (muñeco, mallas y cuerpo de Rapier nuevos). Solo si está como nuevo: sin
   * daños ni abolladuras, sin pasajeros, sin haberlo conducido el jugador y circulando por su carril.
   * false = no se puede (se borra como siempre).
   */
  private recycle(v: Vehicle, brain: CarBrain, driver: any, focus: THREE.Vector3): boolean {
    if (this.cars.length > this.target) return false;
    if (!v.transient || v.owned || v.destroyed || v.disposed || v.sinking || v.onFire || v.dented) return false;
    if (v.health < v.spec.health || v.packages || v.lastDriven >= 0 || v === this.vm.current) return false;
    if ((v as any).fleet || (v as any).homeSpot) return false;
    if (brain.mode !== 'lane' || !driver || driver.removed || driver.vehicle !== v || driver.hostile || driver.police) return false;
    for (const n of this.npcs.list) if (n.vehicle === v && n !== driver) return false;
    // unos pocos intentos de encontrarle sitio (fuera del encuadre y sin otro coche encima)
    let spot: { edge: number; dir: 1 | -1; t: number } | null = null;
    const pos = tmpO;
    for (let k = 0; k < 4 && !spot; k++) {
      spot = this.pickSpawn(focus);
      if (!spot) continue;
      this.roads.lanePoint(spot.edge, spot.dir, spot.t, this.roads.g.edges[spot.edge].width / 4, pos);
      if (this.vm.nearest(pos, 7, (o) => o !== v)) spot = null;
    }
    if (!spot) return false;
    v.resetForReuse();
    v.place(pos, this.roads.heading(spot.edge, spot.dir));
    this.game.mod.vehicleFx?.forget?.(v);
    (v as any).brain = this.newBrain(spot.edge, spot.dir, spot.t);
    this.recycled++;
    return true;
  }
  /** Coches reciclados (para pruebas). */
  recycled = 0;

  /** ¿Se ve este punto (esfera de radio r) desde la cámara? Hay que llamar antes a updateFrustum(). */
  private inView(p: THREE.Vector3, r = 3): boolean {
    return frustum.intersectsSphere(sphere.set(p, r));
  }
  private updateFrustum() {
    const cam = this.game.camera;
    cam.updateMatrixWorld();
    tmpM.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    frustum.setFromProjectionMatrix(tmpM);
  }

  /** Coche aparcado sin conductor. */
  spawnParked(): void {
    const w = this.game.world;
    // alrededor del jugador (no de la cámara: en el menú la cámara está lejos), nunca pegado a él
    const focus = this.game.mod.player?.position ?? this.game.camera.position;
    const cam = this.game.camera.position;
    const office = w.pois.find((p) => p.kind === 'office');
    const spots = w.parkingSpots.filter((s) => {
      const d = s.pos.distanceTo(focus);
      if (office && s.pos.distanceTo(office.door) < 18) return false;
      // que no aparezca de golpe delante de la cámara
      if (d < 120 && this.inView(s.pos) && s.pos.distanceTo(cam) < 150) return false;
      return d > 45 && d < 140;
    });
    if (!spots.length) return;
    const s = spots[Math.floor(rnd.next() * spots.length)];
    if (this.vm.nearest(s.pos, 5)) return;
    const kinds = ['compact', 'compact', 'suv', 'taxi', 'sports', 'scooter', 'truck'] as const;
    // muy de vez en cuando, un sofá abandonado en la calle (que, por supuesto, tiene motor)
    const sofa = this.game.mod.fase >= 9 && rnd.next() < 0.04 && !this.parked.some((p) => p.spec.kind === 'sofa');
    const v = this.vm.spawn(sofa ? 'sofa' : kinds[Math.floor(rnd.next() * kinds.length)], s.pos, s.heading);
    this.parked.push(v);
  }

  update(dt: number) {
    if (!this.enabled || !this.game.world) return;
    const cam = this.game.camera.position;
    const player = this.game.mod.player;
    const focus = player?.position ?? cam;
    this.updateFrustum();

    // limpiar: lejos, destruidos o robados
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const v = this.cars[i];
      if (v.disposed) {
        this.cars.splice(i, 1);
        continue;
      }
      const brain = (v as any).brain as CarBrain | undefined;
      const driverNpc = v.driver && v.driver.kind === 'npc' ? v.driver.npc : null;
      if (v.destroyed) {
        // los restos los retira VehicleDamageFx; el conductor sale despedido y se queda como peatón
        this.cars.splice(i, 1);
        (v as any).brain = undefined;
        if (driverNpc) {
          const out = v.getPosition(new THREE.Vector3());
          driverNpc.leaveVehicle(out);
          driverNpc.knock(new THREE.Vector3((rnd.next() - 0.5) * 8, 6, (rnd.next() - 0.5) * 8));
          this.game.mod.pedestrians?.adopt?.(driverNpc);
        }
        continue;
      }
      v.getPosition(tmpV);
      const dFocus = tmpV.distanceTo(focus);
      // lejos (y sin verse, salvo que esté ya muy lejos, en la niebla)
      let far = dFocus > 210 && (dFocus > 270 || !this.inView(tmpV, 4));
      // atascado un buen rato donde no se ve: se retira (así no se forman colas eternas)
      if (!far && brain && ((brain.jam ?? 0) > 18 || brain.hopeless) && dFocus > 35 && !this.inView(tmpV, 4)) far = true;
      if (v === this.vm.current || (!driverNpc && !far)) {
        // lo ha cogido el jugador o se ha quedado sin conductor: ya no es tráfico
        if (!driverNpc) {
          this.cars.splice(i, 1);
          (v as any).brain = undefined;
          this.parked.push(v);
        }
        continue;
      }
      if (far || !brain) {
        if (far && brain && this.recycle(v, brain, driverNpc, focus)) continue;
        this.cars.splice(i, 1);
        if (driverNpc) this.npcs.remove(driverNpc);
        if (v !== this.vm.current && !v.owned) this.vm.remove(v);
      }
    }
    for (let i = this.parked.length - 1; i >= 0; i--) {
      const v = this.parked[i];
      if (v.disposed || v === this.vm.current || v.owned || !v.transient) {
        this.parked.splice(i, 1);
        continue;
      }
      if (v.getPosition(tmpV).distanceTo(focus) > 220) {
        this.parked.splice(i, 1);
        this.vm.remove(v);
      }
    }

    // aparecer poco a poco
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.4;
      if (this.cars.length < this.target) {
        // solo donde no se ve (fuera del encuadre), para que no aparezcan coches de la nada
        const spot = this.pickSpawn(focus);
        if (spot) this.spawnCar(spot.edge, spot.dir, spot.t);
      }
      if (this.parked.length < Math.round(8 * this.game.quality.density)) this.spawnParked();
    }

    for (const v of this.cars) this.drive(v, dt);
  }

  /**
   * Adónde ir en persecución: al objetivo, o al siguiente cruce del rodeo si hay uno en marcha.
   * Una vez por segundo mira si el objetivo (lejano) queda tapado por un edificio: entonces planea un
   * rodeo por las calles en vez de ir en línea recta contra la pared. El rodeo se acaba al llegar a su
   * último cruce, al pasar su tiempo o si el objetivo se ha movido mucho.
   */
  private chaseGoal(v: Vehicle, brain: CarBrain, pos: THREE.Vector3, dt: number): THREE.Vector3 {
    const goal = brain.chaseTarget!;
    const d = brain.detour;
    if (d) {
      brain.detourT = (brain.detourT ?? 0) - dt;
      while (d.length && Math.hypot(d[0].x - pos.x, d[0].z - pos.z) < 8) d.shift();
      if (d.length && brain.detourT > 0 && !(brain.detourGoal && brain.detourGoal.distanceToSquared(goal) > 20 * 20)) return d[0];
      brain.detour = undefined;
    }
    brain.lookT = (brain.lookT ?? rnd.next()) - dt;
    if (brain.lookT <= 0) {
      brain.lookT = 1;
      const o = tmpO.set(pos.x, pos.y + 1, pos.z);
      const dir = tmpD.set(goal.x - o.x, goal.y + 1 - o.y, goal.z - o.z);
      const len = dir.length();
      if (len > 25 && this.game.physics.raycast(o, dir, len - 2, G.STATIC) && this.planDetour(v, brain, pos)) return brain.detour![0];
    }
    return goal;
  }

  /**
   * Rodeo por las calles hasta `chaseTarget`, empezando por el cruce que el coche tiene delante (así no
   * intenta dar media vuelta donde no cabe). false = no hay rodeo que sirva (sería ir directo).
   */
  private planDetour(v: Vehicle, brain: CarBrain, pos: THREE.Vector3): boolean {
    const R = this.roads;
    const goal = brain.chaseTarget!;
    let from = pos;
    const ne = R.nearestEdge(pos, true);
    if (ne && ne.dist < 14) {
      const e = R.g.edges[ne.edge];
      const a = R.g.nodes[e.a].pos, b = R.g.nodes[e.b].pos;
      const h = v.heading;
      from = (b.x - a.x) * Math.sin(h) + (b.z - a.z) * Math.cos(h) > 0 ? b : a;
    }
    const path = R.route(from, goal, true);
    path.pop(); // el último punto es el propio objetivo
    if (from !== pos && (!path.length || path[0].distanceToSquared(from) > 1)) path.unshift(from.clone());
    // quitar los cruces que ya tiene encima
    while (path.length && Math.hypot(path[0].x - pos.x, path[0].z - pos.z) < 8) path.shift();
    // (si el rodeo es ir directo al objetivo, no sirve de nada)
    if (!path.some((q) => q.distanceToSquared(goal) > 8 * 8)) return false;
    brain.detour = path;
    brain.detourT = 30;
    brain.detourGoal = goal.clone();
    return true;
  }

  /**
   * Un perseguidor que no hay manera de sacar (metido en una plaza entre bolardos, en un rincón, en el
   * mar...): si nadie lo ve, se recoloca en el carril más cercano, mirando hacia su objetivo. place() le
   * quita lo de hundido (y el frenado del agua).
   */
  private rescue(v: Vehicle, brain: CarBrain, pos: THREE.Vector3): boolean {
    if (this.inView(pos, 4) || pos.distanceTo(this.game.camera.position) < 30) return false;
    const R = this.roads;
    const ne = R.nearestEdge(pos, true);
    if (!ne) return false;
    const e = R.g.edges[ne.edge];
    const goal = brain.chaseTarget!;
    const dir: 1 | -1 = R.g.nodes[e.b].pos.distanceToSquared(goal) < R.g.nodes[e.a].pos.distanceToSquared(goal) ? 1 : -1;
    const p = R.lanePoint(ne.edge, dir, dir === 1 ? ne.t : 1 - ne.t, e.width / 4, tmpO);
    if (this.inView(p, 4) || this.vm.nearest(p, 4, (o) => o !== v)) return false;
    v.place(p, R.heading(ne.edge, dir));
    brain.edge = ne.edge;
    brain.dir = dir;
    brain.next = null;
    brain.walls = 0;
    brain.detour = undefined;
    brain.reverse = 0;
    brain.stuck = 0;
    brain.blocked = 0;
    brain.sunk = 0;
    return true;
  }

  /**
   * Ha tenido que dar marcha atrás contra una pared o algo quieto: la próxima vez esquiva por otro lado.
   * En persecución, cada dos veces seguidas rodea por las calles, y si sigue sin salir se recoloca cuando
   * no se vea. En su carril, si le pasa muchas veces seguidas, se retira en cuanto no se vea.
   */
  private hitWall(v: Vehicle, brain: CarBrain, pos: THREE.Vector3) {
    const now = this.game.time.elapsed;
    const recent = now - (brain.wallAt ?? -99) < 15;
    brain.wallAt = now;
    brain.walls = recent ? (brain.walls ?? 0) + 1 : 1;
    // cada intento, por un lado distinto
    brain.dodgeSide = brain.dodgeSide === 1 ? -1 : brain.dodgeSide === -1 ? 1 : rnd.next() < 0.5 ? 1 : -1;
    if (brain.mode !== 'chase' || !brain.chaseTarget) {
      if (brain.walls >= 5) brain.hopeless = true;
      return;
    }
    brain.dodge = 2.5;
    if (brain.walls >= 5 && this.rescue(v, brain, pos)) return;
    if (brain.walls % 2 === 0) this.planDetour(v, brain, pos);
  }

  /**
   * Conducción de un coche de IA: sigue su carril (girando alrededor de la esquina de cada cruce),
   * o va hacia `chaseTarget` en persecución. Frena ante lo que tiene delante; si es algo fijo
   * (una farola, una pared) da marcha atrás, y si es un coche parado o el jugador, acaba adelantando.
   */
  drive(v: Vehicle, dt: number) {
    const brain = (v as any).brain as CarBrain;
    if (!brain || v.destroyed) return;
    const R = this.roads;
    const pos = v.getPosition(tmpV);
    const speed = v.speed;
    const absSpeed = Math.abs(speed);

    // Perseguidor (policía, banda, rival de carrera) en el mar: de ahí no sale solo, así que a los 3 s
    // se recoloca en su calle en cuanto no se vea (sin esperar a chocar cinco veces contra el fondo).
    if (v.sinking && brain.mode === 'chase' && brain.chaseTarget) {
      brain.sunk = (brain.sunk ?? 0) + dt;
      if (brain.sunk > 3) {
        brain.sunk = 2; // si ahora se ve, lo vuelve a intentar dentro de 1 s
        if (this.rescue(v, brain, pos)) return;
      }
    }

    let target: THREE.Vector3;
    let wantSpeed = brain.cruise;
    if (brain.mode === 'chase' && brain.chaseTarget) {
      target = tmpT.copy(this.chaseGoal(v, brain, pos, dt));
      wantSpeed = v.spec.maxSpeed * 0.85;
      // esquivando lo que le ha frenado: apunta unos metros a un lado del objetivo
      if ((brain.dodge ?? 0) > 0 && brain.reverse <= 0) {
        brain.dodge! -= dt;
        const dx = target.x - pos.x, dz = target.z - pos.z;
        const l = Math.hypot(dx, dz) || 1;
        const side = (brain.dodgeSide ?? 1) * Math.min(6, l * 0.5);
        target.x += (-dz / l) * side;
        target.z += (dx / l) * side;
      }
      const d = brain.detour;
      if (d && d.length) {
        // siguiendo un rodeo: frenar antes de cada cruce según lo cerrado que sea el giro
        const next = d.length > 1 ? d[1] : brain.chaseTarget;
        const ax = target.x - pos.x, az = target.z - pos.z, bx = next.x - target.x, bz = next.z - target.z;
        const dist = Math.hypot(ax, az);
        const turn = Math.abs(Math.atan2(ax * bz - az * bx, ax * bx + az * bz));
        const corner = 14 * THREE.MathUtils.clamp(1.05 - turn * 0.42, 0.3, 1);
        wantSpeed = Math.min(wantSpeed, Math.sqrt(corner * corner + 7 * Math.max(0, dist - 6)));
      }
    } else {
      if (!brain.next) brain.next = R.nextEdge(brain.edge, brain.dir, true);
      let h1 = R.heading(brain.edge, brain.dir);
      let turn = laneCorner(R, brain.edge, brain.dir, brain.next.edge, brain.next.dir, tmpC);
      // distancia (a lo largo del carril) hasta la esquina
      let rem = (tmpC.x - pos.x) * Math.sin(h1) + (tmpC.z - pos.z) * Math.cos(h1);
      if (rem < 0.4) {
        // esquina pasada: al siguiente tramo
        brain.edge = brain.next.edge;
        brain.dir = brain.next.dir;
        brain.next = R.nextEdge(brain.edge, brain.dir, true);
        h1 = R.heading(brain.edge, brain.dir);
        turn = laneCorner(R, brain.edge, brain.dir, brain.next.edge, brain.next.dir, tmpC);
        rem = (tmpC.x - pos.x) * Math.sin(h1) + (tmpC.z - pos.z) * Math.cos(h1);
      }
      const e = R.g.edges[brain.edge];
      const len = R.length(brain.edge) || 1;
      const a = R.startOf(e, brain.dir);
      brain.t = THREE.MathUtils.clamp(((pos.x - a.x) * Math.sin(h1) + (pos.z - a.z) * Math.cos(h1)) / len, 0, 1);
      // punto a perseguir: por el carril hasta la esquina y luego por el carril de salida
      const look = 3.5 + absSpeed * 0.45;
      if (rem > look) {
        target = tmpT.set(tmpC.x - Math.sin(h1) * (rem - look), pos.y, tmpC.z - Math.cos(h1) * (rem - look));
      } else {
        const h2 = R.heading(brain.next.edge, brain.next.dir);
        target = tmpT.set(tmpC.x + Math.sin(h2) * (look - rem), pos.y, tmpC.z + Math.cos(h2) * (look - rem));
      }
      // adelantando: por el carril contrario (media calzada a la izquierda)
      if ((brain.bypass ?? 0) > 0) {
        brain.bypass! -= dt;
        const sh = e.width / 2;
        target.x += Math.cos(h1) * sh;
        target.z -= Math.sin(h1) * sh;
        wantSpeed = Math.min(wantSpeed, 6);
      }
      // frenar antes de la esquina según lo cerrada que sea
      const cornerSpeed = turn > 2.6 ? 3 : brain.cruise * THREE.MathUtils.clamp(1.05 - turn * 0.42, 0.38, 1);
      wantSpeed = Math.min(wantSpeed, Math.sqrt(cornerSpeed * cornerSpeed + 7 * Math.max(0, rem - 1.5)));
    }

    // ángulo hacia el objetivo en ejes del coche
    v.getQuaternion(tmpQ).invert();
    tmpL.copy(target).sub(pos).applyQuaternion(tmpQ);
    const angle = Math.atan2(tmpL.x, tmpL.z); // + = objetivo a la izquierda
    const steer = THREE.MathUtils.clamp(-angle * 2.2, -1, 1);
    // frenar en curvas
    wantSpeed *= THREE.MathUtils.clamp(1 - Math.abs(angle) * 1.1, 0.35, 1);
    // En persecución, con el objetivo muy de lado o detrás (media vuelta), despacio: a toda pastilla el
    // volante apenas gira (a 16 m/s hacen falta 37 m para dar la vuelta) y se sale de la calzada; en la
    // costa, al mar (el rival de la carrera se tiraba al agua nada más salir).
    if (brain.mode === 'chase' && Math.abs(angle) > 0.8) {
      wantSpeed = Math.min(wantSpeed, 6 + 14 * THREE.MathUtils.clamp((1.6 - Math.abs(angle)) / 0.8, 0, 1));
    }

    // obstáculos delante: una caja del ancho del coche que se lanza hacia donde va a girar
    const h = v.spec.half;
    const heading = v.heading + THREE.MathUtils.clamp(angle, -0.6, 0.6);
    const fx = Math.sin(heading), fz = Math.cos(heading);
    let shape = castShapes.get(v.spec.kind);
    if (!shape) castShapes.set(v.spec.kind, (shape = new RAPIER.Cuboid(Math.max(0.35, h.x * 0.9), 0.3, 0.1)));
    castPos.x = pos.x + fx * h.z * 0.9;
    castPos.y = pos.y + 0.1;
    castPos.z = pos.z + fz * h.z * 0.9;
    castRot.y = Math.sin(heading / 2);
    castRot.w = Math.cos(heading / 2);
    castVel.x = fx;
    castVel.z = fz;
    const rayLen = 4 + Math.max(0, speed) * 1.1;
    const phys = this.game.physics;
    const hit = phys.world.castShape(castPos, castRot, castVel, shape, 0, rayLen, true, undefined, OBSTACLES, undefined, v.body);
    let blockedByPlayer = false;
    let staticHit = false;
    let stillHit = false;
    let otherCar: Vehicle | null = null;
    if (hit) {
      const dist = hit.time_of_impact;
      const owner: any = phys.ownerOf(hit.collider);
      blockedByPlayer = owner === this.game.mod.player || owner === this.vm.current;
      staticHit = !owner;
      otherCar = owner?.spec ? (owner as Vehicle) : null;
      stillHit = staticHit || (otherCar ? Math.abs(otherCar.speed) < 0.5 : false) || owner === this.game.mod.player;
      // en persecución, al jugador se le embiste
      if (!(brain.mode === 'chase' && blockedByPlayer)) {
        const safe = Math.max(0, dist - 1.6);
        wantSpeed = Math.min(wantSpeed, safe * 0.9);
      }
    }

    // atascado: marcha atrás un momento
    if (brain.reverse > 0) {
      brain.reverse -= dt;
      brain.revT = (brain.revT ?? 0) + dt;
      // si tras un rato no se mueve, algo le tapa por detrás: vuelve a intentarlo hacia delante
      if (brain.revT > 0.8 && absSpeed < 0.25) brain.reverse = 0;
      v.controls.throttle = -0.7;
      // con el objetivo casi de frente, recular recto no sirve (vuelve a dar en lo mismo): gira el morro
      // hacia el lado por el que va a esquivar
      v.controls.steer = Math.abs(steer) < 0.35 && brain.dodgeSide ? -brain.dodgeSide : -steer;
      v.controls.handbrake = false;
      v.controls.boost = false;
      return;
    }
    brain.revT = 0;
    // Atasco: quieto queriendo avanzar, o quieto con una pared (u obstáculo sin dueño) delante. Con algo
    // delante la velocidad deseada baja de 1, así que eso también cuenta; en persecución, también un coche
    // parado (la persecución no adelanta por el otro carril).
    const blockedStill = !!hit && (staticHit || (brain.mode === 'chase' && stillHit && !blockedByPlayer));
    if (absSpeed < 0.4 && (wantSpeed > 1 || blockedStill)) {
      brain.stuck += dt;
      if (brain.stuck > 3.5) {
        brain.stuck = 0;
        brain.reverse = 1.3;
        this.hitWall(v, brain, pos);
      }
    } else brain.stuck = 0;
    brain.jam = absSpeed < 0.5 ? (brain.jam ?? 0) + dt : 0;

    // parado por algo delante
    if (hit && wantSpeed < 1) {
      brain.blocked += dt;
      if (blockedByPlayer && brain.blocked > 1.2 && this.game.time.elapsed - brain.honked > 2.5) {
        brain.honked = this.game.time.elapsed;
        honk(this.game, v);
        this.game.events.emit('vehicle:honk' as any, { vehicle: v } as any);
        const d = v.driver && v.driver.kind === 'npc' ? v.driver.npc : null;
        if (d && rnd.next() < 0.5) this.game.mod.audio?.say(pos, 4, d.voice, 0.5);
      }
      if (staticHit && brain.blocked > 1.5) {
        // una farola, un árbol o una esquina: atrás y a intentarlo otra vez
        brain.blocked = 0;
        brain.stuck = 0;
        brain.reverse = 1.4;
        this.hitWall(v, brain, pos);
      } else if (brain.mode === 'lane' && !staticHit && brain.blocked > (blockedByPlayer ? 7 : stillHit ? 4 : 9)) {
        brain.blocked = 0;
        const tries = (brain.tries = (brain.tries ?? 0) + 1);
        // ¿de frente o cruzado? (en un cruce, dos que giran a la vez se quedan morro con morro)
        let dh = otherCar ? otherCar.heading - v.heading : 0;
        dh = Math.abs(Math.atan2(Math.sin(dh), Math.cos(dh)));
        if (otherCar && dh > 1.2 && (otherCar as any).brain && otherCar.id < v.id) {
          // cede el paso el de número más alto: marcha atrás; el otro espera y pasa
          brain.reverse = 1.3;
        } else if (otherCar && dh > 1.2 && (otherCar as any).brain && tries < 3) {
          // tiene preferencia: espera a que el otro se aparte (si no se aparta, acabará adelantando)
        } else if (tries % 2 === 0 && dh > 1.2) {
          brain.reverse = 1.3;
        } else {
          // un coche parado (o el jugador plantado, o alguien en la calzada): adelantar por el otro carril
          brain.bypass = 4.5;
        }
      }
    } else brain.blocked = 0;
    if (absSpeed > 3) brain.tries = 0;
    // ya circula con normalidad (lejos de la última pared): se olvidan las marchas atrás
    if (absSpeed > 6 && this.game.time.elapsed - (brain.wallAt ?? -99) > 4) brain.walls = 0;

    const diff = wantSpeed - speed;
    v.controls.throttle = diff > 0.5 ? THREE.MathUtils.clamp(diff * 0.35, 0.15, 1) : diff < -0.8 ? -1 : 0;
    v.controls.steer = steer;
    v.controls.handbrake = wantSpeed < 0.3 && absSpeed < 1;
    v.controls.boost = false;
  }
}
