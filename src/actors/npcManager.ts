// Gestor de NPC: los crea, los actualiza (con nivel de detalle por distancia) y resuelve atropellos.
// También hace que la gente de la calle reaccione a lo que pasa: señalar y gritar, grabarlo con el
// móvil, taparse la cabeza con los tiros o levantar las manos si les apuntas.
import * as THREE from 'three';
import type { Game, System } from '../core/game';
import { Npc, type NpcRole, type NpcReaction } from './npc';
import type { CharacterLook, CharacterRig } from '../core/contracts';
import type { VehicleManager } from '../vehicles/manager';
import { fx as rnd } from '../core/rng';

const tmpV = new THREE.Vector3();
const tmpL = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpK = new THREE.Vector3();
const tmpP = new THREE.Vector3();

/** Frases de los peatones (bocadillos). */
const LINES = {
  witness: [
    '¡¡Pero qué hace ese!!', '¡Lo estoy grabando todo!', '¡Esto lo subo a las redes!', '¡Mira, mira, mira!',
    '¡Madre mía, qué castaña!', '¡Que alguien llame a alguien!', '¡Eso no lo cubre el seguro!', '¡Lo que hay que ver!',
  ],
  jump: ['¡Ese coche vuela!', '¡Lo he grabado! ¡Lo he grabado!', '¡Ole ahí!', '¡Un diez de salto!'],
  handsUp: [
    '¡No dispare, que solo he bajado a por el pan!', '¡Llévese la cartera, pero no me despeine!',
    '¡Yo no he pedido nada contra reembolso!', '¡Que soy del barrio!', '¡Tranquilo, que yo pago en efectivo!',
  ],
  angry: [
    '¡Mira por dónde vas, cafetera!', '¡Que tengo el carné de peatón!', '¡Te voy a poner una reclamación!',
    '¡Esto se lo cuento a mi madre!', '¡Aprende a conducir, hombre!', '¡Ya te vale, repartidor!',
  ],
  carjack: ['¡Oiga, que es de leasing!', '¡Mi coche! ¡Que está sin pagar!', '¡Por lo menos devuélvamelo lavado!', '¡Que llevo la compra en el maletero!'],
} as const;
export type ShoutKind = keyof typeof LINES;

const pick = <T>(a: readonly T[]) => a[Math.floor(rnd.next() * a.length)];
/** Reacciones que caben dentro de una lista (sin crear arrays nuevos cada vez). */
const REACTORS: Npc[] = [];

export class NpcManager implements System {
  name = 'npcs';
  readonly list: Npc[] = [];
  /** Fábrica de muñecos (la pone main con makeCharacter). */
  makeRig!: (look: CharacterLook) => CharacterRig;
  /** Último bocadillo de un peatón (para no llenar la pantalla de frases). */
  private lastShout = -99;
  /** Última vez que alguien se paró a mirar un tiroteo lejano. */
  private lastShotWitness = -99;
  private aimCheck = 0;

  constructor(private game: Game) {
    game.mod.npcs = this;
    const ev = game.events;
    // tiros: los de cerca se tapan la cabeza al huir; alguno lejano se para a mirar
    ev.on('weapon:shot' as any, (e: any) => {
      if (e?.pos) this.onShot(e.pos);
    });
    // atropellos y explosiones: los que están lo bastante lejos para no huir se paran a señalar o a grabarlo
    ev.on('npc:runover' as any, (e: any) => {
      if (e?.npc) this.witness(e.npc.position, 14, 34, 3, 'witness');
    });
    ev.on('explosion', (e) => this.witness(e.pos, 45, 85, 3, 'witness'));
    // saltos gordos con el coche: aplausos y móviles en alto
    ev.on('vehicle:landed' as any, (e: any) => {
      const v = e?.vehicle;
      if (!v || e.air < 0.9 || v !== this.game.mod.vehicles?.current) return;
      this.witness(v.getPosition(tmpP), 0, 32, 3, 'jump');
    });
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
    // ¿el jugador apunta a alguien de la calle? manos arriba (cada poco, no en cada frame)
    this.aimCheck -= dt;
    if (this.aimCheck <= 0) {
      this.aimCheck = 0.2;
      this.handsUp();
    }
  }

