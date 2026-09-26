// Nubes low-poly: racimos de icosaedros achatados, instanciados, que flotan a 120-180 m.
// Truco: su profundidad se comprime más allá de la distancia de niebla para poder verlas
// lejos (hasta ~1 km) sin superar camera.far. Lo que hay detrás de la niebla es invisible,
// así que no se nota. Brillo propio (sin luces de three) y bruma que las funde con el cielo.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../../core/rng';

const VERT = /* glsl */ `
uniform float uD0;
uniform float uDRange;
varying vec3 vWorld;
void main() {
  vec4 p = vec4(position, 1.0);
  #ifdef USE_INSTANCING
  p = instanceMatrix * p;
  #endif
  vec4 wp = modelMatrix * p;
  vWorld = wp.xyz;
  vec4 mv = viewMatrix * wp;
  float dist = length(mv.xyz);
  if (dist > uD0) {
    float nd = uD0 + uDRange * (1.0 - exp(-(dist - uD0) / 450.0));
    mv.xyz *= nd / dist;
  }
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec3 uLightDir;
uniform vec3 uSunDir;
uniform vec3 uRim;
uniform float uRimK;
uniform vec3 uHaze;
uniform vec3 uHazeHigh;
uniform float uHazeNear;
uniform float uHazeFar;
uniform float uTopK;
varying vec3 vWorld;
void main() {
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  vec3 v = vWorld - cameraPosition;
  float dist = length(v);
  vec3 vd = v / dist;
  float ndl = dot(n, uLightDir);
  float l = smoothstep(-0.65, 1.0, ndl);
  float top = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 col = mix(uShade, uLit, clamp(l * 0.75 + top * uTopK - 0.06, 0.0, 1.0));
  // contraluz: las nubes cerca del sol se encienden con el color del resplandor (más en los bordes)
  float fwd = pow(max(dot(vd, uSunDir), 0.0), 4.0);
  float edge = pow(1.0 - abs(dot(n, vd)), 1.5);
  col = mix(col, uRim, clamp(fwd * uRimK * (0.55 + 0.45 * edge), 0.0, 0.85));
  // bruma: lejos y bajas, se funden con el cielo
  float e = max(vd.y, 0.0);
  vec3 haze = mix(uHaze, uHazeHigh, smoothstep(0.0, 0.3, pow(e, 0.85)));
  col = mix(col, haze, smoothstep(uHazeNear, uHazeFar, dist) * 0.8);
  gl_FragColor = vec4(col, 1.0);
}
`;

/** Tamaño del campo de nubes: ±FIELD metros alrededor de la cámara. */
const FIELD = 1100;
const PER_VARIANT = 14;
const VARIANTS = 3;

interface Cloud {
  base: THREE.Vector3; // posición en t = 0
  yaw: number;
  sx: number;
  sy: number;
  sz: number;
  speed: number; // multiplicador del viento
}

