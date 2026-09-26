// Mobiliario y vegetación repetidos: se dibujan con InstancedMesh (una llamada por tipo).
import * as THREE from 'three';
import type { Game } from '../../core/game';
import { GeoBuilder, lin } from './geo';
import { makeColliderHelpers } from './ctx';

export type PropType =
  | 'palm' | 'pine' | 'olive' | 'cypress' | 'orange' | 'bush'
  | 'lamp' | 'lampOld' | 'lampWall'
  | 'bench' | 'bin' | 'bollard' | 'pot' | 'tlight' | 'hydrant' | 'lounger' | 'umbrella' | 'barTable' | 'noray' | 'crateStack' | 'tyres';

interface Inst {
  x: number;
  y: number;
  z: number;
  rot: number;
  s: number;
  tint?: THREE.Color;
}

/** Luz cálida de las bombillas. */
const WARM = [1.0, 0.72, 0.36];

function geoPalm(): GeoBuilder {
  const b = new GeoBuilder();
  const trunk = '#9a7650', trunk2 = '#86664a';
  // tronco curvo en 6 tramos
  let x = 0, y = 0;
  const segs = 6;
  for (let i = 0; i < segs; i++) {
    const h = 1.2;
    const r0 = 0.24 - i * 0.018, r1 = 0.24 - (i + 1) * 0.018;
    const nx = x + 0.1 + i * 0.03;
    b.frame(0, 0, 0, 0);
    // tronco de cono inclinado: aproximamos con cilindro desplazado
    b.cyl(x, y, 0, r0, r1, h, 6, i % 2 ? trunk : trunk2, false, false);
    x = nx;
    y += h * 0.98;
  }
  const top = y;
  // cocos
  b.blob(x + 0.15, top - 0.15, 0.1, 0.16, 0.16, 0.16, '#6b4a2a');
  b.blob(x - 0.1, top - 0.2, -0.12, 0.15, 0.15, 0.15, '#7a5530');
  // hojas: 8 palmas que caen
  const leaf = ['#3f9a3c', '#4fae45', '#358a36'];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + (i % 2) * 0.2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const L1 = 1.9, L2 = 1.8;
    const w = 0.55;
    const up = i % 2 ? 0.55 : 0.35;
    const p0 = [x, top, 0];
    const p1 = [x + ca * L1, top + up, sa * L1];
    const p2 = [x + ca * (L1 + L2), top - 0.9, sa * (L1 + L2)];
    const px = -sa * w, pz = ca * w;
    const c = leaf[i % 3];
    // dos tramos, cada uno un cuadrilátero (a dos caras)
    const q = (a: number[], bb: number[], wa: number, wb: number) => {
      b.quadW(a[0] - px * wa, a[1], a[2] - pz * wa, a[0] + px * wa, a[1], a[2] + pz * wa, bb[0] + px * wb, bb[1], bb[2] + pz * wb, bb[0] - px * wb, bb[1], bb[2] - pz * wb, c);
      b.quadW(bb[0] - px * wb, bb[1] - 0.01, bb[2] - pz * wb, bb[0] + px * wb, bb[1] - 0.01, bb[2] + pz * wb, a[0] + px * wa, a[1] - 0.01, a[2] + pz * wa, a[0] - px * wa, a[1] - 0.01, a[2] - pz * wa, c);
    };
    q(p0, p1, 0.25, 1);
    q(p1, p2, 1, 0.1);
  }
  return b;
}

function geoPine(): GeoBuilder {
  // pino piñonero: tronco alto y copa en paraguas
  const b = new GeoBuilder();
  b.cyl(0, 0, 0, 0.26, 0.2, 3.2, 6, '#7a5a3e', false);
  b.cyl(0.05, 3.1, 0, 0.2, 0.14, 2.2, 6, '#7a5a3e', false);
  b.blob(0.2, 5.6, 0, 3.0, 1.0, 2.8, '#2f6e3a', 0.12, 3);
  b.blob(-0.6, 5.9, 0.4, 2.0, 0.8, 1.9, '#3b7f41', 0.1, 5);
  b.blob(1.0, 6.1, -0.5, 1.7, 0.7, 1.6, '#357843', 0.1, 7);
  return b;
}

