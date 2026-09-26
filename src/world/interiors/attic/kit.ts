// Kit compartido por el ático y la oficina: texturas pintadas, fusión de mallas, asientos,
// acuario con peces, fundidos, animación de "aparecer" y otras cosillas de interiores.
import * as THREE from 'three';
import type { Game } from '../../../core/game';
import type { CharacterLook, CharacterPose } from '../../../core/contracts';
import type { CharacterLookExtra } from '../../../actors/character';
import { GeoBuilder } from '../../../core/geo';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fx as rnd } from '../../../core/rng';

// ─────────────────────────────── texturas ───────────────────────────────

/** Textura pintada con canvas 2D (sRGB, con mipmaps). */
export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Plano con textura. basic = no le afectan las luces (pantallas, neones, carteles luminosos). */
export function texPlane(w: number, h: number, tex: THREE.Texture, basic = false, extra: Partial<THREE.MeshBasicMaterialParameters> = {}): THREE.Mesh {
  const mat = basic
    ? new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, ...extra })
    : new THREE.MeshLambertMaterial({ map: tex, ...(extra as THREE.MeshLambertMaterialParameters) });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  return m;
}

/** Texto con contorno. */
export function outlinedText(g: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string, stroke = '#1b1030', lw = 8) {
  g.lineJoin = 'round';
  g.strokeStyle = stroke;
  g.lineWidth = lw;
  g.strokeText(text, x, y);
  g.fillStyle = fill;
  g.fillText(text, x, y);
}

/** Letrero de neón: texto con halo (transparente, para mezcla aditiva). */
export function neonTexture(lines: string[], color: string, w = 1024, h = 256, font = '900 110px system-ui, sans-serif'): THREE.CanvasTexture {
  return canvasTexture(w, h, (g) => {
    g.clearRect(0, 0, w, h);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = font;
    const n = lines.length;
    const lh = h / (n + 0.4);
    for (let pass = 0; pass < 3; pass++) {
      g.shadowColor = color;
      g.shadowBlur = [38, 18, 4][pass];
      g.fillStyle = pass === 2 ? '#ffffff' : color;
      g.globalAlpha = [0.9, 1, 1][pass];
      lines.forEach((l, i) => g.fillText(l, w / 2, h / 2 + (i - (n - 1) / 2) * lh));
    }
    g.globalAlpha = 1;
  });
}

/** Material aditivo para neones y halos (brilla sobre lo que tenga detrás). */
export function glowMaterial(tex: THREE.Texture | null, color = '#ffffff', opacity = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map: tex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
}

/** Halo redondo difuminado (para lámparas, focos, bombillas). */
let haloTex: THREE.CanvasTexture | null = null;
export function haloTexture(): THREE.CanvasTexture {
  if (!haloTex) {
    haloTex = canvasTexture(128, 128, (g) => {
      const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      r.addColorStop(0, 'rgba(255,255,255,1)');
      r.addColorStop(0.25, 'rgba(255,255,255,0.55)');
      r.addColorStop(0.6, 'rgba(255,255,255,0.12)');
      r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, 128, 128);
    });
  }
  return haloTex;
}

/** Haz de luz falso (cono aditivo) para los focos del garaje y el escaparate. */
let beamTex: THREE.CanvasTexture | null = null;
export function beamMaterial(color: string, opacity = 0.35): THREE.MeshBasicMaterial {
  if (!beamTex) {
    beamTex = canvasTexture(4, 128, (g) => {
      const l = g.createLinearGradient(0, 0, 0, 128);
      l.addColorStop(0, 'rgba(255,255,255,0.9)');
      l.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = l;
      g.fillRect(0, 0, 4, 128);
    });
  }
  const m = glowMaterial(beamTex, color, opacity);
  m.side = THREE.DoubleSide;
  return m;
}

