// La gente del club: bailarines en la pista y en las tarimas, clientes en la barra y en los reservados,
// el DJ con cascos, el camarero y el portero de la zona VIP. Solo se animan mientras estás dentro.
import * as THREE from 'three';
import type { Game } from '../../../core/game';
import type { CharacterPose, CharacterLook } from '../../../core/contracts';
import { G } from '../../../core/physics';
import { Rng } from '../../../core/rng';
import { GeoBuilder, vertexColorMaterial } from '../../../core/geo';
import { makeCharacter, randomLook, type Character, type CharacterLookExtra } from '../../../actors/character';
import { B } from '../../../actors/character/skeleton';
import {
  FLOOR, PODIUMS, PODIUM_H, STOOLS, BOOTHS, HIGH_TABLES, DJ_SPOT, BARMAN_SPOT, PORTERO_SPOT, WAITRESS_SPOT, WAITRESS_PATH,
  WAITRESS_SERVE_HEADING,
  boothBackSeat, boothSideSeat,
} from './layout';
import { bottleGeometry } from './room';

type Role = 'dancer' | 'podium' | 'bar' | 'stand' | 'sitter' | 'dj' | 'barman' | 'portero' | 'waitress';

export interface Npc {
  rig: Character;
  role: Role;
  pos: THREE.Vector3;
  heading: number;
  baseHeading: number;
  pose: CharacterPose;
  basePose: CharacterPose;
  baseStyle: number;
  cheer: number;
  cheerStyle: number;
  cheerAt: THREE.Vector3 | null;
  /** Gira la cabeza/cuerpo hacia el jugador cuando se acerca (camarero, portero). */
  watcher: boolean;
}

export const DANCE_NAMES = ['LOS BRAZOS ARRIBA', 'EL ROBOT', 'EL PASITO CON PALMAS', 'LA FIEBRE DEL SÁBADO', 'EL POLLO', 'EL TWIST'];

const tmpV = new THREE.Vector3();

export class Crowd {
  readonly npcs: Npc[] = [];
  dj!: Npc;
  barman!: Npc;
  portero!: Npc;
  waitress!: Npc;
  /** Botella que lleva en alto la camarera (con la bengala encendida). */
  readonly handBottle: THREE.Mesh;
  /** Viajes de la camarera: -1 = esperando; si no, índice del tramo del camino. */
  private trip: { leg: number; back: boolean; t: number; onArrive: () => void } | null = null;
  private tripQueue: (() => void)[] = [];
  private rng = new Rng('club-reembolso-gente');
  private t = 0;

