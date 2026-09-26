// Gestor de NPC: los crea, los actualiza (con nivel de detalle por distancia) y resuelve atropellos.
import * as THREE from 'three';
import type { Game, System } from '../core/game';
import { Npc, type NpcRole } from './npc';
import type { CharacterLook, CharacterRig } from '../core/contracts';
import type { VehicleManager } from '../vehicles/manager';

const tmpV = new THREE.Vector3();
const tmpL = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpK = new THREE.Vector3();

export class NpcManager implements System {
  name = 'npcs';
  readonly list: Npc[] = [];
  /** Fábrica de muñecos (la pone main con makeCharacter). */
  makeRig!: (look: CharacterLook) => CharacterRig;

  constructor(private game: Game) {
    game.mod.npcs = this;
  }

  spawn(role: NpcRole, look: CharacterLook, pos: THREE.Vector3, heading = 0): Npc {
    const npc = new Npc(this.game, role, this.makeRig(look), pos, heading);
    this.list.push(npc);
    return npc;
  }

  remove(npc: Npc) {
    const i = this.list.indexOf(npc);
    if (i >= 0) this.list.splice(i, 1);
    npc.dispose();
  }

  nearest(pos: THREE.Vector3, maxDist: number, filter?: (n: Npc) => boolean): Npc | null {
    let best: Npc | null = null;
    let bd = maxDist * maxDist;
    for (const n of this.list) {
      if (n.removed || (filter && !filter(n))) continue;
      const d = n.position.distanceToSquared(pos);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }

  within(pos: THREE.Vector3, radius: number, out: Npc[] = []): Npc[] {
    out.length = 0;
    const r2 = radius * radius;
    for (const n of this.list) if (!n.removed && n.position.distanceToSquared(pos) < r2) out.push(n);
    return out;
  }

  update(dt: number) {
    const cam = this.game.camera.position;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const n = this.list[i];
      if (n.removed) {
        // se retira cuando ha hecho "puf"
        this.list.splice(i, 1);
        n.dispose();
        continue;
      }
      const d2 = (n.vehicle ? n.vehicle.getPosition(tmpV) : n.position).distanceToSquared(cam);
      const visible = d2 < 170 * 170;
      if (!n.vehicle) n.rig.root.visible = visible;
      n.update(dt, d2 > 45 * 45);
    }
    this.runOvers();
  }

  /** Atropellos: vehículo en marcha contra NPC a pie. */
  private runOvers() {
    const vm = this.game.mod.vehicles as VehicleManager | undefined;
    if (!vm) return;
    for (const v of vm.list) {
      if (v.destroyed) continue;
      const sp = Math.abs(v.speed);
      if (sp < 2.5) continue;
      v.getPosition(tmpV);
      const h = v.spec.half;
      const reach = Math.max(h.x, h.z) + 0.6;
      v.getQuaternion(tmpQ).invert();
      for (const n of this.list) {
        if (n.vehicle || n.removed || n.state === 'knocked') continue;
        const dx = n.position.x - tmpV.x, dz = n.position.z - tmpV.z;
        if (dx * dx + dz * dz > reach * reach) continue;
        if (Math.abs(n.position.y + 0.9 - tmpV.y) > h.y + 1.3) continue;
        tmpL.set(dx, n.position.y + 0.9 - tmpV.y, dz).applyQuaternion(tmpQ);
        if (Math.abs(tmpL.x) > h.x + 0.35 || Math.abs(tmpL.z) > h.z + 0.35) continue;
        // ¡atropello!
        const lv = v.body.linvel();
        const side = Math.sign(tmpL.x) || 1;
        const kick = tmpK.set(lv.x * 0.85, 0, lv.z * 0.85);
        // un poco hacia el lado para que salga rodando y no quede debajo
        kick.x += Math.cos(v.heading) * side * 3;
        kick.z += -Math.sin(v.heading) * side * 3;
        kick.y = 3 + sp * 0.25;
        n.knock(kick);
        n.hurt(sp * 2.2, { cause: 'atropello', vehicle: v });
        v.body.applyImpulse({ x: -lv.x * 20, y: 0, z: -lv.z * 20 }, true);
        this.game.mod.audio?.play('hit', { pos: n.position, volume: Math.min(1, sp / 15) });
        this.game.events.emit('npc:runover' as any, { npc: n, vehicle: v, speed: sp } as any);
        if (vm.current === v) this.game.events.emit('camera:shake', { amount: 0.25 });
      }
    }
  }
}