  /** Un peatón tranquilo que puede pararse a reaccionar. */
  private calmPed(n: Npc, now: number): boolean {
    return (
      n.role === 'civil' && n.transient && !n.hostile && !n.police && !n.vehicle && n.alive && now >= n.reactCool &&
      (n.state === 'walk' || n.state === 'idle' || n.state === 'custom')
    );
  }

  /**
   * Los peatones que están entre rMin y rMax de algo raro se paran a mirarlo: unos señalan y gritan,
   * otros lo graban con el móvil. Como mucho `max` a la vez.
   */
  witness(at: THREE.Vector3, rMin: number, rMax: number, max: number, lines: ShoutKind) {
    const now = this.game.time.elapsed;
    const lo = rMin * rMin, hi = rMax * rMax;
    REACTORS.length = 0;
    for (const n of this.list) {
      if (!this.calmPed(n, now)) continue;
      const d = n.position.distanceToSquared(at);
      if (d >= lo && d <= hi) REACTORS.push(n);
    }
    let said = false;
    for (let k = 0; k < max && REACTORS.length; k++) {
      const i = Math.floor(rnd.next() * REACTORS.length);
      const n = REACTORS[i];
      REACTORS[i] = REACTORS[REACTORS.length - 1];
      REACTORS.length--;
      const kind: NpcReaction = lines === 'jump' && rnd.next() < 0.3 ? 'cheer' : rnd.next() < 0.45 ? 'film' : 'point';
      if (n.react(kind, at, 1.6 + rnd.next() * 1.2) && !said) said = this.shout(n, lines);
    }
    REACTORS.length = 0;
  }

  private onShot(pos: THREE.Vector3) {
    const now = this.game.time.elapsed;
    for (const n of this.list) {
      if (n.role !== 'civil' || n.hostile || n.police || n.vehicle) continue;
      if (n.position.distanceToSquared(pos) < 30 * 30) n.coverUntil = now + 1.6 + (n.id % 5) * 0.2;
    }
    if (now - this.lastShotWitness > 5) {
      this.lastShotWitness = now;
      this.witness(pos, 30, 48, 1, 'witness');
    }
  }

  /** Si el jugador (a pie) apunta con un arma a un peatón cercano, este levanta las manos y luego huye. */
  private handsUp() {
    const p = this.game.mod.player;
    if (!p || p.state !== 'foot' || !p.aiming || !p.weaponKind || p.weaponKind === 'none') return;
    const now = this.game.time.elapsed;
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    let best: Npc | null = null;
    let bestD = 14 * 14;
    for (const n of this.list) {
      if (!this.calmPed(n, now)) continue;
      const dx = n.position.x - p.position.x, dz = n.position.z - p.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > bestD || d2 < 0.5) continue;
      const d = Math.sqrt(d2);
      if ((dx * fx + dz * fz) / d < 0.95) continue; // fuera del punto de mira
      best = n;
      bestD = d2;
    }
    if (best && best.react('hands_up', p.position, 2 + rnd.next(), 'flee')) this.shout(best, 'handsUp');
  }

  /** Bocadillo de un peatón (solo cerca del jugador y sin pisar al anterior). true = lo ha dicho. */
  shout(n: Npc, kind: ShoutKind): boolean {
    const now = this.game.time.elapsed;
    const p = this.game.mod.player;
    if (now - this.lastShout < 2.5 || !p || n.position.distanceToSquared(p.position) > 32 * 32) return false;
    this.lastShout = now;
    this.game.mod.bubbles?.say(n, pick(LINES[kind]), 2.4);
    return true;
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