  constructor(private game: Game, private root: THREE.Group, private origin: THREE.Vector3) {
    const rng = this.rng;

    // ── Pista: 8 bailarines repartidos (sin pisarse) ──
    const kinds = ['fiestero', 'fiestero', 'civil', 'rico', 'fiestero', 'civil', 'fiestero', 'fiestero'] as const;
    const placed: THREE.Vector3[] = [];
    for (let n = 0, tries = 0; n < kinds.length && tries < 400; tries++) {
      const p = new THREE.Vector3(rng.range(FLOOR.x0 + 0.8, FLOOR.x1 - 0.8), 0, rng.range(FLOOR.z0 + 0.8, FLOOR.z1 - 1.6));
      // dejamos un hueco libre en el centro-sur de la pista para que bailes tú
      if (Math.abs(p.x) < 1.6 && p.z > -1.2) continue;
      if (placed.some((q) => q.distanceTo(p) < 1.55)) continue;
      placed.push(p);
      const face = rng.chance(0.3) ? rng.range(-Math.PI, Math.PI) : Math.PI + rng.range(-0.8, 0.8);
      const style = n % 6;
      this.add(kinds[n], p, face, 'dancer', 'dance', style, true);
      n++;
    }

    // ── Tarimas: bailarín y bailarina ──
    this.add('fiestero', PODIUMS[0].clone().setY(PODIUM_H), 0.35, 'podium', 'dance', 0, false, { height: 1.04 });
    this.add('fiestero', PODIUMS[1].clone().setY(PODIUM_H), -0.35, 'podium', 'dance', 3, false, { height: 1.02, hair: 'largo' });

    // ── Barra: dos sentados en taburete y uno de pie con el móvil ──
    for (const i of [1, 4]) {
      const s = STOOLS[i];
      this.add(i === 1 ? 'civil' : 'fiestero', new THREE.Vector3(s.x + 0.05, 0.3, s.z), -Math.PI / 2 + (i === 1 ? 0.25 : -0.2), 'bar', 'sit', 0, false);
    }
    this.add('civil', new THREE.Vector3(-10.35, 0, 4.5), -Math.PI / 2 + 0.7, 'stand', 'phone', 0, true);

    // ── Reservados de los demás: gente rica sentada ──
    this.add('rico', boothBackSeat(BOOTHS[1], -0.55), -Math.PI / 2, 'sitter', 'sit', 0, false);
    this.add('rico', boothSideSeat(BOOTHS[1], -1, 0.2), 0, 'sitter', 'sit', 0, false);
    this.add('rico', boothBackSeat(BOOTHS[0], 0.3), -Math.PI / 2, 'sitter', 'sit', 0, false);

    // ── Mesas altas ──
    {
      const t0 = HIGH_TABLES[0];
      this.add('civil', new THREE.Vector3(t0.x + 0.62, 0, t0.z + 0.15), -Math.PI / 2 - 0.2, 'stand', 'phone', 0, true);
      const t1 = HIGH_TABLES[1];
      this.add('fiestero', new THREE.Vector3(t1.x - 0.6, 0, t1.z - 0.2), Math.PI / 2 + 0.3, 'stand', 'dance', 2, true);
    }

    // ── Personal ──
    this.dj = this.add('fiestero', DJ_SPOT.clone(), 0, 'dj', 'dance', 2, false, {
      cap: true, capColor: '#111111', glasses: true, chain: true, jacket: '#1b1b1b', jacketStyle: 'chandal', shirt: '#ff2e88', hair: 'rapado', height: 1.02,
    });
    this.dj.rig.attach('head', headphones());
    this.barman = this.add('civil', BARMAN_SPOT.clone(), Math.PI / 2, 'barman', 'normal', 0, false, {
      shirt: '#ffffff', jacket: '#1d1d24', jacketStyle: 'americana', pants: '#15151a', shoes: '#111111', cap: false, glasses: false, hair: 'corto', facial: 'bigote', height: 1.0,
    });
    this.barman.watcher = true;
    this.barman.rig.attach('chest', bowTie());
    this.portero = this.add('rico', PORTERO_SPOT.clone(), -Math.PI / 2, 'portero', 'normal', 0, true, {
      shirt: '#f2f2f2', jacket: '#24222c', jacketStyle: 'americana', pants: '#1b1a22', shoes: '#0b0b0b', glasses: true, chain: false,
      hair: 'calvo', build: 1.24, height: 1.08, facial: 'barba', hairColor: '#1c1714',
    });
    this.portero.watcher = true;
    // camarera de la zona VIP: lleva las botellas desde la cava hasta tu mesa
    this.waitress = this.add('fiestero', WAITRESS_SPOT.clone(), -2.4, 'waitress', 'normal', 0, false, {
      shirt: '#ffd23f', jacket: null, pants: '#1b1a22', shoes: '#f2f2f2', cap: false, glasses: false,
      chain: true, hair: 'coleta', hairColor: '#c2612b', shorts: false, height: 0.98, build: 0.95, facial: null,
    });
    this.waitress.watcher = true;
    this.handBottle = new THREE.Mesh(bottleGeometry(), vertexColorMaterial);
    this.handBottle.rotation.x = Math.PI / 2;
    this.handBottle.position.set(0, 0.0, -0.12);
    this.handBottle.visible = false;
    this.waitress.rig.attach('handR', this.handBottle);
  }

  /** La camarera sale con una botella; `onArrive` se llama al dejarla en la mesa. */
  deliver(onArrive: () => void) {
    if (this.trip) this.tripQueue.push(onArrive);
    else this.startTrip(onArrive);
  }

  get delivering() {
    return !!this.trip && !this.trip.back;
  }