function geoOlive(): GeoBuilder {
  const b = new GeoBuilder();
  b.cyl(0, 0, 0, 0.3, 0.2, 1.4, 6, '#6f5a45', false);
  b.cyl(0.1, 1.3, 0, 0.2, 0.12, 0.8, 5, '#6f5a45', false);
  b.blob(0, 2.5, 0, 1.7, 1.0, 1.6, '#7f9a5a', 0.15, 2);
  b.blob(0.7, 2.9, 0.3, 1.1, 0.8, 1.1, '#8aa565', 0.12, 4);
  b.blob(-0.6, 2.8, -0.4, 1.1, 0.7, 1.0, '#76925a', 0.12, 6);
  return b;
}

function geoCypress(): GeoBuilder {
  const b = new GeoBuilder();
  b.cyl(0, 0, 0, 0.15, 0.12, 0.6, 5, '#5e4632', false);
  b.cyl(0, 0.5, 0, 0.75, 0.0, 6.5, 7, '#2c5a36', false);
  b.cyl(0, 0.5, 0, 0.8, 0.55, 2.2, 7, '#2f613a', false);
  return b;
}

function geoOrange(): GeoBuilder {
  const b = new GeoBuilder();
  b.cyl(0, 0, 0, 0.14, 0.11, 1.7, 5, '#6b5240', false);
  b.blob(0, 2.5, 0, 1.25, 1.15, 1.25, '#3f8a3a', 0.1, 9);
  for (let i = 0; i < 6; i++) {
    const a = i * 2.1, r = 1.1;
    b.box(Math.cos(a) * r, 2.3 + (i % 3) * 0.35, Math.sin(a) * r, 0.2, 0.2, 0.2, '#f39a1e');
  }
  return b;
}

function geoBush(): GeoBuilder {
  const b = new GeoBuilder();
  b.blob(0, 0.5, 0, 0.9, 0.65, 0.9, '#4d8f3f', 0.12, 11);
  b.blob(0.5, 0.45, 0.2, 0.6, 0.5, 0.6, '#5a9c47', 0.1, 12);
  return b;
}

function geoLamp(): GeoBuilder {
  // farola de avenida: poste, brazo curvo y luminaria. Bombilla a (1.3, 6.35, 0)
  const b = new GeoBuilder();
  const c = '#39424e';
  b.cyl(0, 0, 0, 0.2, 0.2, 0.5, 6, c, true);
  b.cyl(0, 0.5, 0, 0.11, 0.08, 5.9, 6, c, true);
  b.boxRot(0.45, 6.25, 0, 1.0, 0.1, 0.1, 0, 0, -0.35, c);
  b.box(1.05, 6.45, 0, 0.9, 0.1, 0.12, c);
  b.box(1.3, 6.47, 0, 0.9, 0.18, 0.5, '#2c333c');
  b.box(1.3, 6.35, 0, 0.7, 0.08, 0.38, '#fff3d6', 0, [WARM[0] * 2.2, WARM[1] * 2.2, WARM[2] * 2.2, 0]);
  return b;
}

function geoLampOld(): GeoBuilder {
  // farola fernandina: poste verde oscuro con farol arriba. Bombilla a (0, 3.75, 0)
  const b = new GeoBuilder();
  const c = '#24372e';
  b.cyl(0, 0, 0, 0.22, 0.18, 0.6, 8, c, true);
  b.cyl(0, 0.6, 0, 0.09, 0.07, 2.7, 6, c, true);
  b.cyl(0, 3.25, 0, 0.12, 0.2, 0.2, 6, c, true);
  b.cyl(0, 3.45, 0, 0.2, 0.3, 0.6, 4, '#fff1c9', false, false, [WARM[0] * 2.2, WARM[1] * 2.2, WARM[2] * 2.2, 0], Math.PI / 4);
  b.cyl(0, 4.05, 0, 0.36, 0.0, 0.35, 4, c, false, false, undefined, Math.PI / 4);
  b.box(0, 4.45, 0, 0.06, 0.2, 0.06, c);
  return b;
}

