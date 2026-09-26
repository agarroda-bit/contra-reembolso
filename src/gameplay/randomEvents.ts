// Eventos aleatorios por la isla: ladrón de bolsos, paquetes que se caen de un camión y carreras callejeras.
import * as THREE from 'three';
import type { Game, System } from '../core/game';
import type { Npc } from '../actors/npc';
import type { Vehicle } from '../vehicles/vehicle';
import type { CarBrain } from '../ai/traffic';
import type { Roads } from '../ai/roads';
import { randomLookFor } from '../actors/looks';
import { Rng, fx as rnd } from '../core/rng';

/** Un tramo de la ruta de la carrera: una calle recorrida en un sentido. */
type Leg = { edge: number; dir: 1 | -1 };

type Ev =
  | { kind: 'thief'; thief: Npc; victim: Npc; bag: boolean; t: number }
  | { kind: 'truck'; truck: Vehicle; drops: number; t: number; next: number }
  | {
      kind: 'race';
      rival: Vehicle;
      checkpoints: THREE.Vector3[];
      idx: number;
      rivalIdx: number;
      t: number;
      started: boolean;
      accepted: boolean;
      /** Calles que recorre el rival, en orden (sin callejones). */
      legs: Leg[];
      /** Tramo en el que acaba cada punto de control. */
      cpLeg: number[];
      /** Tramo por el que va el rival. */
      leg: number;
      /** Velocidad de crucero del rival cuando arranca. */
      cruise: number;
      /** Segundos sin avanzar (para recolocarlo si se atasca). */
      stuckT: number;
      anchor: THREE.Vector3;
    };

