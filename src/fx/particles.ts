// Partículas low-poly con InstancedMesh: humo, fuego, chispas, polvo, confeti, cartón, cristales...
// En vez de transparencia, las piezas crecen y encogen (queda bien con el estilo y es barato).
import * as THREE from 'three';
import type { Game, System } from '../core/game';
import { fx as rnd } from '../core/rng';

export type ParticleKind =
  | 'smoke' | 'blacksmoke' | 'fire' | 'spark' | 'dust' | 'confetti' | 'cardboard' | 'debris'
  | 'splash' | 'glass' | 'leaves' | 'fruit' | 'stamps' | 'tape' | 'money' | 'shell' | 'water' | 'stars';

export interface EmitOpts {
  count?: number;
  dir?: THREE.Vector3; // dirección principal
  spread?: number; // 0..1 (1 = todas direcciones)
  speed?: number;
  color?: string | string[];
  scale?: number;
  life?: number;
  gravity?: number;
}

interface Pool {
  mesh: THREE.InstancedMesh;
  max: number;
  // por partícula
  pos: Float32Array;
  vel: Float32Array;
  rot: Float32Array;
  spin: Float32Array;
  age: Float32Array;
  life: Float32Array;
  size: Float32Array;
  grow: Float32Array; // tipo de curva de tamaño: 0 = encoge, 1 = crece y encoge, 2 = constante y encoge al final
  grav: Float32Array;
  drag: Float32Array;
  alive: number;
  cursor: number;
}

const dummy = new THREE.Object3D();
const tmpC = new THREE.Color();
const tmpV = new THREE.Vector3();

function makePool(scene: THREE.Scene, geo: THREE.BufferGeometry, mat: THREE.Material, max: number, shadows = false): Pool {
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.castShadow = shadows;
  mesh.count = 0;
  scene.add(mesh);
  return {
    mesh, max,
    pos: new Float32Array(max * 3), vel: new Float32Array(max * 3),
    rot: new Float32Array(max * 3), spin: new Float32Array(max * 3),
    age: new Float32Array(max), life: new Float32Array(max), size: new Float32Array(max),
    grow: new Float32Array(max), grav: new Float32Array(max), drag: new Float32Array(max),
    alive: 0, cursor: 0,
  };
}

interface KindDef {
  pool: 'puff' | 'glow' | 'chip' | 'flat';
  colors: string[];
  life: [number, number];
  size: [number, number];
  speed: [number, number];
  gravity: number;
  drag: number;
  grow: number;
  spin: number;
  up: number; // empuje hacia arriba extra
}

