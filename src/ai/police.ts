// Policía y nivel de búsqueda (1 a 5 sirenas).
// Sube si te ven robar coches, disparar, atropellar o destrozar. Se pierde escapando de su vista
// un rato o pasando por el taller de pintura del Polígono. Si te pillan: pierdes el efectivo y las armas pequeñas.
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
import { SOLID } from '../core/physics';

const HEAT_LEVELS = [0, 1, 3, 6, 10, 15];
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();

interface Unit {
  car: Vehicle;
  crew: Npc[];
  route: THREE.Vector3[];
  routeTimer: number;
  onFoot: boolean;
  roadblock: boolean;
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

  constructor(private game: Game) {
    game.mod.police = this;
    this.roads = (game.mod.traffic?.roads as Roads) ?? new Roads(game.world);
    const ev = game.events;
    // crímenes
    ev.on('vehicle:steal' as any, (e: any) => this.crime(e.npc?.police ? 3 : 1, 'robo', true));
    ev.on('weapon:shot' as any, (e: any) => {
      if (e.shooter?.kind === 'player') this.crime(e.melee ? 0.3 : 1, 'disparos', false, 60);
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
      if (b && 'side' in b) {
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
   * Un delito. `needsWitness`: solo cuenta si lo ve la policía (o con probabilidad si lo ve la gente).
   * maxDist: distancia a la que la policía lo oye/ve.
   */
  crime(weight: number, what: string, needsWitness: boolean, maxDist = 55) {
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
    this.heat += weight;
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
    this.game.events.emit('wanted', { level: this.wanted });
  }

  /** ¿Algún policía (a pie o en coche) ve este punto? */
  seesPoint(pt: THREE.Vector3, maxDist = 60): boolean {
    const eyes: THREE.Vector3[] = [];
    for (const o of this.officers) if (o.alive && !o.vehicle) eyes.push(tmpV2.copy(o.position).setY(o.position.y + 1.6).clone());
    for (const u of this.units) {
      // solo cuentan los coches con un policía al volante (no el que conduces tú ni uno vacío)
      if (u.car.destroyed || u.car.disposed || u.car === this.vm.current || u.car.driver?.kind !== 'npc') continue;
      eyes.push(u.car.getPosition(new THREE.Vector3()).setY(u.car.getPosition(tmpV2).y + 0.8));
    }
    const target = pt.clone().setY(pt.y + 1);
    for (const e of eyes) {
      const d = e.distanceTo(target);
      if (d > maxDist) continue;
      const dir = target.clone().sub(e);
      const hit = this.game.physics.raycast(e, dir, d - 0.8, SOLID);
      if (!hit) return true;
    }
    return false;
  }

  /** Borra la búsqueda y retira a la policía. */
  clear() {
    this.heat = 0;
    this.wanted = 0;
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

  private spawnUnit(roadblock = false) {
    const p = this.game.mod.player;
    const focus = p.position;
    const edges = this.roads.edgesInRing(focus, roadblock ? 55 : 90, roadblock ? 95 : 160);
    if (!edges.length) return;
    const eid = edges[Math.floor(rnd.next() * edges.length)];
    const dir: 1 | -1 = rnd.next() < 0.5 ? 1 : -1;
    const e = this.roads.g.edges[eid];
    const pos = this.roads.lanePoint(eid, dir, 0.5, roadblock ? 0 : e.width / 4, new THREE.Vector3());
    if (this.vm.nearest(pos, 8)) return;
    const kind = this.wanted >= 4 && rnd.next() < 0.4 ? 'policevan' : 'police';
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
    const unit: Unit = { car, crew, route: [], routeTimer: 0, onFoot: roadblock, roadblock };
    if (roadblock) this.dismount(unit);
    this.units.push(unit);
  }

  private dismount(u: Unit) {
    u.onFoot = true;
    const car = u.car;
    u.crew.forEach((n, i) => {
      if (n.removed) return;
      const side = i % 2 === 0 ? 1 : -1;
      const out = this.vm.doorPoint(car, new THREE.Vector3(), side);
      if (n.vehicle) n.leaveVehicle(out);
      else {
        n.position.copy(out);
        n.position.y = this.game.world.heightAt(out.x, out.z);
        n.rig.root.visible = true;
        n.collider.setEnabled(true);
        n.setState('idle');
        this.game.scene.add(n.rig.root);
      }
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
    this.paintCooldown -= dt;
    this.checkPaintShop();

    if (this.wanted === 0) {
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
      u.crew = u.crew.filter((n) => !n.removed);
      if (u.car.disposed) {
        // el coche ya no existe: los agentes siguen a pie
        for (const n of u.crew) if (!this.officers.includes(n)) this.officers.push(n);
        this.units.splice(i, 1);
        continue;
      }
      const alive = u.crew.some((n) => n.alive);
      const carIsMine = u.car === this.vm.current;
      const ref = carIsMine ? u.crew.find((n) => !n.removed)?.position ?? p.position : u.car.getPosition(tmpV);
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
      if (!u.onFoot) this.driveUnit(u, dt);
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
        this.roadblockTimer = 25 - this.wanted * 2;
        if (this.units.filter((u) => u.roadblock).length < this.wanted - 2) this.spawnUnit(true);
      }
    }

    // policías a pie
    for (let i = this.officers.length - 1; i >= 0; i--) {
      const o = this.officers[i];
      if (o.removed) {
        this.officers.splice(i, 1);
        continue;
      }
      const b = o.brain as CombatBrain;
      if (b) {
        b.arrestOnly = this.wanted <= 2 && p.state === 'foot';
        b.aggro = true;
      }
      updateCombatant(g, o, dt);
      // volver al coche si el jugador se va en vehículo y está lejos
    }
    this.checkArrest(dt);
  }

  private driveUnit(u: Unit, dt: number) {
    const g = this.game;
    const p = g.mod.player;
    const car = u.car;
    const brain = (car as any).brain as CarBrain | undefined;
    if (!brain || car.destroyed) {
      if (!u.onFoot) this.dismount(u);
      return;
    }
    const driver = car.driver && car.driver.kind === 'npc' ? car.driver.npc : null;
    if (!driver) {
      if (!u.onFoot) this.dismount(u);
      return;
    }
    const target = this.unseen < 3 ? (p.state === 'vehicle' && this.vm.current ? this.vm.current.getPosition(tmpV) : tmpV.copy(p.position)) : tmpV.copy(this.lastSeen);
    const carPos = car.getPosition(tmpV2);
    const dist = carPos.distanceTo(target);
    // bajarse cerca si el jugador va a pie o está parado
    const playerSlow = p.state === 'foot' || (this.vm.current && Math.abs(this.vm.current.speed) < 3);
    if (dist < 14 && playerSlow) {
      this.dismount(u);
      return;
    }
    // ruta por calles si está lejos; directo si está cerca
    u.routeTimer -= dt;
    if (dist > 35) {
      if (u.routeTimer <= 0 || !u.route.length) {
        u.routeTimer = 1.5;
        u.route = this.roads.route(carPos, target);
      }
      while (u.route.length > 1 && u.route[0].distanceTo(carPos) < 12) u.route.shift();
      brain.chaseTarget!.copy(u.route[0] ?? target);
    } else {
      // predicción: apuntar un poco por delante del coche del jugador
      const pv = this.vm.current;
      brain.chaseTarget!.copy(target);
      if (pv) {
        const lv = pv.body.linvel();
        brain.chaseTarget!.x += lv.x * 0.5;
        brain.chaseTarget!.z += lv.z * 0.5;
      }
    }
    brain.mode = 'chase';
    this.traffic?.drive(car, dt);
  }

  private checkArrest(dt: number) {
    const g = this.game;
    const p = g.mod.player;
    if (p.state === 'dead') return;
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
    const poi = g.world.pois.find((x) => x.kind === 'paint');
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