  /** Termina de golpe los viajes pendientes (al salir del club). */
  finishDeliveries() {
    if (this.trip && !this.trip.back) this.trip.onArrive();
    for (const f of this.tripQueue) f();
    this.tripQueue = [];
    this.trip = null;
    this.handBottle.visible = false;
    const w = this.waitress;
    w.pos.copy(WAITRESS_SPOT);
    w.rig.root.position.copy(WAITRESS_SPOT);
  }

  private startTrip(onArrive: () => void) {
    this.trip = { leg: 0, back: false, t: 0, onArrive };
    this.handBottle.visible = true;
  }

  /** Mueve a la camarera por el camino. Devuelve su velocidad (m/s) para la animación. */
  private walkWaitress(dt: number): number {
    const tr = this.trip;
    if (!tr) return 0;
    const w = this.waitress;
    const path = WAITRESS_PATH;
    const speed = 1.9;
    let step = speed * dt;
    while (step > 0 && this.trip) {
      const target = tr.back ? path[path.length - 2 - tr.leg] : path[tr.leg + 1];
      if (!target) break;
      tmpV.copy(target).sub(w.pos);
      const d = tmpV.length();
      if (d > 1e-3) w.baseHeading = Math.atan2(tmpV.x, tmpV.z);
      if (d <= step) {
        w.pos.copy(target);
        step -= d;
        tr.leg++;
        if (tr.leg >= path.length - 1) {
          if (!tr.back) {
            // ha llegado a la mesa: deja la botella y se vuelve
            tr.onArrive();
            this.handBottle.visible = false;
            tr.back = true;
            tr.leg = 0;
            tr.t = 0.6; // se queda un momento mirando la mesa
            w.baseHeading = WAITRESS_SERVE_HEADING;
            break;
          } else {
            this.trip = null;
            w.baseHeading = -2.4;
            const next = this.tripQueue.shift();
            if (next) this.startTrip(next);
            break;
          }
        }
      } else {
        w.pos.addScaledVector(tmpV, step / d);
        step = 0;
      }
    }
    w.rig.root.position.copy(w.pos);
    return speed;
  }

  private add(
    kind: 'fiestero' | 'civil' | 'rico', pos: THREE.Vector3, heading: number, role: Role, pose: CharacterPose, style: number,
    solid: boolean, over: Partial<CharacterLookExtra> = {},
  ): Npc {
    const look = { ...randomLook(this.rng, kind), ...over } as CharacterLookExtra;
    const rig = makeCharacter(look as CharacterLook);
    rig.anim.danceStyle = style;
    rig.root.position.copy(pos);
    rig.root.rotation.y = heading;
    rig.mesh.castShadow = false;
    this.root.add(rig.root);
    const npc: Npc = {
      rig, role, pos: pos.clone(), heading, baseHeading: heading, pose, basePose: pose, baseStyle: style,
      cheer: 0, cheerStyle: 0, cheerAt: null, watcher: false,
    };
    if (solid) {
      const o = this.origin;
      this.game.physics.addStaticCylinder(o.x + pos.x, o.y + pos.y + 0.9, o.z + pos.z, 0.8, 0.3, G.NPC);
    }
    // que no arranquen todos igual
    rig.update(this.rng.range(0, 2), { speed: 0, grounded: true, pose });
    this.npcs.push(npc);
    return npc;
  }

  /** La gente de alrededor de `center` (local) aplaude y levanta los brazos durante `seconds`. */
  cheer(center: THREE.Vector3, radius: number, seconds: number) {
    for (const n of this.npcs) {
      if (n.role === 'sitter' || n.role === 'bar' || n.role === 'barman' || n.role === 'portero' || n.role === 'waitress') continue;
      if (n.pos.distanceTo(center) > radius && n.role !== 'dj' && n.role !== 'podium') continue;
      n.cheer = seconds * this.rng.range(0.8, 1.2);
      n.cheerStyle = this.rng.chance(0.55) ? 0 : 2;
      n.cheerAt = n.role === 'dancer' || n.role === 'stand' ? center.clone() : null;
    }
  }

