// Cúpula del cielo (degradado, sol, luna) y estrellas. Siguen a la cámara.
// Los colores van en sRGB directos a pantalla (sin tone mapping), igual que la niebla de three.
import * as THREE from 'three';
import { Rng } from '../../core/rng';

const DOME_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const DOME_FRAG = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uFog;
uniform vec3 uGlow;
uniform float uGlowK;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uSunHalo;
uniform float uSunSize;
uniform float uSunVis;
uniform vec3 uMoonDir;
uniform vec3 uMoonCol;
uniform float uMoonSize;
uniform float uMoonVis;
varying vec3 vDir;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float hp = max(h, 0.0);

  // degradado de tres paradas: horizonte -> media altura -> cenit
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.3, pow(hp, 0.85)));
  col = mix(col, uZenith, smoothstep(0.14, 0.9, hp));

  // resplandor del lado del sol (ancho, pegado al horizonte) + corona alrededor del sol
  float sd = dot(d, uSunDir);
  vec2 dh = normalize(d.xz + vec2(1e-5));
  vec2 sh = normalize(uSunDir.xz + vec2(1e-5));
  float az = dot(dh, sh) * 0.5 + 0.5;
  float band = exp(-hp * 4.5);
  float glow = pow(az, 3.0) * band * 0.8 + pow(max(sd, 0.0), 10.0) * 0.55;
  col = mix(col, uGlow, clamp(glow * uGlowK, 0.0, 0.92));

  // halo y disco del sol
  float sdp = max(sd, 0.0);
  col += uSunHalo * (pow(sdp, 220.0) * 0.45 + pow(sdp, 1600.0) * 0.35) * uSunVis;
  float cosR = cos(uSunSize);
  float aa = max(fwidth(sd) * 1.5, 1e-5);
  float disc = smoothstep(cosR - aa, cosR + aa, sd);
  // el disco nunca más oscuro que el halo que lo rodea (si no, parece un agujero)
  col = mix(col, max(uSunCol, min(col, vec3(1.0))), disc * uSunVis);

  // halo de la luna (antes del disco para no tapar los cráteres)
  float md = dot(d, uMoonDir);
  float mdp = max(md, 0.0);
  col += uMoonCol * (pow(mdp, 500.0) * 0.2 + pow(mdp, 45.0) * 0.07) * uMoonVis;
  // luna con cráteres
  if (uMoonVis > 0.001 && md > 0.985) {
    vec3 mr = normalize(cross(vec3(0.0, 1.0, 0.0), uMoonDir));
    vec3 mu = cross(uMoonDir, mr);
    vec2 uv = vec2(dot(d, mr), dot(d, mu)) / sin(uMoonSize);
    float r = length(uv);
    float e = max(fwidth(r) * 1.5, 1e-4);
    float m = 1.0 - smoothstep(1.0 - e, 1.0 + e, r);
    float cr = 0.0;
    cr += 1.0 - smoothstep(0.17, 0.22, length(uv - vec2(0.34, 0.26)));
    cr += 1.0 - smoothstep(0.23, 0.29, length(uv - vec2(-0.28, -0.14)));
    cr += 1.0 - smoothstep(0.11, 0.15, length(uv - vec2(0.14, -0.52)));
    cr += 1.0 - smoothstep(0.08, 0.12, length(uv - vec2(-0.08, 0.56)));
    cr += 1.0 - smoothstep(0.06, 0.09, length(uv - vec2(0.58, -0.12)));
    vec3 mc = uMoonCol * (1.0 - 0.2 * min(cr, 1.0)) * (1.0 - 0.22 * r * r);
    col = mix(col, mc, m * uMoonVis);
  }

  // bajo el horizonte: color de la niebla (empalma con el suelo lejano)
  float below = 1.0 - smoothstep(-0.035, 0.012, h);
  col = mix(col, uFog, below);

  // tramado para que el degradado no haga bandas
  col += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

const STAR_VERT = /* glsl */ `
attribute float aSize;
attribute float aPhase;
attribute vec3 aColor;
uniform float uTime;
uniform float uOpacity;
uniform float uPixelRatio;
uniform vec3 uMoonDir;
varying vec3 vCol;
varying float vA;
void main() {
  vec3 d = normalize(position);
  float tw = 0.7 + 0.3 * sin(uTime * (1.3 + aPhase * 2.4) + aPhase * 37.0);
  float horizonFade = smoothstep(0.03, 0.22, d.y);
  float moonFade = 1.0 - smoothstep(0.9975, 0.9992, dot(d, uMoonDir));
  vA = uOpacity * horizonFade * moonFade * tw;
  vCol = aColor;
  gl_PointSize = aSize * uPixelRatio * (0.8 + 0.35 * tw);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const STAR_FRAG = /* glsl */ `