/** Mármol blanco con vetas, juntas doradas y rombos negros (2 × 2 losas por repetición). */
export function marbleTexture(): THREE.CanvasTexture {
  const t = canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#f6f1ea';
    g.fillRect(0, 0, w, h);
    // manchas suaves
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(${200 + (i % 3) * 10},${190 + (i % 5) * 6},${180 + (i % 4) * 8},0.12)`;
      g.beginPath();
      g.ellipse(Math.random() * w, Math.random() * h, 40 + Math.random() * 80, 20 + Math.random() * 40, Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
    // vetas
    for (let i = 0; i < 14; i++) {
      g.strokeStyle = i % 4 === 0 ? 'rgba(180,140,60,0.45)' : 'rgba(120,112,108,0.32)';
      g.lineWidth = 1 + Math.random() * 2.5;
      g.beginPath();
      let x = Math.random() * w, y = Math.random() * h;
      g.moveTo(x, y);
      for (let k = 0; k < 8; k++) {
        const nx = x + (Math.random() - 0.3) * 120, ny = y + (Math.random() - 0.5) * 120;
        g.quadraticCurveTo(x + (Math.random() - 0.5) * 80, y + (Math.random() - 0.5) * 80, nx, ny);
        x = nx;
        y = ny;
      }
      g.stroke();
    }
    // juntas doradas y rombos negros en las esquinas (2 × 2 losas por textura)
    g.fillStyle = '#d4af37';
    g.fillRect(0, 0, w, 4);
    g.fillRect(0, h / 2 - 2, w, 4);
    g.fillRect(0, 0, 4, h);
    g.fillRect(w / 2 - 2, 0, 4, h);
    g.fillStyle = '#1b1030';
    for (const x of [0, w / 2, w]) for (const y of [0, h / 2, h]) {
      g.beginPath();
      g.moveTo(x, y - 22);
      g.lineTo(x + 22, y);
      g.lineTo(x, y + 22);
      g.lineTo(x - 22, y);
      g.fill();
    }
    g.fillStyle = '#d4af37';
    for (const x of [0, w / 2, w]) for (const y of [0, h / 2, h]) {
      g.beginPath();
      g.moveTo(x, y - 9);
      g.lineTo(x + 9, y);
      g.lineTo(x, y + 9);
      g.lineTo(x - 9, y);
      g.fill();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ─────────────────────────────── mallas ───────────────────────────────

/**
 * Fusiona todas las mallas con colores por vértice de un objeto (coches, muñecos...) en UNA geometría
 * (posición, normal y color), en las coordenadas del propio objeto. Lo que lleva textura se descarta.
 */
export function bakeObject(obj: THREE.Object3D): THREE.BufferGeometry | null {
  obj.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
  const parts: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const mat = mesh.material as THREE.Material & { map?: THREE.Texture | null; color?: THREE.Color };
    if (Array.isArray(mesh.material) || mat.map) return;
    let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
    const n = g.getAttribute('position').count;
    if (!g.getAttribute('color')) {
      // sin colores por vértice: el color del material
      const c = mat.color ?? new THREE.Color('#888888');
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    } else if ((g.getAttribute('color') as THREE.BufferAttribute).itemSize !== 3) return;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    m.multiplyMatrices(inv, mesh.matrixWorld);
    g.applyMatrix4(m);
    parts.push(g);
  });
  if (!parts.length) return null;
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) return null;
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

/** Malla fusionada lista para poner, con sombras. */
export function meshOf(b: GeoBuilder, mat: THREE.Material, cast = true, receive = true): THREE.Mesh {
  const m = new THREE.Mesh(b.build(), mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

// ─────────────────────────────── utilidades de juego ───────────────────────────────

export function toast(game: Game, text: string, color = '#ffd23f', time = 2.6) {
  game.events.emit('toast', { text, color, time });
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rnd.next() * arr.length)];
}

/** Bocadillo sobre alguien (o un toast si no hay bocadillos). */
export function say(game: Game, target: { position: THREE.Vector3 } | THREE.Vector3, text: string, seconds = 3.2) {
  const b = game.mod.bubbles;
  if (b?.say) b.say(target, text, seconds);
  else toast(game, text, '#ffffff', seconds);
}

/** El aspecto actual del jugador (para cuadros y estatuas). */
export function playerLook(game: Game): CharacterLook {
  const l = game.mod.player?.rig?.look as CharacterLook | undefined;
  return l ?? {
    skin: '#e8ba9a', hair: 'corto', hairColor: '#4d3120', shirt: '#ffc53d', pants: '#3d3d45', shoes: '#1c1c1c', cap: true, capColor: '#ff8a1f',
  };
}

export function lookKey(l: CharacterLook): string {
  const x = l as CharacterLookExtra;
  return [
    l.skin, l.hair, l.hairColor, l.shirt, l.pants, l.cap, l.capColor, l.glasses, l.chain, l.jacket,
    x.jacketStyle, x.hat, x.glassesStyle, x.fake, x.bumBag, x.cape, x.shoesStyle, x.costume,
  ].join('|');
}

/** Texto de aviso en pantalla completa (fundido a negro con mensaje). */
export class Fader {
  private el: HTMLDivElement;
  private txt: HTMLDivElement;
  constructor(game: Game) {
    this.el = document.createElement('div');
    this.el.style.cssText =
      'position:fixed;inset:0;background:#0d0820;opacity:0;pointer-events:none;transition:opacity .6s;z-index:46;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px';
    this.txt = document.createElement('div');
    this.txt.style.cssText = "color:#ffd23f;font:900 44px system-ui,-apple-system,'Segoe UI',sans-serif;text-align:center;text-shadow:4px 4px 0 #6c3bd1;max-width:80vw;white-space:pre-line";
    this.el.appendChild(this.txt);
    game.ui.appendChild(this.el);
  }
  show(text: string, sub = '') {
    this.txt.innerHTML = '';
    const a = document.createElement('div');
    a.textContent = text;
    this.txt.appendChild(a);
    if (sub) {
      const b = document.createElement('div');
      b.textContent = sub;
      b.style.cssText = 'font:700 20px system-ui;color:#fff;text-shadow:none;opacity:.85;margin-top:12px';
      this.txt.appendChild(b);
    }
    this.el.style.opacity = '1';
  }
  hide() {
    this.el.style.opacity = '0';
  }
}

// ─────────────────────────────── asientos ───────────────────────────────

/**
 * Sentarse (sillones, sofás, jacuzzi): el jugador queda quieto en pose 'sit' (estado 'busy') hasta
 * que se mueve o pulsa E. Mientras, la pista de interacción la pone esta clase.
 */
export class Seats {
  private seated: { stand: THREE.Vector3; standHeading: number; t: number; onStand?: () => void } | null = null;
  constructor(private game: Game) {}

  get busy() {
    return !!this.seated;
  }

  sit(seat: THREE.Vector3, heading: number, stand: THREE.Vector3, opts: { pose?: CharacterPose; hint?: string; onStand?: () => void } = {}) {
    const g = this.game;
    const p = g.mod.player;
    if (!p || p.state !== 'foot') return;
    p.teleport(seat);
    p.heading = heading;
    p.velocity.set(0, 0, 0);
    p.state = 'busy';
    p.pose = opts.pose ?? 'sit';
    p.poseTimer = 0;
    p.aiming = false;
    this.seated = { stand: stand.clone(), standHeading: heading, t: 0, onStand: opts.onStand };
    if (g.mod.interaction) g.mod.interaction.override = opts.hint ?? 'E o WASD — Levantarse';
  }

  stand() {
    const s = this.seated;
    if (!s) return;
    this.seated = null;
    const g = this.game;
    const p = g.mod.player;
    if (g.mod.interaction) g.mod.interaction.override = null;
    if (!p) return;
    if (p.state === 'busy') p.state = 'foot';
    p.pose = 'normal';
    p.poseTimer = 0;
    p.teleport(s.stand);
    p.heading = s.standHeading;
    s.onStand?.();
  }

  update(dt: number) {
    const s = this.seated;
    if (!s) return;
    const g = this.game;
    const p = g.mod.player;
    if (!p || p.state !== 'busy') {
      // otro sistema se ha hecho cargo del jugador
      this.seated = null;
      if (g.mod.interaction) g.mod.interaction.override = null;
      return;
    }
    s.t += dt;
    g.mod.cameraRig?.target.copy(p.position);
    const inp = g.input;
    if (!inp.enabled || s.t < 0.4) return;
    const ax = inp.moveAxis();
    if (Math.hypot(ax.x, ax.y) > 0.3 || inp.pressed('interact') || inp.pressed('jump')) this.stand();
  }
}

// ─────────────────────────────── puntos de interacción ───────────────────────────────

export interface Spot {
  /** Posición local (dentro del interior). */
  pos: THREE.Vector3;
  r: number;
  text: string | (() => string);
  run: () => void;
  on?: () => boolean;
}

/** El punto activo más cercano al jugador (en coordenadas locales). */
export function nearestSpot(spots: Spot[], local: THREE.Vector3): { text: string; run: () => void } | null {
  let best: Spot | null = null;
  let bd = Infinity;
  for (const s of spots) {
    if (s.on && !s.on()) continue;
    const dx = s.pos.x - local.x, dz = s.pos.z - local.z;
    const d = Math.hypot(dx, dz);
    if (d < s.r && d < bd && Math.abs(local.y - s.pos.y) < 2.5) {
      bd = d;
      best = s;
    }
  }
  if (!best) return null;
  const b = best;
  return { text: typeof b.text === 'function' ? b.text() : b.text, run: b.run };
}

// ─────────────────────────────── aparecer con rebote ───────────────────────────────

/** Animación de "¡tachán!": el objeto crece con rebote y suelta confeti. */
export class Popper {
  private list: { obj: THREE.Object3D; t: number; base: THREE.Vector3; at: THREE.Vector3 | null; scale: boolean }[] = [];
  constructor(private game: Game) {}

  /** scale = false: sin crecer (grupos repartidos por la sala, como los neones). */
  pop(obj: THREE.Object3D, confettiAt: THREE.Vector3 | null = null, scale = true) {
    const base = (obj.userData.baseScale as THREE.Vector3 | undefined) ?? obj.scale.clone();
    obj.userData.baseScale = base;
    obj.visible = !scale;
    obj.scale.copy(base).multiplyScalar(scale ? 0.001 : 1);
    this.list = this.list.filter((x) => x.obj !== obj);
    this.list.push({ obj, t: -0.15 - this.list.length * 0.12, base, at: confettiAt, scale });
  }

  update(dt: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const it = this.list[i];
      const before = it.t;
      it.t += dt;
      if (before < 0 && it.t >= 0) {
        this.game.mod.audio?.play('pop', { volume: 0.7 });
        if (it.at) {
          this.game.mod.particles?.emit('confetti', it.at, { count: 26, speed: 1.1 });
          this.game.mod.particles?.emit('stars', it.at, { count: 8 });
        }
      }
      const k = Math.max(0, it.t) / 0.55;
      if (!it.scale) {
        if (it.t >= 0) {
          it.obj.visible = true;
          this.list.splice(i, 1);
        }
        continue;
      }
      if (it.t >= 0) it.obj.visible = true;
      if (k >= 1) {
        it.obj.scale.copy(it.base);
        this.list.splice(i, 1);
        continue;
      }
      // easeOutBack: crece, se pasa un poco y vuelve
      const c1 = 2.2, c3 = c1 + 1, q = k - 1;
      const s = k <= 0 ? 0.001 : 1 + c3 * q * q * q + c1 * q * q;
      it.obj.scale.copy(it.base).multiplyScalar(Math.max(0.001, s));
    }
  }
}

// ─────────────────────────────── acuario ───────────────────────────────

const FISH_COLORS = ['#ff7b1a', '#ffd23f', '#2ec4ff', '#ff4f81', '#7cff4f', '#b14dff', '#ffffff', '#ff3b3b', '#35d0ff', '#ffe14d'];

let fishGeo: THREE.BufferGeometry | null = null;
function fishGeometry(): THREE.BufferGeometry {
  if (!fishGeo) {
    const b = new GeoBuilder();
    // cuerpo (blanco: el color lo pone cada instancia), cola y aleta
    b.sphere(0.5, '#ffffff', 0, 0, 0, 1, 0.42, 0.62, 1);
    b.add(new THREE.ConeGeometry(0.34, 0.45, 4), '#dddddd', 0, 0, -0.62, -Math.PI / 2, 0, 0, 0.35, 1, 1.25);
    b.add(new THREE.ConeGeometry(0.18, 0.3, 3), '#dddddd', 0, 0.36, -0.05, 0, 0, 0, 0.3, 1, 1.4);
    b.sphere(0.07, '#111111', 0.18, 0.08, 0.3, 0);
    b.sphere(0.07, '#111111', -0.18, 0.08, 0.3, 0);
    // raya
    b.box(0.43, 0.5, 0.08, '#f2f2f2', 0, 0, 0.12);
    fishGeo = b.build();
  }
  return fishGeo;
}

let boxFishGeo: THREE.BufferGeometry | null = null;
/** El pez paquete: una caja de cartón con cola. Sí, existe. */
function boxFishGeometry(): THREE.BufferGeometry {
  if (!boxFishGeo) {
    const b = new GeoBuilder();
    b.box(0.5, 0.42, 0.62, '#c8915a', 0, 0, 0);
    b.box(0.52, 0.08, 0.64, '#e3d3a8', 0, 0.02, 0); // cinta
    b.add(new THREE.ConeGeometry(0.3, 0.4, 4), '#b07b48', 0, 0, -0.5, -Math.PI / 2, 0, 0, 0.35, 1, 1.2);
    b.sphere(0.08, '#ffffff', 0.2, 0.08, 0.3, 0);
    b.sphere(0.08, '#ffffff', -0.2, 0.08, 0.3, 0);
    b.sphere(0.045, '#111111', 0.23, 0.08, 0.34, 0);
    b.sphere(0.045, '#111111', -0.23, 0.08, 0.34, 0);
    boxFishGeo = b.build();
  }
  return boxFishGeo;
}

const waterBackVS = /* glsl */ `
uniform vec3 uSize;
varying vec3 vP;
void main(){ vP = position / uSize + 0.5; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const waterBackFS = /* glsl */ `
uniform float uTime; uniform vec3 uTop; uniform vec3 uBottom;
varying vec3 vP;
void main(){
  vec2 p = vec2(vP.x * 6.0 + vP.z * 3.0, vP.y * 3.0);
  float c = sin(p.x*2.1 + uTime*1.3 + sin(p.y*3.0+uTime)) * sin(p.y*2.7 - uTime*1.1 + sin(p.x*1.7));
  c = smoothstep(0.55, 1.0, c);
  vec3 col = mix(uBottom, uTop, smoothstep(0.0, 1.0, vP.y));
  col += vec3(0.35, 0.6, 0.65) * c * (0.4 + 0.6*vP.y);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Agua animada vista por dentro (caja con las caras de atrás): degradado con cáusticas que se mueven. */
export function waterBoxMaterial(w: number, h: number, d: number, top = '#58e0ff', bottom = '#0a4c8c'): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uTop: { value: new THREE.Color(top) }, uBottom: { value: new THREE.Color(bottom) },
      uSize: { value: new THREE.Vector3(w, h, d) },
    },
    vertexShader: waterBackVS,
    fragmentShader: waterBackFS,
    side: THREE.BackSide,
  });
}

export interface FishTankOpts {
  w: number; // largo (x local)
  h: number; // alto del agua
  d: number; // fondo (z local)
  fish: number;
  /** Añade el pez paquete. */
  boxFish?: boolean;
  /** Adorno del fondo: furgoneta hundida o cofre. */
  ornament?: 'van' | 'chest';
}

/**
 * Acuario con peces que nadan (InstancedMesh: 1 draw call), fondo de agua animado, grava, algas,
 * burbujas y un adorno. Origen = centro de la base del agua; el cristal va de -w/2..w/2 × 0..h × -d/2..d/2.
 */
export class FishTank {
  readonly group = new THREE.Group();
  private fish: THREE.InstancedMesh;
  private boxFish: THREE.Mesh | null = null;
  private params: { sp: number; ph: number; ph2: number; ph3: number; y0: number; z0: number; ay: number; s: number }[] = [];
  private bubbles: THREE.InstancedMesh;
  private bub: { x: number; z: number; y: number; v: number }[] = [];
  private back: THREE.ShaderMaterial;
  private feedT = 0;
  private dummy = new THREE.Object3D();
  private t = 0;

  constructor(private o: FishTankOpts) {
    const { w, h, d } = o;
    // grava, algas, rocas y adorno (fusionado)
    const b = new GeoBuilder();
    const gravel = ['#e9d8a6', '#d4b483', '#f2e2ba', '#c9a66b'];
    b.box(w - 0.02, 0.12, d - 0.02, '#d9c08c', 0, 0.06, 0);
    for (let i = 0; i < Math.round(w * 9); i++) {
      b.sphere(0.05 + rnd.next() * 0.05, gravel[i % 4], (rnd.next() - 0.5) * (w - 0.1), 0.12, (rnd.next() - 0.5) * (d - 0.1), 0, 1, 0.5, 1);
    }
    for (let i = 0; i < Math.round(w * 2.2); i++) {
      const x = (rnd.next() - 0.5) * (w - 0.3);
      const z = (rnd.next() - 0.3) * (d * 0.5);
      const hh = 0.4 + rnd.next() * h * 0.6;
      const col = pick(['#2fbf71', '#1f9e5a', '#66d17a', '#138a4b']);
      for (let k = 0; k < 3; k++) b.box(0.06, hh * (1 - k * 0.2), 0.03, col, x + (k - 1) * 0.06, 0.1 + hh * (1 - k * 0.2) / 2, z, 0, k * 0.8, (k - 1) * 0.15);
    }
    for (let i = 0; i < 3; i++) b.sphere(0.12 + rnd.next() * 0.12, pick(['#8d8d99', '#a18a7a', '#6f6f7c']), (rnd.next() - 0.5) * (w - 0.4), 0.16, (rnd.next() - 0.5) * (d - 0.3), 0, 1.3, 0.8, 1);
    if (o.ornament === 'van') {
      // furgoneta de reparto hundida (mini)
      const x = w * 0.28;
      b.box(0.5, 0.26, 0.24, '#ffd23f', x, 0.25, -d * 0.15, 0, 0.3, 0.25);
      b.box(0.14, 0.12, 0.25, '#223a5e', x + 0.2, 0.33, -d * 0.15 + 0.06, 0, 0.3, 0.25);
      b.cyl(0.06, 0.06, 0.26, 8, '#1e1e24', x - 0.15, 0.13, -d * 0.15, Math.PI / 2, 0.3, 0);
      b.cyl(0.06, 0.06, 0.26, 8, '#1e1e24', x + 0.15, 0.2, -d * 0.15 + 0.05, Math.PI / 2, 0.3, 0);
    } else {
      // cofre del tesoro con monedas
      const x = -w * 0.3;
      b.box(0.36, 0.2, 0.24, '#8a5a33', x, 0.22, 0);
      b.box(0.37, 0.1, 0.25, '#6b4226', x, 0.36, -0.05, -0.5, 0, 0);
      b.box(0.3, 0.04, 0.18, '#ffd23f', x, 0.33, 0.02);
    }
    const deco = meshOf(b, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), false, true);
    this.group.add(deco);

    // agua: caja vista por dentro (se ve el fondo desde cualquier lado)
    this.back = waterBoxMaterial(w, h, d);
    const water = new THREE.Mesh(new THREE.BoxGeometry(w - 0.01, h - 0.01, d - 0.01), this.back);
    water.position.y = h / 2;
    this.group.add(water);

    // peces
    this.fish = new THREE.InstancedMesh(fishGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), o.fish);
    this.fish.frustumCulled = false;
    const c = new THREE.Color();
    for (let i = 0; i < o.fish; i++) {
      this.params.push({
        sp: 0.25 + rnd.next() * 0.35, ph: rnd.next() * 6.3, ph2: rnd.next() * 6.3, ph3: rnd.next() * 6.3,
        y0: 0.35 + rnd.next() * (h - 0.7), z0: (rnd.next() - 0.5) * (d - 0.35) * 0.6, ay: 0.1 + rnd.next() * 0.2,
        s: 0.17 + rnd.next() * 0.12,
      });
      c.set(FISH_COLORS[i % FISH_COLORS.length]);
      this.fish.setColorAt(i, c);
    }
    this.group.add(this.fish);
    if (o.boxFish) {
      this.boxFish = new THREE.Mesh(boxFishGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
      this.boxFish.scale.setScalar(0.42);
      this.group.add(this.boxFish);
    }

    // burbujas (esferitas que suben)
    const nb = Math.round(w * 6);
    this.bubbles = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#e8fbff', transparent: true, opacity: 0.75 }), nb);
    this.bubbles.frustumCulled = false;
    for (let i = 0; i < nb; i++) {
      const col = i % 3;
      this.bub.push({ x: -w / 2 + 0.25 + (col === 0 ? 0.05 : col === 1 ? w * 0.55 : w - 0.6), z: 0, y: rnd.next() * h, v: 0.35 + rnd.next() * 0.4 });
    }
    this.group.add(this.bubbles);

    // cristal (caja transparente) con un poco de brillo en los bordes
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.04, h + 0.04, d + 0.04),
      new THREE.MeshBasicMaterial({ color: '#9eeaff', transparent: true, opacity: 0.16, depthWrite: false }),
    );
    glass.position.y = h / 2;
    glass.renderOrder = 2;
    this.group.add(glass);
    // superficie del agua
    const surf = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: '#bff6ff', transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
    surf.rotation.x = -Math.PI / 2;
    surf.position.y = h - 0.06;
    this.group.add(surf);
    this.update(0);
  }

  /** Echar de comer: los peces suben a la superficie un rato. */
  feed() {
    this.feedT = 6;
  }

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    this.back.uniforms.uTime.value = t;
    const { w, h, d } = this.o;
    const hx = w / 2 - 0.3;
    this.feedT = Math.max(0, this.feedT - dt);
    const feedK = Math.min(1, this.feedT / 1.5);
    const dm = this.dummy;
    for (let i = 0; i < this.params.length; i++) {
      const p = this.params[i];
      const a = t * p.sp + p.ph;
      const x = Math.sin(a) * hx;
      const vx = Math.cos(a) * hx * p.sp;
      let y = p.y0 + Math.sin(t * 0.6 + p.ph2) * p.ay;
      y += (h - 0.35 - y) * feedK;
      const z = p.z0 + Math.sin(t * 0.37 + p.ph3) * (d * 0.18);
      const vz = Math.cos(t * 0.37 + p.ph3) * d * 0.18 * 0.37;
      dm.position.set(x, y, z);
      dm.rotation.set(0, Math.atan2(vx, vz) + Math.sin(t * 9 + p.ph) * 0.18, 0);
      dm.scale.setScalar(p.s);
      dm.updateMatrix();
      this.fish.setMatrixAt(i, dm.matrix);
    }
    this.fish.instanceMatrix.needsUpdate = true;
    if (this.boxFish) {
      const a = t * 0.22 + 1;
      const x = Math.sin(a) * (hx - 0.2);
      this.boxFish.position.set(x, h * 0.45 + Math.sin(t * 0.8) * 0.15 + (h - 0.4 - h * 0.45) * feedK, Math.sin(t * 0.3) * d * 0.1);
      this.boxFish.rotation.set(Math.sin(t * 2) * 0.08, Math.atan2(Math.cos(a), 0.15) + Math.sin(t * 7) * 0.12, 0);
    }
    for (let i = 0; i < this.bub.length; i++) {
      const bb = this.bub[i];
      bb.y += bb.v * dt;
      if (bb.y > h - 0.08) bb.y = 0.15;
      dm.position.set(bb.x + Math.sin(t * 3 + i) * 0.03, bb.y, -d * 0.3 + (i % 2) * 0.1);
      dm.rotation.set(0, 0, 0);
      dm.scale.setScalar(0.025 + (i % 3) * 0.012);
      dm.updateMatrix();
      this.bubbles.setMatrixAt(i, dm.matrix);
    }
    this.bubbles.instanceMatrix.needsUpdate = true;
  }
}

// ─────────────────────────────── cuadros ───────────────────────────────

/** Pinta un retrato del jugador (para el cuadro gigante de la oficina y el del ático). */
export function paintPortrait(g: CanvasRenderingContext2D, w: number, h: number, look: CharacterLook, title = 'EL JEFE') {
  // fondo con rayos de gloria
  const cx = w / 2, cy = h * 0.42;
  g.fillStyle = '#6c3bd1';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 24; i++) {
    g.fillStyle = i % 2 ? '#ffd23f' : '#ff7b54';
    g.beginPath();
    g.moveTo(cx, cy);
    const a0 = (i / 24) * Math.PI * 2, a1 = ((i + 1) / 24) * Math.PI * 2;
    g.lineTo(cx + Math.cos(a0) * w * 2, cy + Math.sin(a0) * w * 2);
    g.lineTo(cx + Math.cos(a1) * w * 2, cy + Math.sin(a1) * w * 2);
    g.closePath();
    g.fill();
  }
  const u = w / 256;
  const lx = look as CharacterLookExtra;
  const costume = lx.costume ?? null;
  const hat = costume === 'pollo' ? 'pollo' : costume ? null : (lx.hat ?? null);
  // capa de superhéroe por detrás de los hombros
  if (lx.cape && !costume) {
    g.fillStyle = lx.cape;
    g.beginPath();
    g.moveTo(cx - 70 * u, h * 0.78);
    g.lineTo(cx + 70 * u, h * 0.78);
    g.lineTo(cx + 128 * u, h);
    g.lineTo(cx - 128 * u, h);
    g.fill();
  }
  // hombros (uniforme, chaqueta o disfraz)
  g.fillStyle = costume === 'pollo' ? '#ffd93b' : costume === 'paquete' ? '#c8915a' : (look.jacket ?? look.shirt);
  if (costume === 'paquete') {
    g.fillRect(cx - 104 * u, h * 0.8, 208 * u, h * 0.2);
    g.fillStyle = '#e3d3a8';
    g.fillRect(cx - 14 * u, h * 0.8, 28 * u, h * 0.2);
    g.fillStyle = '#b07b48';
    g.fillRect(cx - 104 * u, h * 0.8, 208 * u, 8 * u);
  } else {
    g.beginPath();
    g.ellipse(cx, h * 0.92, 108 * u, 70 * u, 0, Math.PI, 0);
    g.fill();
    g.fillRect(cx - 108 * u, h * 0.92, 216 * u, h * 0.1);
  }
  if (costume === 'pollo') {
    g.fillStyle = '#fff8e7';
    g.beginPath();
    g.ellipse(cx, h * 0.97, 46 * u, 40 * u, 0, Math.PI, 0);
    g.fill();
  }
  if (look.jacket && !costume) {
    g.fillStyle = look.shirt;
    g.beginPath();
    g.moveTo(cx - 26 * u, h * 0.8);
    g.lineTo(cx + 26 * u, h * 0.8);
    g.lineTo(cx, h * 0.97);
    g.fill();
  }
  // cuello
  g.fillStyle = look.skin;
  g.fillRect(cx - 22 * u, h * 0.62, 44 * u, 44 * u);
  // cadena
  if (look.chain && !costume) {
    g.strokeStyle = '#ffd700';
    g.lineWidth = 7 * u;
    g.beginPath();
    g.arc(cx, h * 0.74, 34 * u, 0.2, Math.PI - 0.2);
    g.stroke();
  }
  // pajarita del traje de gala
  if (lx.jacketStyle === 'gala' && look.jacket && !costume) {
    g.fillStyle = '#111111';
    g.beginPath();
    g.moveTo(cx, h * 0.83);
    g.lineTo(cx - 24 * u, h * 0.81);
    g.lineTo(cx - 24 * u, h * 0.86);
    g.closePath();
    g.moveTo(cx, h * 0.83);
    g.lineTo(cx + 24 * u, h * 0.81);
    g.lineTo(cx + 24 * u, h * 0.86);
    g.closePath();
    g.fill();
  }
  // riñonera cruzada
  if (lx.bumBag && !costume) {
    g.strokeStyle = '#1b1030';
    g.lineWidth = 9 * u;
    g.beginPath();
    g.moveTo(cx + 70 * u, h * 0.8);
    g.lineTo(cx - 40 * u, h * 1.0);
    g.stroke();
    g.fillStyle = lx.bumBag;
    g.fillRect(cx - 80 * u, h * 0.92, 60 * u, 30 * u);
    g.fillStyle = '#ffd23f';
    g.fillRect(cx - 58 * u, h * 0.95, 16 * u, 10 * u);
  }
  // peluca y capucha de pollo: por detrás de la cabeza
  if (hat === 'peluca') {
    const cols = ['#3a86ff', '#06d6a0', '#ffd23f', '#ff7b1a', '#e63946'];
    cols.forEach((c, i) => {
      g.fillStyle = c;
      g.beginPath();
      g.arc(cx, h * 0.4 - i * 6 * u, (100 - i * 16) * u, 0, Math.PI * 2);
      g.fill();
    });
  } else if (hat === 'pollo') {
    g.fillStyle = '#ffd93b';
    g.beginPath();
    g.ellipse(cx, h * 0.43, 82 * u, 96 * u, 0, 0, Math.PI * 2);
    g.fill();
  }
  // cabeza
  const hy = h * 0.46;
  g.fillStyle = look.skin;
  g.beginPath();
  g.ellipse(cx, hy, 58 * u, 70 * u, 0, 0, Math.PI * 2);
  g.fill();
  // orejas
  g.beginPath();
  g.ellipse(cx - 58 * u, hy + 6 * u, 11 * u, 16 * u, 0, 0, Math.PI * 2);
  g.ellipse(cx + 58 * u, hy + 6 * u, 11 * u, 16 * u, 0, 0, Math.PI * 2);
  g.fill();
  // pelo (el casco, la peluca y la capucha de pollo lo tapan entero)
  g.fillStyle = look.hairColor;
  const hair = hat === 'casco' || hat === 'peluca' || hat === 'pollo' ? 'calvo' : look.hair;
  if (hair === 'afro') {
    g.beginPath();
    g.arc(cx, hy - 40 * u, 78 * u, 0, Math.PI * 2);
    g.fill();
  } else if (hair === 'largo' || hair === 'coleta' || hair === 'moño') {
    g.beginPath();
    g.ellipse(cx, hy - 30 * u, 66 * u, 50 * u, 0, Math.PI, 0);
    g.fill();
    if (hair === 'largo') g.fillRect(cx - 66 * u, hy - 30 * u, 22 * u, 110 * u), g.fillRect(cx + 44 * u, hy - 30 * u, 22 * u, 110 * u);
    if (hair === 'moño') {
      g.beginPath();
      g.arc(cx, hy - 86 * u, 26 * u, 0, Math.PI * 2);
      g.fill();
    }
  } else if (hair === 'cresta') {
    g.fillRect(cx - 12 * u, hy - 110 * u, 24 * u, 60 * u);
  } else if (hair !== 'calvo') {
    g.beginPath();
    g.ellipse(cx, hy - 34 * u, 60 * u, hair === 'rapado' ? 38 * u : 44 * u, 0, Math.PI, 0);
    g.fill();
  }
  // gorra (o lo que se lleve en la cabeza)
  if (look.cap && !hat && !costume) {
    g.fillStyle = look.capColor;
    g.beginPath();
    g.ellipse(cx, hy - 40 * u, 62 * u, 44 * u, 0, Math.PI, 0);
    g.fill();
    g.fillRect(cx - 10 * u, hy - 46 * u, 96 * u, 14 * u);
  }
  if (hat === 'casco' || hat === 'pollo') {
    g.fillStyle = hat === 'casco' ? '#e63946' : '#ffd93b';
    g.beginPath();
    g.ellipse(cx, hy - 30 * u, 72 * u, 62 * u, 0, Math.PI, 0);
    g.fill();
    g.fillRect(cx - 72 * u, hy - 32 * u, 16 * u, 70 * u);
    g.fillRect(cx + 56 * u, hy - 32 * u, 16 * u, 70 * u);
    if (hat === 'casco') {
      g.fillStyle = '#223a70';
      g.fillRect(cx - 52 * u, hy - 44 * u, 104 * u, 16 * u);
      g.fillStyle = '#ffd23f';
      g.beginPath();
      g.moveTo(cx - 62 * u, hy - 24 * u);
      g.lineTo(cx - 70 * u, hy + 4 * u);
      g.lineTo(cx - 62 * u, hy + 2 * u);
      g.lineTo(cx - 68 * u, hy + 26 * u);
      g.lineTo(cx - 58 * u, hy - 4 * u);
      g.lineTo(cx - 64 * u, hy - 2 * u);
      g.fill();
    } else {
      g.fillStyle = '#ff3b3b';
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        g.arc(cx - 18 * u + k * 18 * u, hy - 96 * u + (k === 1 ? -8 : 0) * u, 13 * u, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#ff9f1c';
      g.beginPath();
      g.moveTo(cx - 16 * u, hy - 40 * u);
      g.lineTo(cx + 16 * u, hy - 40 * u);
      g.lineTo(cx, hy - 20 * u);
      g.fill();
      g.fillStyle = '#1b1030';
      g.fillRect(cx - 34 * u, hy - 66 * u, 12 * u, 12 * u);
      g.fillRect(cx + 22 * u, hy - 66 * u, 12 * u, 12 * u);
    }
  } else if (hat === 'paja') {
    g.fillStyle = '#d9b04f';
    g.beginPath();
    g.ellipse(cx, hy - 40 * u, 118 * u, 24 * u, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f1cf6e';
    g.beginPath();
    g.ellipse(cx, hy - 52 * u, 60 * u, 50 * u, 0, Math.PI, 0);
    g.fill();
    g.fillStyle = '#e63946';
    g.fillRect(cx - 60 * u, hy - 62 * u, 120 * u, 12 * u);
  } else if (hat === 'peluca') {
    // flequillo arcoíris por encima de la frente
    g.fillStyle = '#3a86ff';
    g.beginPath();
    g.ellipse(cx, hy - 52 * u, 62 * u, 26 * u, 0, Math.PI, 0);
    g.fill();
  }
  // cara: ojos, cejas y sonrisa de ganador
  if (look.glasses && lx.glassesStyle === 'corazon') {
    g.fillStyle = '#ff4f81';
    for (const s of [-1, 1]) {
      const x = cx + s * 27 * u, y = hy + 2 * u;
      g.beginPath();
      g.moveTo(x, y + 18 * u);
      g.bezierCurveTo(x - 30 * u, y - 2 * u, x - 16 * u, y - 22 * u, x, y - 8 * u);
      g.bezierCurveTo(x + 16 * u, y - 22 * u, x + 30 * u, y - 2 * u, x, y + 18 * u);
      g.fill();
    }
  } else if (look.glasses) {
    g.fillStyle = '#111';
    g.fillRect(cx - 50 * u, hy - 8 * u, 42 * u, 22 * u);
    g.fillRect(cx + 8 * u, hy - 8 * u, 42 * u, 22 * u);
    g.fillRect(cx - 10 * u, hy - 4 * u, 20 * u, 6 * u);
  } else {
    g.fillStyle = '#fff';
    g.beginPath();
    g.ellipse(cx - 24 * u, hy + 2 * u, 12 * u, 10 * u, 0, 0, Math.PI * 2);
    g.ellipse(cx + 24 * u, hy + 2 * u, 12 * u, 10 * u, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1b1030';
    g.beginPath();
    g.arc(cx - 22 * u, hy + 3 * u, 5 * u, 0, Math.PI * 2);
    g.arc(cx + 26 * u, hy + 3 * u, 5 * u, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = '#1b1030';
  g.lineWidth = 5 * u;
  g.beginPath();
  g.moveTo(cx - 38 * u, hy - 20 * u);
  g.lineTo(cx - 12 * u, hy - 16 * u);
  g.moveTo(cx + 12 * u, hy - 16 * u);
  g.lineTo(cx + 38 * u, hy - 22 * u);
  g.stroke();
  g.beginPath();
  g.arc(cx, hy + 26 * u, 22 * u, 0.15, Math.PI - 0.15);
  g.stroke();
  // guiño de brillo en un diente
  g.fillStyle = '#ffffff';
  g.fillRect(cx - 6 * u, hy + 42 * u, 8 * u, 6 * u);
  // bigotazo postizo
  if (lx.fake === 'bigotazo') {
    g.strokeStyle = '#2a1a12';
    g.lineCap = 'round';
    g.lineWidth = 11 * u;
    g.beginPath();
    g.moveTo(cx - 44 * u, hy + 6 * u);
    g.quadraticCurveTo(cx - 40 * u, hy + 30 * u, cx, hy + 22 * u);
    g.quadraticCurveTo(cx + 40 * u, hy + 30 * u, cx + 44 * u, hy + 6 * u);
    g.stroke();
    g.lineCap = 'butt';
  }
  // cartela
  g.fillStyle = '#1b1030';
  g.fillRect(w * 0.18, h * 0.88, w * 0.64, h * 0.09);
  g.fillStyle = '#ffd23f';
  g.font = `900 ${Math.round(24 * u)}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(title, cx, h * 0.925);
}

/** Marco dorado barroco (fusionado) alrededor de un cuadro de w × h centrado en (0, 0, 0). */
export function addGoldFrame(b: GeoBuilder, w: number, h: number, x = 0, y = 0, z = 0, ry = 0, t = 0.16, color = '#d4af37') {
  const c = Math.cos(ry), s = Math.sin(ry);
  const P = (lx: number, lz: number): [number, number] => [x + lx * c + lz * s, z - lx * s + lz * c];
  let [px, pz] = P(0, 0.02);
  b.box(w + t * 2, t, 0.1, color, px, y + h / 2 + t / 2, pz, 0, ry, 0);
  b.box(w + t * 2, t, 0.1, color, px, y - h / 2 - t / 2, pz, 0, ry, 0);
  [px, pz] = P(-w / 2 - t / 2, 0.02);
  b.box(t, h, 0.1, color, px, y, pz, 0, ry, 0);
  [px, pz] = P(w / 2 + t / 2, 0.02);
  b.box(t, h, 0.1, color, px, y, pz, 0, ry, 0);
  // adornos en las esquinas
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    [px, pz] = P(sx * (w / 2 + t / 2), 0.06);
    b.sphere(t * 0.75, '#ffe27a', px, y + sy * (h / 2 + t / 2), pz, 0);
  }
  // fondo
  [px, pz] = P(0, -0.03);
  b.box(w, h, 0.04, '#2b1b0f', px, y, pz, 0, ry, 0);
}