function geoLampWall(): GeoBuilder {
  // farolillo de pared; el soporte sale hacia +Z desde la fachada. Bombilla a (0, -0.25, 0.55)
  const b = new GeoBuilder();
  const c = '#1f1f24';
  b.box(0, 0, 0.05, 0.16, 0.3, 0.1, c);
  b.box(0, 0.08, 0.3, 0.05, 0.05, 0.55, c);
  b.cyl(0, -0.5, 0.55, 0.13, 0.17, 0.36, 4, '#fff1c9', false, true, [WARM[0] * 2.2, WARM[1] * 2.2, WARM[2] * 2.2, 0], Math.PI / 4);
  b.cyl(0, -0.14, 0.55, 0.2, 0.0, 0.22, 4, c, false, false, undefined, Math.PI / 4);
  return b;
}

function geoBench(): GeoBuilder {
  const b = new GeoBuilder();
  const wood = '#b77b45', iron = '#2d3138';
  b.box(-0.8, 0.22, 0, 0.08, 0.44, 0.5, iron);
  b.box(0.8, 0.22, 0, 0.08, 0.44, 0.5, iron);
  b.box(0, 0.47, 0.08, 1.9, 0.06, 0.42, wood);
  b.boxRot(0, 0.78, -0.18, 1.9, 0.36, 0.05, -0.18, 0, 0, wood);
  return b;
}

function geoBin(): GeoBuilder {
  const b = new GeoBuilder();
  b.cyl(0, 0, 0, 0.26, 0.3, 0.85, 7, '#3f7d4a', true);
  b.cyl(0, 0.85, 0, 0.32, 0.32, 0.07, 7, '#2d5c36', true);
  return b;
}

function geoBollard(): GeoBuilder {
  const b = new GeoBuilder();
  b.cyl(0, 0, 0, 0.13, 0.13, 0.62, 6, '#3a3f47', false);
  b.cyl(0, 0.62, 0, 0.13, 0.13, 0.12, 6, '#f2f2f2', false);
  b.cyl(0, 0.74, 0, 0.13, 0.06, 0.12, 6, '#3a3f47', true);
  return b;
}

function geoPot(): GeoBuilder {
  const b = new GeoBuilder();
  b.cyl(0, 0, 0, 0.26, 0.36, 0.55, 6, '#c8643b', false);
  b.blob(0, 0.72, 0, 0.36, 0.28, 0.36, '#4f8f3f', 0.1, 3);
  b.box(0.12, 0.92, 0.05, 0.14, 0.14, 0.14, '#e8394d');
  b.box(-0.12, 0.88, -0.1, 0.13, 0.13, 0.13, '#f25c8c');
  b.box(0.0, 0.95, -0.16, 0.12, 0.12, 0.12, '#e8394d');
  return b;
}

function geoTLight(): GeoBuilder {
  // semáforo: la cabeza mira a +Z
  const b = new GeoBuilder();
  const c = '#2f3540';
  b.cyl(0, 0, 0, 0.09, 0.09, 3.1, 6, c, true);
  b.box(0, 3.55, 0.05, 0.36, 1.0, 0.28, '#23272e');
  b.box(0, 3.88, 0.2, 0.2, 0.2, 0.04, '#ff3b30', 0, [1.2, 0.1, 0.05, 0.35]);
  b.box(0, 3.56, 0.2, 0.2, 0.2, 0.04, '#6b5a1a', 0, [0.2, 0.15, 0.0, 0.2]);
  b.box(0, 3.24, 0.2, 0.2, 0.2, 0.04, '#1a5a2a', 0, [0.0, 0.3, 0.1, 0.2]);
  return b;
}

function geoHydrant(): GeoBuilder {
  const b = new GeoBuilder();
  b.cyl(0, 0, 0, 0.16, 0.14, 0.6, 6, '#d6352b', true);
  b.box(0, 0.4, 0, 0.44, 0.1, 0.1, '#d6352b');
  b.cyl(0, 0.6, 0, 0.1, 0.0, 0.12, 6, '#d6352b');
  return b;
}