const KINDS: Record<ParticleKind, KindDef> = {
  smoke: { pool: 'puff', colors: ['#d9d9d9', '#bfbfbf', '#e8e8e8'], life: [1.2, 2.2], size: [0.5, 1.1], speed: [0.5, 1.5], gravity: -1.5, drag: 1.2, grow: 1, spin: 1, up: 1.2 },
  blacksmoke: { pool: 'puff', colors: ['#3a3a3a', '#2a2a2a', '#555555'], life: [1.5, 2.8], size: [0.7, 1.4], speed: [0.5, 1.5], gravity: -2.5, drag: 1, grow: 1, spin: 1, up: 2 },
  fire: { pool: 'glow', colors: ['#ffd23f', '#ff9f1c', '#ff5400', '#ffea8a'], life: [0.35, 0.7], size: [0.35, 0.8], speed: [0.5, 2], gravity: -6, drag: 2, grow: 1, spin: 3, up: 2 },
  spark: { pool: 'glow', colors: ['#fff3b0', '#ffd23f', '#ffffff'], life: [0.2, 0.5], size: [0.05, 0.1], speed: [4, 10], gravity: 12, drag: 1, grow: 0, spin: 0, up: 0 },
  dust: { pool: 'puff', colors: ['#c8b89a', '#b5a484', '#d8cbb0'], life: [0.5, 1.1], size: [0.25, 0.55], speed: [0.5, 2], gravity: -0.5, drag: 2.5, grow: 1, spin: 1, up: 0.4 },
  confetti: { pool: 'flat', colors: ['#ff4f81', '#ffd23f', '#2ec4b6', '#6c3bd1', '#ff7b54', '#06d6a0', '#ffffff'], life: [1.8, 3], size: [0.1, 0.18], speed: [3, 7], gravity: 3.5, drag: 1.8, grow: 2, spin: 8, up: 3 },
  cardboard: { pool: 'chip', colors: ['#c8915a', '#b07b48', '#d9a870', '#8f6238'], life: [1.5, 2.5], size: [0.15, 0.35], speed: [3, 8], gravity: 14, drag: 0.6, grow: 2, spin: 7, up: 3 },
  debris: { pool: 'chip', colors: ['#555a60', '#3d4046', '#7a7f86', '#2b2d33'], life: [1.5, 3], size: [0.15, 0.4], speed: [5, 12], gravity: 18, drag: 0.4, grow: 2, spin: 8, up: 4 },
  splash: { pool: 'puff', colors: ['#bfefff', '#ffffff', '#8fd8f0'], life: [0.5, 1], size: [0.2, 0.45], speed: [3, 7], gravity: 16, drag: 0.6, grow: 2, spin: 2, up: 5 },
  glass: { pool: 'flat', colors: ['#bfe8ff', '#e6f7ff', '#9fd3f0'], life: [0.8, 1.5], size: [0.06, 0.14], speed: [3, 7], gravity: 16, drag: 0.5, grow: 2, spin: 10, up: 2 },
  leaves: { pool: 'flat', colors: ['#4caf50', '#7cb342', '#9ccc65'], life: [1.5, 2.5], size: [0.1, 0.18], speed: [1, 3], gravity: 2, drag: 2, grow: 2, spin: 6, up: 1.5 },
  fruit: { pool: 'chip', colors: ['#ff9f1c', '#e63946', '#ffd23f', '#7cb342', '#ff7b54'], life: [1.5, 2.5], size: [0.12, 0.2], speed: [3, 7], gravity: 16, drag: 0.5, grow: 2, spin: 6, up: 3 },
  stamps: { pool: 'flat', colors: ['#e63946', '#1d3557', '#2a9d8f', '#ffd23f'], life: [0.6, 1.2], size: [0.1, 0.14], speed: [2, 5], gravity: 6, drag: 1.5, grow: 2, spin: 8, up: 1 },
  tape: { pool: 'flat', colors: ['#d9b26f', '#c9a25f'], life: [0.6, 1.2], size: [0.15, 0.25], speed: [1, 3], gravity: 5, drag: 2, grow: 2, spin: 5, up: 0.5 },
  money: { pool: 'flat', colors: ['#6fcf6f', '#9be39b', '#4caf50'], life: [2, 3.5], size: [0.14, 0.2], speed: [2, 5], gravity: 2.5, drag: 2, grow: 2, spin: 6, up: 4 },
  shell: { pool: 'chip', colors: ['#e0b04a', '#c9983a'], life: [0.6, 1], size: [0.03, 0.05], speed: [2, 3], gravity: 14, drag: 0.3, grow: 2, spin: 15, up: 2 },
  water: { pool: 'puff', colors: ['#ffffff', '#dff6ff'], life: [0.6, 1.2], size: [0.3, 0.6], speed: [0.5, 2], gravity: 4, drag: 1.5, grow: 1, spin: 1, up: 2 },
  stars: { pool: 'glow', colors: ['#ffd23f', '#ffffff', '#ff4f81'], life: [0.5, 0.9], size: [0.08, 0.14], speed: [1, 3], gravity: -1, drag: 2, grow: 1, spin: 5, up: 1 },
};

export class Particles implements System {
  name = 'particles';
  private pools: Record<KindDef['pool'], Pool>;
  /** Luces de destello (explosiones, fogonazos). */
  private flashes: { light: THREE.PointLight; t: number; dur: number; peak: number }[] = [];

