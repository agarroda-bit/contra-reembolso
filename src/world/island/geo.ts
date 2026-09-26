// Constructor de geometría fusionada con colores por vértice y "emisión" por vértice.
// Todo lo estático del mundo se acumula aquí y se convierte en pocas mallas grandes.
import * as THREE from 'three';

const _col = new THREE.Color();
const ZERO4: readonly number[] = [0, 0, 0, 0];

export type Col = number | string;

/** Emisión por vértice: [r, g, b, nivel]. nivel = brillo de día (0..1); de noche sube a 1. >= 2 = bombillas intermitentes (fase = nivel - 2). */
export type Emit = readonly number[];

/** Color sRGB -> lineal (lo que espera three para colores de vértice). */
export function lin(c: Col, out: THREE.Color = _col): THREE.Color {
  return out.set(c as any);
}

export function emitOf(c: Col, level = 0, strength = 1): number[] {
  const k = lin(c);
  return [k.r * strength, k.g * strength, k.b * strength, level];
}

// Bits para saltarse caras de una caja
export const SKIP = { PX: 1, NX: 2, PY: 4, NY: 8, PZ: 16, NZ: 32 } as const;

// Caras de la caja unitaria: normal, u, v (u x v = n)
const FACES: [number[], number[], number[], number][] = [
  [[1, 0, 0], [0, 1, 0], [0, 0, 1], SKIP.PX],
  [[-1, 0, 0], [0, 0, 1], [0, 1, 0], SKIP.NX],
  [[0, 1, 0], [0, 0, 1], [1, 0, 0], SKIP.PY],
  [[0, -1, 0], [1, 0, 0], [0, 0, 1], SKIP.NY],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0], SKIP.PZ],
  [[0, 0, -1], [0, 1, 0], [1, 0, 0], SKIP.NZ],
];

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Euler();

export class GeoBuilder {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  emi: number[] = [];
  uv: number[] = [];
  withUv = false;

  // marco local (origen + giro en Y)
  private ox = 0;
  private oy = 0;
  private oz = 0;
  private rc = 1;
  private rs = 0;
  private rot = 0;

  get vertexCount() {
    return this.pos.length / 3;
  }

  frame(x: number, y: number, z: number, rotY = 0): this {
    this.ox = x;
    this.oy = y;
    this.oz = z;
    this.rot = rotY;
    this.rc = Math.cos(rotY);
    this.rs = Math.sin(rotY);
    return this;
  }
  resetFrame(): this {
    return this.frame(0, 0, 0, 0);
  }
  /** Punto local -> mundo. */
  wx(x: number, z: number) {
    return this.ox + x * this.rc + z * this.rs;
  }
  wz(x: number, z: number) {
    return this.oz - x * this.rs + z * this.rc;
  }
  wy(y: number) {
    return this.oy + y;
  }
  get frameRot() {
    return this.rot;
  }

  /**
   * Capa aparte del mismo trozo, con el marco actual (los toldos van ahí: se dibujan con un material
   * que se abre alrededor del vehículo para que la lona no lo tape).
   */
  layer: GeoBuilder | null = null;
  sub(): GeoBuilder {
    if (!this.layer) this.layer = new GeoBuilder();
    return this.layer.frame(this.ox, this.oy, this.oz, this.rot);
  }

  /** Matriz del marco actual. */
  frameMatrix(out = new THREE.Matrix4()): THREE.Matrix4 {
    _q.setFromAxisAngle(_v.set(0, 1, 0), this.rot);
    return out.compose(_p.set(this.ox, this.oy, this.oz), _q, _s.set(1, 1, 1));
  }

  private pushV(x: number, y: number, z: number, nx: number, ny: number, nz: number, c: THREE.Color, e: Emit, u = 0, v = 0) {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.col.push(c.r, c.g, c.b);
    this.emi.push(e[0], e[1], e[2], e[3]);
    if (this.withUv) this.uv.push(u, v);
  }

