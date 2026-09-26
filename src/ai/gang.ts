// Los Devueltos: la banda rival. Controlan el Polígono (guardias en su guarida), montan emboscadas,
// persiguen al jugador en furgonetas moradas, le embisten hasta que se le caen paquetes e intentan sacarle.
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
import { WEAPONS, type WeaponId } from '../combat/weapons';
import { G } from '../core/physics';
import { driveChaseCar, offscreen, type ChaseNav } from './police';

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpMuzzle = new THREE.Vector3();
const tmpAim = new THREE.Vector3();
/**
 * Tregua tras reaparecer: mientras no te vayas de la zona donde has reaparecido (ver `truceZone`),
 * las emboscadas que salgan cerca esperan al acecho sin atacar. Los guardias de la guarida que estén
 * cerca no se enfadan solo por verte durante estos segundos.
 */
const TRUCE = 45;
/** Radio de la tregua alrededor del punto de reaparición (te vas de la zona a TRUCE_RADIUS + 20 m). */
const TRUCE_RADIUS = 130;
/** Segundos que esperan al acecho los de una emboscada en tregua antes de cansarse e irse. */
const LURK_WAIT = 90;
/** Segundos que la banda se acuerda de a cuántos les derribaste en una emboscada (para no mandarlos otra vez a todos). */
const AMBUSH_MEMORY = 300;

/** Una emboscada en un sitio: cuántos eran, cuántos has derribado y cuántos siguen por ahí. */
interface AmbushGroup {
  pos: THREE.Vector3;
  size: number;
  down: number;
  live: number;
  at: number;
}

interface Chase extends ChaseNav {
  van: Vehicle;
  crew: Npc[];
  fireTimer: number;
  stopTimer: number;
  dismounted: boolean;
  life: number;
}

export class Gang implements System {
  name = 'gang';
  readonly members: Npc[] = [];
  private guards: Npc[] = [];
  private guardsSpawned = false;
  private chases: Chase[] = [];
  private rng = new Rng('devueltos');
  private roads: Roads;
  private chaseTimer = 90;
  private territoryWarned = 0;
  /** Desactivar persecuciones aleatorias (tutorial, misiones tranquilas). */
  calm = false;
  /** Tregua tras reaparecer (ver TRUCE): hasta cuándo para los guardias y alrededor de dónde. */
  private truceUntil = -1;
  private readonly truceAt = new THREE.Vector3();
  /** El jugador aún no se ha ido de la zona donde reapareció (mientras tanto sigue la tregua ahí). */
  private truceZone = false;
  /** Emboscadas recientes (ver AMBUSH_MEMORY) y a cuál pertenece cada miembro. */
  private groups: AmbushGroup[] = [];
  private groupOf = new Map<Npc, AmbushGroup>();

