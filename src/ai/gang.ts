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

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();

interface Chase {
  van: Vehicle;
  crew: Npc[];
  route: THREE.Vector3[];
  routeTimer: number;
  fireTimer: number;
  stopTimer: number;
  dismounted: boolean;
  life: number;
}

export class Gang implements System {
  name = 'gang';
  readonly members: Npc[] = [];
  private guards: Npc[] = [];
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
    game.events.on('player:died', () => this.clearChases());
    game.events.on('player:respawn', () => this.clearChases());
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

  /** Emboscada: `count` miembros alrededor de `pos`, ya enfadados. */
  ambush(pos: THREE.Vector3, count = 3, weapon?: WeaponId): Npc[] {
    const out: Npc[] = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rnd.next();
      const r = 6 + rnd.next() * 6;
      const p = new THREE.Vector3(pos.x + Math.cos(a) * r, 0, pos.z + Math.sin(a) * r);
      if (!this.game.world.isLand(p.x, p.z)) p.copy(pos);
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
    const eid = edges[Math.floor(rnd.next() * edges.length)];
    const dir: 1 | -1 = rnd.next() < 0.5 ? 1 : -1;
    const e = this.roads.g.edges[eid];
    const pos = this.roads.lanePoint(eid, dir, 0.5, e.width / 4, new THREE.Vector3());
    if (this.vm.nearest(pos, 8)) return false;
    const van = this.vm.spawn('gangvan', pos, this.roads.heading(eid, dir));
    const crew: Npc[] = [];
    for (let i = 0; i < 3; i++) {
      const n = this.spawnMember(pos.clone(), i === 0 ? 'pistol' : i === 1 ? 'smg' : 'fists', true);
      if (i === 0) n.enterVehicle(van);
      else {
        n.rig.root.visible = false;
        n.setState('driving');
        n.collider.setEnabled(false);
      }
      crew.push(n);
    }
    const brain: CarBrain = { edge: eid, dir, t: 0.5, next: null, cruise: 22, blocked: 0, stuck: 0, reverse: 0, honked: 0, mode: 'chase', chaseTarget: new THREE.Vector3() };
    (van as any).brain = brain;
    this.chases.push({ van, crew, route: [], routeTimer: 0, fireTimer: 2, stopTimer: 0, dismounted: false, life: 0 });
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
      if (d < 130 && this.guards.filter((x) => !x.removed).length === 0 && !(g as any).hideoutCleared) {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const pos = new THREE.Vector3(h.door.x + Math.cos(a) * (6 + i), 0, h.door.z + Math.sin(a) * (6 + i));
          if (!g.world.isLand(pos.x, pos.z)) continue;
          pos.y = g.world.heightAt(pos.x, pos.z);
          const m = this.spawnMember(pos);
          (m.brain as CombatBrain).home = pos.clone();
          this.guards.push(m);
        }
      } else if (d > 190) {
        for (const x of this.guards) if (!x.removed) this.npcs.remove(x);
        this.guards = [];
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
      const far = c.van.getPosition(tmpV).distanceTo(p.position) > 230;
      if (far || c.crew.length === 0 || c.life > 180) {
        for (const n of c.crew) if (!n.removed) this.npcs.remove(n);
        if (!c.van.destroyed && c.van !== this.vm.current) this.vm.remove(c.van);
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
    c.routeTimer -= dt;
    if (dist > 35) {
      if (c.routeTimer <= 0 || !c.route.length) {
        c.routeTimer = 1.5;
        c.route = this.roads.route(vpos, target);
      }
      while (c.route.length > 1 && c.route[0].distanceTo(vpos) < 12) c.route.shift();
      brain.chaseTarget!.copy(c.route[0] ?? target);
    } else {
      brain.chaseTarget!.copy(target);
      const pv = this.vm.current;
      if (pv) {
        const lv = pv.body.linvel();
        brain.chaseTarget!.x += lv.x * 0.4;
        brain.chaseTarget!.z += lv.z * 0.4;
      }
    }
    brain.mode = 'chase';
    this.traffic?.drive(van, dt);

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
    if (dist < 12 && playerStopped) {
      c.stopTimer += dt;
      if (c.stopTimer > 1.2) this.dismount(c);
    } else c.stopTimer = 0;
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
