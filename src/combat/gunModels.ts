// Modelos de las armas (se enganchan a la mano derecha). Hechos con cajas, colores por vértice.
import * as THREE from 'three';
import { GeoBuilder, vertexColorMaterial } from '../core/geo';
import type { WeaponId } from './weapons';

const cache = new Map<WeaponId, THREE.BufferGeometry>();
const METAL = '#2b2d33';
const DARK = '#1a1b1f';
const WOOD = '#8a5a33';

function build(id: WeaponId): THREE.BufferGeometry | null {
  const b = new GeoBuilder();
  // El arma apunta a +Z local; la empuñadura en el origen (mano).
  switch (id) {
    case 'pistol':
      b.box(0.05, 0.08, 0.22, METAL, 0, 0.05, 0.07);
      b.box(0.045, 0.12, 0.06, DARK, 0, -0.02, 0, -0.25, 0, 0);
      break;
    case 'stamp':
      b.box(0.07, 0.1, 0.2, '#e63946', 0, 0.05, 0.06);
      b.box(0.05, 0.12, 0.06, '#1d3557', 0, -0.02, 0, -0.25, 0, 0);
      b.box(0.1, 0.1, 0.04, '#ffd23f', 0, 0.05, 0.18); // boca con sello
      break;
    case 'shotgun':
      b.box(0.06, 0.07, 0.75, METAL, 0, 0.05, 0.25);
      b.box(0.06, 0.1, 0.35, WOOD, 0, 0.0, -0.15);
      b.box(0.07, 0.06, 0.2, WOOD, 0, 0.0, 0.3);
      break;
    case 'tape':
      b.cyl(0.09, 0.09, 0.07, 10, '#d9b26f', 0, 0.09, 0.05, 0, 0, Math.PI / 2);
      b.cyl(0.04, 0.04, 0.08, 8, '#8a6a3a', 0, 0.09, 0.05, 0, 0, Math.PI / 2);
      b.box(0.05, 0.12, 0.06, '#e63946', 0, -0.02, 0, -0.25, 0, 0);
      b.box(0.04, 0.04, 0.18, '#e63946', 0, 0.02, 0.12);
      break;
    case 'smg':
      b.box(0.06, 0.09, 0.4, METAL, 0, 0.05, 0.12);
      b.box(0.045, 0.12, 0.06, DARK, 0, -0.03, 0, -0.2, 0, 0);
      b.box(0.04, 0.16, 0.05, DARK, 0, -0.04, 0.16);
      break;
    case 'rifle':
      b.box(0.06, 0.09, 0.9, METAL, 0, 0.05, 0.3);
      b.box(0.06, 0.12, 0.3, WOOD, 0, 0.0, -0.2);
      b.box(0.045, 0.12, 0.06, DARK, 0, -0.03, 0, -0.2, 0, 0);
      b.box(0.04, 0.16, 0.06, DARK, 0, -0.05, 0.18);
      b.box(0.04, 0.05, 0.18, DARK, 0, 0.13, 0.15); // mira
      break;
    case 'launcher':
      b.box(0.16, 0.16, 0.8, '#ffd23f', 0, 0.08, 0.2);
      b.box(0.18, 0.18, 0.08, '#ff4f81', 0, 0.08, 0.6);
      b.box(0.05, 0.12, 0.06, DARK, 0, -0.03, 0, -0.2, 0, 0);
      b.box(0.1, 0.1, 0.12, '#c8915a', 0, 0.2, -0.05); // caja cargada
      break;
    case 'fragile':
      b.box(0.24, 0.2, 0.24, '#c8915a', 0, 0.08, 0.05);
      b.box(0.245, 0.05, 0.245, '#e63946', 0, 0.1, 0.05);
      break;
    default:
      return null;
  }
  return b.build();
}

export function makeGunMesh(id: WeaponId): THREE.Mesh | null {
  let g = cache.get(id);
  if (!g) {
    const built = build(id);
    if (!built) return null;
    g = built;
    cache.set(id, g);
  }
  const m = new THREE.Mesh(g, vertexColorMaterial);
  m.castShadow = true;
  return m;
}

/** Punta del arma en coordenadas locales (para el fogonazo). */
export function muzzleOffset(id: WeaponId): THREE.Vector3 {
  switch (id) {
    case 'shotgun': return new THREE.Vector3(0, 0.05, 0.63);
    case 'rifle': return new THREE.Vector3(0, 0.05, 0.76);
    case 'smg': return new THREE.Vector3(0, 0.05, 0.33);
    case 'launcher': return new THREE.Vector3(0, 0.08, 0.62);
    default: return new THREE.Vector3(0, 0.05, 0.2);
  }
}