  constructor(private game: Game) {
    game.mod.gang = this;
    this.roads = (game.mod.traffic?.roads as Roads) ?? new Roads(game.world);
    game.events.on('npc:hurt' as any, (e: any) => {
      const b = e.npc?.brain as CombatBrain | undefined;
      if (b && b.side === 'gang') {
        b.lastHurt = game.time.elapsed;
        b.aggro = true;
        // los compañeros cercanos también se enteran
        for (const m of this.members) if (m.position.distanceTo(e.npc.position) < 30) ((m.brain as CombatBrain).aggro = true);
      }
    });
    game.events.on('npc:killed' as any, (e: any) => {
      const n = e.npc as Npc;
      if (n.role !== 'devuelto') return;
      game.events.emit('gang:killed' as any, { npc: n } as any);
      const grp = this.groupOf.get(n);
      if (grp) {
        grp.down++;
        grp.live--;
        this.groupOf.delete(n);
      }
      // a veces sueltan dinero o munición
      const r = rnd.next();
      const pos = n.position.clone();
      if (r < 0.45) game.mod.pickups?.spawn('cash', pos, 20 + Math.floor(rnd.next() * 60), 40);
      else if (r < 0.65) game.mod.pickups?.spawn('ammo', pos, 20, 40);
      else if (r < 0.72) game.mod.pickups?.spawn('health', pos, 1, 40);
    });
    // embestidas de la furgoneta morada: se te caen paquetes
    game.events.on('vehicle:impact' as any, (e: any) => {
      const v = e.vehicle;
      if (v !== game.mod.vehicles?.current || e.dv < 8 || !v.packages) return;
      const near = this.chases.some((c) => !c.van.disposed && c.van.getPosition(tmpV).distanceTo(v.getPosition(tmpV2)) < v.spec.half.z + c.van.spec.half.z + 3);
      if (near) game.mod.jobs?.dropFrom(v, 1);
    });
    game.events.on('player:died', () => this.clearChases());
    game.events.on('player:respawn', () => {
      this.clearChases();
      // tregua: lo que salga cerca de donde reapareces (p. ej. la emboscada del rescate de un empleado
      // junto a la oficina) espera al acecho en vez de ir a por ti nada más levantarte, mientras no te vayas de allí
      this.truceUntil = game.time.elapsed + TRUCE;
      this.truceAt.copy(game.mod.player.position);
      this.truceZone = true;
      this.calmDown();
    });
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
  /** La guarida (se busca una vez: los sitios del mapa no cambian). */
  private hideoutPoi: Poi | undefined;
  get hideout(): Poi | undefined {
    return (this.hideoutPoi ??= this.game.world.pois.find((p) => p.kind === 'hideout'));
  }

  /** Crea un miembro de la banda. */
  spawnMember(pos: THREE.Vector3, weapon?: WeaponId, aggro = false): Npc {
    const n = this.npcs.spawn('devuelto', randomLookFor(this.rng, 'devuelto'), pos, rnd.next() * 6.28);
    n.hostile = true;
    n.killable = true;
    n.transient = false;
    n.health = n.maxHealth = 60;
    const lvl = this.game.mod.economy?.fameLevel ?? 1;
    const pool: WeaponId[] = lvl >= 4 ? ['pistol', 'smg', 'shotgun', 'launcher'] : lvl >= 2 ? ['pistol', 'pistol', 'smg', 'fists'] : ['pistol', 'fists', 'fists'];
    const w = weapon ?? pool[Math.floor(rnd.next() * pool.length)];
    const b = makeCombatBrain('gang', w);
    b.aggro = aggro;
    n.brain = b;
    armNpc(n, w);
    this.members.push(n);
    return n;
  }

  /**
   * Tras reaparecer: los que te estaban dando caza se van (si no, te esperan en la puerta del
   * centro de salud) y los guardias de la guarida vuelven a su sitio.
   */
  private calmDown() {
    for (const m of [...this.members]) {
      if (m.removed || m.role === 'jefe') continue;
      if (this.guards.includes(m)) {
        const b = m.brain as CombatBrain;
        b.aggro = false;
        b.mode = 'idle';
        m.aiming = false;
        if (m.position.distanceTo(this.truceAt) < TRUCE_RADIUS) b.calmUntil = this.truceUntil;
        if (b.home && m.alive && !m.busy) m.goTo(b.home);
        continue;
      }
      if (m.alive) this.npcs.remove(m);
    }
  }

  /**
   * La banda se retira (al cumplir una misión de la historia): se acaban las persecuciones, los que
   * estén a menos de `radius` de `center` se van andando (y desaparecen cuando nadie los ve) y los
   * guardias de la guarida vuelven a su sitio. Nadie se enfada solo por verte durante `calmFor` segundos.
   */
  standDown(center: THREE.Vector3, radius = 250, calmFor = 60) {
    this.clearChases();
    const until = this.game.time.elapsed + calmFor;
    for (const m of this.members) {
      if (m.removed || !m.alive || m.position.distanceTo(center) > radius) continue;
      const b = m.brain as CombatBrain | undefined;
      if (!b) continue;
      b.aggro = false;
      b.mode = 'idle';
      b.calmUntil = until;
      b.unseenFor = 0;
      b.lurk = false;
      m.aiming = false;
      (b as any).robber = false;
      if (this.guards.includes(m)) {
        if (b.home && !m.busy) m.goTo(b.home);
        continue;
      }
      b.home = null;
      b.holdAt = null;
      b.bored = true;
      m.stop();
    }
  }

  /** ¿Es un buen sitio para que aparezca alguien? En tierra, fuera de los edificios y sin desnivel raro. */
  private goodSpot(p: THREE.Vector3, refY: number): boolean {
    const w = this.game.world;
    if (!w.isLand(p.x, p.z)) return false;
    p.y = w.heightAt(p.x, p.z);
    if (Math.abs(p.y - refY) > 3) return false;
    // dentro de un edificio (hay techo encima)
    return !this.game.physics.raycast(tmpV.set(p.x, p.y + 21, p.z), tmpV2.set(0, -1, 0), 19.5, G.STATIC);
  }

  /**
   * La emboscada de este sitio si hubo una hace poco y aún no la has terminado (si no, una nueva).
   * Así, si derribas a 2 de 3 y te vas a curarte, al volver no salen otra vez los 3.
   */
  private ambushGroup(pos: THREE.Vector3, count: number): AmbushGroup {
    const now = this.game.time.elapsed;
    // (los que se han borrado hace un momento, p. ej. al reaparecer, ya no siguen por ahí)
    for (const m of this.groupOf.keys()) if (m.removed) this.leaveGroup(m);
    let w = 0;
    let found: AmbushGroup | null = null;
    for (const grp of this.groups) {
      if (now - grp.at > AMBUSH_MEMORY || (grp.down >= grp.size && grp.live <= 0)) continue;
      this.groups[w++] = grp;
      if (!found && grp.down < grp.size && grp.pos.distanceToSquared(pos) < 15 * 15) found = grp;
    }
    this.groups.length = w;
    if (found) {
      found.at = now;
      return found;
    }
    const grp: AmbushGroup = { pos: pos.clone(), size: count, down: 0, live: 0, at: now };
    this.groups.push(grp);
    return grp;
  }

  /** Emboscada: `count` miembros alrededor de `pos`, ya enfadados. */
  ambush(pos: THREE.Vector3, count = 3, weapon?: WeaponId): Npc[] {
    const out: Npc[] = [];
    const refY = this.game.world.heightAt(pos.x, pos.z);
    // si el jugador está lejos (p. ej. la misión de la guarida empieza en la oficina), esperan apostados
    // en su sitio hasta que llegues; si no, cruzarían media isla (o se borrarían por estar lejos)
    const cur = this.vm.current;
    const ppos = cur ? cur.getPosition(tmpV2) : this.game.mod.player.position;
    // recién reaparecido y cerca de donde reapareces: al acecho (esperan sin atacar salvo que te acerques
    // mucho o les ataques, y si no vas se cansan y se van: nada de quedarse plantados delante de la oficina)
    const lurk = this.truceZone && pos.distanceTo(this.truceAt) < TRUCE_RADIUS;
    const posted = !lurk && ppos.distanceTo(pos) > 120;
    // los que ya derribaste aquí hace poco no vuelven
    const grp = this.ambushGroup(pos, count);
    if (grp.size !== count || grp.down > 0 || grp.live > 0) count = Math.max(1, grp.size - grp.down - grp.live);
    for (let i = 0; i < count; i++) {
      // un sitio a 7-14 m, fuera de los edificios y, si se puede, donde no se vea aparecer
      let p: THREE.Vector3 | null = null;
      let fallback: THREE.Vector3 | null = null;
      for (let k = 0; k < 10 && !p; k++) {
        const a = (i / count) * Math.PI * 2 + rnd.next() * 1.4 + k * 0.7;
        const r = 7 + rnd.next() * 7;
        const c = new THREE.Vector3(pos.x + Math.cos(a) * r, 0, pos.z + Math.sin(a) * r);
        if (!this.goodSpot(c, refY)) continue;
        if (offscreen(this.game, c)) p = c;
        else fallback ??= c;
      }
      p ??= fallback ?? pos.clone();
      p.y = this.game.world.heightAt(p.x, p.z);
      const m = this.spawnMember(p, weapon, !posted && !lurk);
      const b = m.brain as CombatBrain;
      if (posted) {
        b.home = p.clone();
        b.holdAt = p.clone();
      } else if (lurk) {
        // (al acecho, `calmUntil` es hasta cuándo esperan antes de irse)
        b.lurk = true;
        b.calmUntil = this.game.time.elapsed + LURK_WAIT;
      }
      grp.live++;
      this.groupOf.set(m, grp);
      out.push(m);
    }
    if (!posted && !lurk) this.game.events.emit('notify', { title: '¡Emboscada!', text: 'Os estábamos esperando, repartidor 😈', from: 'Los Devueltos', icon: '↩️' });
    return out;
  }

  /** Persecución en furgoneta morada. */
  startChase(): boolean {
    const p = this.game.mod.player;
    const edges = this.roads.edgesInRing(p.position, 70, 130);
    if (!edges.length) return false;
    // una calle fuera de la vista, con la furgoneta ya mirando hacia el jugador
    let eid = -1;
    let dir: 1 | -1 = 1;
    let pos: THREE.Vector3 | null = null;
    for (let k = 0; k < 8; k++) {
      const id = edges[Math.floor(rnd.next() * edges.length)];
      const ed = this.roads.g.edges[id];
      const a = this.roads.g.nodes[ed.a].pos, b = this.roads.g.nodes[ed.b].pos;
      const d: 1 | -1 = b.distanceToSquared(p.position) < a.distanceToSquared(p.position) ? 1 : -1;
      const q = this.roads.lanePoint(id, d, 0.5, ed.width / 4, new THREE.Vector3());
      if (this.vm.nearest(q, 8)) continue;
      eid = id;
      dir = d;
      pos = q;
      if (offscreen(this.game, q)) break;
    }
    if (!pos) return false;
    const van = this.vm.spawn('gangvan', pos, this.roads.heading(eid, dir));
    const crew: Npc[] = [];
    for (let i = 0; i < 3; i++) {
      const n = this.spawnMember(pos.clone(), i === 0 ? 'pistol' : i === 1 ? 'smg' : 'fists', true);
      if (i === 0) n.enterVehicle(van);
      else n.rideAlong(van);
      crew.push(n);
    }
    const brain: CarBrain = { edge: eid, dir, t: 0.5, next: null, cruise: 22, blocked: 0, stuck: 0, reverse: 0, honked: 0, mode: 'chase', chaseTarget: new THREE.Vector3() };
    (van as any).brain = brain;
    this.chases.push({ van, crew, route: [], routeTimer: 0, fireTimer: 2, stopTimer: 0, dismounted: false, life: 0, unstick: { t: 0, tries: 0 } });
    this.game.events.emit('notify', { title: 'Furgoneta morada detrás', text: '¿Ese paquete es para nosotros? 😂', from: 'Los Devueltos', icon: '↩️' });
    return true;
  }

  private clearChases() {
    for (const c of this.chases) {
      for (const n of c.crew) if (!n.removed) this.npcs.remove(n);
      if (!c.van.destroyed && c.van !== this.vm.current) this.vm.remove(c.van);
    }
    this.chases = [];
  }

  update(dt: number) {
    const g = this.game;
    const p = g.mod.player;
    if (!p || !g.world) return;
    const h = this.hideout;

    // la tregua tras reaparecer se acaba al irte de la zona
    if (this.truceZone && p.position.distanceTo(this.truceAt) > TRUCE_RADIUS + 20) this.truceZone = false;

    // guardias de la guarida
    if (h) {
      const d = p.position.distanceTo(h.door);
      if (d < 130 && !this.guardsSpawned) {
        this.guardsSpawned = true;
        const refY = g.world.heightAt(h.door.x, h.door.z);
        for (let i = 0; i < 6; i++) {
          // alrededor de la puerta, pero fuera de las naves (si no, se quedan encerrados dentro)
          let pos: THREE.Vector3 | null = null;
          for (let k = 0; k < 6 && !pos; k++) {
            const a = (i / 6) * Math.PI * 2 + k * 0.5;
            const c = new THREE.Vector3(h.door.x + Math.cos(a) * (6 + i), 0, h.door.z + Math.sin(a) * (6 + i));
            if (this.goodSpot(c, refY)) pos = c;
          }
          if (!pos) continue;
          const m = this.spawnMember(pos);
          // defienden la guarida: no persiguen al jugador por medio Polígono (ni se quedan atascados en la valla)
          (m.brain as CombatBrain).home = pos.clone();
          (m.brain as CombatBrain).holdAt = pos.clone();
          this.guards.push(m);
        }
      } else if (d > 190 && this.guardsSpawned) {
        for (const x of this.guards) if (!x.removed) this.npcs.remove(x);
        this.guards = [];
        this.guardsSpawned = false;
      }
      // zona de la banda: si te acercas a menos de 45 m te atacan
      if (d < 45) {
        if (g.time.elapsed - this.territoryWarned > 30) {
          this.territoryWarned = g.time.elapsed;
          g.events.emit('toast', { text: 'Territorio de Los Devueltos', color: '#6c3bd1', time: 2.5 });
        }
        for (const m of this.guards) if (m.alive && m.position.distanceTo(p.position) < 40) (m.brain as CombatBrain).aggro = true;
      }
    }

    // IA de todos los miembros a pie
    for (let i = this.members.length - 1; i >= 0; i--) {
      const m = this.members[i];
      if (m.removed) {
        this.leaveGroup(m);
        this.members.splice(i, 1);
        continue;
      }
      // lejos se retiran (los apostados esperando en su sitio aguantan más)
      const farLimit = (m.brain as CombatBrain)?.home ? 420 : 200;
      if (m.position.distanceTo(p.position) > farLimit && !m.vehicle) {
        this.npcs.remove(m);
        this.leaveGroup(m);
        this.members.splice(i, 1);
        continue;
      }
      const b = m.brain as CombatBrain;
      // al acecho: si uno se enfada (te ha visto muy cerca o le has dado) o llegas al sitio de la emboscada
      // (aunque estén detrás de una esquina), salen todos los de alrededor; si se cansan de esperar o te
      // vas de la zona de la tregua, se van
      if (b.lurk && m.alive) {
        const spot = this.groupOf.get(m)?.pos;
        if (b.aggro || m.position.distanceToSquared(p.position) < 6 * 6 || (spot && spot.distanceToSquared(p.position) < 10 * 10)) this.wakeLurkers(m);
        else if (g.time.elapsed > b.calmUntil || !this.truceZone) {
          b.lurk = false;
          b.bored = true;
          b.calmUntil = g.time.elapsed + 30;
        }
      }
      // los que bajan de la furgoneta intentan sacarte del vehículo y quitarte los paquetes
      // (solo si siguen a por ti y estás cerca: no cruzan media isla cada vez que paras)
      const cur = this.vm.current;
      if ((b as any).robber && b.aggro && m.alive && !m.busy && !m.vehicle && cur && Math.abs(cur.speed) < 2 && cur.getPosition(tmpV).distanceTo(m.position) < 40) {
        this.tryRob(m);
        continue;
      }
      // han perdido el interés: se van andando y, cuando nadie los ve, se retiran
      // (el jefe final no: se queda por allí hasta que vuelvas)
      if (b.bored && !b.aggro && !b.home && m.alive && !m.busy && !m.vehicle && m.role !== 'jefe') {
        const dp = m.position.distanceTo(p.position);
        // (lo de si se le ve, cada 10 frames: es un rayo)
        if (dp > 35 && (g.time.frame + m.id) % 10 === 0 && offscreen(g, m.position)) {
          this.npcs.remove(m);
          this.leaveGroup(m);
          this.members.splice(i, 1);
          continue;
        }
        if (!m.target) {
          tmpV.copy(m.position).sub(p.position).setY(0);
          if (tmpV.lengthSq() < 0.01) tmpV.set(1, 0, 0);
          tmpV.normalize().multiplyScalar(30).add(m.position);
          if (g.world.isLand(tmpV.x, tmpV.z)) m.goTo(tmpV);
        }
      }
      if (!b.aggro && b.home && !m.busy && !m.vehicle) {
        // patrulla tranquila alrededor de su sitio
        if (!m.target && rnd.next() < dt * 0.3) m.goTo(tmpV.set(b.home.x + (rnd.next() - 0.5) * 8, b.home.y, b.home.z + (rnd.next() - 0.5) * 8));
      }
      updateCombatant(g, m, dt);
    }

    // persecuciones
    const chases = this.chases;
    for (let i = chases.length - 1; i >= 0; i--) {
      // (un disparo desde la furgoneta puede matarte y vaciar la lista de persecuciones)
      if (chases !== this.chases) break;
      const c = chases[i];
      if (!c) continue;
      c.life += dt;
      dropRemoved(c.crew);
      if (c.van.disposed) {
        this.chases.splice(i, 1);
        continue;
      }
      const far = c.van.getPosition(tmpV).distanceTo(p.position) > 230;
      if (far) {
        for (const n of c.crew) if (!n.removed) this.npcs.remove(n);
        if (!c.van.destroyed && c.van !== this.vm.current) this.vm.remove(c.van);
        this.chases.splice(i, 1);
        continue;
      }
      if (c.van.destroyed && !c.dismounted) this.dismount(c);
      if (!anyAlive(c.crew) || c.life > 180 || c.van === this.vm.current) {
        // se acabó: la furgoneta se queda aparcada (te la puedes llevar) y los que queden van a pie
        if (!c.van.destroyed && c.van !== this.vm.current) {
          if (!c.dismounted) this.dismount(c);
          (c.van as any).brain = undefined;
          this.game.mod.traffic?.parked.push(c.van);
        }
        this.chases.splice(i, 1);
        continue;
      }
      if (!c.dismounted) this.driveChase(c, dt);
    }

    // persecuciones aleatorias cuando llevas paquetes o dinero
    if (!this.calm && p.state === 'vehicle') {
      this.chaseTimer -= dt;
      const v = this.vm.current;
      const tempting = (v?.packages ?? 0) > 0 || (g.mod.economy?.cash ?? 0) > 400;
      if (this.chaseTimer <= 0) {
        this.chaseTimer = 120 + rnd.next() * 120;
        if (tempting && this.chases.length === 0 && rnd.next() < 0.6) this.startChase();
      }
    }
  }

  /** Ya no está (sin haber caído): deja de contar como uno de los que siguen en su emboscada. */
  private leaveGroup(m: Npc) {
    const grp = this.groupOf.get(m);
    if (!grp) return;
    grp.live--;
    this.groupOf.delete(m);
  }

  /** Salta la emboscada de los que estaban al acecho alrededor de `m`. */
  private wakeLurkers(m: Npc) {
    for (const o of this.members) {
      const ob = o.brain as CombatBrain | undefined;
      if (!ob || (o !== m && (!ob.lurk || o.removed || !o.alive || o.position.distanceTo(m.position) > 30))) continue;
      ob.lurk = false;
      ob.calmUntil = 0;
      ob.aggro = true;
      ob.bored = false;
    }
    this.game.events.emit('notify', { title: '¡Emboscada!', text: 'Os estábamos esperando, repartidor 😈', from: 'Los Devueltos', icon: '↩️' });
  }

  private lastRob = -99;
  private tryRob(m: Npc) {
    const g = this.game;
    const v = this.vm.current;
    if (!v || Math.abs(v.speed) > 2 || g.time.elapsed - this.lastRob < 12) return;
    const door = this.vm.doorPoint(v, new THREE.Vector3());
    if (m.position.distanceTo(door) > 2.6) {
      m.goTo(door, true);
      return;
    }
    this.lastRob = g.time.elapsed;
    g.mod.bubbles?.say(m, '¡Fuera de ahí! ¡Esos paquetes son nuestros!', 2.5);
    g.mod.jobs?.dropFrom(v, 99);
    this.vm.forceExit();
    const p = g.mod.player;
    p.push.set((rnd.next() - 0.5) * 6, 4, (rnd.next() - 0.5) * 6);
    p.pose = 'knocked';
    p.poseTimer = 1.2;
    p.hurt(8, { cause: 'puñetazo' });
    g.events.emit('toast', { text: '¡Te han sacado de la furgoneta! Recoge los paquetes del suelo', color: '#6c3bd1', time: 3 });
  }

  private driveChase(c: Chase, dt: number) {
    const g = this.game;
    const p = g.mod.player;
    const van = c.van;
    const brain = (van as any).brain as CarBrain | undefined;
    const driver = van.driver && van.driver.kind === 'npc' ? van.driver.npc : null;
    if (!brain || van.destroyed || !driver) {
      this.dismount(c);
      return;
    }
    const target = p.state === 'vehicle' && this.vm.current ? this.vm.current.getPosition(tmpV) : tmpV.copy(p.position);
    const vpos = van.getPosition(tmpV2);
    const dist = vpos.distanceTo(target);
    // por calles si no te ve; directo si te ve o está cerca. Atascada sin remedio y sin que nadie la vea: se recoloca
    if (driveChaseCar(g, this.roads, van, brain, c, target, 0.4, dt) && dist > 45 && offscreen(g, vpos)) {
      this.relocate(c);
      return;
    }

    // disparos desde la ventanilla (el copiloto)
    c.fireTimer -= dt;
    let shooter: Npc | null = null;
    for (const n of c.crew) if (n !== driver && n.alive) { shooter = n; break; }
    if (shooter && dist < 28 && c.fireTimer <= 0) {
      c.fireTimer = 1.3 + rnd.next() * 1.4;
      const combat = g.mod.combat;
      const muzzle = van.localToWorld(tmpMuzzle.set(-van.spec.half.x - 0.3, 0.5, 0.8), tmpMuzzle);
      const aim = tmpAim.copy(target);
      aim.y += 0.8;
      aim.x += (rnd.next() - 0.5) * 2;
      aim.z += (rnd.next() - 0.5) * 2;
      if (combat) combat.fire({ kind: 'npc', npc: shooter, exclude: van.body }, VAN_SMG, muzzle, aim, 4 + dist / 6);
    }

    // si el jugador se para cerca, bajan a por él
    const pv = this.vm.current;
    const playerStopped = p.state === 'foot' || (pv && Math.abs(pv.speed) < 2);
    if ((dist < 12 && playerStopped) || (dist < 30 && c.unstick.tries > 0 && playerStopped)) {
      c.stopTimer += dt;
      if (c.stopTimer > 1.2) this.dismount(c);
    } else c.stopTimer = 0;
  }

  /** Pone una furgoneta atascada en otra calle (fuera de la vista) mirando hacia el jugador. */
  private relocate(c: Chase) {
    const p = this.game.mod.player;
    const focus = this.vm.current ? this.vm.current.getPosition(new THREE.Vector3()) : p.position;
    const edges = this.roads.edgesInRing(focus, 60, 110);
    for (let k = 0; k < 8 && edges.length; k++) {
      const id = edges[Math.floor(rnd.next() * edges.length)];
      const ed = this.roads.g.edges[id];
      const a = this.roads.g.nodes[ed.a].pos, b = this.roads.g.nodes[ed.b].pos;
      const d: 1 | -1 = b.distanceToSquared(focus) < a.distanceToSquared(focus) ? 1 : -1;
      const q = this.roads.lanePoint(id, d, 0.5, ed.width / 4, new THREE.Vector3());
      if (this.vm.nearest(q, 8) || !offscreen(this.game, q)) continue;
      c.van.place(q, this.roads.heading(id, d));
      c.unstick.t = 0;
      c.unstick.tries = 0;
      c.route = [];
      const brain = (c.van as any).brain as CarBrain | undefined;
      if (brain) {
        brain.edge = id;
        brain.dir = d;
        brain.t = 0.5;
        brain.reverse = 0;
      }
      return;
    }
  }

  private dismount(c: Chase) {
    c.dismounted = true;
    const van = c.van;
    c.crew.forEach((n, i) => {
      if (n.removed) return;
      const out = this.vm.doorPoint(van, new THREE.Vector3(), i % 2 === 0 ? 1 : -1);
      if (n.vehicle) n.leaveVehicle(out);
      else {
        n.position.copy(out);
        n.position.y = this.game.world.heightAt(out.x, out.z);
        n.rig.root.visible = true;
        n.collider.setEnabled(true);
        n.setState('idle');
        this.game.scene.add(n.rig.root);
      }
      (n.brain as CombatBrain).aggro = true;
      (n.brain as any).robber = true;
    });
    van.controls.throttle = 0;
    van.controls.handbrake = true;
    (van as any).brain = undefined;
  }
}

/** Subfusil del copiloto de la furgoneta, con el daño rebajado para los enemigos (hecho una vez, no en cada ráfaga). */
const VAN_SMG = { ...WEAPONS.smg, damage: WEAPONS.smg.damage * 0.3 };

/** ¿Queda alguno en pie? (sin funciones nuevas en cada frame) */
function anyAlive(list: Npc[]): boolean {
  for (const n of list) if (n.alive) return true;
  return false;
}

/** Quita de la lista los que ya no existen, sin crear una lista nueva. */
function dropRemoved(list: Npc[]) {
  let w = 0;
  for (let i = 0; i < list.length; i++) if (!list[i].removed) list[w++] = list[i];
  list.length = w;
}