varying vec3 vCol;
varying float vA;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = 1.0 - smoothstep(0.35, 1.0, r);
  gl_FragColor = vec4(vCol, vA * a);
}
`;

const v3 = () => new THREE.Vector3();

export class SkyDome {
  readonly mesh: THREE.Mesh;
  readonly stars: THREE.Points;
  readonly uniforms = {
    uZenith: { value: v3() },
    uMid: { value: v3() },
    uHorizon: { value: v3() },
    uFog: { value: v3() },
    uGlow: { value: v3() },
    uGlowK: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunCol: { value: v3() },
    uSunHalo: { value: v3() },
    uSunSize: { value: 0.04 },
    uSunVis: { value: 1 },
    uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
    uMoonCol: { value: new THREE.Vector3(0.9, 0.93, 1) },
    uMoonSize: { value: 0.042 },
    uMoonVis: { value: 0 },
  };
  readonly starUniforms = {
    uTime: { value: 0 },
    uOpacity: { value: 0 },
    uPixelRatio: { value: 1 },
    uMoonDir: this.uniforms.uMoonDir,
  };

  constructor(scene: THREE.Scene) {
    const geo = new THREE.SphereGeometry(1, 48, 24);
    const mat = new THREE.ShaderMaterial({
      name: 'cielo',
      uniforms: this.uniforms,
      vertexShader: DOME_VERT,
      fragmentShader: DOME_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = 'cielo';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.matrixAutoUpdate = false;
    // sigue a la cámara justo antes de pintarse (después de cámara y temblores)
    this.mesh.onBeforeRender = (_r, _s, cam) => followCamera(this.mesh, cam);
    this.mesh.raycast = noRaycast; // que ningún rayo "choque" con el cielo
    scene.add(this.mesh);

    this.stars = makeStars(this.starUniforms);
    this.stars.onBeforeRender = (_r, _s, cam) => followCamera(this.stars, cam);
    this.stars.raycast = noRaycast;
    scene.add(this.stars);
  }

  /** Radio de la cúpula y de las estrellas (siempre por dentro de camera.far). */
  setFar(far: number) {
    this.mesh.scale.setScalar(far * 0.9);
    this.stars.scale.setScalar(far * 0.985);
  }

  dispose() {
    this.mesh.removeFromParent();
    this.stars.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.stars.geometry.dispose();
    (this.stars.material as THREE.Material).dispose();
  }
}

/** Para que los Raycaster de three ignoren cielo, estrellas y nubes. */
export function noRaycast(): void {}

const _camPos = new THREE.Vector3();
function followCamera(obj: THREE.Object3D, cam: THREE.Camera) {
  cam.getWorldPosition(_camPos);
  obj.position.copy(_camPos);
  obj.updateMatrix();
  obj.matrixWorld.copy(obj.matrix);
}

function makeStars(uniforms: Record<string, THREE.IUniform>): THREE.Points {
  const rng = new Rng('estrellas');
  const N = 1600;
  const pos = new Float32Array(N * 3);
  const size = new Float32Array(N);
  const phase = new Float32Array(N);
  const col = new Float32Array(N * 3);
  const TINTS = [
    [1, 1, 1],
    [0.8, 0.88, 1],
    [0.7, 0.8, 1],
    [1, 0.92, 0.78],
    [1, 0.82, 0.7],
  ];
  for (let i = 0; i < N; i++) {
    // dirección uniforme en la semiesfera superior
    const y = rng.range(0.02, 1);
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(1 - y * y);
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = Math.sin(a) * r;
    const b = rng.next();
    size[i] = 1.2 + b * b * b * 3.2; // casi todas pequeñas, unas pocas gordas
    phase[i] = rng.next();
    const t = rng.chance(0.7) ? TINTS[0] : rng.pick(TINTS);
    const bright = 0.55 + 0.45 * b;
    col[i * 3] = t[0] * bright;
    col[i * 3 + 1] = t[1] * bright;
    col[i * 3 + 2] = t[2] * bright;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.ShaderMaterial({
    name: 'estrellas',
    uniforms,
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.name = 'estrellas';
  pts.frustumCulled = false;
  pts.renderOrder = -999;
  pts.matrixAutoUpdate = false;
  return pts;
}