function geoLounger(): GeoBuilder {
  const b = new GeoBuilder();
  b.box(0, 0.3, 0.2, 0.7, 0.08, 1.4, '#f4f1ea');
  b.boxRot(0, 0.52, -0.72, 0.7, 0.07, 0.6, -0.6, 0, 0, '#f4f1ea');
  b.box(0, 0.36, 0.2, 0.62, 0.06, 1.3, '#3aa6d8');
  b.box(-0.3, 0.14, 0.7, 0.05, 0.28, 0.05, '#aaa');
  b.box(0.3, 0.14, 0.7, 0.05, 0.28, 0.05, '#aaa');
  return b;
}

function geoUmbrella(): GeoBuilder {
  const b = new GeoBuilder();
  b.cyl(0, 0, 0, 0.04, 0.04, 2.3, 5, '#ddd', false);
  const cols = ['#e8394d', '#f4f1ea'];
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * Math.PI * 2, a1 = ((i + 1) / 8) * Math.PI * 2;
    const r = 1.35;
    b.triW(0, 2.55, 0, Math.cos(a1) * r, 2.05, Math.sin(a1) * r, Math.cos(a0) * r, 2.05, Math.sin(a0) * r, cols[i % 2]);
  }
  return b;
}

function geoBarTable(): GeoBuilder {
  // mesa de terraza con dos sillas
  const b = new GeoBuilder();
  b.cyl(0, 0, 0, 0.05, 0.05, 0.72, 4, '#444', false);
  b.cyl(0, 0.72, 0, 0.42, 0.42, 0.04, 8, '#f0ede4', true);
  for (const s of [-1, 1]) {
    b.box(0, 0.44, s * 0.62, 0.42, 0.05, 0.42, '#c0392b');
    b.box(0, 0.7, s * 0.84, 0.42, 0.5, 0.05, '#c0392b');
    b.box(-0.17, 0.22, s * 0.62, 0.04, 0.44, 0.04, '#666');
    b.box(0.17, 0.22, s * 0.62, 0.04, 0.44, 0.04, '#666');
  }
  return b;
}

function geoNoray(): GeoBuilder {
  const b = new GeoBuilder();
  b.cyl(0, 0, 0, 0.3, 0.26, 0.55, 7, '#2e3238', false);
  b.cyl(0, 0.55, 0, 0.42, 0.42, 0.14, 7, '#2e3238', true);
  return b;
}

function geoCrateStack(): GeoBuilder {
  // pila de cajas de cartón y un palé
  const b = new GeoBuilder();
  b.box(0, 0.07, 0, 1.2, 0.14, 1.0, '#b08a5a');
  b.box(-0.25, 0.44, 0, 0.6, 0.6, 0.9, '#c9955a');
  b.box(0.32, 0.39, 0.1, 0.5, 0.5, 0.6, '#d2a468');
  b.box(-0.2, 0.96, -0.05, 0.5, 0.44, 0.6, '#c08c52');
  b.box(-0.25, 0.745, 0.451, 0.12, 0.6, 0.01, '#e8d7a8');
  return b;
}

function geoTyres(): GeoBuilder {
  const b = new GeoBuilder();
  for (let i = 0; i < 4; i++) b.cyl(0, i * 0.26, 0, 0.42, 0.42, 0.24, 8, i % 2 ? '#222326' : '#2c2d31', i === 3);
  return b;
}

const GEOS: Record<PropType, () => GeoBuilder> = {
  palm: geoPalm, pine: geoPine, olive: geoOlive, cypress: geoCypress, orange: geoOrange, bush: geoBush,
  lamp: geoLamp, lampOld: geoLampOld, lampWall: geoLampWall,
  bench: geoBench, bin: geoBin, bollard: geoBollard, pot: geoPot, tlight: geoTLight, hydrant: geoHydrant,
  lounger: geoLounger, umbrella: geoUmbrella, barTable: geoBarTable,
  noray: geoNoray, crateStack: geoCrateStack, tyres: geoTyres,
};