export class Clouds {
  readonly group = new THREE.Group();
  readonly meshes: THREE.InstancedMesh[] = [];
  readonly uniforms = {
    uD0: { value: 250 },
    uDRange: { value: 70 },
    uLit: { value: new THREE.Vector3(1, 1, 1) },
    uShade: { value: new THREE.Vector3(0.8, 0.85, 0.95) },
    uLightDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uRim: { value: new THREE.Vector3(1, 0.9, 0.7) },
    uRimK: { value: 0.3 },
    uHaze: { value: new THREE.Vector3(0.8, 0.9, 1) },
    uHazeHigh: { value: new THREE.Vector3(0.5, 0.7, 1) },
    uHazeNear: { value: 550 },
    uHazeFar: { value: 1700 },
    uTopK: { value: 0.38 },
  };
  private clouds: Cloud[][] = [];
  private wind = new THREE.Vector3(4.5, 0, 1.6);
  private readonly material: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene) {
    const rng = new Rng('nubes');
    this.material = new THREE.ShaderMaterial({
      name: 'nubes',
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      fog: false,
    });
    for (let v = 0; v < VARIANTS; v++) {
      const geo = makeCloudGeometry(rng.fork(v + 1), v);
      const mesh = new THREE.InstancedMesh(geo, this.material, PER_VARIANT);
      mesh.name = 'nubes-' + v;
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const list: Cloud[] = [];
      for (let i = 0; i < PER_VARIANT; i++) {
        const s = rng.range(1.15, 2.0);
        list.push({
          base: new THREE.Vector3(rng.range(-FIELD, FIELD), rng.range(120, 180), rng.range(-FIELD, FIELD)),
          yaw: rng.range(-0.5, 0.5) + (rng.chance(0.5) ? Math.PI : 0),
          sx: s * rng.range(0.9, 1.25),
          sy: s * rng.range(1.0, 1.35),
          sz: s * rng.range(0.85, 1.2),
          speed: rng.range(0.8, 1.2),
        });
      }
      this.clouds.push(list);
      this.meshes.push(mesh);
      this.group.add(mesh);
    }
    this.group.name = 'nubes';
    scene.add(this.group);
  }

  /** Compresión de profundidad: desde la distancia de niebla hasta casi camera.far. */
  setRange(fogFar: number, cameraFar: number) {
    this.uniforms.uD0.value = Math.min(fogFar + 4, cameraFar - 20);
    this.uniforms.uDRange.value = Math.max(5, cameraFar * 0.975 - this.uniforms.uD0.value);
  }

  private _m = new THREE.Matrix4();
  private _p = new THREE.Vector3();
  private _q = new THREE.Quaternion();
  private _s = new THREE.Vector3();
  private _up = new THREE.Vector3(0, 1, 0);

  /** Mueve las nubes con el viento y las recoloca alrededor de la cámara. */
  update(elapsed: number, cam: THREE.Vector3) {
    const span = FIELD * 2;
    for (let v = 0; v < this.meshes.length; v++) {
      const mesh = this.meshes[v];
      const list = this.clouds[v];
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        let x = c.base.x + this.wind.x * elapsed * c.speed - cam.x;
        let z = c.base.z + this.wind.z * elapsed * c.speed - cam.z;
        x = x - Math.floor((x + FIELD) / span) * span; // envolver a [-FIELD, FIELD)
        z = z - Math.floor((z + FIELD) / span) * span;
        // encoger en el borde del campo para que no aparezcan de golpe
        const edge = Math.max(Math.abs(x), Math.abs(z));
        const f = 1 - smooth(FIELD * 0.82, FIELD, edge);
        const k = Math.max(0.001, f);
        this._p.set(cam.x + x, c.base.y, cam.z + z);
        this._q.setFromAxisAngle(this._up, c.yaw);
        this._s.set(c.sx * k, c.sy * k, c.sz * k);
        this._m.compose(this._p, this._q, this._s);
        mesh.setMatrixAt(i, this._m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  setVisible(v: boolean) {
    this.group.visible = v;
  }

  dispose() {
    this.group.removeFromParent();
    for (const m of this.meshes) {
      m.geometry.dispose();
      m.dispose();
    }
    this.material.dispose();
  }
}

function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Un racimo de bolas achatadas con la base plana. Unos 40-90 m de largo. */
function makeCloudGeometry(rng: Rng, variant: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const n = 5 + variant * 2 + rng.int(0, 1); // 5..8 bolas en la fila principal
  const length = 34 + n * 7;
  const baseY = 0;
  const addPuff = (x: number, y: number, z: number, r: number, detail: number) => {
    const g = new THREE.IcosahedronGeometry(r, detail);
    g.deleteAttribute('normal');
    g.deleteAttribute('uv');
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      let px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
      // deformación determinista por vértice (los vértices repetidos se mueven igual: sin grietas)
      const j = jitter(Math.round(px * 100) + x, Math.round(py * 100) + y, Math.round(pz * 100) + z) * r * 0.07;
      const len = Math.hypot(px, py, pz) || 1;
      px += (px / len) * j;
      py += (py / len) * j;
      pz += (pz / len) * j;
      py *= 0.86; // algo achatada
      let wy = py + y;
      if (wy < baseY) wy = baseY + (wy - baseY) * 0.12; // base casi plana
      pos.setXYZ(i, px * 1.12 + x, wy, pz + z);
    }
    parts.push(g);
  };
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const center = 1 - Math.abs(t - 0.5) * 1.5; // más gordas en el centro
    const r = (7 + center * 9) * rng.range(0.85, 1.15);
    const x = (t - 0.5) * length + rng.range(-3, 3);
    const y = baseY + r * 0.4 + center * 8 + rng.range(-1, 1.5);
    addPuff(x, y, rng.range(-4, 4), r, r > 12.5 ? 1 : 0);
  }
  // segunda fila (profundidad) y un par de cúmulos encima
  const extra = 2 + variant;
  for (let i = 0; i < extra; i++) {
    const r = rng.range(6, 10);
    addPuff(rng.range(-length * 0.3, length * 0.3), baseY + r * 0.3, rng.pick([-1, 1]) * rng.range(8, 13), r, 0);
  }
  // cúmulos de arriba (forma de coliflor)
  for (let i = 0; i < 2 + (variant % 2); i++) {
    const r = rng.range(8, 12);
    addPuff(rng.range(-length * 0.22, length * 0.22), baseY + 14 + r * 0.35 + rng.range(0, 4), rng.range(-4, 4), r, 1);
  }
  const merged = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  merged.computeBoundingSphere();
  return merged;
}

/** Ruido barato y determinista en [-1, 1]. */
function jitter(x: number, y: number, z: number): number {
  const s = Math.sin(x * 0.129898 + y * 0.78233 + z * 0.37719) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}
