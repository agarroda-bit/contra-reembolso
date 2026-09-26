// Vehículos locos repartidos por la isla, cada uno con su gracia al conducirlo.
import * as THREE from 'three';
import type { Game, System } from '../core/game';
import type { Vehicle } from './vehicle';
import type { VehicleManager } from './manager';
import type { VehicleKind } from './types';
import { fx as rnd } from '../core/rng';
import { beep, honk, paellaMusic, PAELLA_TUNE_SECONDS } from './sounds';

const INTRO: Record<string, string> = {
  cart: '🛒 Carrito del súper con motor: gira raro porque tiene una rueda loca. Como todos.',
  escooter: '🛴 Patinete eléctrico: silencioso, ecológico y muy lento. El claxon es un timbre.',
  garbage: '🚛 Camión de la basura: lo arrasa todo. TODO.',
  golf: '⛳ Carrito de golf del casino: elegante, lento y con música de ascensor.',
  crane: '🏗️ Grúa del puerto: se conduce fatal. A veces el volante va al revés. No es un fallo, es una característica.',
  granny: '👵 Silla de la yaya: lentísima e indestructible. Pita sola y los coches se apartan. La yaya tiene preferencia.',
  paella: '🥘 Paella-móvil: pita (H) y suena la verbena. La gente se vuelve loca por una ración.',
  sofa: '🛋️ Sofá del rastro con motor de cortacésped: no hay manera de que vaya recto.',
  forklift: '🏗️ Carretilla del puerto: gira con las ruedas de atrás. Pita (H) para levantar lo que tengas delante.',
};

/** Cartel con el nombre gracioso que sale encima del vehículo al subirse: título, subtítulo, fondo, letra. */
const CARDS: Record<string, [string, string, string, string]> = {
  cart: ['EL CARRITO FURIOSO', 'Rueda loca de serie', '#e63946', '#ffffff'],
  escooter: ['PATINETE SIN FRENOS', 'Cero emisiones, cero prisa', '#06d6a0', '#1b1030'],
  garbage: ['EL CAMIÓN DEVORADOR', 'Recogida selectiva: se lo lleva todo', '#2a9d8f', '#ffd23f'],
  golf: ['EL CARRITO DEL MILLONARIO', 'Música de ascensor incluida', '#f1faee', '#6c3bd1'],
  crane: ['LA GRÚA MAREADA', 'El volante va a su aire', '#ff7b54', '#1b1030'],
  granny: ['LA SILLA DE LA YAYA', '20 km/h de pura furia', '#ff4f81', '#ffffff'],
  paella: ['LA PAELLA-MÓVIL', 'Pita y empieza la verbena', '#ffd23f', '#c1121f'],
  sofa: ['EL SOFÁ DERRAPÓN', 'Recogido del rastro. Con pelusas.', '#7f5539', '#ffe8a3'],
  forklift: ['LA CARRETILLA ¡AÚPA!', 'Levanta coches como quien levanta cajas', '#ffc300', '#1b1b1b'],
};

/**
 * Sitios de los vehículos locos nuevos (fase 9) en la isla. Se usan solo con la isla de verdad
 * (los mundos de prueba no los tienen). x, z en metros; rumbo 0 = mirando al sur (+Z).
 */
const EXTRA_SPOTS: { kind: VehicleKind; x: number; z: number; heading: number }[] = [
  { kind: 'granny', x: 59.6, z: 24.5, heading: Math.PI }, // en la acera del centro de salud
  { kind: 'paella', x: -108, z: 185.5, heading: -Math.PI / 2 }, // delante de la lonja
  { kind: 'sofa', x: -165.5, z: 51, heading: Math.PI / 2 }, // junto a los puestos del mercadillo del Barrio Viejo
  { kind: 'forklift', x: 44, z: 212, heading: Math.PI }, // junto a los contenedores del muelle
];

const GRANNY_LINES = ['¡PIII! ¡Que voy!', '¡Paso, que tengo médico!', '¡En mis tiempos esto era todo campo!', '¡Jovencito, el intermitente!', '¡Que se me enfrían las croquetas!', '¡Esta silla corre más que tu coche!'];
const PAELLA_LINES = ['¡Una de paella!', '¡Ración para mí!', '¡Con socarrat, por favor!', '¡Eso no es paella, es arroz con cosas!', '¡Olé!', '¡Qué arte!'];

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpV3 = new THREE.Vector3();
const RICE = ['#f4c430', '#ffd23f', '#f4c430', '#ffe066', '#ff7b54', '#6a994e'];

