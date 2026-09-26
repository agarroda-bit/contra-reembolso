// Constructor de geometría low-poly con colores por vértice: se añaden piezas y sale UNA geometría.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const tmpColor = new THREE.Color();
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();

export class GeoBuilder {
  private parts: THREE.BufferGeometry[] = [];

  /** Añade una geometría ya hecha, coloreada y colocada. */
  add(
    geo: THREE.BufferGeometry,
    color: string | THREE.Color,
    x = 0, y = 0, z = 0,
    rx = 0, ry = 0, rz = 0,
    sx = 1, sy = 1, sz = 1,
  ): this {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    tmpM.compose(tmpP.set(x, y, z), tmpQ.setFromEuler(tmpE.set(rx, ry, rz)), tmpS.set(sx, sy, sz));
    g.applyMatrix4(tmpM);
    // quitar uv para que todas las piezas fusionen igual
    if (g.getAttribute('uv')) g.deleteAttribute('uv');
    if (g.getAttribute('uv1')) g.deleteAttribute('uv1');
    const n = g.getAttribute('position').count;
    const colors = new Float32Array(n * 3);
    tmpColor.set(color as any);
    for (let i = 0; i < n; i++) {
      colors[i * 3] = tmpColor.r;
      colors[i * 3 + 1] = tmpColor.g;
      colors[i * 3 + 2] = tmpColor.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    this.parts.push(g);
    return this;
  }

  box(w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): this {
    return this.add(new THREE.BoxGeometry(w, h, d), color, x, y, z, rx, ry, rz);
  }

  /** Caja con la cara de arriba estrechada (parabrisas inclinados). front/back = cuánto entra la arista superior. */
  taperBox(w: number, h: number, d: number, color: string, x: number, y: number, z: number, front: number, back: number, side = 0): this {
    const g = new THREE.BoxGeometry(w, h, d);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) > 0) {
        const zz = p.getZ(i);
        p.setZ(i, zz > 0 ? zz - front : zz + back);
        const xx = p.getX(i);
        p.setX(i, xx > 0 ? xx - side : xx + side);
      }
    }
    return this.add(g, color, x, y, z);
  }

  cyl(rTop: number, rBottom: number, h: number, seg: number, color: string, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): this {
    return this.add(new THREE.CylinderGeometry(rTop, rBottom, h, seg), color, x, y, z, rx, ry, rz);
  }

  sphere(r: number, color: string, x = 0, y = 0, z = 0, detail = 0, sx = 1, sy = 1, sz = 1): this {
    return this.add(new THREE.IcosahedronGeometry(r, detail), color, x, y, z, 0, 0, 0, sx, sy, sz);
  }

  get empty() {
    return this.parts.length === 0;
  }

  build(): THREE.BufferGeometry {
    const merged = mergeGeometries(this.parts, false)!;
    for (const p of this.parts) p.dispose();
    this.parts = [];
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    return merged;
  }
}

/** Material compartido para todo lo que usa colores por vértice. */
export const vertexColorMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

/** Oscurece o aclara un color (#rrggbb) por un factor. */
export function shade(hex: string, f: number): string {
  const c = new THREE.Color(hex);
  if (f < 1) c.multiplyScalar(f);
  else c.lerp(new THREE.Color('#ffffff'), Math.min(1, f - 1));
  return '#' + c.getHexString();
}
