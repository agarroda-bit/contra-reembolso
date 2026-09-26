// La vista desde el ático: el pueblo bajando por la colina hasta el mar, el faro, el puerto y barquitos.
// Es un decorado (no es la isla de verdad, que queda a 4 km): se ilumina con el sol del juego y la
// niebla lo funde con el cielo, así que cambia con la hora como todo lo demás.
import * as THREE from 'three';
import type { Game } from '../../../core/game';
import { GeoBuilder } from '../../../core/geo';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../../../core/rng';

/** Centro del ático (local) y altura del mar (local: el suelo del ático está en y = 0). */
const CX = 12, CZ = 9;
export const SEA_Y = -26;
const BASE_Y = -13.5; // pie del edificio del ático
const TERRACE = 4; // anchura de la terraza (al oeste de los ventanales)

/** Rectángulo que ocupa el edificio del ático (con la terraza). */
const RECT = { x0: -TERRACE - 1, x1: 25, z0: -1.2, z1: 19.2 };

function distRect(x: number, z: number): number {
  const dx = Math.max(RECT.x0 - x, 0, x - RECT.x1);
  const dz = Math.max(RECT.z0 - z, 0, z - RECT.z1);
  return Math.hypot(dx, dz);
}

/** Altura del terreno del decorado (coordenadas locales del ático). */
export function viewHeight(x: number, z: number): number {
  const d = distRect(x, z);
  const th = Math.atan2(z - CZ, x - CX);
  // al oeste baja deprisa (mar cerca), al este sigue la isla
  const k = 0.1 - 0.045 * Math.cos(th) + 0.012 * Math.sin(th * 3);
  const flat = Math.min(1, d / 14);
  const bumps = (1.6 * Math.sin(x * 0.07 + 0.4) * Math.cos(z * 0.06) + 0.9 * Math.sin(x * 0.13 + z * 0.11)) * flat;
  return BASE_Y - d * k + bumps;
}

// ─────────────────────── lote de triángulos (rápido, sin crear geometrías) ───────────────────────

class Batch {
  pos: number[] = [];
  col: number[] = [];
  private c = new THREE.Color();

