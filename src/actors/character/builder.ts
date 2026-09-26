// Constructor de geometría low-poly para el muñeco: primitivas pegadas a huesos,
// color por vértice y skinning rígido (cada vértice pesa 1 en su hueso).
import * as THREE from 'three';
import { BIND_WORLD } from './skeleton';

type V3 = [number, number, number];

export interface Ring {
  y: number;
  hx: number;
  hz: number;
  /** Chaflán de las esquinas (0 = caja). */
  ch?: number;
  /** Desplazamiento del centro del anillo. */
  cx?: number;
  cz?: number;
}

const _c = new THREE.Color();
const _v = new THREE.Vector3();

export class MeshBuilder {
  private pos: number[] = [];
  private col: number[] = [];
  private skin: number[] = [];
  private bone = 0;
  private ox = 0;
  private oy = 0;
  private oz = 0;
  private r = 1;
  private g = 1;
  private b = 1;
  private mat: THREE.Matrix4 | null = null;

  /** Las coordenadas siguientes son locales a este hueso (en reposo). */
  setBone(i: number): this {
    this.bone = i;
    const w = BIND_WORLD[i];
    this.ox = w[0];
    this.oy = w[1];
    this.oz = w[2];
    return this;
  }

  color(c: string | THREE.Color): this {
    if (typeof c === 'string') _c.set(c);
    else _c.copy(c);
    this.r = _c.r;
    this.g = _c.g;
    this.b = _c.b;
    return this;
  }

  /** Ejecuta fn con una rotación (Euler XYZ) alrededor del pivote (coordenadas locales del hueso). */
  rotated(rx: number, ry: number, rz: number, px: number, py: number, pz: number, fn: () => void) {
    const prev = this.mat;
    const m = new THREE.Matrix4().makeTranslation(px, py, pz);
    m.multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
    m.multiply(new THREE.Matrix4().makeTranslation(-px, -py, -pz));
    this.mat = prev ? prev.clone().multiply(m) : m;
    fn();
    this.mat = prev;
  }

  private tx(p: V3): V3 {
    if (!this.mat) return p;
    _v.set(p[0], p[1], p[2]).applyMatrix4(this.mat);
    return [_v.x, _v.y, _v.z];
  }

  private push(p: V3) {
    this.pos.push(p[0] + this.ox, p[1] + this.oy, p[2] + this.oz);
    this.col.push(this.r, this.g, this.b);
    this.skin.push(this.bone);
  }

  /** Triángulo orientado hacia fuera: `ref` es un punto interior (o una normal si isNormal). */
  tri(a: V3, b: V3, c: V3, ref: V3, isNormal = false) {
    const ta = this.tx(a), tb = this.tx(b), tc = this.tx(c);
    let rx: number, ry: number, rz: number;
    if (isNormal) {
      if (this.mat) {
        _v.set(ref[0], ref[1], ref[2]).transformDirection(this.mat);
        rx = _v.x; ry = _v.y; rz = _v.z;
      } else {
        rx = ref[0]; ry = ref[1]; rz = ref[2];
      }
    } else {
      const tr = this.tx(ref);
      rx = ta[0] - tr[0]; ry = ta[1] - tr[1]; rz = ta[2] - tr[2];
    }
    const ux = tb[0] - ta[0], uy = tb[1] - ta[1], uz = tb[2] - ta[2];
    const vx = tc[0] - ta[0], vy = tc[1] - ta[1], vz = tc[2] - ta[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * rx + ny * ry + nz * rz >= 0) {
      this.push(ta); this.push(tb); this.push(tc);
    } else {
      this.push(ta); this.push(tc); this.push(tb);
    }
  }

  quad(a: V3, b: V3, c: V3, d: V3, ref: V3, isNormal = false) {
    this.tri(a, b, c, ref, isNormal);
    this.tri(a, c, d, ref, isNormal);
  }