  /** Triángulo en coordenadas de mundo (antihorario visto desde delante). */
  triW(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    color: Col | THREE.Color, emit: Emit = ZERO4,
  ) {
    const c = color instanceof THREE.Color ? color : lin(color);
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    this.pushV(ax, ay, az, nx, ny, nz, c, emit);
    this.pushV(bx, by, bz, nx, ny, nz, c, emit);
    this.pushV(cx, cy, cz, nx, ny, nz, c, emit);
  }

  /** Cuadrilátero en mundo (a,b,c,d antihorario). */
  quadW(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number,
    color: Col | THREE.Color, emit: Emit = ZERO4,
  ) {
    const c = color instanceof THREE.Color ? color.clone() : lin(color).clone();
    this.triW(ax, ay, az, bx, by, bz, cx, cy, cz, c, emit);
    this.triW(ax, ay, az, cx, cy, cz, dx, dy, dz, c, emit);
  }

  /** Cuadrilátero con UV (para carteles). */
  quadUvW(
    p: number[][], uvs: number[][], color: Col = '#ffffff', emit: Emit = ZERO4,
  ) {
    const c = lin(color).clone();
    const [a, b, cc, d] = p;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = cc[0] - a[0], vy = cc[1] - a[1], vz = cc[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const order = [0, 1, 2, 0, 2, 3];
    for (const i of order) this.pushV(p[i][0], p[i][1], p[i][2], nx, ny, nz, c, emit, uvs[i][0], uvs[i][1]);
  }

  /** Cuadrilátero en coordenadas locales del marco. */
  quadL(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number,
    color: Col | THREE.Color, emit: Emit = ZERO4,
  ) {
    this.quadW(
      this.wx(ax, az), this.wy(ay), this.wz(ax, az),
      this.wx(bx, bz), this.wy(by), this.wz(bx, bz),
      this.wx(cx, cz), this.wy(cy), this.wz(cx, cz),
      this.wx(dx, dz), this.wy(dy), this.wz(dx, dz),
      color, emit,
    );
  }

  /**
   * Rectángulo vertical pegado a una fachada, en coordenadas locales: centrado en (x, y) sobre el
   * plano z = zf, mirando a +Z local. w x h.
   */
  panelZ(x: number, y: number, zf: number, w: number, h: number, color: Col | THREE.Color, emit: Emit = ZERO4) {
    const x0 = x - w / 2, x1 = x + w / 2, y0 = y - h / 2, y1 = y + h / 2;
    this.quadL(x0, y0, zf, x1, y0, zf, x1, y1, zf, x0, y1, zf, color, emit);
  }
  /** Igual pero en un plano x = xf mirando a +X (sign=1) o -X (sign=-1). */
  panelX(z: number, y: number, xf: number, w: number, h: number, sign: number, color: Col | THREE.Color, emit: Emit = ZERO4) {
    const y0 = y - h / 2, y1 = y + h / 2;
    if (sign > 0) {
      const z0 = z + w / 2, z1 = z - w / 2;
      this.quadL(xf, y0, z0, xf, y0, z1, xf, y1, z1, xf, y1, z0, color, emit);
    } else {
      const z0 = z - w / 2, z1 = z + w / 2;
      this.quadL(xf, y0, z0, xf, y0, z1, xf, y1, z1, xf, y1, z0, color, emit);
    }
  }

  /** Caja en coordenadas locales (centro y tamaños). rotY extra alrededor de su centro. */
  box(
    cx: number, cy: number, cz: number,
    sx: number, sy: number, sz: number,
    color: Col | THREE.Color, skip = 0, emit: Emit = ZERO4, rotY = 0,
  ) {
    const c = color instanceof THREE.Color ? color.clone() : lin(color).clone();
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const cr = Math.cos(rotY), sr = Math.sin(rotY);
    const corner: number[] = [0, 0, 0];
    const P: number[][] = [[], [], [], []];
    for (const [n, u, v, bit] of FACES) {
      if (skip & bit) continue;
      const sgn = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (let k = 0; k < 4; k++) {
        const a = sgn[k][0], b = sgn[k][1];
        corner[0] = (n[0] + u[0] * a + v[0] * b) * hx;
        corner[1] = (n[1] + u[1] * a + v[1] * b) * hy;
        corner[2] = (n[2] + u[2] * a + v[2] * b) * hz;
        // giro propio
        const lx = corner[0] * cr + corner[2] * sr + cx;
        const lz = -corner[0] * sr + corner[2] * cr + cz;
        P[k] = [this.wx(lx, lz), this.wy(corner[1] + cy), this.wz(lx, lz)];
      }
      this.triW(P[0][0], P[0][1], P[0][2], P[1][0], P[1][1], P[1][2], P[2][0], P[2][1], P[2][2], c, emit);
      this.triW(P[0][0], P[0][1], P[0][2], P[2][0], P[2][1], P[2][2], P[3][0], P[3][1], P[3][2], c, emit);
    }
  }

  /** Caja transformada por una matriz de mundo (la caja unitaria va de -0.5 a 0.5). */
  boxMat(m: THREE.Matrix4, color: Col | THREE.Color, skip = 0, emit: Emit = ZERO4) {
    const c = color instanceof THREE.Color ? color.clone() : lin(color).clone();
    const P: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const sgn = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [n, u, v, bit] of FACES) {
      if (skip & bit) continue;
      for (let k = 0; k < 4; k++) {
        const a = sgn[k][0], b = sgn[k][1];
        P[k].set((n[0] + u[0] * a + v[0] * b) * 0.5, (n[1] + u[1] * a + v[1] * b) * 0.5, (n[2] + u[2] * a + v[2] * b) * 0.5).applyMatrix4(m);
      }
      this.triW(P[0].x, P[0].y, P[0].z, P[1].x, P[1].y, P[1].z, P[2].x, P[2].y, P[2].z, c, emit);
      this.triW(P[0].x, P[0].y, P[0].z, P[2].x, P[2].y, P[2].z, P[3].x, P[3].y, P[3].z, c, emit);
    }
  }