/** Posición local de la bombilla de cada tipo de farola. */
export const BULB: Partial<Record<PropType, [number, number, number]>> = {
  lamp: [1.3, 6.3, 0],
  lampOld: [0, 3.75, 0],
  lampWall: [0, -0.32, 0.55],
};

const CAST: Partial<Record<PropType, boolean>> = { palm: true, pine: true, olive: true, cypress: true, orange: true, lamp: true, lampOld: true, bench: true, tlight: true, umbrella: true };

export class Props {
  readonly list = new Map<PropType, Inst[]>();

  add(type: PropType, x: number, y: number, z: number, rot = 0, s = 1, tint?: THREE.Color) {
    let arr = this.list.get(type);
    if (!arr) this.list.set(type, (arr = []));
    arr.push({ x, y, z, rot, s, tint });
  }

  count(type: PropType) {
    return this.list.get(type)?.length ?? 0;
  }

  /** Posiciones de mundo de las bombillas. */
  bulbs(): THREE.Vector3[] {
    const out: THREE.Vector3[] = [];
    for (const [type, arr] of this.list) {
      const b = BULB[type];
      if (!b) continue;
      for (const it of arr) {
        const c = Math.cos(it.rot), s = Math.sin(it.rot);
        out.push(new THREE.Vector3(it.x + (b[0] * c + b[2] * s) * it.s, it.y + b[1] * it.s, it.z + (-b[0] * s + b[2] * c) * it.s));
      }
    }
    return out;
  }

  build(game: Game, mat: THREE.Material): THREE.InstancedMesh[] {
    const col = makeColliderHelpers(game);
    const out: THREE.InstancedMesh[] = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (const [type, arr] of this.list) {
      if (!arr.length) continue;
      const geo = GEOS[type]().toGeometry();
      const im = new THREE.InstancedMesh(geo, mat, arr.length);
      im.name = 'props-' + type;
      im.castShadow = !!CAST[type];
      im.receiveShadow = true;
      let tinted = false;
      arr.forEach((it, i) => {
        q.setFromAxisAngle(up, it.rot);
        im.setMatrixAt(i, m.compose(p.set(it.x, it.y, it.z), q, sc.set(it.s, it.s, it.s)));
        if (it.tint) {
          im.setColorAt(i, it.tint);
          tinted = true;
        }
      });
      if (tinted) {
        const white = new THREE.Color(1, 1, 1);
        arr.forEach((it, i) => !it.tint && im.setColorAt(i, white));
      }
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      out.push(im);
      game.scene.add(im);
      // colisores sencillos
      for (const it of arr) {
        switch (type) {
          case 'palm':
          case 'pine':
          case 'olive':
          case 'cypress':
          case 'orange':
            col.cyl(it.x, it.y + 2, it.z, 2, 0.3 * it.s);
            break;
          case 'lamp':
          case 'lampOld':
          case 'tlight':
            col.cyl(it.x, it.y + 2, it.z, 2, 0.16);
            break;
          case 'bench':
            col.box(it.x, it.y + 0.45, it.z, 0.95, 0.45, 0.28, it.rot);
            break;
          case 'bin':
          case 'hydrant':
            col.cyl(it.x, it.y + 0.45, it.z, 0.45, 0.28);
            break;
          case 'bollard':
            col.cyl(it.x, it.y + 0.45, it.z, 0.45, 0.14);
            break;
          case 'pot':
            col.cyl(it.x, it.y + 0.4, it.z, 0.4, 0.34);
            break;
          case 'noray':
            col.cyl(it.x, it.y + 0.35, it.z, 0.35, 0.42);
            break;
          case 'crateStack':
            col.box(it.x, it.y + 0.6, it.z, 0.6, 0.6, 0.5, it.rot);
            break;
          case 'tyres':
            col.cyl(it.x, it.y + 0.5, it.z, 0.5, 0.42);
            break;
        }
      }
    }
    return out;
  }
}

export { lin };
