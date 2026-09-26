// Luces y efectos del club: baldosas que laten, focos móviles con haces de luz, bola de espejos con
// sus puntitos, humo bajo, pantalla LED, confeti, bengalas, chorros de CO2 y las luces reales (3).
// Todo barato: instancias, mezcla aditiva y shaders cortos. Solo se actualiza mientras estás dentro.
import * as THREE from 'three';
import { ROOM, FLOOR, BALL, DJ, VIP, floorAt } from './layout';
import { BEAM_ORIGINS, BEAM_Y, type RoomParts } from './room';
import {
  dotTexture, spotTexture, tileTexture, noiseTexture, ledTextTexture, drawLedText, LED_CANVAS_W, LED_VISIBLE_PX,
} from './textures';

export interface FxState {
  /** Pulsos desde que empezó la música (con decimales). */
  beat: number;
  /** Golpe del bombo (1 justo al sonar, cae a 0). */
  kick: number;
  bar: number;
  /** Compás dentro del bloque de 32 (el parón va del 28 al 31). */
  section: number;
  breakdown: boolean;
  /** Nivel de fiesta 0..1 (sube al comprar). */
  party: number;
  time: number;
  /** Posición del jugador (local) para que las baldosas se enciendan al pisarlas. */
  player: THREE.Vector3 | null;
}

const PALETTE = ['#ff2e88', '#19e6d2', '#b44dff', '#ffd23f', '#3a86ff', '#7cff4f'].map((c) => new THREE.Color(c));
/**
 * Color de la paleta por índice, dando la vuelta en los dos sentidos: el contador de pulsos crece sin
 * parar y algunos patrones lo restan, así que el índice puede salir negativo (PALETTE[-3] no existe).
 */
function pal(k: number): THREE.Color {
  const n = PALETTE.length;
  if (!Number.isFinite(k)) return PALETTE[0];
  return PALETTE[((Math.floor(k) % n) + n) % n];
}
const WHITE = new THREE.Color('#ffffff');
const tmpC = new THREE.Color();
const tmpC2 = new THREE.Color();
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);

function hash(a: number, b: number, c: number): number {
  const s = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
  return s - Math.floor(s);
}
const frac = (x: number) => x - Math.floor(x);

// ───────── Haz de luz (cono aditivo con bordes suaves y polvo) ─────────
const BEAM_VERT = /* glsl */ `
varying float vAlong;
varying vec3 vN;
varying vec3 vV;
varying vec3 vL;
void main() {
  vAlong = -position.y;
  vL = (modelMatrix * vec4(position, 1.0)).xyz;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
uniform float uTime;
uniform sampler2D uNoise;
varying float vAlong;
varying vec3 vN;
varying vec3 vV;
varying vec3 vL;
void main() {
  float rim = abs(dot(normalize(vN), normalize(vV)));
  float edge = pow(rim, 1.6);
  float fade = (1.0 - vAlong * 0.7) * smoothstep(0.0, 0.06, vAlong);
  float dust = texture2D(uNoise, vL.xz * 0.11 + vec2(vL.y * 0.07 + uTime * 0.02, uTime * 0.013)).r;
  float a = uIntensity * edge * fade * (0.55 + dust * 0.9);
  gl_FragColor = vec4(linearToOutputTexel(vec4(uColor, 1.0)).rgb * a, 1.0);
}`;

// ───────── Humo bajo ─────────
const SMOKE_VERT = /* glsl */ `
varying vec2 vP;
void main() {
  vP = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SMOKE_FRAG = /* glsl */ `