  /** Posición mundial encima de la cabeza (para bocadillos). */
  worldPos(n: Npc, out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(n.pos).add(this.origin);
  }

  update(dt: number, beat: number, party: number, player: THREE.Vector3 | null) {
    this.t += dt;
    // camarera: pausa al dejar la botella y luego camina
    let waitressSpeed = 0;
    if (this.trip && this.trip.t > 0) this.trip.t -= dt;
    else waitressSpeed = this.walkWaitress(dt);
    for (const n of this.npcs) {
      let pose = n.basePose;
      let style = n.baseStyle;
      let target = n.baseHeading;
      if (n.role === 'dj') {
        // el DJ cambia de rollo cada 8 compases y en la fiesta levanta los brazos
        style = [2, 3, 2, 1][Math.floor(beat / 32) % 4];
      }
      if (n.cheer > 0) {
        n.cheer -= dt;
        pose = 'dance';
        style = n.cheerStyle;
        if (n.cheerAt) target = Math.atan2(n.cheerAt.x - n.pos.x, n.cheerAt.z - n.pos.z);
      } else if (party > 0.6 && (n.role === 'dancer' || n.role === 'podium' || n.role === 'dj')) {
        style = (n.baseStyle + Math.floor(beat / 8)) % 6 === 1 ? 0 : n.baseStyle;
      }
      if (n.watcher && player && !(n === this.waitress && this.trip)) {
        const dx = player.x - n.pos.x, dz = player.z - n.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 6 && d > 0.3) {
          let a = Math.atan2(dx, dz) - n.baseHeading;
          a = Math.atan2(Math.sin(a), Math.cos(a));
          target = n.baseHeading + THREE.MathUtils.clamp(a, -1.1, 1.1);
        }
      }
      let dh = target - n.heading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      n.heading += dh * Math.min(1, dt * (n === this.waitress && this.trip ? 8 : 3));
      n.rig.root.rotation.y = n.heading;
      n.rig.anim.danceStyle = style;
      const walking = n === this.waitress && waitressSpeed > 0;
      n.rig.update(dt, { speed: walking ? waitressSpeed : 0, grounded: true, pose, timeScale: pose === 'dance' ? 1 + party * 0.35 : 1 });
      if (n === this.waitress && this.handBottle.visible) {
        // brazo derecho en alto: ¡que se vea la botella!
        const bn = n.rig.bones;
        bn[B.armR].rotation.set(-2.75, 0, 0.12);
        bn[B.foreR].rotation.set(-0.25, 0, 0);
        bn[B.handR].rotation.set(0, 0, 0);
      }
    }
  }

  dispose() {
    for (const n of this.npcs) n.rig.dispose();
    this.npcs.length = 0;
  }
}

/** Cascos de DJ (se enganchan a la cabeza). */
function headphones(): THREE.Mesh {
  const b = new GeoBuilder();
  const arc = new THREE.TorusGeometry(0.135, 0.018, 4, 12, Math.PI);
  b.add(arc, '#1a1a1f', 0, -0.14, 0, 0, 0, 0);
  arc.dispose();
  for (const s of [-1, 1]) {
    b.cyl(0.065, 0.065, 0.05, 10, '#1a1a1f', s * 0.14, -0.15, 0, 0, 0, Math.PI / 2);
    b.cyl(0.045, 0.045, 0.012, 10, '#19e6d2', s * 0.168, -0.15, 0, 0, 0, Math.PI / 2);
  }
  const m = new THREE.Mesh(b.build(), vertexColorMaterial);
  m.name = 'cascos';
  return m;
}

/** Pajarita del camarero. */
function bowTie(): THREE.Mesh {
  const b = new GeoBuilder();
  b.box(0.06, 0.05, 0.03, '#111111', -0.04, 0.2, 0.01, 0, 0, 0.3);
  b.box(0.06, 0.05, 0.03, '#111111', 0.04, 0.2, 0.01, 0, 0, -0.3);
  b.box(0.025, 0.03, 0.035, '#222222', 0, 0.2, 0.012);
  const m = new THREE.Mesh(b.build(), vertexColorMaterial);
  m.name = 'pajarita';
  return m;
}

