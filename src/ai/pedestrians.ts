// Peatones: pasean por las aceras, miran el móvil, huyen de los tiros y se enfadan si los atropellas.
import * as THREE from 'three';
import type { Game, System } from '../core/game';
import type { NpcManager } from '../actors/npcManager';
import type { Npc } from '../actors/npc';
import { Roads } from './roads';
import { fx as rnd, Rng } from '../core/rng';
import { randomLookFor, type LookKind } from '../actors/looks';

interface PedBrain {
  edge: number;
  dir: 1 | -1;
  t: number;
  side: 1 | -1;
  pause: number;
  panic: number;
  from: THREE.Vector3 | null;
}

const tmpV = new THREE.Vector3();
const tmpT = new THREE.Vector3();

export class Pedestrians implements System {
  name = 'pedestrians';
  readonly peds: Npc[] = [];
  private roads: Roads;
  private rng = new Rng('peatones');
  private spawnTimer = 0;
  enabled = true;

  constructor(private game: Game) {
    game.mod.pedestrians = this;
    this.roads = (game.mod.traffic?.roads as Roads) ?? new Roads(game.world);
    // pánico con tiros, explosiones y atropellos
    const scare = (pos: THREE.Vector3, radius: number) => this.panicAt(pos, radius);
    game.events.on('explosion', (e) => scare(e.pos, 45));
    game.events.on('weapon:shot' as any, (e: any) => scare(e.pos, 28));
    game.events.on('npc:runover' as any, (e: any) => scare(e.npc.position, 14));
  }

  private get npcs(): NpcManager {
    return this.game.mod.npcs;
  }
  get target(): number {
    return Math.round(30 * this.game.quality.density);
  }

  panicAt(pos: THREE.Vector3, radius: number) {
    for (const p of this.peds) {
      if (!p.alive || p.busy) continue;
      if (p.position.distanceToSquared(pos) > radius * radius) continue;
      const b = p.brain as PedBrain;
      b.panic = 6 + rnd.next() * 5;
      b.from = pos.clone();
      if (rnd.next() < 0.3) this.game.mod.audio?.say(p.position, 3, p.voice * 1.2, 0.6);
    }
  }

  private spawnPed() {
    const focus = this.game.mod.player?.position ?? this.game.camera.position;
    const edges = this.roads.edgesInRing(focus, 25, 110, false);
    if (!edges.length) return;
    const eid = edges[Math.floor(rnd.next() * edges.length)];
    const e = this.roads.g.edges[eid];
    const dir: 1 | -1 = rnd.next() < 0.5 ? 1 : -1;
    const side: 1 | -1 = rnd.next() < 0.5 ? 1 : -1;
    const t = rnd.next();
    const pos = this.roads.lanePoint(eid, dir, t, side * (e.width / 2 + 1.2), new THREE.Vector3());
    if (!this.game.world.isLand(pos.x, pos.z)) return;
    // no aparecer delante de la cámara si está cerca
    const cam = this.game.camera.position;
    const toP = tmpT.copy(pos).sub(cam);
    const fwd = this.game.camera.getWorldDirection(tmpV);
    if (toP.length() < 60 && toP.normalize().dot(fwd) > 0.5) return;
    const kinds: LookKind[] = ['civil', 'civil', 'civil', 'civil', 'abuela', 'rico', 'fiestero'];
    let kind = kinds[Math.floor(rnd.next() * kinds.length)];
    if (e.district === 'colina' && rnd.next() < 0.5) kind = 'rico';
    if (e.district === 'viejo' && rnd.next() < 0.3) kind = 'abuela';
    const npc = this.npcs.spawn('civil', randomLookFor(this.rng, kind), pos, this.roads.heading(eid, dir));
    npc.walkSpeed = kind === 'abuela' ? 0.9 : 1.2 + rnd.next() * 0.6;
    npc.brain = { edge: eid, dir, t, side, pause: 0, panic: 0, from: null } as PedBrain;
    this.peds.push(npc);
  }

  update(dt: number) {
    if (!this.enabled || !this.game.world) return;
    const focus = this.game.mod.player?.position ?? this.game.camera.position;
    for (let i = this.peds.length - 1; i >= 0; i--) {
      const p = this.peds[i];
      if (p.removed || p.position.distanceTo(focus) > 150) {
        this.peds.splice(i, 1);
        if (!p.removed) this.npcs.remove(p);
        continue;
      }
      this.think(p, dt);
    }
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.25;
      if (this.peds.length < this.target) this.spawnPed();
    }
  }

  private think(p: Npc, dt: number) {
    const b = p.brain as PedBrain;
    if (!b || p.busy || p.state === 'angry') return;
    // huir
    if (b.panic > 0) {
      b.panic -= dt;
      if (b.from) {
        const away = tmpV.copy(p.position).sub(b.from).setY(0);
        if (away.lengthSq() < 0.01) away.set(rnd.next() - 0.5, 0, rnd.next() - 0.5);
        away.normalize().multiplyScalar(12).add(p.position);
        p.goTo(away, true);
        p.setState('flee');
      }
      if (b.panic <= 0) {
        // volver a pasear desde la calle más cercana
        const ne = this.roads.nearestEdge(p.position, false);
        if (ne) {
          b.edge = ne.edge;
          b.t = ne.t;
        }
        b.from = null;
        p.setState('walk');
      }
      return;
    }
    if (p.state === 'flee') p.setState('walk');
    // pausa (mirar el móvil, charlar)
    if (b.pause > 0) {
      b.pause -= dt;
      p.target = null;
      if (p.state !== 'custom') {
        p.customPose = rnd.next() < 0.6 ? 'phone' : 'normal';
        p.setState('custom');
      }
      if (b.pause <= 0) p.setState('walk');
      return;
    }
    if (rnd.next() < dt * 0.02) {
      b.pause = 2 + rnd.next() * 5;
      return;
    }
    // pasear por la acera
    const e = this.roads.g.edges[b.edge];
    const len = this.roads.length(b.edge) || 1;
    const [a, bb] = this.roads.ends(e, b.dir);
    const abx = bb.x - a.x, abz = bb.z - a.z;
    b.t = Math.max(b.t, ((p.position.x - a.x) * abx + (p.position.z - a.z) * abz) / (len * len));
    if (b.t >= 0.97) {
      const n = this.roads.nextEdge(b.edge, b.dir, false);
      b.edge = n.edge;
      b.dir = n.dir;
      b.t = 0;
      if (rnd.next() < 0.3) b.side = (b.side === 1 ? -1 : 1) as 1 | -1;
    }
    const e2 = this.roads.g.edges[b.edge];
    const len2 = this.roads.length(b.edge) || 1;
    const tt = Math.min(1, b.t + 3 / len2);
    const target = this.roads.lanePoint(b.edge, b.dir, tt, b.side * (e2.width / 2 + 1.2), tmpT);
    p.goTo(target, false);
  }
}