  /** Caja local con giro arbitrario (euler XYZ en radianes, aplicado sobre el marco). */
  boxRot(
    cx: number, cy: number, cz: number, sx: number, sy: number, sz: number,
    rx: number, ry: number, rz: number, color: Col | THREE.Color, skip = 0, emit: Emit = ZERO4,
  ) {
    const fm = this.frameMatrix(new THREE.Matrix4());
    _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ'));
    _m.compose(_p.set(cx, cy, cz), _q, _s.set(sx, sy, sz));
    fm.multiply(_m);
    this.boxMat(fm, color, skip, emit);
  }

  /** Barra de sección cuadrada entre dos puntos de MUNDO (cables, cuerdas, barandillas). */
  beam(ax: number, ay: number, az: number, bx: number, by: number, bz: number, t: number, color: Col | THREE.Color, emit: Emit = ZERO4) {
    _p.set(bx - ax, by - ay, bz - az);
    const L = _p.length();
    if (L < 1e-4) return;
    _p.multiplyScalar(1 / L);
    _q.setFromUnitVectors(_v.set(0, 0, 1), _p);
    _m.compose(_p.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), _q, _s.set(t, t, L));
    this.boxMat(_m, color, 0, emit);
  }

  /** Cilindro/tronco de cono vertical en coordenadas locales. */
  cyl(
    cx: number, y0: number, cz: number, r0: number, r1: number, h: number, seg: number,
    color: Col | THREE.Color, capTop = true, capBottom = false, emit: Emit = ZERO4, phase = 0,
  ) {
    const c = color instanceof THREE.Color ? color.clone() : lin(color).clone();
    const y1 = y0 + h;
    for (let i = 0; i < seg; i++) {
      const a0 = phase + (i / seg) * Math.PI * 2, a1 = phase + ((i + 1) / seg) * Math.PI * 2;
      const x0 = cx + Math.cos(a0) * r0, z0 = cz + Math.sin(a0) * r0;
      const x1 = cx + Math.cos(a1) * r0, z1 = cz + Math.sin(a1) * r0;
      const x2 = cx + Math.cos(a1) * r1, z2 = cz + Math.sin(a1) * r1;
      const x3 = cx + Math.cos(a0) * r1, z3 = cz + Math.sin(a0) * r1;
      // lado (visto desde fuera: antihorario)
      if (r1 > 0.0001) {
        this.quadW(
          this.wx(x1, z1), this.wy(y0), this.wz(x1, z1),
          this.wx(x0, z0), this.wy(y0), this.wz(x0, z0),
          this.wx(x3, z3), this.wy(y1), this.wz(x3, z3),
          this.wx(x2, z2), this.wy(y1), this.wz(x2, z2),
          c, emit,
        );
      } else {
        this.triW(
          this.wx(x1, z1), this.wy(y0), this.wz(x1, z1),
          this.wx(x0, z0), this.wy(y0), this.wz(x0, z0),
          this.wx(cx, cz), this.wy(y1), this.wz(cx, cz),
          c, emit,
        );
      }
      if (capTop && r1 > 0.0001) {
        this.triW(
          this.wx(cx, cz), this.wy(y1), this.wz(cx, cz),
          this.wx(x2, z2), this.wy(y1), this.wz(x2, z2),
          this.wx(x3, z3), this.wy(y1), this.wz(x3, z3),
          c, emit,
        );
      }
      if (capBottom) {
        this.triW(
          this.wx(cx, cz), this.wy(y0), this.wz(cx, cz),
          this.wx(x0, z0), this.wy(y0), this.wz(x0, z0),
          this.wx(x1, z1), this.wy(y0), this.wz(x1, z1),
          c, emit,
        );
      }
    }
  }

  /** Tejado a cuatro aguas (o a dos si gable) sobre un rectángulo w (x) por d (z), altura h. */
  roof(cx: number, y0: number, cz: number, w: number, d: number, h: number, color: Col, endColor: Col, gable = false) {
    const hw = w / 2, hd = d / 2;
    const along = w >= d; // cumbrera a lo largo de x si es más ancho
    if (along) {
      const r = gable ? hw : Math.max(0.01, hw - hd);
      // faldón sur (+z) y norte (-z)
      this.quadL(cx - hw, y0, cz + hd, cx + hw, y0, cz + hd, cx + r, y0 + h, cz, cx - r, y0 + h, cz, color);
      this.quadL(cx + hw, y0, cz - hd, cx - hw, y0, cz - hd, cx - r, y0 + h, cz, cx + r, y0 + h, cz, color);
      // hastiales / faldones laterales
      const ec = gable ? endColor : color;
      this.triL(cx + hw, y0, cz + hd, cx + hw, y0, cz - hd, cx + r, y0 + h, cz, ec);
      this.triL(cx - hw, y0, cz - hd, cx - hw, y0, cz + hd, cx - r, y0 + h, cz, ec);
    } else {
      const r = gable ? hd : Math.max(0.01, hd - hw);
      this.quadL(cx + hw, y0, cz + hd, cx + hw, y0, cz - hd, cx, y0 + h, cz - r, cx, y0 + h, cz + r, color);
      this.quadL(cx - hw, y0, cz - hd, cx - hw, y0, cz + hd, cx, y0 + h, cz + r, cx, y0 + h, cz - r, color);
      const ec = gable ? endColor : color;
      this.triL(cx - hw, y0, cz + hd, cx + hw, y0, cz + hd, cx, y0 + h, cz + r, ec);
      this.triL(cx + hw, y0, cz - hd, cx - hw, y0, cz - hd, cx, y0 + h, cz - r, ec);
    }
  }

  triL(
    ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number,
    color: Col | THREE.Color, emit: Emit = ZERO4,
  ) {
    this.triW(
      this.wx(ax, az), this.wy(ay), this.wz(ax, az),
      this.wx(bx, bz), this.wy(by), this.wz(bx, bz),
      this.wx(cx, cz), this.wy(cy), this.wz(cx, cz),
      color, emit,
    );
  }

  /** Bola facetada (icosaedro achatado) para copas y rocas. */
  blob(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, color: Col, jitter = 0, seed = 1) {
    const g = BLOB;
    const c = lin(color).clone();
    const c2 = c.clone().multiplyScalar(0.9);
    const p = g.attributes.position as THREE.BufferAttribute;
    const idx = g.index!;
    const tmp: number[][] = [];
    for (let i = 0; i < p.count; i++) {
      const j = jitter ? 1 + Math.sin(i * 12.9898 + seed * 78.233) * jitter : 1;
      const lx = p.getX(i) * rx * j + cx, ly = p.getY(i) * ry * j + cy, lz = p.getZ(i) * rz * j + cz;
      tmp.push([this.wx(lx, lz), this.wy(ly), this.wz(lx, lz)]);
    }
    for (let i = 0; i < idx.count; i += 3) {
      const a = tmp[idx.getX(i)], b = tmp[idx.getX(i + 1)], d = tmp[idx.getX(i + 2)];
      this.triW(a[0], a[1], a[2], b[0], b[1], b[2], d[0], d[1], d[2], (i / 3) % 3 === 0 ? c2 : c);
    }
  }

  /** Añade la geometría de otro constructor (ya en mundo). */
  append(o: GeoBuilder) {
    for (const v of o.pos) this.pos.push(v);
    for (const v of o.nor) this.nor.push(v);
    for (const v of o.col) this.col.push(v);
    for (const v of o.emi) this.emi.push(v);
    if (this.withUv) for (const v of o.uv) this.uv.push(v);
  }

  toGeometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aEmit', new THREE.Float32BufferAttribute(this.emi, 4));
    if (this.withUv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const BLOB = (() => {
  const g = new THREE.IcosahedronGeometry(1, 0);
  // índice propio (la de three viene sin índice)
  const merged = mergeVerts(g);
  return merged;
})();

function mergeVerts(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const p = g.attributes.position as THREE.BufferAttribute;
  const verts: number[][] = [];
  const index: number[] = [];
  const key = (x: number, y: number, z: number) => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
  const map = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    const k = key(p.getX(i), p.getY(i), p.getZ(i));
    let id = map.get(k);
    if (id === undefined) {
      id = verts.length;
      verts.push([p.getX(i), p.getY(i), p.getZ(i)]);
      map.set(k, id);
    }
    index.push(id);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(verts.flat(), 3));
  out.setIndex(index);
  return out;
}