  constructor(private game: Game) {
    game.mod.particles = this;
    const s = game.scene;
    const puffGeo = new THREE.IcosahedronGeometry(1, 0);
    const glowGeo = new THREE.OctahedronGeometry(1, 0);
    const chipGeo = new THREE.BoxGeometry(1, 0.6, 0.8);
    const flatGeo = new THREE.PlaneGeometry(1, 0.6);
    this.pools = {
      puff: makePool(s, puffGeo, new THREE.MeshLambertMaterial({ flatShading: true }), 700),
      glow: makePool(s, glowGeo, new THREE.MeshBasicMaterial({ toneMapped: false }), 600),
      chip: makePool(s, chipGeo, new THREE.MeshLambertMaterial({ flatShading: true }), 500, true),
      flat: makePool(s, flatGeo, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), 700),
    };
    // Las luces de destello están SIEMPRE en la escena (a intensidad 0 cuando no se usan): si se
    // encendieran y apagaran con visible, cambiaría el número de luces y three tendría que
    // recompilar todos los shaders en el primer tiro o explosión (medido: medio segundo congelado).
    for (let i = 0; i < 2; i++) {
      const light = new THREE.PointLight('#ffb347', 0, 18, 1.6);
      light.name = 'destello';
      light.position.set(0, -500, 0);
      s.add(light);
      this.flashes.push({ light, t: 0, dur: 0, peak: 0 });
    }
  }

  emit(kind: ParticleKind, pos: THREE.Vector3, opts: EmitOpts = {}) {
    const def = KINDS[kind];
    const pool = this.pools[def.pool];
    const count = Math.max(1, Math.round((opts.count ?? 8) * (this.game.settings.quality === 'baja' ? 0.5 : 1)));
    const colors = opts.color ? (Array.isArray(opts.color) ? opts.color : [opts.color]) : def.colors;
    const spread = opts.spread ?? 1;
    const speedK = opts.speed ?? 1;
    for (let n = 0; n < count; n++) {
      const i = pool.cursor;
      pool.cursor = (pool.cursor + 1) % pool.max;
      if (pool.alive < pool.max) pool.alive++;
      const i3 = i * 3;
      pool.pos[i3] = pos.x + (rnd.next() - 0.5) * 0.2;
      pool.pos[i3 + 1] = pos.y + (rnd.next() - 0.5) * 0.2;
      pool.pos[i3 + 2] = pos.z + (rnd.next() - 0.5) * 0.2;
      // dirección: aleatoria mezclada con dir
      tmpV.set(rnd.next() * 2 - 1, rnd.next() * 2 - 1, rnd.next() * 2 - 1).normalize();
      if (opts.dir) tmpV.multiplyScalar(spread).addScaledVector(opts.dir, 1 - spread * 0.5).normalize();
      const sp = (def.speed[0] + rnd.next() * (def.speed[1] - def.speed[0])) * speedK;
      pool.vel[i3] = tmpV.x * sp;
      pool.vel[i3 + 1] = tmpV.y * sp + def.up * (0.5 + rnd.next());
      pool.vel[i3 + 2] = tmpV.z * sp;
      pool.rot[i3] = rnd.next() * 6;
      pool.rot[i3 + 1] = rnd.next() * 6;
      pool.rot[i3 + 2] = rnd.next() * 6;
      pool.spin[i3] = (rnd.next() - 0.5) * def.spin * 2;
      pool.spin[i3 + 1] = (rnd.next() - 0.5) * def.spin * 2;
      pool.spin[i3 + 2] = (rnd.next() - 0.5) * def.spin * 2;
      pool.age[i] = 0;
      pool.life[i] = (opts.life ?? 1) * (def.life[0] + rnd.next() * (def.life[1] - def.life[0]));
      pool.size[i] = (opts.scale ?? 1) * (def.size[0] + rnd.next() * (def.size[1] - def.size[0]));
      pool.grow[i] = def.grow;
      pool.grav[i] = opts.gravity ?? def.gravity;
      pool.drag[i] = def.drag;
      tmpC.set(colors[Math.floor(rnd.next() * colors.length)]);
      pool.mesh.instanceColor!.setXYZ(i, tmpC.r, tmpC.g, tmpC.b);
    }
    pool.mesh.instanceColor!.needsUpdate = true;
  }

  /** Destello de luz breve (explosión, fogonazo). */
  flash(pos: THREE.Vector3, color = '#ffb347', intensity = 60, dur = 0.25, distance = 18) {
    let f = this.flashes.find((x) => x.t >= x.dur) ?? this.flashes[0];
    f.light.position.copy(pos);
    f.light.color.set(color);
    f.light.distance = distance;
    f.t = 0;
    f.dur = dur;
    f.peak = intensity;
  }

  /** Explosión visual completa (sin daño: el daño lo pone quien la provoca). */
  explosion(pos: THREE.Vector3, big = false) {
    const k = big ? 1.8 : 1;
    this.emit('fire', pos, { count: 26 * k, speed: 3 * k, scale: 1.6 * k, life: 1.2 });
    this.emit('blacksmoke', pos, { count: 16 * k, speed: 2 * k, scale: 1.5 * k });
    this.emit('smoke', pos, { count: 10 * k, speed: 2.5, scale: 1.3 * k, life: 1.5 });
    this.emit('spark', pos, { count: 30 * k, speed: 1.4 });
    this.emit('debris', pos, { count: 14 * k });
    this.emit('confetti', pos, { count: 10 * k });
    this.flash(pos, '#ffb347', big ? 220 : 120, big ? 0.6 : 0.35, big ? 40 : 26);
    this.game.events.emit('camera:shake', { amount: big ? 1.2 : 0.6 });
  }

  /** Enemigo derribado: nube de cartón y confeti (sin sangre). */
  poof(pos: THREE.Vector3) {
    this.emit('cardboard', pos, { count: 12, speed: 0.8 });
    this.emit('confetti', pos, { count: 22 });
    this.emit('dust', pos, { count: 8, scale: 1.4 });
  }

  update(dt: number) {
    for (const f of this.flashes) {
      if (f.t < f.dur) {
        f.t += dt;
        const k = 1 - f.t / f.dur;
        f.light.intensity = f.t >= f.dur ? 0 : f.peak * k * k;
      }
    }
    for (const key in this.pools) {
      const p = this.pools[key as KindDef['pool']];
      if (p.alive === 0) continue;
      let maxIndex = 0;
      for (let i = 0; i < p.max; i++) {
        if (p.age[i] >= p.life[i]) {
          if (p.life[i] > 0) {
            // ocultar
            dummy.scale.setScalar(0);
            dummy.updateMatrix();
            p.mesh.setMatrixAt(i, dummy.matrix);
            p.life[i] = 0;
            p.age[i] = 0;
          }
          continue;
        }
        maxIndex = i + 1;
        p.age[i] += dt;
        const i3 = i * 3;
        const drag = Math.max(0, 1 - p.drag[i] * dt);
        p.vel[i3] *= drag;
        p.vel[i3 + 1] = p.vel[i3 + 1] * drag - p.grav[i] * dt;
        p.vel[i3 + 2] *= drag;
        p.pos[i3] += p.vel[i3] * dt;
        p.pos[i3 + 1] += p.vel[i3 + 1] * dt;
        p.pos[i3 + 2] += p.vel[i3 + 2] * dt;
        // rebote simple con el suelo para trozos
        if (p.grow[i] === 2 && this.game.world) {
          const gy = this.game.world.heightAt(p.pos[i3], p.pos[i3 + 2]) + 0.03;
          if (p.pos[i3 + 1] < gy) {
            p.pos[i3 + 1] = gy;
            p.vel[i3 + 1] *= -0.3;
            p.vel[i3] *= 0.6;
            p.vel[i3 + 2] *= 0.6;
            p.spin[i3] *= 0.5;
            p.spin[i3 + 2] *= 0.5;
          }
        }
        p.rot[i3] += p.spin[i3] * dt;
        p.rot[i3 + 1] += p.spin[i3 + 1] * dt;
        p.rot[i3 + 2] += p.spin[i3 + 2] * dt;
        const t = p.age[i] / p.life[i];
        let s: number;
        if (p.grow[i] === 1) s = t < 0.25 ? t / 0.25 : 1 - (t - 0.25) / 0.75;
        else if (p.grow[i] === 2) s = t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2;
        else s = 1 - t;
        s = Math.max(0, s) * p.size[i] * (p.grow[i] === 1 ? 1 + t * 1.5 : 1);
        dummy.position.set(p.pos[i3], p.pos[i3 + 1], p.pos[i3 + 2]);
        dummy.rotation.set(p.rot[i3], p.rot[i3 + 1], p.rot[i3 + 2]);
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        p.mesh.setMatrixAt(i, dummy.matrix);
      }
      p.mesh.count = maxIndex;
      if (maxIndex === 0) p.alive = 0;
      p.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