  tri(a: number[], b: number[], c: number[], color: string | THREE.Color) {
    this.c.set(color as any);
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let i = 0; i < 3; i++) this.col.push(this.c.r, this.c.g, this.c.b);
  }
  quad(a: number[], b: number[], c: number[], d: number[], color: string | THREE.Color) {
    this.tri(a, b, c, color);
    this.tri(a, c, d, color);
  }
  /** Caja con la base en y (sin cara de abajo). */
  box(cx: number, y: number, cz: number, w: number, h: number, d: number, ry: number, color: string, top: string = color) {
    const co = Math.cos(ry), si = Math.sin(ry);
    const P = (lx: number, ly: number, lz: number) => [cx + lx * co + lz * si, y + ly, cz - lx * si + lz * co];
    const hw = w / 2, hd = d / 2;
    const A = P(hw, 0, hd), B = P(hw, 0, -hd), C = P(-hw, 0, -hd), D = P(-hw, 0, hd);
    const A2 = P(hw, h, hd), B2 = P(hw, h, -hd), C2 = P(-hw, h, -hd), D2 = P(-hw, h, hd);
    this.quad(A, B, B2, A2, color); // +x
    this.quad(C, D, D2, C2, color); // -x
    this.quad(D, A, A2, D2, color); // +z
    this.quad(B, C, C2, B2, color); // -z
    this.quad(D2, A2, B2, C2, top); // arriba
  }
  /** Tejado a cuatro aguas. */
  roof(cx: number, y: number, cz: number, w: number, d: number, h: number, ry: number, color: string, color2: string) {
    const co = Math.cos(ry), si = Math.sin(ry);
    const P = (lx: number, ly: number, lz: number) => [cx + lx * co + lz * si, y + ly, cz - lx * si + lz * co];
    const hw = w / 2 + 0.25, hd = d / 2 + 0.25;
    const top = P(0, h, 0);
    const A = P(hw, 0, hd), B = P(hw, 0, -hd), C = P(-hw, 0, -hd), D = P(-hw, 0, hd);
    this.tri(D, A, top, color);
    this.tri(A, B, top, color2);
    this.tri(B, C, top, color);
    this.tri(C, D, top, color2);
  }
  /** Rectángulo en la cara de una caja (ventanas), ligeramente separado. */
  facadeQuad(cx: number, cy: number, cz: number, nx: number, nz: number, w: number, h: number, color: string) {
    // r = up × n
    const rx = nz, rz = -nx;
    const ox = cx + nx * 0.05, oz = cz + nz * 0.05;
    const hw = w / 2, hh = h / 2;
    this.quad(
      [ox - rx * hw, cy - hh, oz - rz * hw],
      [ox + rx * hw, cy - hh, oz + rz * hw],
      [ox + rx * hw, cy + hh, oz + rz * hw],
      [ox - rx * hw, cy + hh, oz - rz * hw],
      color,
    );
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

// ─────────────────────────────── mar con reflejos ───────────────────────────────

const seaVS = /* glsl */ `
#include <fog_pars_vertex>
varying vec3 vWorld;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const seaFS = /* glsl */ `
uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uSky; uniform vec3 uHorizon;
uniform vec3 uDeep; uniform vec3 uShallow; uniform float uTime; uniform float uLight; uniform vec3 uCenter;
varying vec3 vWorld;
#include <fog_pars_fragment>
void main(){
  vec3 v = normalize(vWorld - cameraPosition);
  vec2 p = vWorld.xz;
  float t = uTime;
  vec3 n = normalize(vec3(
    sin(p.x*0.35 + t*1.1)*0.045 + sin(p.y*0.5 - t*0.9 + p.x*0.2)*0.035 + sin((p.x+p.y)*1.3 + t*2.1)*0.02,
    1.0,
    cos(p.y*0.3 + t*0.8)*0.045 + sin(p.x*0.45 + p.y*0.25 + t*1.4)*0.035 + cos((p.x-p.y)*1.1 - t*1.7)*0.02));
  vec3 r = reflect(v, n);
  float fres = pow(1.0 - max(dot(-v, n), 0.0), 3.0);
  float d = length(vWorld.xz - uCenter.xz);
  vec3 water = mix(uShallow, uDeep, smoothstep(70.0, 190.0, d)) * uLight;
  vec3 sky = mix(uHorizon, uSky, clamp(r.y * 1.6, 0.0, 1.0));
  vec3 col = mix(water, sky, clamp(fres * 0.85 + 0.08, 0.0, 1.0));
  float glint = pow(max(dot(r, uSunDir), 0.0), 220.0) + 0.25 * pow(max(dot(r, uSunDir), 0.0), 24.0);
  col += uSunCol * glint * 3.5;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export interface AtticView {
  group: THREE.Group;
  update(dt: number): void;
}

const WALLS = ['#fff6e8', '#fff6e8', '#fbead2', '#f6d6a8', '#ffe8d6', '#eef4f2', '#f4c7a1', '#ffd6e0', '#d8efe0', '#fff1c1'];
const ROOFS = ['#c8643c', '#b85a38', '#d67a4a', '#c05a3a'];
const GLASS = '#34425e';

export function buildAtticView(game: Game, root: THREE.Object3D): AtticView {
  const group = new THREE.Group();
  group.name = 'vista-atico';
  root.add(group);
  const rng = new Rng('vista-del-atico');
  const lambert = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

  // ── Mar ──
  const seaUniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color('#fff2d0') },
      uSky: { value: new THREE.Color('#3d86e2') }, uHorizon: { value: new THREE.Color('#c9e0f4') },
      uDeep: { value: new THREE.Color('#0e4f8f') }, uShallow: { value: new THREE.Color('#1fa3c4') },
      uTime: { value: 0 }, uLight: { value: 1 }, uCenter: { value: new THREE.Vector3() },
    },
  ]);
  const seaMat = new THREE.ShaderMaterial({ uniforms: seaUniforms, vertexShader: seaVS, fragmentShader: seaFS, fog: true });
  const sea = new THREE.Mesh(new THREE.CircleGeometry(470, 64).rotateX(-Math.PI / 2), seaMat);
  sea.position.set(CX, SEA_Y, CZ);
  sea.frustumCulled = false;
  group.add(sea);

  // ── Terreno ──
  const terr = new Batch();
  const STEP = 5, EXT = 230;
  const hCache = new Map<number, number>();
  const H = (i: number, j: number) => {
    const key = i * 10007 + j;
    let v = hCache.get(key);
    if (v === undefined) {
      v = viewHeight(CX + i * STEP, CZ + j * STEP);
      hCache.set(key, v);
    }
    return v;
  };
  const N = EXT / STEP;
  const cTmp = new THREE.Color();
  const grass = [new THREE.Color('#a9c96a'), new THREE.Color('#c2cf7c'), new THREE.Color('#d8c688'), new THREE.Color('#93bd63')];
  const sand = new THREE.Color('#f2dca0');
  const rock = new THREE.Color('#c9b28a');
  for (let i = -N; i < N; i++) {
    for (let j = -N; j < N; j++) {
      const x0 = CX + i * STEP, z0 = CZ + j * STEP;
      const h00 = H(i, j), h10 = H(i + 1, j), h01 = H(i, j + 1), h11 = H(i + 1, j + 1);
      const maxH = Math.max(h00, h10, h01, h11);
      if (maxH < SEA_Y - 1.2) continue; // bajo el mar no se ve
      const avg = (h00 + h10 + h01 + h11) / 4;
      const n = Math.sin(x0 * 0.05 + z0 * 0.03) + Math.cos(z0 * 0.07 - x0 * 0.02);
      if (avg < SEA_Y + 1.6) cTmp.copy(sand);
      else if (avg < SEA_Y + 2.4) cTmp.copy(rock);
      else cTmp.copy(grass[(Math.floor(n * 1.7 + 4) + (i & 1)) % 4]);
      const a = [x0, h00, z0], b = [x0 + STEP, h10, z0], c = [x0 + STEP, h11, z0 + STEP], d = [x0, h01, z0 + STEP];
      // (orden para que la normal mire arriba)
      terr.tri(a, d, c, cTmp);
      terr.tri(a, c, b, cTmp.clone().multiplyScalar(0.94));
    }
  }
  const terrain = new THREE.Mesh(terr.geometry(), lambert);
  terrain.receiveShadow = true;
  group.add(terrain);

  // ── El pueblo ──
  const town = new Batch();
  const lit = new Batch(); // ventanas que se encienden de noche
  const toAtticX = CX, toAtticZ = CZ;
  const placed: { x: number; z: number; r: number }[] = [];
  // plaza de la iglesia y el faro (sitios reservados)
  const church = { x: -48, z: 52 };
  const coastDir = (th: number) => {
    // distancia a la costa en una dirección
    for (let dd = 20; dd < 260; dd += 2) {
      const x = CX + Math.cos(th) * dd, z = CZ + Math.sin(th) * dd;
      if (viewHeight(x, z) < SEA_Y + 1.2) return dd;
    }
    return 260;
  };
  const lhTh = Math.PI * 0.84; // faro al noroeste
  const lhD = coastDir(lhTh) - 6;
  const lighthouse = { x: CX + Math.cos(lhTh) * lhD, z: CZ + Math.sin(lhTh) * lhD };
  placed.push({ x: church.x, z: church.z, r: 16 }, { x: lighthouse.x, z: lighthouse.z, r: 10 });

  const GRID = 10;
  for (let gx = -15; gx <= 15; gx++) {
    for (let gz = -15; gz <= 15; gz++) {
      // calles: cada tres filas/columnas se deja hueco
      if (gx % 3 === 0 || gz % 4 === 0) continue;
      const bx = CX + gx * GRID + rng.range(-1.8, 1.8);
      const bz = CZ + gz * GRID + rng.range(-1.8, 1.8);
      const dC = Math.hypot(bx - CX, bz - CZ);
      if (dC > 150) continue;
      const dR = distRect(bx, bz);
      if (dR < 7) continue;
      const hc = viewHeight(bx, bz);
      if (hc < SEA_Y + 2.6) continue;
      if (placed.some((p) => Math.hypot(p.x - bx, p.z - bz) < p.r)) continue;
      if (!rng.chance(0.86)) continue;
      const w = rng.range(5.5, 8.6), d = rng.range(5.5, 8.6);
      const ry = 0.1 + rng.range(-0.06, 0.06);
      // altura del suelo: la más baja de las esquinas (sin flotar en la cuesta)
      let base = Infinity;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) base = Math.min(base, viewHeight(bx + sx * w * 0.5, bz + sz * d * 0.5));
      base -= 0.6;
      const far = dC > 90 ? 1 : 0;
      const floors = rng.int(1, 3) + (rng.chance(0.25) ? 1 : 0) + far * rng.int(0, 2);
      const hh = floors * 3.1 + (hc - base);
      const wall = rng.pick(WALLS);
      const pitched = rng.chance(0.6);
      town.box(bx, base, bz, w, hh, d, ry, wall, pitched ? wall : '#e6ddcf');
      const topY = base + hh;
      if (pitched) {
        const rc = rng.pick(ROOFS);
        town.roof(bx, topY, bz, w, d, rng.range(1.3, 2.2), ry, rc, shadeHex(rc, 0.82));
      } else {
        // azotea: pretil, a veces piscina o depósito
        const co = Math.cos(ry), si = Math.sin(ry);
        town.box(bx + (w / 2 - 0.15) * co, topY, bz - (w / 2 - 0.15) * si, 0.3, 0.6, d, ry, wall);
        town.box(bx - (w / 2 - 0.15) * co, topY, bz + (w / 2 - 0.15) * si, 0.3, 0.6, d, ry, wall);
        if (rng.chance(0.35)) town.box(bx, topY, bz, w * 0.5, 0.12, d * 0.45, ry, '#39c6e8', '#5ad6f2');
        else if (rng.chance(0.4)) town.box(bx + 1, topY, bz - 1, 1.2, 1.4, 1.2, ry, '#cfd6dc');
      }
      // ventanas en las fachadas que miran al ático
      const co = Math.cos(ry), si = Math.sin(ry);
      // [normal x, normal z, anchura de la fachada, distancia al centro]
      const faces: [number, number, number, number][] = [
        [co, -si, d, w / 2], [-co, si, d, w / 2], [si, co, w, d / 2], [-si, -co, w, d / 2],
      ];
      const tx = toAtticX - bx, tz = toAtticZ - bz;
      const tl = Math.hypot(tx, tz) || 1;
      for (const [nx, nz, faceW, off] of faces) {
        const facing = (nx * tx + nz * tz) / tl;
        if (facing < 0.05) continue;
        const count = Math.max(1, Math.floor(faceW / 2.3));
        for (let f = 0; f < floors; f++) {
          const wy = topY - (floors - f) * 3.1 + 1.7;
          if (wy < hc - 0.2) continue;
          for (let k = 0; k < count; k++) {
            const t = (k + 0.5) / count - 0.5;
            // eje a lo largo de la fachada: r = up × n
            const px = bx + nx * off + nz * t * faceW;
            const pz = bz + nz * off - nx * t * faceW;
            const target = rng.chance(0.42) ? lit : town;
            target.facadeQuad(px, wy, pz, nx, nz, 0.95, 1.25, GLASS);
          }
        }
      }
      placed.push({ x: bx, z: bz, r: 3 });
    }
  }

  // ── Iglesia con cúpula azul ──
  const gb = new GeoBuilder();
  const chY = viewHeight(church.x, church.z) - 0.5;
  gb.box(9, 8, 15, '#fbf4e6', church.x, chY + 4, church.z, 0, 0.1, 0);
  gb.box(4.2, 18, 4.2, '#fbf4e6', church.x + 3.2, chY + 9, church.z + 7, 0, 0.1, 0);
  gb.box(4.6, 0.6, 4.6, '#e8dcc4', church.x + 3.2, chY + 18.2, church.z + 7, 0, 0.1, 0);
  gb.cyl(0.1, 2.2, 3, 4, '#2f6fd6', church.x + 3.2, chY + 20, church.z + 7, 0, Math.PI / 4 + 0.1, 0);
  gb.sphere(4.4, '#2f6fd6', church.x - 0.4, chY + 8, church.z - 2, 1, 1, 0.9, 1);
  gb.box(0.25, 1.6, 0.25, '#ffd23f', church.x - 0.4, chY + 13.2, church.z - 2);
  gb.box(1.0, 0.25, 0.25, '#ffd23f', church.x - 0.4, chY + 13.4, church.z - 2);
  // plaza
  gb.box(26, 0.3, 26, '#efe3c8', church.x, chY + 0.3, church.z, 0, 0.1, 0);

  // ── Faro ──
  const lhY = viewHeight(lighthouse.x, lighthouse.z) - 0.3;
  for (let s = 0; s < 6; s++) gb.cyl(1.55 - s * 0.12, 1.65 - s * 0.12, 2.4, 10, s % 2 ? '#e63946' : '#ffffff', lighthouse.x, lhY + 1.2 + s * 2.4, lighthouse.z);
  gb.cyl(1.3, 1.3, 0.3, 10, '#2b2d42', lighthouse.x, lhY + 14.6, lighthouse.z);
  gb.cyl(0.2, 1.1, 1.3, 8, '#2b2d42', lighthouse.x, lhY + 17.3, lighthouse.z);
  gb.box(5, 1.5, 4, '#fff6e8', lighthouse.x + 3, lhY + 0.75, lighthouse.z + 1);

  // ── Puerto al norte: espigón, contenedores y grúas ──
  const hTh = -Math.PI * 0.62;
  const hD = coastDir(hTh);
  const hx = CX + Math.cos(hTh) * hD, hz = CZ + Math.sin(hTh) * hD;
  const pierDir = hTh;
  for (let p = 0; p < 3; p++) {
    const px = hx + Math.cos(pierDir + Math.PI / 2) * (p - 1) * 26;
    const pz = hz + Math.sin(pierDir + Math.PI / 2) * (p - 1) * 26;
    const len = 34 + p * 6;
    const mx = px + Math.cos(pierDir) * len / 2, mz = pz + Math.sin(pierDir) * len / 2;
    gb.box(8, 1.4, len, '#b8b2a6', mx, SEA_Y + 0.2, mz, 0, Math.PI / 2 - pierDir, 0);
    const cols = ['#ff7b54', '#2ec4b6', '#6c3bd1', '#ffd23f', '#ff4f81', '#3a86ff'];
    for (let c = 0; c < 6; c++) {
      const along = -len / 2 + 5 + c * 4.6;
      const cx = mx + Math.cos(pierDir) * along, cz = mz + Math.sin(pierDir) * along;
      gb.box(2.4, 2.4, 4.2, cols[(c + p) % 6], cx, SEA_Y + 2.1, cz, 0, Math.PI / 2 - pierDir, 0);
      if ((c + p) % 3 === 0) gb.box(2.4, 2.4, 4.2, cols[(c + p + 2) % 6], cx, SEA_Y + 4.5, cz, 0, Math.PI / 2 - pierDir, 0);
    }
    if (p !== 1) {
      // grúa naranja
      const gx = mx + Math.cos(pierDir) * (len / 2 - 4), gz = mz + Math.sin(pierDir) * (len / 2 - 4);
      const ry = Math.PI / 2 - pierDir;
      for (const s of [-1.6, 1.6]) for (const t of [-1.6, 1.6]) {
        const lx = gx + Math.cos(ry) * s + Math.sin(ry) * t, lz = gz - Math.sin(ry) * s + Math.cos(ry) * t;
        gb.box(0.5, 16, 0.5, '#ff8a1f', lx, SEA_Y + 8.9, lz, 0, ry, 0);
      }
      gb.box(4.2, 1.2, 4.2, '#ff8a1f', gx, SEA_Y + 17.4, gz, 0, ry, 0);
      gb.box(1, 1, 26, '#ff8a1f', gx, SEA_Y + 18.4, gz, 0, ry + 0.6 * (p - 1), 0);
      gb.box(2.2, 2, 3, '#ffd23f', gx, SEA_Y + 19.6, gz, 0, ry, 0);
    }
  }

  // ── Palmeras en el paseo ──
  for (let k = 0; k < 44; k++) {
    const th = Math.PI * 0.35 + (k / 44) * Math.PI * 1.1;
    const dd = coastDir(th) - 4.5;
    const x = CX + Math.cos(th) * dd, z = CZ + Math.sin(th) * dd;
    const y = viewHeight(x, z);
    if (y < SEA_Y + 1) continue;
    const lean = rng.range(-0.15, 0.15);
    gb.cyl(0.18, 0.28, 6.5, 5, '#8a5a33', x, y + 3.2, z, lean, 0, lean * 0.5);
    for (let l = 0; l < 6; l++) {
      const a = (l / 6) * Math.PI * 2 + rng.next();
      gb.add(new THREE.ConeGeometry(0.5, 3.6, 3), '#3fae4f', x + Math.cos(a) * 1.4 + lean * 3, y + 6.4, z + Math.sin(a) * 1.4, Math.PI / 2 - 0.35, -a + Math.PI / 2, 0, 1, 1, 0.3);
    }
  }

  // ── El edificio del ático y su terraza (bajo los ventanales) ──
  const facade = '#f7f1e6';
  const TX = -TERRACE; // borde de la terraza
  const bw = 24.4 - (TX - 0.2);
  gb.box(bw, -BASE_Y - 0.3, 20.4, facade, (24.4 + TX - 0.2) / 2, (BASE_Y - 0.3) / 2, 9, 0, 0, 0);
  const floors = Math.floor((-BASE_Y - 1) / 3.1);
  for (let f = 0; f < floors; f++) {
    const y = -2.2 - f * 3.1;
    gb.box(bw + 0.2, 0.35, 20.6, '#e2d6c0', (24.4 + TX - 0.2) / 2, y - 1.1, 9); // bandas de forjado
    for (let k = 0; k < 8; k++) gb.box(1.8, 1.6, 0.1, GLASS, TX + 1.2 + k * 3.4, y + 0.3, -1.25);
    for (let k = 0; k < 6; k++) gb.box(0.1, 1.6, 1.8, GLASS, TX - 0.25, y + 0.3, 0.5 + k * 3.4);
    // balcones con toldo
    for (let k = 0; k < 3; k++) {
      gb.box(0.9, 0.12, 2.6, '#e2d6c0', TX - 0.65, y - 0.55, 2.2 + k * 6);
      gb.box(0.05, 0.8, 2.6, '#dfe6ee', TX - 1.08, y - 0.1, 2.2 + k * 6);
      gb.box(0.9, 0.08, 2.7, k % 2 ? '#ff4f81' : '#2ec4b6', TX - 0.6, y + 1.35, 2.2 + k * 6, 0, 0, 0.35);
    }
  }
  // terraza (tarima), barandilla de cristal y trastos de verano
  for (let k = 0; k < 18; k++) gb.box(TERRACE + 0.1, 0.12, 1.12, k % 2 ? '#b98655' : '#a8754a', TX / 2, -0.06, -0.6 + k * 1.14);
  gb.box(0.12, 0.08, 20.4, '#dfe6ee', TX - 0.1, 1.12, 9.1);
  gb.box(TERRACE + 0.2, 0.08, 0.12, '#dfe6ee', TX / 2, 1.12, -1.1);
  gb.box(TERRACE + 0.2, 0.08, 0.12, '#dfe6ee', TX / 2, 1.12, 19.3);
  for (let k = 0; k < 8; k++) gb.box(0.09, 1.1, 0.09, '#dfe6ee', TX - 0.1, 0.55, -1 + k * 2.9);
  // tumbonas
  for (const z of [3.2, 6.2]) {
    gb.box(0.9, 0.3, 2.0, '#ffffff', TX / 2, 0.3, z);
    gb.box(0.9, 0.6, 0.12, '#ffffff', TX / 2, 0.6, z - 1.0, -0.6, 0, 0);
    gb.box(0.85, 0.1, 1.2, '#ff4f81', TX / 2, 0.5, z + 0.3);
  }
  // sombrilla rosa
  gb.cyl(0.05, 0.05, 2.4, 6, '#dddddd', TX / 2, 1.2, 4.7);
  gb.cyl(0.05, 1.7, 0.6, 8, '#ff4f81', TX / 2, 2.5, 4.7);
  // macetones con palmera enana
  for (const z of [0.2, 10.5, 16.5]) {
    gb.cyl(0.45, 0.35, 0.8, 8, '#d4af37', TX + 0.7, 0.4, z);
    gb.cyl(0.08, 0.12, 1.4, 5, '#8a5a33', TX + 0.7, 1.4, z);
    for (let l = 0; l < 5; l++) {
      const a = (l / 5) * Math.PI * 2;
      gb.add(new THREE.ConeGeometry(0.28, 1.6, 3), '#3fae4f', TX + 0.7 + Math.cos(a) * 0.6, 2.1, z + Math.sin(a) * 0.6, Math.PI / 2 - 0.4, -a + Math.PI / 2, 0, 1, 1, 0.3);
    }
  }

  // todo lo fijo en una sola malla
  const townGeo = town.geometry();
  const extraGeo = gb.build();
  const staticGeo = mergeGeometries([townGeo, extraGeo], false)!;
  townGeo.dispose();
  extraGeo.dispose();
  staticGeo.computeBoundingSphere();
  const townMesh = new THREE.Mesh(staticGeo, lambert);
  townMesh.receiveShadow = true;
  townMesh.castShadow = false;
  group.add(townMesh);

  // ventanas que se encienden de noche (emisivo)
  const litMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: '#ffbe62', emissiveIntensity: 0 });
  const litMesh = new THREE.Mesh(lit.geometry(), litMat);
  group.add(litMesh);

  // cristal de la barandilla de la terraza
  const railGlass = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 1.05, 20.4),
    new THREE.MeshBasicMaterial({ color: '#bfe9ff', transparent: true, opacity: 0.18, depthWrite: false }),
  );
  railGlass.position.set(TX - 0.1, 0.55, 9.1);
  group.add(railGlass);

  // luz del faro (de noche) con haz que gira
  const lampMat = new THREE.MeshBasicMaterial({ color: '#fff3b0', toneMapped: false });
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.4, 10), lampMat);
  lamp.position.set(lighthouse.x, lhY + 15.8, lighthouse.z);
  group.add(lamp);
  const beamGeo = new THREE.ConeGeometry(4, 60, 12, 1, true).translate(0, -30, 0).rotateZ(Math.PI / 2);
  const beamTex = (() => {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 64;
    const g = c.getContext('2d')!;
    const l = g.createLinearGradient(0, 0, 0, 64);
    l.addColorStop(0, 'rgba(255,255,255,0.9)');
    l.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = l;
    g.fillRect(0, 0, 4, 64);
    const t = new THREE.CanvasTexture(c);
    return t;
  })();
  const beamMat = new THREE.MeshBasicMaterial({ color: '#fff0b0', map: beamTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.copy(lamp.position);
  group.add(beam);

  // barquitos que se mecen (InstancedMesh)
  const bb = new GeoBuilder();
  bb.box(1.4, 0.7, 4.2, '#ffffff', 0, 0.2, 0);
  bb.add(new THREE.ConeGeometry(0.7, 1.4, 4), '#ffffff', 0, 0.2, 2.6, Math.PI / 2, Math.PI / 4, 0, 1, 1, 0.5);
  bb.box(1.2, 0.2, 3.6, '#2b6cb0', 0, 0.62, -0.1);
  bb.box(0.1, 5.2, 0.1, '#dddddd', 0, 3.2, 0.3);
  bb.add(new THREE.ConeGeometry(1.6, 4.4, 3), '#fff8e8', 0, 3.1, -0.4, 0, Math.PI / 2, 0, 0.12, 1, 1);
  const boats = new THREE.InstancedMesh(bb.build(), lambert, 7);
  const boatInfo: { x: number; z: number; ry: number; ph: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const th = Math.PI * (0.62 + i * 0.12) + rng.range(-0.05, 0.05);
    const dd = coastDir(th) + 40 + rng.range(0, 90);
    boatInfo.push({ x: CX + Math.cos(th) * dd, z: CZ + Math.sin(th) * dd, ry: rng.range(0, 6.28), ph: rng.range(0, 6.28) });
  }
  boats.frustumCulled = false;
  group.add(boats);
  const dm = new THREE.Object3D();

  let t = 0;
  const update = (dt: number) => {
    t += dt;
    const dn = game.mod.dayNight;
    const U = seaMat.uniforms;
    U.uTime.value = t;
    group.getWorldPosition(U.uCenter.value);
    U.uCenter.value.x += CX;
    U.uCenter.value.z += CZ;
    if (dn) {
      U.uSunDir.value.copy(dn.lightDirection);
      U.uSunCol.value.copy(dn.sun.color).multiplyScalar(Math.min(1.4, dn.sun.intensity * 0.5));
      U.uSky.value.copy(dn.zenithColor);
      U.uHorizon.value.copy(dn.horizonColor);
      const hc = dn.hemi.color;
      const lum = hc.r * 0.3 + hc.g * 0.59 + hc.b * 0.11;
      U.uLight.value = lum * dn.hemi.intensity * 0.6 + dn.sun.intensity * 0.12;
    }
    const night = game.night;
    litMat.emissiveIntensity = Math.max(0, night * 1.1 - 0.05);
    const on = Math.max(0, Math.min(1, (night - 0.3) / 0.4));
    lampMat.color.setRGB(0.35 + on * 1.2, 0.33 + on * 1.1, 0.25 + on * 0.6);
    beamMat.opacity = on * 0.22;
    beam.visible = on > 0.01;
    beam.rotation.y = t * 0.6;
    for (let i = 0; i < boatInfo.length; i++) {
      const b = boatInfo[i];
      dm.position.set(b.x + Math.sin(t * 0.05 + b.ph) * 6, SEA_Y + Math.sin(t * 1.3 + b.ph) * 0.15, b.z + Math.cos(t * 0.04 + b.ph) * 6);
      dm.rotation.set(Math.sin(t * 1.1 + b.ph) * 0.06, b.ry + t * 0.01, Math.sin(t * 0.9 + b.ph * 2) * 0.08);
      dm.updateMatrix();
      boats.setMatrixAt(i, dm.matrix);
    }
    boats.instanceMatrix.needsUpdate = true;
  };
  update(0);
  return { group, update };
}

function shadeHex(hex: string, f: number): string {
  const c = new THREE.Color(hex).multiplyScalar(f);
  return '#' + c.getHexString();
}