uniform sampler2D uNoise;
uniform float uTime;
uniform float uLayer;
uniform float uOpacity;
uniform vec3 uColor;
varying vec2 vP;
void main() {
  vec2 p = vP * 0.075;
  float n1 = texture2D(uNoise, p + vec2(uTime * 0.011, uTime * 0.006) + uLayer * 0.37).r;
  float n2 = texture2D(uNoise, p * 1.9 - vec2(uTime * 0.017, -uTime * 0.011) + uLayer * 0.71).r;
  float d = smoothstep(0.38, 0.9, n1 * 0.7 + n2 * 0.45);
  // más humo sobre la pista, menos en los bordes de la sala
  vec2 c = (vP - vec2(0.0, 2.0)) / vec2(13.5, 10.0);
  float mask = 1.0 - smoothstep(0.45, 1.0, length(c));
  gl_FragColor = vec4(linearToOutputTexel(vec4(uColor, 1.0)).rgb, d * mask * uOpacity);
}`;

// ───────── Pantalla LED ─────────
const LED_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const LED_FRAG = /* glsl */ `
uniform float uTime;
uniform float uBeat;
uniform float uKick;
uniform float uParty;
uniform float uScroll;
uniform float uSpan;
uniform float uUsed;
uniform sampler2D uText;
uniform vec3 uColA;
uniform vec3 uColB;
varying vec2 vUv;
vec3 hsv(float h, float s, float v) {
  vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return v * mix(vec3(1.0), k, s);
}
void main() {
  vec2 grid = vec2(160.0, 60.0);
  vec2 gp = vUv * grid;
  vec2 cell = floor(gp);
  vec2 f = fract(gp) - 0.5;
  // puntitos del LED; de lejos se funden en una media para que no salga moiré
  vec2 fw = fwidth(gp);
  float blur = clamp(max(fw.x, fw.y) * 1.6 - 0.4, 0.0, 1.0);
  float led = mix(smoothstep(0.5, 0.3, length(f)), 0.62, blur);
  vec2 c = (cell + 0.5) / grid;
  float w = sin(c.x * 9.0 + uTime * 1.3) + sin(c.y * 7.0 - uTime * 0.9) + sin((c.x + c.y) * 6.0 + uBeat * 1.5708);
  vec3 col = mix(uColA, uColB, 0.5 + 0.22 * w) * (0.16 + 0.14 * uKick + 0.1 * uParty);
  // ecualizador
  float bi = floor(c.x * 32.0);
  float lvl = 0.2 + 0.55 * fract(sin(bi * 12.9898 + floor(uBeat * 2.0) * 78.233) * 43758.5453) * (0.45 + 0.55 * uKick);
  lvl *= 1.0 - smoothstep(0.35, 0.5, abs(c.x - 0.5)) * 0.4;
  if (c.y < lvl * 0.42) col = mix(col, hsv(0.92 - c.y * 1.4 + uParty * uTime * 0.2, 0.85, 1.0), 0.9);
  // texto que pasa (letra de tamaño fijo: se ven unas 13 letras de una vez)
  float band = step(0.47, c.y) * step(c.y, 0.95);
  vec2 tuv = vec2(mod(c.x * uSpan + uScroll, uUsed), (c.y - 0.47) / 0.48);
  float txt = texture2D(uText, tuv).r * band;
  vec3 tc = mix(vec3(1.0, 0.82, 0.2), hsv(fract(uTime * 0.3 + c.x), 0.7, 1.0), uParty);
  col = mix(col, tc, txt);
  gl_FragColor = linearToOutputTexel(vec4(col * led * 1.5, 1.0));
}`;

interface Beam {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  origin: THREE.Vector3;
  dir: THREE.Vector3;
  target: THREE.Vector3;
  color: THREE.Color;
}

interface Confetto {
  p: THREE.Vector3;
  v: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  life: number;
  ground: number; // tiempo que lleva en el suelo
  size: number;
  alive: boolean;
}

interface Spark {
  p: THREE.Vector3;
  v: THREE.Vector3;
  life: number;
  age: number;
}

export class ClubFx {
  readonly lights: THREE.PointLight[] = [];
  private root: THREE.Group;
  private room: RoomParts;
  private tiles: THREE.InstancedMesh;
  private tileCenters: { x: number; z: number; i: number; j: number }[] = [];
  private beams: Beam[] = [];
  private spots: THREE.InstancedMesh;
  private lens: THREE.Points;
  private ball: THREE.Mesh;
  private ballAngle = 0;
  private dots: THREE.Points;
  private dotDirs: Float32Array;
  private dotTw: Float32Array;
  private smoke: THREE.ShaderMaterial[] = [];
  private led: THREE.ShaderMaterial;
  private ledCanvas: HTMLCanvasElement;
  private ledTex: THREE.CanvasTexture;
  private ledScroll = 0;
  /** Fracción del lienzo del LED que ocupa el texto actual. */
  private ledUsed = 1;
  private confetti: Confetto[] = [];
  private confettiMesh: THREE.InstancedMesh;
  private rainTimer = 0;
  private sparks: Spark[] = [];
  private sparkGeo: THREE.BufferGeometry;
  private sparkPts: THREE.Points;
  private emitters: { p: THREE.Vector3; t: number }[] = [];
  private jets: { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; t: number }[] = [];
  private noise: THREE.Texture;
  private flash = 0;
  private dummy = new THREE.Object3D();
  active = false;

  constructor(root: THREE.Group, room: RoomParts) {
    this.root = root;
    this.room = room;
    this.noise = noiseTexture(128);

    // ── Baldosas de la pista ──
    const tgeo = new THREE.BoxGeometry(FLOOR.tile - 0.08, 0.06, FLOOR.tile - 0.08);
    tgeo.translate(0, 0.03, 0);
    const tmat = new THREE.MeshBasicMaterial({ map: tileTexture(), toneMapped: false });
    this.tiles = new THREE.InstancedMesh(tgeo, tmat, FLOOR.cols * FLOOR.rows);
    this.tiles.name = 'club-pista';
    let k = 0;
    for (let j = 0; j < FLOOR.rows; j++) {
      for (let i = 0; i < FLOOR.cols; i++) {
        const x = FLOOR.x0 + (i + 0.5) * FLOOR.tile, z = FLOOR.z0 + (j + 0.5) * FLOOR.tile;
        this.dummy.position.set(x, 0, z);
        this.dummy.updateMatrix();
        this.tiles.setMatrixAt(k, this.dummy.matrix);
        this.tiles.setColorAt(k, tmpC.setRGB(0.05, 0.05, 0.08));
        this.tileCenters.push({ x, z, i, j });
        k++;
      }
    }
    this.tiles.instanceMatrix.needsUpdate = true;
    root.add(this.tiles);

    // ── Focos móviles: haces y manchas en el suelo ──
    const cone = new THREE.CylinderGeometry(0.05, 1, 1, 20, 1, true);
    cone.translate(0, -0.5, 0);
    BEAM_ORIGINS.forEach(([x, z], i) => {
      const mat = this.beamMaterial(PALETTE[i % PALETTE.length]);
      const mesh = new THREE.Mesh(cone, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
      root.add(mesh);
      this.beams.push({
        mesh, mat,
        origin: new THREE.Vector3(x, BEAM_Y, z),
        dir: new THREE.Vector3(0, -1, 0),
        target: new THREE.Vector3(x * 0.5, 0, z),
        color: PALETTE[i % PALETTE.length].clone(),
      });
    });
    // el foco fijo que apunta a la bola de espejos
    {
      const mat = this.beamMaterial(new THREE.Color('#fff6e8'));
      mat.uniforms.uIntensity.value = 0.55;
      const mesh = new THREE.Mesh(cone, mat);
      const o = new THREE.Vector3(6.6, BEAM_Y + 0.1, 3.3);
      const d = BALL.clone().sub(o);
      const L = d.length() - 0.3;
      mesh.position.copy(o);
      mesh.quaternion.setFromUnitVectors(DOWN, d.normalize());
      mesh.scale.set(0.06 * L, L, 0.06 * L);
      mesh.renderOrder = 3;
      root.add(mesh);
    }
    const sgeo = new THREE.PlaneGeometry(1, 1);
    sgeo.rotateX(-Math.PI / 2);
    this.spots = new THREE.InstancedMesh(
      sgeo,
      new THREE.MeshBasicMaterial({ map: spotTexture(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }),
      this.beams.length,
    );
    this.spots.frustumCulled = false;
    this.spots.renderOrder = 2;
    for (let i = 0; i < this.beams.length; i++) this.spots.setColorAt(i, WHITE);
    root.add(this.spots);
    // brillo de las lentes
    const dotTex = dotTexture();
    {
      const g = new THREE.BufferGeometry();
      const pos = new Float32Array(this.beams.length * 3);
      const col = new Float32Array(this.beams.length * 3);
      this.beams.forEach((b, i) => {
        pos.set([b.origin.x, b.origin.y - 0.12, b.origin.z], i * 3);
        col.set([b.color.r, b.color.g, b.color.b], i * 3);
      });
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      this.lens = new THREE.Points(g, new THREE.PointsMaterial({
        size: 1.1, map: dotTex, vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false,
      }));
      this.lens.frustumCulled = false;
      this.lens.renderOrder = 4;
      root.add(this.lens);
    }

    // ── Bola de espejos ──
    {
      const geo = new THREE.IcosahedronGeometry(0.55, 2).toNonIndexed();
      const n = geo.getAttribute('position').count;
      const col = new Float32Array(n * 3);
      for (let f = 0; f < n / 3; f++) {
        const v = 0.45 + hash(f, 1, 2) * 0.55;
        const tint = hash(f, 3, 4) < 0.15 ? 0.85 : 1;
        for (let q = 0; q < 3; q++) col.set([v, v * tint, v], (f * 3 + q) * 3);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      this.ball = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
        vertexColors: true, flatShading: true, shininess: 140, specular: new THREE.Color('#ffffff'), emissive: new THREE.Color('#2a2338'),
      }));
      this.ball.position.copy(BALL);
      root.add(this.ball);
    }
    // puntitos de luz que reparte la bola por paredes, suelo y techo
    const ND = 260;
    this.dotDirs = new Float32Array(ND * 3);
    this.dotTw = new Float32Array(ND);
    for (let i = 0; i < ND; i++) {
      let x = 0, y = 0, z = 0, tries = 0;
      do {
        x = hash(i, 11, tries) * 2 - 1;
        y = hash(i, 12, tries) * 2 - 1;
        z = hash(i, 13, tries) * 2 - 1;
        tries++;
      } while (x * x + y * y + z * z > 1 && tries < 20);
      const l = Math.hypot(x, y, z) || 1;
      // más hacia los lados y abajo que hacia el techo
      this.dotDirs.set([x / l, Math.min(0.45, y / l) - 0.1, z / l], i * 3);
      this.dotTw[i] = hash(i, 5, 6) * 6.28;
    }
    {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ND * 3), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(ND * 3), 3));
      this.dots = new THREE.Points(g, new THREE.PointsMaterial({
        size: 0.2, map: dotTex, vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false,
      }));
      this.dots.frustumCulled = false;
      this.dots.renderOrder = 2;
      root.add(this.dots);
    }

    // ── Humo bajo (tres capas) ──
    for (let l = 0; l < 3; l++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: SMOKE_VERT,
        fragmentShader: SMOKE_FRAG,
        uniforms: {
          uNoise: { value: this.noise },
          uTime: { value: 0 },
          uLayer: { value: l },
          uOpacity: { value: 0.3 - l * 0.06 },
          uColor: { value: new THREE.Color('#9d8cff') },
        },
        transparent: true,
        depthWrite: false,
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.x1 - ROOM.x0, ROOM.z1 - ROOM.z0), mat);
      // el plano XY pasa a ser el suelo; vP = (x, -z) local
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.16 + l * 0.27;
      m.renderOrder = 5 + l;
      root.add(m);
      this.smoke.push(mat);
    }

    // ── Pantalla LED detrás del DJ ──
    this.ledTex = ledTextTexture(LED_TEXT);
    this.ledCanvas = this.ledTex.image as HTMLCanvasElement;
    this.ledUsed = drawLedText(this.ledCanvas.getContext('2d')!, LED_TEXT);
    this.led = new THREE.ShaderMaterial({
      vertexShader: LED_VERT,
      fragmentShader: LED_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uBeat: { value: 0 },
        uKick: { value: 0 },
        uParty: { value: 0 },
        uScroll: { value: 0 },
        uSpan: { value: LED_VISIBLE_PX / LED_CANVAS_W },
        uUsed: { value: this.ledUsed },
        uText: { value: this.ledTex },
        uColA: { value: new THREE.Color('#6c3bd1') },
        uColB: { value: new THREE.Color('#ff2e88') },
      },
    });
    const ledMesh = new THREE.Mesh(new THREE.PlaneGeometry(8.5, 3.2), this.led);
    ledMesh.position.set(0, 3.55, ROOM.z0 + 0.19);
    root.add(ledMesh);

    // ── Confeti ──
    const cgeo = new THREE.PlaneGeometry(0.13, 0.085);
    this.confettiMesh = new THREE.InstancedMesh(cgeo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), 420);
    this.confettiMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.confettiMesh.count = 0;
    this.confettiMesh.frustumCulled = false;
    for (let i = 0; i < 420; i++) {
      this.confettiMesh.setColorAt(i, PALETTE[i % PALETTE.length]);
      this.confetti.push({
        p: new THREE.Vector3(), v: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(),
        life: 0, ground: 0, size: 1, alive: false,
      });
    }
    root.add(this.confettiMesh);

    // ── Chispas de las bengalas ──
    const MAXS = 360;
    this.sparkGeo = new THREE.BufferGeometry();
    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXS * 3), 3));
    this.sparkGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAXS * 3), 3));
    this.sparkGeo.setDrawRange(0, 0);
    this.sparkPts = new THREE.Points(this.sparkGeo, new THREE.PointsMaterial({
      size: 0.12, map: dotTex, vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false,
    }));
    this.sparkPts.frustumCulled = false;
    this.sparkPts.renderOrder = 6;
    root.add(this.sparkPts);
    for (let i = 0; i < MAXS; i++) this.sparks.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, age: 1 });

    // ── Chorros de CO2 a los lados de la cabina ──
    for (const s of [-1, 1]) {
      const mat = this.beamMaterial(new THREE.Color('#e8f4ff'));
      mat.uniforms.uIntensity.value = 0;
      const mesh = new THREE.Mesh(cone, mat);
      mesh.position.set(s * 4.1, DJ.h + 0.05, DJ.z1 - 0.35);
      mesh.quaternion.setFromUnitVectors(DOWN, UP);
      mesh.scale.set(0.9, 5.2, 0.9);
      mesh.visible = false;
      mesh.renderOrder = 3;
      root.add(mesh);
      this.jets.push({ mesh, mat, t: 0 });
    }

    // ── Luces reales: siempre en el grupo del club, que fuera está oculto (no cuentan ni gastan).
    // Así la precarga de interiores las ve y compila los shaders con ellas (calidad baja).
    const L0 = new THREE.PointLight('#ff2e88', 0, 17, 1.3);
    L0.position.set(-3.8, 4.6, -2.8);
    const L1 = new THREE.PointLight('#19e6d2', 0, 17, 1.3);
    L1.position.set(3.8, 4.6, -2.8);
    const L2 = new THREE.PointLight('#ffb35c', 0, 15, 1.3);
    L2.position.set(11.2, 3.6, -1.2);
    this.lights.push(L0, L1, L2);
    root.add(L0, L1, L2);
  }

  private beamMaterial(color: THREE.Color): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      uniforms: {
        uColor: { value: color.clone() },
        uIntensity: { value: 0.35 },
        uTime: { value: 0 },
        uNoise: { value: this.noise },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  /** Dentro o fuera (las luces están siempre en el grupo del club, que fuera se oculta entero). */
  setActive(on: boolean) {
    this.active = on;
  }

  setLedText(text: string) {
    this.ledUsed = drawLedText(this.ledCanvas.getContext('2d')!, text);
    this.led.uniforms.uUsed.value = this.ledUsed;
    this.ledScroll = 0; // el mensaje nuevo empieza por el principio
    this.ledTex.needsUpdate = true;
  }

  /** Lluvia de confeti desde el techo durante unos segundos. */
  confettiRain(seconds: number) {
    this.rainTimer = Math.max(this.rainTimer, seconds);
  }

  /** Estallido de confeti en un punto (local). */
  confettiBurst(pos: THREE.Vector3, count = 60, up = 5) {
    for (let n = 0; n < count; n++) {
      const c = this.spawnConfetto();
      if (!c) return;
      c.p.copy(pos);
      const a = Math.random() * Math.PI * 2;
      const s = 1 + Math.random() * 3;
      c.v.set(Math.cos(a) * s, up * (0.6 + Math.random() * 0.6), Math.sin(a) * s);
    }
  }

  /** Bengala en la punta de una botella (local) durante unos segundos. Devuelve el emisor (se puede mover). */
  sparkler(pos: THREE.Vector3, seconds = 6): { p: THREE.Vector3; t: number } {
    const e = { p: pos.clone(), t: seconds };
    this.emitters.push(e);
    return e;
  }

  /** ¡Fshhhh! Chorros de CO2 a los lados del DJ. */
  co2() {
    for (const j of this.jets) {
      j.t = 1.1;
      j.mesh.visible = true;
    }
  }

  /** Quita confeti, chispas, bengalas y chorros a medias (al salir del club). */
  clearTransient() {
    for (const c of this.confetti) c.alive = false;
    this.confettiMesh.count = 0;
    for (const sp of this.sparks) sp.age = sp.life = 1;
    this.sparkGeo.setDrawRange(0, 0);
    this.emitters.length = 0;
    this.rainTimer = 0;
    this.flash = 0;
    for (const j of this.jets) {
      j.t = 0;
      j.mesh.visible = false;
    }
  }

  /** Destello blanco (al comprar, en el «drop»). */
  strobe(amount = 1) {
    this.flash = Math.max(this.flash, amount);
  }

  private spawnConfetto(): Confetto | null {
    for (const c of this.confetti) {
      if (!c.alive) {
        c.alive = true;
        c.life = 9 + Math.random() * 4;
        c.ground = 0;
        c.size = 0.8 + Math.random() * 0.5;
        c.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        c.spin.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
        return c;
      }
    }
    return null;
  }

  update(dt: number, s: FxState) {
    const party = s.party;
    const speed = 1 + party * 1.4;
    const beatI = Math.floor(s.beat);
    const pulse = s.breakdown ? 0.25 + 0.15 * Math.sin(s.time * 2) : s.kick;
    this.flash = Math.max(0, this.flash - dt * 4);

    // ── baldosas ──
    this.updateTiles(s, pulse, beatI);

    // ── neones que laten ──
    const na = 0.55 + 0.6 * pulse + party * 0.3 + this.flash * 0.5;
    const offBeat = s.breakdown ? 0.5 : Math.exp(-frac(s.beat + 0.5) * 5);
    const nb = 0.5 + 0.55 * offBeat + party * 0.3 + this.flash * 0.5;
    this.room.pulseA.color.setScalar(na);
    this.room.pulseB.color.setScalar(nb);
    // el letrero de la barra parpadea de vez en cuando (tubo viejo)
    const fl = hash(Math.floor(s.time * 12), 7, 7);
    this.room.flickerMat.opacity = fl > 0.965 ? 0.25 : fl > 0.94 ? 0.65 : 1;
    // conos de los altavoces
    this.room.speakerCones.position.z = pulse * 0.035;

    // ── focos móviles ──
    const mode = s.breakdown ? -1 : Math.floor(s.bar / 8) % 4;
    const t = s.time * speed;
    const palShift = Math.floor(s.bar / 4) + (party > 0.2 ? Math.floor(s.beat) : 0);
    this.beams.forEach((b, i) => {
      const o = b.origin;
      const ph = i * 0.9;
      const T = tmpV;
      switch (mode) {
        case 0: {
          const a = t * 0.55 + (i / this.beams.length) * Math.PI * 2;
          T.set(Math.cos(a) * 4.2, 0, -2.2 + Math.sin(a) * 3.2);
          break;
        }
        case 1:
          T.set(Math.sin(t * 0.8 + ph) * 5.2, 0, -2.2 + Math.cos(t * 0.63 + ph * 1.3) * 4);
          break;
        case 2: {
          const cx = Math.sin(t * 0.45) * 3.5, cz = -2.2 + Math.cos(t * 0.37) * 2.5;
          T.set(cx + Math.sin(t * 3 + ph) * 0.4, 0, cz + Math.cos(t * 2.6 + ph) * 0.4);
          break;
        }
        case 3: {
          const sw = Math.sin((s.beat * Math.PI) / 4 + (i % 2) * Math.PI);
          T.set(-o.x * 0.55 + sw * 2.2, 0, o.z * 0.35 - 1.5 + Math.cos(t * 0.5 + ph) * 1.5);
          break;
        }
        default: {
          // parón: los focos se van despacio hacia las paredes
          const a = t * 0.2 + ph;
          T.set(o.x * 1.6 + Math.sin(a) * 2, 0, o.z * 1.2 + Math.cos(a) * 2);
        }
      }
      T.x = THREE.MathUtils.clamp(T.x, ROOM.x0 + 0.5, ROOM.x1 - 0.5);
      T.z = THREE.MathUtils.clamp(T.z, ROOM.z0 + 0.5, ROOM.z1 - 0.5);
      T.y = floorAt(T.x, T.z) + 0.07;
      b.target.lerp(T, Math.min(1, dt * (2.5 + party * 3)));
      const d = tmpV2.copy(b.target).sub(o);
      const L = d.length();
      d.divideScalar(L);
      b.dir.copy(d);
      const r = L * (0.085 + party * 0.02);
      b.mesh.position.copy(o);
      b.mesh.quaternion.setFromUnitVectors(DOWN, d);
      b.mesh.scale.set(r, L, r);
      // color
      b.color.copy(pal(i + palShift));
      if (party > 0.5 && (Math.floor(s.beat * 4) + i) % 3 === 0) b.color.lerp(WHITE, 0.35);
      const inten = (s.breakdown ? 0.12 + (i % 3 === 0 ? 0.18 : 0) : 0.26 + 0.16 * pulse) + party * 0.2 + this.flash * 0.3;
      b.mat.uniforms.uColor.value.copy(b.color);
      b.mat.uniforms.uIntensity.value = inten;
      b.mat.uniforms.uTime.value = s.time;
      // mancha en el suelo (elipse alargada según la inclinación)
      const cosA = Math.max(0.35, Math.abs(d.y));
      const yaw = Math.atan2(d.x, d.z);
      tmpQ.setFromAxisAngle(UP, yaw);
      tmpS.set(r * 2.3, 1, (r * 2.3) / cosA);
      tmpM.compose(tmpV.copy(b.target).setY(b.target.y + 0.01), tmpQ, tmpS);
      this.spots.setMatrixAt(i, tmpM);
      this.spots.setColorAt(i, tmpC.copy(b.color).multiplyScalar(Math.min(1, inten * 1.7)));
      // lente
      const lc = this.lens.geometry.getAttribute('color') as THREE.BufferAttribute;
      lc.setXYZ(i, b.color.r * inten * 2.4, b.color.g * inten * 2.4, b.color.b * inten * 2.4);
    });
    this.spots.instanceMatrix.needsUpdate = true;
    if (this.spots.instanceColor) this.spots.instanceColor.needsUpdate = true;
    (this.lens.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;

    // ── bola de espejos y sus puntitos ──
    this.ballAngle += dt * (0.45 + party * 0.9);
    this.ball.rotation.y = this.ballAngle;
    this.updateDots(s);

    // ── humo ──
    tmpC.copy(pal(palShift)).lerp(tmpC2.set('#b8a8ff'), 0.6);
    for (const m of this.smoke) {
      m.uniforms.uTime.value = s.time;
      (m.uniforms.uColor.value as THREE.Color).lerp(tmpC, Math.min(1, dt * 0.8));
    }

    // ── pantalla LED ──
    this.ledScroll = (this.ledScroll + (dt * (120 + party * 60)) / LED_CANVAS_W) % this.ledUsed;
    const u = this.led.uniforms;
    u.uTime.value = s.time;
    // en la GPU los números grandes pierden precisión: basta con la vuelta de 64 pulsos (16 compases)
    u.uBeat.value = s.beat % 64;
    u.uKick.value = pulse;
    u.uParty.value = party;
    u.uScroll.value = this.ledScroll;
    (u.uColA.value as THREE.Color).copy(pal(palShift + 2)).multiplyScalar(0.8);
    (u.uColB.value as THREE.Color).copy(pal(palShift + 4));

    // ── luces reales ──
    const [L0, L1, L2] = this.lights;
    L0.color.copy(pal(palShift));
    L1.color.copy(pal(palShift + 1));
    const li = 26 + 22 * pulse + party * 26 + this.flash * 40;
    L0.intensity = li;
    L1.intensity = li;
    L2.intensity = 22 + party * 18 + this.flash * 30;
    // la luz cálida acompaña al jugador por zonas: barra, paquetería, reservados o portero/photocall
    const pl = s.player;
    if (!pl) tmpV.set(11.2, 3.6, -1.2);
    else if (pl.x < -1.5) {
      if (pl.z < 5.5) tmpV.set(-10.6, 3.3, -0.8);
      else tmpV.set(-10.4, 3.2, 7.0);
    } else if (pl.z > 3.2 && !(pl.x > VIP.x0 && pl.z < 3.8)) tmpV.set(9.6, 3.3, 6.4);
    else tmpV.set(11.2, 3.6, -1.2);
    L2.position.lerp(tmpV, Math.min(1, dt * 1.2));

    // ── confeti, bengalas y CO2 ──
    this.updateConfetti(dt);
    this.updateSparks(dt);
    for (const j of this.jets) {
      if (j.t <= 0) continue;
      j.t -= dt;
      const k = Math.max(0, j.t / 1.1);
      j.mat.uniforms.uIntensity.value = 0.8 * Math.sin(k * Math.PI) ** 0.5;
      j.mat.uniforms.uTime.value = s.time * 3;
      j.mesh.scale.set(0.7 + (1 - k) * 0.5, 4.6 + (1 - k) * 1.2, 0.7 + (1 - k) * 0.5);
      if (j.t <= 0) j.mesh.visible = false;
    }
  }

  private updateTiles(s: FxState, pulse: number, beatI: number) {
    const party = s.party;
    const b = s.beat * (party > 0.3 ? 2 : 1);
    const bi = Math.floor(b);
    const pat = s.breakdown ? -1 : (Math.floor(s.bar / 4) + (party > 0.3 ? Math.floor(s.beat / 2) : 0)) % 5;
    const palI = Math.floor(s.bar / 4);
    const pl = s.player;
    for (let k = 0; k < this.tileCenters.length; k++) {
      const { x, z, i, j } = this.tileCenters[k];
      let v = 0;
      let col = pal(palI + ((i + j) & 1));
      switch (pat) {
        case 0:
          v = (i + j + bi) & 1 ? 1 : 0.06;
          break;
        case 1: {
          const d = Math.hypot(i - 4.5, j - 3.5);
          const w = frac(d * 0.3 - b * 0.5);
          v = w < 0.3 ? 1 : 0.05;
          col = pal(palI + Math.floor(d * 0.3 - b * 0.5));
          break;
        }
        case 2: {
          const pos = frac(b / 8) * 14 - 2;
          v = Math.max(0.05, 1 - Math.abs(i - pos) * 0.45);
          col = pal(palI + 1);
          break;
        }
        case 3:
          v = hash(i, j, Math.floor(b * 2)) > 0.6 ? 1 : 0.05;
          col = pal(hash(j, i, Math.floor(b * 2)) * PALETTE.length);
          break;
        case 4: {
          const h = 1 + Math.floor(hash(i, 3, bi) * (FLOOR.rows - 1) * (0.5 + 0.5 * pulse));
          const row = FLOOR.rows - 1 - j;
          v = row < h ? 1 : 0.05;
          col = row > 5 ? PALETTE[0] : row > 3 ? PALETTE[3] : PALETTE[5];
          break;
        }
        default: {
          // parón: una ola lenta y suave
          v = 0.15 + 0.35 * (0.5 + 0.5 * Math.sin(s.time * 1.5 - (i + j) * 0.5));
          col = PALETTE[2];
        }
      }
      const bright = v * (0.5 + 0.5 * pulse) * (1 + party * 0.25) + this.flash * 0.3;
      tmpC.setRGB(0.03 + col.r * bright, 0.025 + col.g * bright, 0.05 + col.b * bright);
      // la baldosa que pisas se enciende
      if (pl) {
        const dd = Math.abs(pl.x - x) + Math.abs(pl.z - z);
        if (dd < 1.1 && pl.y < 0.5) tmpC.lerp(WHITE, (1 - dd / 1.1) * 0.8);
      }
      this.tiles.setColorAt(k, tmpC);
    }
    if (this.tiles.instanceColor) this.tiles.instanceColor.needsUpdate = true;
    void beatI;
  }

  private updateDots(s: FxState) {
    const pos = this.dots.geometry.getAttribute('position') as THREE.BufferAttribute;
    const col = this.dots.geometry.getAttribute('color') as THREE.BufferAttribute;
    const n = pos.count;
    const ca = Math.cos(this.ballAngle), sa = Math.sin(this.ballAngle);
    const bx = BALL.x, by = BALL.y, bz = BALL.z;
    const X0 = ROOM.x0 + 0.03, X1 = ROOM.x1 - 0.03, Z0 = ROOM.z0 + 0.03, Z1 = ROOM.z1 - 0.03;
    const bright = (s.breakdown ? 1.0 : 0.7) + s.party * 0.3;
    for (let i = 0; i < n; i++) {
      const x0 = this.dotDirs[i * 3], dy = this.dotDirs[i * 3 + 1], z0 = this.dotDirs[i * 3 + 2];
      const dx = ca * x0 + sa * z0, dz = -sa * x0 + ca * z0;
      let tt = Infinity;
      if (dx > 1e-4) tt = Math.min(tt, (X1 - bx) / dx);
      else if (dx < -1e-4) tt = Math.min(tt, (X0 - bx) / dx);
      if (dz > 1e-4) tt = Math.min(tt, (Z1 - bz) / dz);
      else if (dz < -1e-4) tt = Math.min(tt, (Z0 - bz) / dz);
      if (dy > 1e-4) tt = Math.min(tt, (ROOM.h - 0.03 - by) / dy);
      else if (dy < -1e-4) {
        const tf = (0.075 - by) / dy;
        if (tf < tt) {
          const hx = bx + dx * tf, hz = bz + dz * tf;
          const fy = floorAt(hx, hz);
          tt = fy > 0.1 ? Math.min(tt, (fy + 0.02 - by) / dy) : tf;
        }
      }
      pos.setXYZ(i, bx + dx * tt, by + dy * tt, bz + dz * tt);
      const tw = 0.55 + 0.45 * Math.sin(s.time * 3 + this.dotTw[i]);
      const k = tw * bright * Math.min(1, 9 / tt);
      col.setXYZ(i, k, k * 0.96, k * 0.9);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  private updateConfetti(dt: number) {
    if (this.rainTimer > 0) {
      this.rainTimer -= dt;
      const n = Math.random() < dt * 50 ? 2 : 0;
      for (let q = 0; q < n; q++) {
        const c = this.spawnConfetto();
        if (!c) break;
        c.p.set(-9 + Math.random() * 23, ROOM.h - 0.3 - Math.random() * 0.5, -9.5 + Math.random() * 16);
        c.v.set((Math.random() - 0.5) * 0.6, -0.4, (Math.random() - 0.5) * 0.6);
      }
    }
    const m = this.confettiMesh;
    let count = 0;
    for (let ci = 0; ci < this.confetti.length; ci++) {
      const c = this.confetti[ci];
      if (!c.alive) continue;
      c.life -= dt;
      const fy = floorAt(c.p.x, c.p.z) + 0.07;
      if (c.p.y > fy + 0.001) {
        // caída con resistencia y balanceo (como papelitos)
        c.v.y -= 7 * dt;
        const drag = Math.min(1, dt * 2.6);
        c.v.x -= c.v.x * drag;
        c.v.z -= c.v.z * drag;
        if (c.v.y < -1.1) c.v.y += (-1.1 - c.v.y) * Math.min(1, dt * 6);
        c.p.addScaledVector(c.v, dt);
        c.p.x += Math.sin(c.life * 3.1 + c.size * 10) * dt * 0.5;
        c.rot.x += c.spin.x * dt;
        c.rot.y += c.spin.y * dt;
        c.rot.z += c.spin.z * dt;
        if (c.p.y <= fy) {
          c.p.y = fy;
          c.rot.x = -Math.PI / 2;
          c.rot.z = 0;
        }
      } else c.ground += dt;
      const shrink = c.life < 1 ? Math.max(0, c.life) : 1;
      if (c.life <= 0) {
        c.alive = false;
        continue;
      }
      this.dummy.position.copy(c.p);
      this.dummy.rotation.copy(c.rot);
      this.dummy.scale.setScalar(c.size * shrink);
      this.dummy.updateMatrix();
      m.setMatrixAt(count, this.dummy.matrix);
      m.setColorAt(count, pal(ci * 7));
      count++;
    }
    m.count = count;
    if (count) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  private updateSparks(dt: number) {
    for (let e = this.emitters.length - 1; e >= 0; e--) {
      const em = this.emitters[e];
      em.t -= dt;
      if (em.t <= 0) {
        this.emitters.splice(e, 1);
        continue;
      }
      const n = Math.floor(dt * 140 + Math.random());
      for (let q = 0; q < n; q++) {
        const sp = this.sparks.find((x) => x.age >= x.life);
        if (!sp) break;
        sp.p.copy(em.p);
        const a = Math.random() * Math.PI * 2;
        const core = q < 2; // unas cuantas se quedan en la punta: el núcleo brillante
        const h = core ? 0.05 : 0.25 + Math.random() * 0.8;
        sp.v.set(Math.cos(a) * h, core ? 0.1 : 1.1 + Math.random() * 1.8, Math.sin(a) * h);
        sp.age = 0;
        sp.life = core ? 0.12 : 0.35 + Math.random() * 0.5;
      }
    }
    const pos = this.sparkGeo.getAttribute('position') as THREE.BufferAttribute;
    const col = this.sparkGeo.getAttribute('color') as THREE.BufferAttribute;
    let n = 0;
    for (const sp of this.sparks) {
      if (sp.age >= sp.life) continue;
      sp.age += dt;
      sp.v.y -= 5 * dt;
      sp.p.addScaledVector(sp.v, dt);
      const k = Math.max(0, 1 - sp.age / sp.life);
      pos.setXYZ(n, sp.p.x, sp.p.y, sp.p.z);
      col.setXYZ(n, 1.4 * k, (1.1 - sp.age) * k, 0.5 * k * k);
      n++;
    }
    this.sparkGeo.setDrawRange(0, n);
    if (n) {
      pos.needsUpdate = true;
      col.needsUpdate = true;
    }
  }
}

const LED_TEXT = '★ CLUB REEMBOLSO VIP ★ AQUÍ SIEMPRE SON LAS 3 DE LA MAÑANA ★ SE ADMITE PAGO CONTRA REEMBOLSO ★ ';