const rng = new Rng('eventos');
const tmpV = new THREE.Vector3();
const tmpP = new THREE.Vector3();
/** Metros de ruta de una carrera y distancia mínima entre puntos de control. */
const RACE_LEN = 650;
const RACE_CP_GAP = 110;
/** Segundos sin avanzar para recolocar al rival en su calle. */
const RACE_STUCK = 4.5;

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
    // el tutorial solo cuenta si está en marcha (al continuar una partida a medias se queda en el paso 0 para siempre)
    const tuto = g.mod.tutorial;
    const inTutorial = !!tuto && !tuto.done && tuto.step > 0;
    return !!(g.mod.story?.running || g.mod.interiors?.inside || (g.mod.police?.wanted ?? 0) > 0 || inTutorial);
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
      // carrera: rival deportivo en la calle más cercana, en su carril y mirando hacia la ruta
      const cur = g.mod.vehicles.current as Vehicle | null;
      if (!cur) return;
      const cpos = cur.getPosition(new THREE.Vector3());
      const ne = roads.nearestEdge(cpos, true);
      if (!ne) return;
      const e = roads.g.edges[ne.edge];
      // arranca hacia donde mira el jugador; si por ahí la ruta sale muy corta (fondo de saco), al revés
      const ahead: 1 | -1 = Math.cos(cur.heading - roads.heading(ne.edge, 1)) >= 0 ? 1 : -1;
      const tOf = (d: 1 | -1) => (d === 1 ? ne.t : 1 - ne.t);
      let dir = ahead;
      let legs = this.raceRoute(ne.edge, dir, ne.t);
      if (this.routeLen(legs, tOf(dir)) < 300) {
        const bdir = -ahead as 1 | -1;
        const back = this.raceRoute(ne.edge, bdir, ne.t);
        if (this.routeLen(back, tOf(bdir)) > this.routeLen(legs, tOf(dir))) {
          dir = bdir;
          legs = back;
        }
      }
      const tDir = tOf(dir);
      // puntos de control: al final de un tramo cada ~110 m de ruta (máximo 5); el último, la meta
      const cps: THREE.Vector3[] = [];
      const cpLeg: number[] = [];
      let acc = roads.length(ne.edge) * (1 - tDir);
      for (let i = 0; i < legs.length; i++) {
        if (i > 0) acc += roads.length(legs[i].edge);
        const last = i === legs.length - 1;
        if (acc < RACE_CP_GAP && !last) continue;
        const end = this.legEnd(legs[i]);
        // una meta pegada al punto anterior: mejor que la meta sea esta y quitar el anterior
        if (last && acc < 50 && cps.length) {
          cps.pop();
          cpLeg.pop();
        }
        cps.push(end.clone());
        cpLeg.push(i);
        acc = 0;
        if (cps.length >= 5) {
          legs.length = i + 1;
          break;
        }
      }
      if (cps.length < 2) return;
      // sitio de salida: en su carril, al lado del jugador si cabe o un poco por delante/detrás (nunca encima)
      const len = roads.length(ne.edge) || 1;
      let pos: THREE.Vector3 | null = null;
      let tStart = tDir;
      for (const dm of [0, 10, -10, 18, -18, 28]) {
        const tt = tDir + dm / len;
        if (tt < 0.03 || tt > 0.97) continue;
        const cand = roads.lanePoint(ne.edge, dir, tt, e.width / 4, new THREE.Vector3());
        if (cand.distanceTo(cpos) < 5.5 || g.mod.vehicles.nearest(cand, 4)) continue;
        pos = cand;
        tStart = tt;
        break;
      }
      if (!pos) return;
      const rival = g.mod.vehicles.spawn('sports', pos, roads.heading(ne.edge, dir), '#e63946');
      rival.transient = false;
      const driver = g.mod.npcs.spawn('driver', randomLookFor(rng, 'fiestero'), pos);
      driver.enterVehicle(rival);
      // conduce como el tráfico (carril, esquinas, frenar ante obstáculos) pero siguiendo la ruta de la carrera;
      // va algo más despacio que el vehículo del jugador a tope, para que se le pueda ganar conduciendo bien
      const cruise = THREE.MathUtils.clamp(cur.spec.maxSpeed * 0.6, 13, 20);
      (rival as any).brain = {
        edge: ne.edge, dir, t: tStart, next: legs[1] ? { ...legs[1] } : null,
        cruise: 0, blocked: 0, stuck: 0, reverse: 0, honked: 0, mode: 'lane',
      } as CarBrain;
      this.ev = {
        kind: 'race', rival, checkpoints: cps, idx: 0, rivalIdx: 0, t: 0, started: false, accepted: false,
        legs, cpLeg, leg: 0, cruise, stuckT: 0, anchor: pos.clone(),
      };
      g.mod.bubbles?.say(driver, '¿Una carrerita, repartidor? ¡Al que llegue primero, 500 pavos!', 4);
      g.mod.messages?.receive('carrera', 'El Niño Nitro', '🏎️', '¿Te atreves? Carrera hasta el último punto. Si ganas, 500 €. Si pierdes, me das 200.', [
        { label: '¡Vamos!', style: 'si', run: () => this.acceptRace(), valid: () => this.ev?.kind === 'race' && !this.ev.accepted },
        { label: 'Paso', style: 'no', run: () => this.end(), valid: () => this.ev?.kind === 'race' && !this.ev.accepted },
      ]);
    }
  }

  /**
   * Ruta de la carrera desde una calle en un sentido: se encadenan calles (sin callejones, que son
   * estrechos) sin volver a pasar por un cruce si se puede, hasta unos 650 m.
   */
  private raceRoute(edge: number, dir: 1 | -1, t: number): Leg[] {
    const R: Roads = this.game.mod.traffic.roads;
    const G = R.g;
    const legs: Leg[] = [{ edge, dir }];
    const e0 = G.edges[edge];
    const visited = new Set<number>([e0.a, e0.b]);
    let total = R.length(edge) * (dir === 1 ? 1 - t : t);
    while (total < RACE_LEN && legs.length < 16) {
      const last = legs[legs.length - 1];
      const le = G.edges[last.edge];
      const node = last.dir === 1 ? le.b : le.a;
      const opts = (G.adjacency[node] ?? []).filter((id) => id !== last.edge && !G.edges[id].alley);
      const fresh = opts.filter((id) => !visited.has(G.edges[id].a === node ? G.edges[id].b : G.edges[id].a));
      const from = fresh.length ? fresh : opts;
      if (!from.length) break;
      const id = from[Math.floor(rnd.next() * from.length)];
      const ne = G.edges[id];
      const ndir: 1 | -1 = ne.a === node ? 1 : -1;
      visited.add(ndir === 1 ? ne.b : ne.a);
      legs.push({ edge: id, dir: ndir });
      total += R.length(id);
    }
    return legs;
  }

  /** Metros de una ruta (del primer tramo solo lo que queda desde la fracción t0). */
  private routeLen(legs: Leg[], t0: number): number {
    const R: Roads = this.game.mod.traffic.roads;
    let d = R.length(legs[0].edge) * (1 - t0);
    for (let i = 1; i < legs.length; i++) d += R.length(legs[i].edge);
    return d;
  }

  /** Cruce en el que acaba un tramo. */
  private legEnd(l: Leg): THREE.Vector3 {
    const R: Roads = this.game.mod.traffic.roads;
    const e = R.g.edges[l.edge];
    return R.g.nodes[l.dir === 1 ? e.b : e.a].pos;
  }

  /**
   * El rival lleva un rato sin avanzar (empotrado, encajado contra el jugador…): se le recoloca unos
   * metros más adelante en su carril de la ruta, mirando hacia donde tiene que ir.
   */
  private unstickRival(ev: Extract<Ev, { kind: 'race' }>) {
    const R: Roads | undefined = this.game.mod.traffic?.roads;
    const rv = ev.rival;
    const rb = (rv as any).brain as CarBrain | undefined;
    if (!R || !rb) return;
    rv.getPosition(tmpV);
    let k = ev.leg;
    let leg = ev.legs[k];
    let [a, b] = R.ends(R.g.edges[leg.edge], leg.dir);
    let L = R.length(leg.edge) || 1;
    let tt = ((tmpV.x - a.x) * (b.x - a.x) + (tmpV.z - a.z) * (b.z - a.z)) / (L * L) + 8 / L;
    const vm = this.game.mod.vehicles;
    for (let tries = 0; tries < 6; tries++) {
      if (tt > 0.92 && ev.legs[k + 1]) {
        k++;
        leg = ev.legs[k];
        [a, b] = R.ends(R.g.edges[leg.edge], leg.dir);
        L = R.length(leg.edge) || 1;
        tt = Math.min(0.5, 6 / L);
      }
      tt = THREE.MathUtils.clamp(tt, 0.05, 0.95);
      R.lanePoint(leg.edge, leg.dir, tt, R.g.edges[leg.edge].width / 4, tmpP);
      // que no caiga encima de otro coche ni del jugador
      if (!vm.nearest(tmpP, 3.5, (x: Vehicle) => x !== rv) && tmpP.distanceTo(this.game.mod.player.position) > 3.5) break;
      tt += 8 / L;
    }
    rv.place(tmpP, R.heading(leg.edge, leg.dir));
    rb.edge = leg.edge;
    rb.dir = leg.dir;
    rb.t = tt;
    rb.next = ev.legs[k + 1] ? { ...ev.legs[k + 1] } : null;
    rb.reverse = rb.stuck = rb.blocked = 0;
    rb.bypass = rb.jam = rb.tries = 0;
    ev.leg = k;
    ev.anchor.copy(tmpP);
    ev.stuckT = 0;
    this.game.mod.particles?.emit('smoke', tmpP, { count: 6 });
  }

  private acceptRace() {
    const ev = this.ev;
    if (!ev || ev.kind !== 'race') return;
    ev.accepted = true;
    ev.t = 0;
    ev.stuckT = 0;
    ev.rival.getPosition(ev.anchor);
    const rb = (ev.rival as any).brain as CarBrain | undefined;
    if (rb) rb.cruise = ev.cruise;
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
      const rv = ev.rival;
      const rb = (rv as any).brain as CarBrain | undefined;
      if (!ev.accepted) {
        if (rb) rb.cruise = 0;
        rv.controls.throttle = 0;
        rv.controls.handbrake = true;
        if (ev.t > 25) this.end();
        return;
      }
      // rival: conduce por su carril y en cada cruce sigue la ruta de la carrera
      if (rb && rv.driver?.kind === 'npc' && !rv.destroyed) {
        rb.mode = 'lane';
        const legs = ev.legs;
        for (let k = ev.leg; k < legs.length; k++) {
          if (legs[k].edge === rb.edge && legs[k].dir === rb.dir) {
            ev.leg = k;
            break;
          }
        }
        const nx = legs[ev.leg + 1];
        if (nx && (!rb.next || rb.next.edge !== nx.edge || rb.next.dir !== nx.dir)) rb.next = { edge: nx.edge, dir: nx.dir };
        // puntos superados: los de tramos ya pasados, o el del tramo actual al llegar a él
        const rp = rv.getPosition(tmpV);
        while (ev.rivalIdx < cp.length && (ev.cpLeg[ev.rivalIdx] < ev.leg || (ev.cpLeg[ev.rivalIdx] === ev.leg && rp.distanceTo(cp[ev.rivalIdx]) < 12))) ev.rivalIdx++;
        // atascado (contra una pared, encajado con el jugador…): tras unos segundos se le recoloca en su calle
        if (rp.distanceTo(ev.anchor) > 4) {
          ev.anchor.copy(rp);
          ev.stuckT = 0;
        } else if ((ev.stuckT += dt) > RACE_STUCK) this.unstickRival(ev);
        g.mod.traffic?.drive(rv, dt);
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
