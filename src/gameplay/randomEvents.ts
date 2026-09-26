// Eventos aleatorios por la isla: ladrón de bolsos, paquetes que se caen de un camión y carreras callejeras.
import * as THREE from 'three';
import type { Game, System } from '../core/game';
import type { Npc } from '../actors/npc';
import type { Vehicle } from '../vehicles/vehicle';
import type { CarBrain } from '../ai/traffic';
import { randomLookFor } from '../actors/looks';
import { Rng, fx as rnd } from '../core/rng';

type Ev =
  | { kind: 'thief'; thief: Npc; victim: Npc; bag: boolean; t: number }
  | { kind: 'truck'; truck: Vehicle; drops: number; t: number; next: number }
  | { kind: 'race'; rival: Vehicle; checkpoints: THREE.Vector3[]; idx: number; rivalIdx: number; t: number; started: boolean; accepted: boolean };

const rng = new Rng('eventos');
const tmpV = new THREE.Vector3();

export class RandomEvents implements System {
  name = 'randomEvents';
  private ev: Ev | null = null;
  private timer = 150;
  enabled = true;

  constructor(private game: Game) {
    game.mod.randomEvents = this;
  }

  private busy(): boolean {
    const g = this.game;
    return !!(g.mod.story?.running || g.mod.interiors?.inside || (g.mod.police?.wanted ?? 0) > 0 || g.mod.tutorial?.done === false);
  }