  private ringPoints(r: Ring, n: number): V3[] {
    const cx = r.cx ?? 0, cz = r.cz ?? 0;
    const pts: V3[] = [];
    if (n === 4) {
      pts.push([cx + r.hx, r.y, cz + r.hz], [cx + r.hx, r.y, cz - r.hz], [cx - r.hx, r.y, cz - r.hz], [cx - r.hx, r.y, cz + r.hz]);
    } else if (n === 8) {
      const c = Math.min(r.ch ?? 0, r.hx * 0.95, r.hz * 0.95);
      pts.push(
        [cx + r.hx - c, r.y, cz + r.hz], [cx + r.hx, r.y, cz + r.hz - c],
        [cx + r.hx, r.y, cz - r.hz + c], [cx + r.hx - c, r.y, cz - r.hz],
        [cx - r.hx + c, r.y, cz - r.hz], [cx - r.hx, r.y, cz - r.hz + c],
        [cx - r.hx, r.y, cz + r.hz - c], [cx - r.hx + c, r.y, cz + r.hz],
      );
    } else {
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + Math.PI / n;
        pts.push([cx + Math.sin(a) * r.hx, r.y, cz + Math.cos(a) * r.hz]);
      }
    }
    return pts;
  }

  /**
   * Sólido "extruido" a lo largo de Y por anillos (caja achaflanada, cilindro, tronco...).
   * n = 4 (caja), 8 (caja achaflanada) u otro (elipse de n lados).
   */
  loft(rings: Ring[], n = 8, capBottom = true, capTop = true): this {
    const all = rings.map((r) => this.ringPoints(r, n));
    // centro para orientar las caras
    let sx = 0, sy = 0, sz = 0, cnt = 0;
    for (const ring of all) for (const p of ring) { sx += p[0]; sy += p[1]; sz += p[2]; cnt++; }
    const center: V3 = [sx / cnt, sy / cnt, sz / cnt];
    for (let i = 0; i < all.length - 1; i++) {
      const a = all[i], b = all[i + 1];
      // centro local del tramo (mejor para piezas no convexas)
      const lc: V3 = [0, (rings[i].y + rings[i + 1].y) / 2, 0];
      lc[0] = ((rings[i].cx ?? 0) + (rings[i + 1].cx ?? 0)) / 2;
      lc[2] = ((rings[i].cz ?? 0) + (rings[i + 1].cz ?? 0)) / 2;
      for (let k = 0; k < n; k++) {
        const k2 = (k + 1) % n;
        this.quad(a[k], a[k2], b[k2], b[k], lc);
      }
    }
    const cap = (ring: V3[], normalY: number) => {
      const c: V3 = [0, ring[0][1], 0];
      for (const p of ring) { c[0] += p[0] / n; c[2] += p[2] / n; }
      for (let k = 0; k < n; k++) this.tri(c, ring[k], ring[(k + 1) % n], [0, normalY, 0], true);
    };
    if (capBottom) cap(all[0], -1);
    if (capTop) cap(all[all.length - 1], 1);
    void center;
    return this;
  }

  /** Caja centrada en (cx, cy, cz) con tamaño (sx, sy, sz). */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): this {
    return this.loft(
      [
        { y: cy - sy / 2, hx: sx / 2, hz: sz / 2, cx, cz },
        { y: cy + sy / 2, hx: sx / 2, hz: sz / 2, cx, cz },
      ],
      4,
    );
  }

  /** Caja achaflanada (octógono en planta) con biseles arriba y abajo. */
  roundBox(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, ch: number, bevel = 0): this {
    const hx = sx / 2, hz = sz / 2, y0 = cy - sy / 2, y1 = cy + sy / 2;
    const rings: Ring[] = [];
    if (bevel > 0) rings.push({ y: y0, hx: hx - bevel, hz: hz - bevel, ch: ch * 0.8, cx, cz });
    rings.push({ y: y0 + bevel, hx, hz, ch, cx, cz });
    rings.push({ y: y1 - bevel, hx, hz, ch, cx, cz });
    if (bevel > 0) rings.push({ y: y1, hx: hx - bevel, hz: hz - bevel, ch: ch * 0.8, cx, cz });
    return this.loft(rings, 8);
  }

  /** Rectángulo plano (pegatina) centrado en (cx, cy, cz) mirando hacia `dir` (+1 = +Z, -1 = -Z). */
  decal(cx: number, cy: number, cz: number, w: number, h: number, dir = 1): this {
    const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
    this.quad([x0, y0, cz], [x1, y0, cz], [x1, y1, cz], [x0, y1, cz], [0, 0, dir], true);
    return this;
  }

  /** Polígono plano (en XY, con forma de estrella respecto a su primer punto central) a la altura z. */
  poly(points: [number, number][], z: number, dir = 1, cx = 0, cy = 0, fromCenter = false): this {
    const n = points.length;
    if (!fromCenter) {
      // polígono convexo: abanico desde el primer vértice
      const p0 = points[0];
      for (let k = 1; k < n - 1; k++) {
        const a = points[k], b = points[k + 1];
        this.tri([cx + p0[0], cy + p0[1], z], [cx + a[0], cy + a[1], z], [cx + b[0], cy + b[1], z], [0, 0, dir], true);
      }
      return this;
    }
    let mx = 0, my = 0;
    for (const p of points) { mx += p[0]; my += p[1]; }
    mx /= n; my /= n;
    for (let k = 0; k < n; k++) {
      const a = points[k], b = points[(k + 1) % n];
      this.tri([cx + mx, cy + my, z], [cx + a[0], cy + a[1], z], [cx + b[0], cy + b[1], z], [0, 0, dir], true);
    }
    return this;
  }

  /** Octógono plano (ojos, pupilas...) de ancho w y alto h (de lado plano a lado plano). */
  oct(cx: number, cy: number, z: number, w: number, h: number, dir = 1): this {
    const k = 1 / Math.cos(Math.PI / 8);
    const pts: [number, number][] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      pts.push([(Math.cos(a) * w * k) / 2, (Math.sin(a) * h * k) / 2]);
    }
    return this.poly(pts, z, dir, cx, cy);
  }

  /** Tira plana (2 triángulos) entre dos puntos del plano XY, mirando a +Z. */
  flatBar(x1: number, y1: number, x2: number, y2: number, z: number, thick: number): this {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * thick * 0.5, ny = (dx / len) * thick * 0.5;
    this.quad([x1 + nx, y1 + ny, z], [x2 + nx, y2 + ny, z], [x2 - nx, y2 - ny, z], [x1 - nx, y1 - ny, z], [0, 0, 1], true);
    return this;
  }

  /** Barra fina entre dos puntos del plano XY (para cadenas, flechas...). */
  bar(x1: number, y1: number, x2: number, y2: number, z: number, thick: number, depth: number) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx);
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    this.rotated(0, 0, ang, mx, my, z, () => this.box(mx, my, z, len + thick * 0.6, thick, depth));
  }

  get triangles() {
    return this.pos.length / 9;
  }

  build(): THREE.BufferGeometry {
    const n = this.pos.length / 3;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      si[i * 4] = this.skin[i];
      sw[i * 4] = 1;
    }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    geo.computeVertexNormals();
    return geo;
  }
}