/** Estado de cada vehículo loco (se guarda en el propio vehículo). */
interface CrazyState {
  /** Cuenta atrás para el próximo pitido espontáneo (silla de la yaya) o verbena (paella de la IA). */
  auto: number;
  /** Segundos que le quedan de música (paella). */
  music: number;
  /** Cuenta atrás de efectos (arroz, humo, pitidos de marcha atrás). */
  fx: number;
  /** Horquilla: altura 0..1, fase y tiempo en la fase. */
  fork: number;
  forkPhase: 'idle' | 'up' | 'hold' | 'down';
  forkT: number;
  /** Ya ha levantado lo que tenía delante en esta subida. */
  lifted: boolean;
  /** Cuenta atrás del bandazo del sofá. */
  wobble: number;
}

function stateOf(v: Vehicle): CrazyState {
  let s = (v as any).crazy as CrazyState | undefined;
  if (!s) {
    s = { auto: 4 + rnd.next() * 6, music: 0, fx: 0, fork: 0, forkPhase: 'idle', forkT: 0, lifted: false, wobble: 1 };
    (v as any).crazy = s;
  }
  return s;
}

/** Cartel con el nombre del vehículo loco: un sprite que sale de un bote y se va (uno para todos). */
class NameCard {
  private sprite: THREE.Sprite;
  private mats = new Map<string, THREE.SpriteMaterial>();
  private v: Vehicle | null = null;
  private t = 0;
  private size = 4;

  /** Frames que se dibuja escondido al empezar, para compilar su shader antes de hacer falta (sin tirón). */
  private warm = 3;

  constructor(scene: THREE.Scene) {
    this.sprite = new THREE.Sprite(this.material('cart')!);
    this.sprite.position.set(0, -1000, 0);
    this.sprite.scale.setScalar(0.001);
    this.sprite.renderOrder = 999;
    this.sprite.frustumCulled = false;
    this.sprite.name = 'cartel del vehículo loco';
    scene.add(this.sprite);
  }