/** Trocea lo estático en cuadrados de `chunk` metros (para que la cámara descarte lo que no ve). */
export class ChunkSet {
  readonly map = new Map<number, GeoBuilder>();
  constructor(readonly half: number, readonly chunk: number) {}
  key(x: number, z: number) {
    const n = Math.ceil((this.half * 2) / this.chunk);
    const ix = Math.max(0, Math.min(n - 1, Math.floor((x + this.half) / this.chunk)));
    const iz = Math.max(0, Math.min(n - 1, Math.floor((z + this.half) / this.chunk)));
    return iz * n + ix;
  }
  at(x: number, z: number): GeoBuilder {
    const k = this.key(x, z);
    let b = this.map.get(k);
    if (!b) this.map.set(k, (b = new GeoBuilder()));
    return b;
  }
  toMeshes(material: THREE.Material, name: string, cast: boolean, receive: boolean, layer = false): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [k, b0] of this.map) {
      const b = layer ? b0.layer : b0;
      if (!b || !b.pos.length) continue;
      const m = new THREE.Mesh(b.toGeometry(), material);
      m.name = `${name}-${k}`;
      m.castShadow = cast;
      m.receiveShadow = receive;
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      out.push(m);
    }
    return out;
  }
  triangles() {
    let t = 0;
    for (const b of this.map.values()) t += b.pos.length / 9;
    return t;
  }
}
