// Los Devueltos: la banda rival. Controlan el Polígono (guardias en su guarida), montan emboscadas,
// persiguen al jugador en furgonetas moradas, le embisten hasta que se le caen paquetes e intentan sacarle.
import * as THREE from 'three';
import type { Game, System } from '../core/game';
import type { Npc } from '../actors/npc';
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
  get hideout() {
    return this.game.world.pois.find((p) => p.kind === 'hideout');
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
        if (b.home && m.alive && !m.busy) m.goTo(b.home);
        continue;
      }
      if (m.alive) this.npcs.remove(m);
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

  /** Emboscada: `count` miembros alrededor de `pos`, ya enfadados. */
  ambush(pos: THREE.Vector3, count = 3, weapon?: WeaponId): Npc[] {
    const out: Npc[] = [];
    const refY = this.game.world.heightAt(pos.x, pos.z);
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
      out.push(this.spawnMember(p, weapon, true));
    }
    this.game.events.emit('notify', { title: '¡Emboscada!', text: 'Os estábamos esperando, repartidor 😈', from: 'Los Devueltos', icon: '↩️' });
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

    // guardias de la guarida
    if (h) {
      const d = p.position.distanceTo(h.door);
      if (d < 130 && !this.guardsSpawned) {
        this.guardsSpawned = true;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const pos = new THREE.Vector3(h.door.x + Math.cos(a) * (6 + i), 0, h.door.z + Math.sin(a) * (6 + i));
          if (!g.world.isLand(pos.x, pos.z)) continue;
          pos.y = g.world.heightAt(pos.x, pos.z);
          const m = this.spawnMember(pos);
          (m.brain as CombatBrain).home = pos.clone();
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
        this.members.splice(i, 1);
        continue;
      }
      if (m.position.distanceTo(p.position) > 200 && !m.vehicle) {
        this.npcs.remove(m);
        this.members.splice(i, 1);
        continue;
      }
      const b = m.brain as CombatBrain;
      // los que bajan de la furgoneta intentan sacarte del vehículo y quitarte los paquetes
      const cur = this.vm.current;
      if ((b as any).robber && m.alive && !m.busy && !m.vehicle && cur && Math.abs(cur.speed) < 2) {
        this.tryRob(m);
        continue;
      }
      if (!b.aggro && b.home && !m.busy && !m.vehicle) {
        // patrulla tranquila alrededor de su sitio
        if (!m.target && rnd.next() < dt * 0.3) m.goTo(b.home.clone().add(new THREE.Vector3((rnd.next() - 0.5) * 8, 0, (rnd.next() - 0.5) * 8)));
      }
      updateCombatant(g, m, dt);
    }

    // persecuciones
    for (let i = this.chases.length - 1; i >= 0; i--) {
      const c = this.chases[i];
      c.life += dt;
      c.crew = c.crew.filter((n) => !n.removed);
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
      if (c.crew.every((n) => !n.alive) || c.life > 180 || c.van === this.vm.current) {
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
    const shooter = c.crew.find((n) => n !== driver && n.alive);
    if (shooter && dist < 28 && c.fireTimer <= 0) {
      c.fireTimer = 1.3 + rnd.next() * 1.4;
      const combat = g.mod.combat;
      const muzzle = van.localToWorld(new THREE.Vector3(-van.spec.half.x - 0.3, 0.5, 0.8), new THREE.Vector3());
      const aim = target.clone();
      aim.y += 0.8;
      aim.x += (rnd.next() - 0.5) * 2;
      aim.z += (rnd.next() - 0.5) * 2;
      if (combat) {
        const def = npcWeapon('smg');
        combat.fire({ kind: 'npc', npc: shooter, exclude: van.body }, def, muzzle, aim, 4 + dist / 6);
      }
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

/** Arma con el daño rebajado para los enemigos. */
function npcWeapon(id: WeaponId) {
  const d = WEAPONS[id];
  return { ...d, damage: d.damage * 0.35 };
}