  private material(kind: string): THREE.SpriteMaterial | null {
    const card = CARDS[kind];
    if (!card) return null;
    let m = this.mats.get(kind);
    if (m) return m;
    const [title, sub, bg, fg] = card;
    const c = document.createElement('canvas');
    c.width = 640;
    c.height = 240;
    const g = c.getContext('2d')!;
    g.translate(320, 120);
    g.rotate(-0.035);
    // cinta con sombra y borde grueso
    g.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(g, -292, -86, 596, 184, 34);
    g.fill();
    g.fillStyle = bg;
    g.strokeStyle = '#1b1030';
    g.lineWidth = 12;
    roundRect(g, -300, -96, 596, 184, 34);
    g.fill();
    g.stroke();
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let fs = 70;
    g.font = `900 ${fs}px system-ui, sans-serif`;
    while (g.measureText(title).width > 540 && fs > 30) g.font = `900 ${(fs -= 3)}px system-ui, sans-serif`;
    g.fillText(title, -2, -30);
    fs = 34;
    g.font = `700 ${fs}px system-ui, sans-serif`;
    while (g.measureText(sub).width > 530 && fs > 18) g.font = `700 ${(fs -= 2)}px system-ui, sans-serif`;
    g.globalAlpha = 0.85;
    g.fillText(sub, -2, 44);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false });
    this.mats.set(kind, m);
    return m;
  }

  show(v: Vehicle) {
    const m = this.material(v.spec.kind);
    if (!m) return;
    this.sprite.material = m;
    this.v = v;
    this.t = 0;
    this.size = THREE.MathUtils.clamp(2.6 + v.spec.half.z * 0.7, 3, 4.6);
    this.sprite.visible = true;
  }

  update(dt: number) {
    if (this.warm > 0 && --this.warm === 0 && !this.v) this.sprite.visible = false;
    const v = this.v;
    if (!v) return;
    this.t += dt;
    const T = 3.2;
    if (this.t >= T || v.disposed) {
      this.sprite.visible = false;
      this.v = null;
      return;
    }
    // entra de un bote (se pasa un poco y vuelve), aguanta y se encoge
    const t = this.t;
    let k = 1;
    if (t < 0.45) {
      const x = t / 0.45;
      k = 1 + Math.sin(x * Math.PI * 1.5) * (1 - x) * 0.35 - (1 - x) ** 3;
    } else if (t > T - 0.35) k = Math.max(0, (T - t) / 0.35);
    const s = this.size * Math.max(0.01, k);
    this.sprite.scale.set(s, s * 0.375, 1);
    v.getPosition(tmpV3);
    this.sprite.position.set(tmpV3.x, tmpV3.y + v.spec.half.y + 1.3 + Math.sin(t * 3) * 0.08, tmpV3.z);
  }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export class CrazyVehicles implements System {
  name = 'crazyVehicles';
  readonly list: Vehicle[] = [];
  /** Vehículos locos que el jugador ya ha probado (se guarda en la partida). */
  private seen = new Set<string>();
  private craneFlip = 1;
  private craneTimer = 5;
  private respawnTimer = 10;
  private card: NameCard;
  private grannyToastT = 0;

  constructor(private game: Game) {
    game.mod.crazy = this;
    this.card = new NameCard(game.scene);
    this.spawnAll();
    game.mod.save?.register({
      key: 'crazyVehicles',
      save: () => ({ seen: [...this.seen] }),
      load: (d: any) => {
        for (const k of (d?.seen ?? []) as string[]) if (INTRO[k]) this.seen.add(k);
      },
    });
    game.events.on('vehicle:enter', (e: any) => {
      const v = e.vehicle as Vehicle | undefined;
      const k = v?.spec?.kind as string;
      if (!v || !INTRO[k]) return;
      this.card.show(v);
      if (!this.seen.has(k)) {
        this.seen.add(k);
        game.events.emit('toast', { text: INTRO[k], color: '#06d6a0', time: 4 });
        game.mod.economy?.addFame(5, 'vehículo loco');
        if (this.seen.size === Object.keys(INTRO).length) {
          // premio por probarlos todos
          game.events.emit('toast', { text: '🏆 ¡Has conducido los 9 vehículos locos de Puerto Paquete! Eres un peligro público.', color: '#ffd23f', time: 5 });
          game.mod.economy?.addFame(40, 'todos los vehículos locos');
          game.events.emit('crazy:all' as any, {} as any);
        }
      }
    });
    game.events.on('vehicle:impact' as any, (e: any) => {
      const v = e.vehicle as Vehicle;
      const k = v.spec.kind;
      if (k === 'garbage') this.garbageSmash(v);
      else if (k === 'granny') this.grannyShove(v, e.dv);
      else if (k === 'forklift' && v.speed > 2) this.startLift(v);
    });
    // pitar: verbena en la paella-móvil, horquilla arriba en la carretilla
    game.events.on('vehicle:honk' as any, (e: any) => {
      const v = e.vehicle as Vehicle;
      if (v.spec.kind === 'paella') this.startMusic(v);
      else if (v.spec.kind === 'forklift') this.startLift(v);
    });
  }

  private get vm(): VehicleManager {
    return this.game.mod.vehicles;
  }

  /** ¿Es la isla de verdad? (los sitios nuevos solo valen para ella) */
  private get island(): boolean {
    return !!(this.game.world as any)?.extra?.plazuela;
  }

  private spawnAll() {
    const w = this.game.world;
    if (!w) return;
    const spots: { kind: string; pos: THREE.Vector3; heading: number }[] = [...w.specialVehicleSpots];
    if (this.island) for (const s of EXTRA_SPOTS) spots.push({ kind: s.kind, pos: new THREE.Vector3(s.x, w.heightAt(s.x, s.z), s.z), heading: s.heading });
    for (const s of spots) {
      const kind = s.kind === 'scooter_e' ? 'escooter' : s.kind;
      if (this.list.some((v) => v.spec.kind === kind && !v.destroyed)) continue;
      const v = this.vm.spawn(kind as VehicleKind, s.pos, s.heading);
      v.transient = false;
      (v as any).homeSpot = s;
      this.list.push(v);
    }
  }

  /** Lo llama el gestor de vehículos justo después de leer los mandos del jugador. */
  modifyControls(v: Vehicle) {
    const k = v.spec.kind;
    if (k === 'cart') {
      // rueda loca: el volante tiembla
      v.controls.steer += Math.sin(this.game.time.elapsed * 7) * 0.35 + (rnd.next() - 0.5) * 0.3;
    } else if (k === 'crane') {
      v.controls.steer *= this.craneFlip;
    } else if (k === 'granny') {
      // la yaya no conoce el turbo
      v.controls.boost = false;
    }
  }

  // ─────────── Gracias de cada uno ───────────

  /** El camión de la basura manda a volar lo que toca. */
  private garbageSmash(v: Vehicle) {
    if (Math.abs(v.speed) < 4) return;
    v.getPosition(tmpV);
    for (const o of this.vm.list) {
      if (o === v || o.destroyed) continue;
      const d = o.getPosition(tmpV2).distanceTo(tmpV);
      if (d < v.spec.half.z + o.spec.half.z + 1) {
        const dir = tmpV2.sub(tmpV).setY(0).normalize();
        o.body.applyImpulse({ x: dir.x * o.spec.mass * 9, y: o.spec.mass * 5, z: dir.z * o.spec.mass * 9 }, true);
        o.body.applyTorqueImpulse({ x: o.spec.mass * 2, y: 0, z: o.spec.mass * 3 }, true);
        o.damage(o.spec.health * 0.3);
      }
    }
  }

  /** La yaya tiene preferencia: lo que choca con su silla sale rebotado. */
  private grannyShove(v: Vehicle, dv: number) {
    if (dv < 3) return;
    v.getPosition(tmpV);
    let any = false;
    for (const o of this.vm.list) {
      if (o === v || o.destroyed || o.disposed) continue;
      const d = o.getPosition(tmpV2).distanceTo(tmpV);
      if (d > o.spec.half.z + 1.6) continue;
      const dir = tmpV2.sub(tmpV).setY(0);
      if (dir.lengthSq() < 0.01) dir.set(1, 0, 0);
      dir.normalize();
      const m = o.spec.mass;
      o.body.applyImpulse({ x: dir.x * m * 6, y: m * 2.2, z: dir.z * m * 6 }, true);
      o.body.applyTorqueImpulse({ x: 0, y: m * (rnd.next() - 0.5) * 3, z: 0 }, true);
      any = true;
    }
    // la silla no sale disparada: la yaya no se mueve de su sitio
    const lv = v.body.linvel();
    v.body.setLinvel({ x: lv.x * 0.3, y: Math.min(lv.y, 1), z: lv.z * 0.3 }, true);
    const g = this.game;
    if (any && v === this.vm.current && g.time.elapsed > this.grannyToastT) {
      this.grannyToastT = g.time.elapsed + 6;
      g.events.emit('toast', { text: '👵 ¡La yaya tiene preferencia!', color: '#ff4f81', time: 1.8 });
    }
  }

  private startMusic(v: Vehicle) {
    const st = stateOf(v);
    if (st.music > 0) return;
    st.music = PAELLA_TUNE_SECONDS;
    paellaMusic(this.game, v.getPosition(tmpV));
    // la gente de alrededor pide su ración
    const npcs = this.game.mod.npcs?.list ?? [];
    let shouts = 0;
    for (const n of npcs) {
      if (shouts >= 3) break;
      if (n.role !== 'civil' || !n.alive || n.vehicle || n.position.distanceTo(tmpV) > 22) continue;
      if (rnd.next() < 0.6) {
        shouts++;
        this.game.events.emit('npc:shout' as any, { npc: n, text: PAELLA_LINES[Math.floor(rnd.next() * PAELLA_LINES.length)] } as any);
      }
    }
  }

  private startLift(v: Vehicle) {
    const st = stateOf(v);
    if (st.forkPhase === 'up' || st.forkPhase === 'hold') return;
    st.forkPhase = 'up';
    st.forkT = 0;
    st.lifted = false;
  }

  /** La horquilla levanta (y voltea) lo que haya justo delante: coches y gente. */
  private liftFront(v: Vehicle) {
    const h = v.heading;
    const fx = Math.sin(h), fz = Math.cos(h);
    v.getPosition(tmpV);
    let hitCar = false;
    for (const o of this.vm.list) {
      if (o === v || o.destroyed || o.disposed) continue;
      o.getPosition(tmpV2);
      const dx = tmpV2.x - tmpV.x, dz = tmpV2.z - tmpV.z;
      const along = dx * fx + dz * fz;
      const side = dx * fz - dz * fx;
      if (along < v.spec.half.z - 0.4 || along > v.spec.half.z + o.spec.half.z + 1.8 || Math.abs(side) > o.spec.half.z + 0.6) continue;
      if (Math.abs(tmpV2.y - tmpV.y) > 2.5) continue;
      const m = o.spec.mass;
      const hs = o.spec.half;
      // arriba, un empujón hacia delante y un giro que lo vuelca hacia atrás (eje = arriba × delante)
      o.body.applyImpulse({ x: fx * m * 2.5, y: m * 8.5, z: fz * m * 2.5 }, true);
      const inertia = ((m / 12) * (4 * hs.y * hs.y + 4 * hs.z * hs.z) * 1.2 + (m / 12) * (4 * hs.x * hs.x + 4 * hs.y * hs.y) * 1.2) / 2;
      o.body.applyTorqueImpulse({ x: fz * inertia * 3.2, y: 0, z: -fx * inertia * 3.2 }, true);
      if (o.spec.invulnerable) continue;
      o.damage(o.spec.health * 0.08);
      hitCar = true;
    }
    for (const n of this.game.mod.npcs?.list ?? []) {
      if (!n.alive || n.vehicle) continue;
      const dx = n.position.x - tmpV.x, dz = n.position.z - tmpV.z;
      const along = dx * fx + dz * fz;
      if (along < v.spec.half.z - 0.3 || along > v.spec.half.z + 1.6 || Math.abs(dx * fz - dz * fx) > 1.1) continue;
      n.knock(tmpV3.set(fx * 3, 8, fz * 3));
    }
    if (hitCar) {
      this.game.mod.audio?.play('crash_small', { pos: tmpV, volume: 0.7 });
      if (v === this.vm.current) {
        this.game.events.emit('toast', { text: '¡AÚPA! 🏋️', color: '#ffc300', time: 1.4 });
        // un instante a cámara lenta para ver el coche dando la voltereta
        this.game.slowMo(0.7, 0.35);
      }
    }
  }

  /** Horquilla: sube, aguanta un momento y baja (y al subir levanta lo de delante). */
  private updateFork(v: Vehicle, st: CrazyState, dt: number) {
    if (st.forkPhase === 'idle') {
      (v as any).engineExtra = 0;
      return;
    }
    st.forkT += dt;
    if (st.forkPhase === 'up') {
      st.fork = Math.min(1, st.fork + dt * 2.4);
      if (!st.lifted && st.fork > 0.25) {
        st.lifted = true;
        this.liftFront(v);
      }
      if (st.fork >= 1) {
        st.forkPhase = 'hold';
        st.forkT = 0;
      }
    } else if (st.forkPhase === 'hold') {
      if (st.forkT > 1.1) {
        st.forkPhase = 'down';
        st.forkT = 0;
      }
    } else {
      st.fork = Math.max(0, st.fork - dt * 1.2);
      if (st.fork <= 0) st.forkPhase = 'idle';
    }
    (v as any).engineExtra = st.forkPhase === 'up' || st.forkPhase === 'down' ? 1 : 0;
    const part = v.mesh.part;
    if (part) part.position.y = part.userData.rest.y + st.fork * 1.8;
  }

  /**
   * Gracias que funcionan lleve quien lleve el vehículo (el jugador o un conductor del tráfico) y
   * mientras esté cerca: pitidos, música, arroz, humo, horquilla.
   */
  private updateOne(v: Vehicle, dt: number, cam: THREE.Vector3) {
    const k = v.spec.kind;
    const st = stateOf(v);
    const mine = v === this.vm.current;
    const driven = mine || !!v.driver;
    v.getPosition(tmpV);
    const near = tmpV.distanceToSquared(cam) < 60 * 60;
    const g = this.game;
    const particles = g.mod.particles;
    if (k === 'forklift') {
      this.updateFork(v, st, dt);
      // pi, pi, pi al ir marcha atrás
      if (driven && near && v.speed < -0.6) {
        st.fx -= dt;
        if (st.fx <= 0) {
          st.fx = 0.5;
          beep(g, tmpV, 1050, 0.08);
        }
      }
    } else if (k === 'granny') {
      if (!driven || !near) return;
      if (v.speed < -0.4) {
        st.fx -= dt;
        if (st.fx <= 0) {
          st.fx = 0.55;
          beep(g, tmpV, 1500, 0.06, 0.1);
        }
      }
      // pita sola, y la yaya suelta alguna perla
      st.auto -= dt;
      if (st.auto <= 0) {
        st.auto = 7 + rnd.next() * 8;
        honk(g, v);
        g.mod.bubbles?.say(v, GRANNY_LINES[Math.floor(rnd.next() * GRANNY_LINES.length)], 2.6);
      }
    } else if (k === 'paella') {
      const part = v.mesh.part;
      if (st.music > 0) {
        st.music -= dt;
        if (part) part.rotation.y += dt * 6;
        st.fx -= dt;
        if (st.fx <= 0 && near && particles) {
          st.fx = 0.14;
          if (part) part.getWorldPosition(tmpV2);
          else tmpV2.copy(tmpV);
          particles.emit('confetti', tmpV2.setY(tmpV2.y + 0.2), { count: 4, color: RICE, speed: 0.9, scale: 0.9 });
        }
      } else if (part && part.rotation.y !== 0) {
        // vuelve a su sitio poco a poco
        part.rotation.y = part.rotation.y % (Math.PI * 2);
        part.rotation.y *= 1 - Math.min(1, dt * 3);
        if (Math.abs(part.rotation.y) < 0.01) part.rotation.y = 0;
      }
      // en las curvas fuertes se cae arroz de la paella
      if (near && particles && v.slip > 4 && Math.abs(v.speed) > 6) {
        st.fx -= dt;
        if (st.fx <= 0) {
          st.fx = 0.18;
          v.localToWorld(tmpV2.set(0, v.spec.half.y + 0.4, -0.6), tmpV2);
          particles.emit('confetti', tmpV2, { count: 2, color: RICE, speed: 0.6, scale: 0.5 });
        }
      }
      // conducida por la IA: de vez en cuando pone la verbena (como el camión de los helados)
      if (!mine && driven && near) {
        st.auto -= dt;
        if (st.auto <= 0) {
          st.auto = 20 + rnd.next() * 20;
          honk(g, v);
          this.startMusic(v);
        }
      }
    } else if (k === 'sofa') {
      if (!driven) return;
      // humo del cortacésped al acelerar
      if (near && particles && v.controls.throttle > 0.1) {
        st.fx -= dt;
        if (st.fx <= 0) {
          st.fx = 0.22;
          v.localToWorld(tmpV2.set(-0.05, -v.spec.half.y + 0.85, -v.spec.half.z - 0.05), tmpV2);
          particles.emit('smoke', tmpV2, { count: 1, scale: 0.14, speed: 0.3, life: 0.5 });
        }
      }
      // el sofá no va recto: da bandazos de vez en cuando
      if (Math.abs(v.speed) > 3) {
        st.wobble -= dt;
        if (st.wobble <= 0) {
          st.wobble = 0.8 + rnd.next() * 1.4;
          v.body.applyTorqueImpulse({ x: 0, y: v.spec.mass * (rnd.next() < 0.5 ? -1 : 1) * (0.35 + rnd.next() * 0.35), z: 0 }, true);
        }
      }
    }
  }

  update(dt: number) {
    const g = this.game;
    const cur = this.vm.current;
    const cam = g.camera.position;
    this.card.update(dt);
    // gracias de los locos (los de su sitio y los que van por el tráfico)
    for (const v of this.vm.list) {
      if (v.destroyed) continue;
      const k = v.spec.kind;
      if (k === 'granny' || k === 'paella' || k === 'sofa' || k === 'forklift') this.updateOne(v, dt, cam);
    }
    if (cur) {
      const k = cur.spec.kind;
      if (k === 'cart') {
        if (Math.abs(cur.speed) > 3 && rnd.next() < dt * 2) g.mod.audio?.play('slot', { volume: 0.25, pitch: 2.2 });
      } else if (k === 'crane') {
        this.craneTimer -= dt;
        if (this.craneTimer <= 0) {
          this.craneTimer = 4 + rnd.next() * 5;
          this.craneFlip = rnd.next() < 0.45 ? -1 : 1;
          if (this.craneFlip < 0) g.events.emit('toast', { text: '¡El volante de la grúa va al revés!', color: '#ff7b54', time: 1.6 });
        }
        // la pluma se balancea
        const boom = cur.mesh.body;
        boom.rotation.z = Math.sin(g.time.elapsed * 1.3) * 0.03 * Math.min(1, Math.abs(cur.speed) / 5);
      } else if (k === 'golf') {
        // bota un poco
        cur.mesh.body.position.y = Math.abs(Math.sin(g.time.elapsed * 9)) * 0.04 * Math.min(1, Math.abs(cur.speed) / 4);
      }
    }
    // reponer los que se destruyen, cuando el jugador está lejos
    this.respawnTimer -= dt;
    if (this.respawnTimer <= 0) {
      this.respawnTimer = 20;
      const p = g.mod.player?.position;
      for (let i = this.list.length - 1; i >= 0; i--) {
        const v = this.list[i];
        const home = (v as any).homeSpot;
        if ((v.destroyed || v.sinking) && p && home && home.pos.distanceTo(p) > 120 && v !== cur) {
          this.vm.remove(v);
          this.list.splice(i, 1);
        }
      }
      if (p) this.spawnAll();
    }
  }
}