  update(dt: number) {
    const g = this.game;
    if (!this.enabled || !g.world || !g.mod.player) return;
    if (!this.ev) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = 150 + rnd.next() * 150;
        if (!this.busy()) this.start();
      }
      return;
    }
    this.tick(dt);
  }

  start(kind?: Ev['kind']) {
    const g = this.game;
    const p = g.mod.player;
    const k = kind ?? (p.state === 'vehicle' ? (rnd.next() < 0.5 ? 'race' : 'truck') : rnd.next() < 0.6 ? 'thief' : 'truck');
    const roads = g.mod.traffic?.roads;
    if (!roads) return;
    if (k === 'thief') {
      const edges = roads.edgesInRing(p.position, 18, 45, false);
      if (!edges.length) return;
      const e = roads.g.edges[edges[Math.floor(rnd.next() * edges.length)]];
      const pos = roads.lanePoint(e.id, 1, 0.5, e.width / 2 + 1.3, new THREE.Vector3());
      const victim = g.mod.npcs.spawn('civil', randomLookFor(rng, 'abuela'), pos.clone());
      const thief = g.mod.npcs.spawn('civil', randomLookFor(rng, 'civil'), pos.clone().add(new THREE.Vector3(1.5, 0, 0)));
      victim.transient = thief.transient = false;
      thief.hostile = true;
      thief.killable = false;
      thief.runSpeed = 6.2;
      thief.health = thief.maxHealth = 40;
      const away = pos.clone().add(new THREE.Vector3((rnd.next() - 0.5) * 120, 0, (rnd.next() - 0.5) * 120));
      thief.goTo(away, true);
      victim.customPose = 'hands_up';
      victim.setState('custom');
      g.mod.bubbles?.say(victim, '¡AL LADRÓN! ¡Mi bolso! ¡Que alguien le pare!', 3.5);
      g.mod.audio?.say(victim.position, 6, 1.4, 0.8);
      g.events.emit('toast', { text: '👜 ¡Un ladrón de bolsos! Tíralo al suelo para recuperarlo', color: '#ff7b54', time: 3 });
      this.ev = { kind: 'thief', thief, victim, bag: true, t: 0 };
    } else if (k === 'truck') {
      const edges = roads.edgesInRing(p.position, 40, 90, true);
      if (!edges.length) return;
      const eid = edges[Math.floor(rnd.next() * edges.length)];
      const truck = g.mod.traffic.spawnCar(eid, 1, 0.3, 'truck');
      if (!truck) return;
      truck.transient = false;
      g.mod.messages?.receive('radio-macuto', 'Radio Macuto', '📻', 'Aviso: un furgón de reparto va perdiendo paquetes por el barrio. Quien los encuentre, que se los quede. O que los devuelva. Tú sabrás.');
      this.ev = { kind: 'truck', truck, drops: 0, t: 0, next: 2 };
    } else {
      // carrera: rival deportivo al lado
      const cur = g.mod.vehicles.current as Vehicle | null;
      if (!cur) return;
      const ne = roads.nearestEdge(cur.getPosition(tmpV), true);
      if (!ne) return;
      const e = roads.g.edges[ne.edge];
      const pos = roads.lanePoint(ne.edge, 1, ne.t, -e.width / 4, new THREE.Vector3());
      if (g.mod.vehicles.nearest(pos, 4)) return;
      const rival = g.mod.vehicles.spawn('sports', pos, roads.heading(ne.edge, 1), '#e63946');
      rival.transient = false;
      const driver = g.mod.npcs.spawn('driver', randomLookFor(rng, 'fiestero'), pos);
      driver.enterVehicle(rival);
      // ruta: 4 puntos a lo largo de calles
      const far = roads.g.nodes[Math.floor(rnd.next() * roads.g.nodes.length)].pos;
      let route = roads.route(pos, far);
      if (route.length < 4) route = roads.route(pos, roads.g.nodes[Math.floor(rnd.next() * roads.g.nodes.length)].pos);
      const cps = route.filter((_, i) => i % 2 === 1).slice(0, 5);
      if (cps.length < 2) {
        g.mod.vehicles.remove(rival);
        return;
      }
      (rival as any).brain = { edge: ne.edge, dir: 1, t: ne.t, next: null, cruise: 30, blocked: 0, stuck: 0, reverse: 0, honked: 0, mode: 'chase', chaseTarget: cps[0].clone() } as CarBrain;
      this.ev = { kind: 'race', rival, checkpoints: cps, idx: 0, rivalIdx: 0, t: 0, started: false, accepted: false };
      g.mod.bubbles?.say(driver, '¿Una carrerita, repartidor? ¡Al que llegue primero, 500 pavos!', 4);
      g.mod.messages?.receive('carrera', 'El Niño Nitro', '🏎️', '¿Te atreves? Carrera hasta el último punto. Si ganas, 500 €. Si pierdes, me das 200.', [
        { label: '¡Vamos!', style: 'si', run: () => this.acceptRace(), valid: () => this.ev?.kind === 'race' && !this.ev.accepted },
        { label: 'Paso', style: 'no', run: () => this.end(), valid: () => this.ev?.kind === 'race' && !this.ev.accepted },
      ]);
    }
  }

  private acceptRace() {
    const ev = this.ev;
    if (!ev || ev.kind !== 'race') return;
    ev.accepted = true;
    ev.t = 0;
    this.game.events.emit('toast', { text: '🏁 3… 2… 1… ¡YA!', color: '#ffd23f', time: 2 });
    this.game.mod.audio?.play('bell');
  }

  private end() {
    const g = this.game;
    const ev = this.ev;
    this.ev = null;
    g.hud.markers = g.hud.markers.filter((m) => !(m as any).event);
    if (!ev) return;
    if (ev.kind === 'thief') {
      for (const n of [ev.thief, ev.victim]) {
        const npc = n;
        setTimeout(() => !npc.removed && g.mod.npcs?.remove(npc), 4000);
      }
    } else if (ev.kind === 'race') {
      const r = ev.rival;
      setTimeout(() => {
        const d = r.driver && r.driver.kind === 'npc' ? r.driver.npc : null;
        if (d) g.mod.npcs?.remove(d);
        if (r !== g.mod.vehicles?.current) g.mod.vehicles?.remove(r);
      }, 6000);
    }
  }

  private tick(dt: number) {
    const g = this.game;
    const ev = this.ev!;
    ev.t += dt;
    const p = g.mod.player;
    g.hud.markers = g.hud.markers.filter((m) => !(m as any).event);
    if (ev.kind === 'thief') {
      const th = ev.thief;
      if (ev.bag) {
        g.hud.markers.push({ x: th.position.x, z: th.position.z, icon: '👜', color: '#ff7b54', event: true } as any);
        if (th.busy && th.state !== 'flee') {
          // derribado: suelta el bolso
          ev.bag = false;
          const pos = th.position.clone();
          g.mod.bubbles?.say(th, '¡Vale, vale! ¡Toma tu bolso!', 2);
          g.mod.pickups?.spawn('package', pos, 1, 60, () => {
            (ev as any).gotBag = true;
            g.events.emit('toast', { text: 'Bolso recuperado: devuélveselo a la señora', color: '#ff7b54' });
          });
          th.hostile = false;
          th.setState('flee');
        } else if (!th.target) {
          th.goTo(th.position.clone().add(new THREE.Vector3((rnd.next() - 0.5) * 60, 0, (rnd.next() - 0.5) * 60)), true);
        }
        if (ev.t > 70 || th.position.distanceTo(p.position) > 150) {
          g.mod.bubbles?.say(ev.victim, 'Nada, que se ha escapado… Mi bolso de la suerte…', 3);
          this.end();
        }
      } else if ((ev as any).gotBag) {
        const v = ev.victim;
        g.hud.markers.push({ x: v.position.x, z: v.position.z, icon: '👵', color: '#ff7b54', event: true } as any);
        if (p.state === 'foot' && p.position.distanceTo(v.position) < 2.5) {
          g.mod.bubbles?.say(v, '¡Ay, hijo, qué majo! Toma, para un café. O para diez.', 3.5);
          g.mod.economy?.addCash(150, 'recompensa');
          g.mod.economy?.addFame(20, 'buena acción');
          g.mod.audio?.play('success');
          this.end();
        }
      } else if (ev.t > 100) this.end();
    } else if (ev.kind === 'truck') {
      const tr = ev.truck;
      ev.next -= dt;
      if (ev.next <= 0 && ev.drops < 4 && !tr.destroyed) {
        ev.next = 3 + rnd.next() * 2;
        ev.drops++;
        const back = tr.localToWorld(new THREE.Vector3(0, 0, -tr.spec.half.z - 1), new THREE.Vector3());
        back.y = g.world.heightAt(back.x, back.z);
        g.mod.particles?.emit('cardboard', back, { count: 5 });
        g.mod.audio?.play('drop', { pos: back });
        g.mod.pickups?.spawn('package', back, 1, 90, () => {
          g.mod.economy?.addCash(60, 'paquete encontrado');
          g.events.emit('toast', { text: '📦 Paquete encontrado: +60 € (nadie lo reclamará… probablemente)', color: '#ffd23f' });
        });
      }
      if (ev.t > 30) this.end();
    } else if (ev.kind === 'race') {
      const cur = g.mod.vehicles.current as Vehicle | null;
      const cp = ev.checkpoints;
      if (ev.idx < cp.length) g.hud.markers.push({ x: cp[ev.idx].x, z: cp[ev.idx].z, icon: '🏁', color: '#ffd23f', event: true } as any);
      if (!ev.accepted) {
        (ev.rival as any).brain.cruise = 0;
        ev.rival.controls.throttle = 0;
        ev.rival.controls.handbrake = true;
        if (ev.t > 25) this.end();
        return;
      }
      // rival
      const rb = (ev.rival as any).brain as CarBrain | undefined;
      if (rb && ev.rival.driver) {
        rb.mode = 'chase';
        if (ev.rivalIdx < cp.length) {
          rb.chaseTarget!.copy(cp[ev.rivalIdx]);
          if (ev.rival.getPosition(tmpV).distanceTo(cp[ev.rivalIdx]) < 12) ev.rivalIdx++;
        }
        g.mod.traffic?.drive(ev.rival, dt);
      }
      // jugador
      if (cur && ev.idx < cp.length && cur.getPosition(tmpV).distanceTo(cp[ev.idx]) < 14) {
        ev.idx++;
        g.mod.audio?.play('coin');
      }
      if (ev.idx >= cp.length) {
        g.events.emit('toast', { text: '🏆 ¡Has ganado la carrera! +500 €', color: '#ffd23f', time: 3 });
        g.mod.economy?.addCash(500, 'carrera');
        g.mod.economy?.addFame(30, 'carrera');
        g.mod.audio?.play('cheer');
        this.end();
      } else if (ev.rivalIdx >= cp.length) {
        g.events.emit('toast', { text: '😤 Ha ganado El Niño Nitro. −200 €', color: '#ff4f81', time: 3 });
        g.mod.economy?.spend(Math.min(200, (g.mod.economy?.cash ?? 0) + (g.mod.economy?.bank ?? 0)), 'carrera');
        this.end();
      } else if (ev.t > 150) this.end();
    }
  }
}
