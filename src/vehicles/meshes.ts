// Modelos de vehículos generados por código (low-poly, colores por vértice).
import * as THREE from 'three';
import { GeoBuilder, shade } from '../core/geo';
import type { VehicleKind, VehicleSpec } from './types';

export interface VehicleMesh {
  group: THREE.Group; // origen = centro del chasis (coincide con el cuerpo físico)
  body: THREE.Mesh;
  wheels: THREE.Object3D[]; // pivotes de rueda (en orden: del-izq, del-der, tras-izq, tras-der)
  lights: THREE.Mesh; // faros y pilotos (material compartido que se enciende de noche)
  siren: THREE.Mesh | null; // luces de policía
  bodyGeo: THREE.BufferGeometry; // propia de este vehículo (se abolla)
}

// Materiales compartidos por todos los vehículos
export const vehicleBodyMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
export const headlightMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
export const sirenMaterialRed = new THREE.MeshBasicMaterial({ color: '#ff2040' });
export const sirenMaterialBlue = new THREE.MeshBasicMaterial({ color: '#2060ff' });
const tireGeo = new THREE.CylinderGeometry(1, 1, 1, 12).rotateZ(Math.PI / 2);
const wheelMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const wheelGeoCache = new Map<string, THREE.BufferGeometry>();

function wheelGeometry(radius: number, width: number, hub = '#c9ccd1'): THREE.BufferGeometry {
  const key = `${radius.toFixed(2)}-${width.toFixed(2)}-${hub}`;
  let g = wheelGeoCache.get(key);
  if (!g) {
    const b = new GeoBuilder();
    b.add(tireGeo, '#1e1e24', 0, 0, 0, 0, 0, 0, width, radius, radius);
    b.add(tireGeo, hub, 0, 0, 0, 0, 0, 0, width * 1.06, radius * 0.55, radius * 0.55);
    b.box(width * 1.1, radius * 0.18, radius * 0.9, shade(hub, 0.75));
    g = b.build();
    wheelGeoCache.set(key, g);
  }
  return g;
}

const GLASS = '#223a5e';
const DARK = '#2b2d33';
const CHROME = '#d8dde3';

/** Pinta un cartel lateral con texto (para la furgoneta de reparto y la de la banda). */
function sideDecal(text: string, sub: string, bg: string, fg: string, w: number, h: number): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = fg;
  g.font = '900 78px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const lines = text.split('\n');
  lines.forEach((l, i) => g.fillText(l, 256, 80 + i * 80 - (lines.length - 1) * 20));
  g.font = '700 34px system-ui, sans-serif';
  g.fillText(sub, 256, 222);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex, transparent: true }));
  return m;
}

export function makeVehicleMesh(spec: VehicleSpec, color: string): VehicleMesh {
  const b = new GeoBuilder();
  const L = new GeoBuilder(); // luces
  const { x: hx, y: hy, z: hz } = spec.half;
  const W = hx * 2, H = hy * 2, D = hz * 2;
  const dark = shade(color, 0.7);
  const group = new THREE.Group();
  let siren: THREE.Mesh | null = null;
  const bottom = -hy; // parte baja del chasis (local)
  const decals: THREE.Mesh[] = [];

  const lightsFront = (y: number, z: number, x: number, s = 0.22) => {
    L.box(s * 1.3, s * 0.8, 0.06, '#fff6c8', x, y, z);
    L.box(s * 1.3, s * 0.8, 0.06, '#fff6c8', -x, y, z);
  };
  const lightsBack = (y: number, z: number, x: number, s = 0.2) => {
    L.box(s * 1.2, s * 0.7, 0.06, '#ff2b3a', x, y, z);
    L.box(s * 1.2, s * 0.7, 0.06, '#ff2b3a', -x, y, z);
  };

  switch (spec.kind as VehicleKind) {
    case 'van':
    case 'gangvan':
    case 'policevan':
    case 'truck': {
      const isTruck = spec.kind === 'truck';
      const cabLen = isTruck ? 1.8 : 1.35;
      // caja de carga
      const boxLen = D - cabLen;
      b.box(W, H * 0.92, boxLen, color, 0, bottom + H * 0.46 + 0.05, -hz + boxLen / 2);
      // cabina con parabrisas inclinado
      b.box(W * 0.98, H * 0.45, cabLen, color, 0, bottom + H * 0.225 + 0.05, hz - cabLen / 2);
      b.taperBox(W * 0.96, H * 0.44, cabLen * 0.9, GLASS, 0, bottom + H * 0.67, hz - cabLen / 2 - 0.05, 0.45, 0, 0.04);
      b.taperBox(W * 0.98, 0.08, cabLen * 0.5, color, 0, bottom + H * 0.9, hz - cabLen * 0.75, 0.05, 0);
      // pilares y techo de cabina
      b.box(W * 0.99, 0.12, cabLen * 0.52, color, 0, bottom + H * 0.88, hz - cabLen + cabLen * 0.26);
      // parachoques
      b.box(W * 1.02, 0.22, 0.2, DARK, 0, bottom + 0.2, hz + 0.02);
      b.box(W * 1.02, 0.22, 0.2, DARK, 0, bottom + 0.2, -hz - 0.02);
      // rejilla
      b.box(W * 0.6, 0.22, 0.05, DARK, 0, bottom + 0.48, hz + 0.01);
      // retrovisores
      b.box(0.08, 0.2, 0.14, DARK, hx + 0.06, bottom + H * 0.62, hz - 0.3);
      b.box(0.08, 0.2, 0.14, DARK, -hx - 0.06, bottom + H * 0.62, hz - 0.3);
      // puertas traseras (línea)
      b.box(0.04, H * 0.8, 0.02, dark, 0, bottom + H * 0.47, -hz - 0.005);
      lightsFront(bottom + 0.5, hz + 0.02, hx * 0.72);
      lightsBack(bottom + 0.55, -hz - 0.02, hx * 0.8);
      if (spec.kind === 'van') {
        // baca con paquetes
        b.box(W * 0.8, 0.06, boxLen * 0.6, DARK, 0, bottom + H * 0.97 + 0.05, -0.3);
        b.box(0.6, 0.35, 0.5, '#c8915a', 0.3, bottom + H * 0.97 + 0.26, -0.2);
        b.box(0.45, 0.28, 0.4, '#b07b48', -0.35, bottom + H * 0.97 + 0.22, -0.6);
        for (const s of [1, -1]) {
          const d = sideDecal('CONTRA\nREEMBOLSO', 'Pagas al recibir · ¡o no!', '#ffd23f', '#1b1030', boxLen * 0.85, H * 0.6);
          d.position.set(s * (hx + 0.012), bottom + H * 0.55, -hz + boxLen / 2);
          d.rotation.y = s * Math.PI / 2;
          decals.push(d);
        }
        b.box(W * 1.005, 0.12, boxLen * 0.98, '#ff4f81', 0, bottom + H * 0.2, -hz + boxLen / 2);
      } else if (spec.kind === 'gangvan') {
        for (const s of [1, -1]) {
          const d = sideDecal('↩ LOS\nDEVUELTOS', 'Te lo devolvemos... a golpes', '#6c3bd1', '#ffd23f', boxLen * 0.85, H * 0.6);
          d.position.set(s * (hx + 0.012), bottom + H * 0.55, -hz + boxLen / 2);
          d.rotation.y = s * Math.PI / 2;
          decals.push(d);
        }
      } else if (spec.kind === 'policevan') {
        b.box(W * 1.005, 0.3, boxLen * 0.98, '#f1faee', 0, bottom + H * 0.45, -hz + boxLen / 2);
        const sb = new GeoBuilder();
        sb.box(0.5, 0.14, 0.25, '#ff2040', 0.35, 0, 0);
        sb.box(0.5, 0.14, 0.25, '#2060ff', -0.35, 0, 0);
        siren = new THREE.Mesh(sb.build(), new THREE.MeshBasicMaterial({ vertexColors: true }));
        siren.position.set(0, bottom + H + 0.12, hz - cabLen * 0.6);
      } else if (isTruck) {
        b.box(W * 1.005, 0.14, boxLen * 0.98, shade(color, 0.8), 0, bottom + H * 0.25, -hz + boxLen / 2);
      }
      break;
    }
    case 'scooter':
    case 'escooter': {
      const e = spec.kind === 'escooter';
      if (e) {
        b.box(0.18, 0.06, 1.0, DARK, 0, bottom + 0.12, 0);
        b.cyl(0.025, 0.025, 1.1, 6, CHROME, 0, bottom + 0.65, 0.45, -0.15, 0, 0);
        b.box(0.5, 0.04, 0.04, DARK, 0, bottom + 1.2, 0.53);
        b.box(0.12, 0.08, 0.3, color, 0, bottom + 0.16, -0.1);
      } else {
        b.box(0.5, 0.1, 0.9, DARK, 0, bottom + 0.18, 0); // plataforma
        b.taperBox(0.55, 0.5, 0.7, color, 0, bottom + 0.48, -0.35, 0.2, 0.05, 0.05); // cuerpo trasero
        b.box(0.42, 0.12, 0.55, '#2b2d33', 0, bottom + 0.78, -0.3); // asiento
        b.taperBox(0.5, 0.9, 0.18, color, 0, bottom + 0.62, 0.55, 0.08, 0, 0.05); // escudo delantero
        b.cyl(0.03, 0.03, 0.5, 6, CHROME, 0, bottom + 1.05, 0.62, -0.3, 0, 0); // columna
        b.box(0.7, 0.05, 0.05, DARK, 0, bottom + 1.28, 0.68); // manillar
        b.box(0.22, 0.14, 0.12, color, 0, bottom + 1.2, 0.72);
        b.box(0.2, 0.25, 0.3, shade(color, 0.85), 0, bottom + 0.9, -0.72); // baúl
        L.box(0.16, 0.12, 0.05, '#fff6c8', 0, bottom + 1.2, 0.79);
        L.box(0.14, 0.08, 0.05, '#ff2b3a', 0, bottom + 0.62, -0.72);
      }
      break;
    }
    case 'cart': {
      // carrito del súper: cesta de rejilla (barras)
      const c = '#c7ccd4';
      b.box(0.62, 0.04, 0.9, c, 0, bottom + 0.35, 0);
      for (let i = 0; i < 6; i++) b.box(0.03, 0.55, 0.03, c, -0.3 + (i % 2) * 0.6, bottom + 0.62, -0.42 + Math.floor(i / 2) * 0.42);
      for (let i = 0; i < 4; i++) b.box(0.62, 0.03, 0.03, c, 0, bottom + 0.45 + i * 0.14, 0.44);
      for (let i = 0; i < 4; i++) b.box(0.62, 0.03, 0.03, c, 0, bottom + 0.45 + i * 0.14, -0.44);
      for (let i = 0; i < 4; i++) b.box(0.03, 0.03, 0.9, c, 0.31, bottom + 0.45 + i * 0.14, 0);
      for (let i = 0; i < 4; i++) b.box(0.03, 0.03, 0.9, c, -0.31, bottom + 0.45 + i * 0.14, 0);
      b.box(0.7, 0.05, 0.05, '#e63946', 0, bottom + 0.95, -0.55);
      b.box(0.25, 0.2, 0.25, '#555', 0, bottom + 0.2, -0.3); // motor
      b.box(0.3, 0.3, 0.3, '#ff9f1c', 0.1, bottom + 0.55, 0.1); // compra
      b.box(0.18, 0.4, 0.18, '#2ec4b6', -0.15, bottom + 0.6, 0.2);
      break;
    }
    case 'golf': {
      b.box(W, 0.35, D, color, 0, bottom + 0.35, 0);
      b.box(W * 0.9, 0.35, 0.6, '#9b2226', 0, bottom + 0.7, -0.15); // asiento
      b.box(W * 0.9, 0.5, 0.1, '#9b2226', 0, bottom + 0.95, -0.45);
      for (const sx of [1, -1]) for (const sz of [1, -1]) b.box(0.05, 1.1, 0.05, CHROME, sx * hx * 0.85, bottom + 1.2, sz * hz * 0.6);
      b.box(W * 1.05, 0.06, D * 0.75, '#ffd23f', 0, bottom + 1.78, 0); // techo
      b.box(W * 0.8, 0.5, 0.5, '#6c3bd1', 0, bottom + 0.6, -hz + 0.25); // bolsa de palos
      lightsFront(bottom + 0.45, hz + 0.02, hx * 0.6, 0.15);
      break;
    }
    case 'garbage': {
      const cab = 2.0;
      b.box(W, H * 0.95, D - cab, color, 0, bottom + H * 0.5, -cab / 2);
      b.box(W, H * 0.62, cab, '#f1faee', 0, bottom + H * 0.33, hz - cab / 2);
      b.taperBox(W * 0.96, H * 0.3, cab * 0.9, GLASS, 0, bottom + H * 0.78, hz - cab / 2, 0.25, 0, 0.03);
      b.box(W * 0.98, 0.1, cab * 0.9, '#f1faee', 0, bottom + H * 0.94, hz - cab / 2 - 0.05);
      b.box(W * 1.02, 0.3, 0.25, DARK, 0, bottom + 0.3, hz + 0.05);
      b.box(W * 0.9, H * 0.7, 0.4, shade(color, 0.7), 0, bottom + H * 0.5, -hz - 0.1); // compactador
      b.box(W * 1.01, 0.2, D - cab, '#ffd23f', 0, bottom + H * 0.3, -cab / 2);
      lightsFront(bottom + 0.6, hz + 0.02, hx * 0.75);
      lightsBack(bottom + 0.5, -hz - 0.3, hx * 0.85);
      const sb = new GeoBuilder();
      sb.box(0.3, 0.15, 0.3, '#ff9f1c', 0.5, 0, 0);
      sb.box(0.3, 0.15, 0.3, '#ff9f1c', -0.5, 0, 0);
      siren = new THREE.Mesh(sb.build(), new THREE.MeshBasicMaterial({ vertexColors: true }));
      siren.position.set(0, bottom + H + 0.05, hz - cab / 2);
      break;
    }
    case 'crane': {
      b.box(W, H * 0.6, D, color, 0, bottom + H * 0.35, 0);
      b.box(1.3, 1.3, 1.4, '#ffd23f', 0.5, bottom + H * 0.6 + 0.65, 1.6); // cabina
      b.box(1.2, 0.7, 1.2, GLASS, 0.5, bottom + H * 0.6 + 0.9, 1.62);
      b.box(0.5, 0.5, 6.5, '#ffd23f', -0.3, bottom + H * 0.6 + 1.6, -0.2, 0.28, 0, 0); // pluma
      b.box(0.08, 2.5, 0.08, '#333', -0.3, bottom + H * 0.6 + 1.9, -3.2); // cable
      b.box(0.5, 0.35, 0.3, '#333', -0.3, bottom + H * 0.6 + 0.6, -3.2); // gancho
      for (const s of [1, -1]) b.box(0.3, 0.3, 0.3, DARK, s * (hx + 0.1), bottom + 0.3, hz - 0.2);
      lightsFront(bottom + 0.6, hz + 0.02, hx * 0.7);
      break;
    }
    case 'armored': {
      b.box(W, H * 0.9, D * 0.72, color, 0, bottom + H * 0.5, -D * 0.14);
      b.box(W, H * 0.6, D * 0.28, color, 0, bottom + H * 0.35, hz - D * 0.14);
      b.box(W * 0.9, H * 0.18, D * 0.2, '#111', 0, bottom + H * 0.72, hz - D * 0.15);
      b.box(W * 1.04, 0.5, 0.3, '#222', 0, bottom + 0.45, hz + 0.1); // parachoques ariete
      for (let i = 0; i < 5; i++) b.box(0.06, 0.4, 0.3, '#888', -0.8 + i * 0.4, bottom + 0.45, hz + 0.28, 0.3, 0, 0);
      for (const s of [1, -1]) {
        const d = sideDecal('↩ EL\nDEVOLUCIÓN', 'Nada llega. Todo vuelve.', '#4a2a8a', '#ffd23f', D * 0.5, H * 0.5);
        d.position.set(s * (hx + 0.012), bottom + H * 0.55, -D * 0.14);
        d.rotation.y = s * Math.PI / 2;
        decals.push(d);
      }
      lightsFront(bottom + 0.7, hz + 0.02, hx * 0.7);
      lightsBack(bottom + 0.7, -hz - 0.02, hx * 0.8);
      break;
    }
    default: {
      // Turismos: compact, taxi, sports, suv, police
      const k = spec.kind;
      const lowH = k === 'sports' ? H * 0.52 : k === 'suv' ? H * 0.58 : H * 0.55;
      const cabH = H - lowH;
      const cabLen = k === 'sports' ? D * 0.42 : k === 'compact' ? D * 0.55 : D * 0.5;
      const cabZ = k === 'sports' ? -D * 0.06 : k === 'compact' ? -D * 0.04 : -D * 0.04;
      // carrocería baja con capó inclinado
      b.taperBox(W, lowH, D, color, 0, bottom + lowH / 2 + 0.02, 0, k === 'sports' ? 0.35 : 0.12, 0.08, 0.02);
      // cabina: cristal con techo de color
      b.taperBox(W * 0.86, cabH * 0.86, cabLen, GLASS, 0, bottom + lowH + cabH * 0.43, cabZ, cabLen * 0.28, cabLen * 0.2, W * 0.06);
      b.taperBox(W * 0.8, 0.08, cabLen * 0.5, color, 0, bottom + lowH + cabH * 0.86 + 0.02, cabZ - cabLen * 0.02, 0.02, 0.02, 0.02);
      // pilares centrales
      b.box(W * 0.84, cabH * 0.8, 0.1, color, 0, bottom + lowH + cabH * 0.42, cabZ + 0.02);
      // parachoques, rejilla
      b.box(W * 1.02, 0.18, 0.16, DARK, 0, bottom + 0.18, hz + 0.02);
      b.box(W * 1.02, 0.18, 0.16, DARK, 0, bottom + 0.18, -hz - 0.02);
      b.box(W * 0.5, 0.14, 0.04, DARK, 0, bottom + lowH * 0.55, hz + 0.01);
      // pasos de rueda oscuros
      for (const sz of [spec.wheelZFront, spec.wheelZBack])
        for (const sx of [1, -1]) b.box(0.05, spec.wheelRadius * 1.3, spec.wheelRadius * 2.2, shade(color, 0.45), sx * (hx + 0.005), bottom + spec.wheelRadius * 0.9, sz);
      // retrovisores
      b.box(0.08, 0.1, 0.14, color, hx + 0.05, bottom + lowH + 0.1, cabZ + cabLen / 2);
      b.box(0.08, 0.1, 0.14, color, -hx - 0.05, bottom + lowH + 0.1, cabZ + cabLen / 2);
      lightsFront(bottom + lowH * 0.7, hz + 0.02, hx * 0.7);
      lightsBack(bottom + lowH * 0.72, -hz - 0.02, hx * 0.75);
      if (k === 'sports') {
        b.box(W * 0.9, 0.06, 0.35, DARK, 0, bottom + lowH + 0.32, -hz + 0.2); // alerón
        b.box(0.06, 0.28, 0.1, DARK, W * 0.3, bottom + lowH + 0.16, -hz + 0.2);
        b.box(0.06, 0.28, 0.1, DARK, -W * 0.3, bottom + lowH + 0.16, -hz + 0.2);
        b.box(W * 0.3, 0.02, D * 0.8, '#ffffff', 0, bottom + lowH + 0.03, 0); // franja
      }
      if (k === 'suv') {
        b.box(W * 0.75, 0.06, cabLen * 0.8, DARK, 0, bottom + H + 0.08, cabZ); // baca
        b.cyl(spec.wheelRadius, spec.wheelRadius, 0.22, 10, '#1e1e24', 0, bottom + lowH * 0.8, -hz - 0.14, Math.PI / 2, 0, 0);
      }
      if (k === 'taxi') {
        b.box(W * 1.005, 0.12, D * 0.6, '#1b1b1b', 0, bottom + lowH * 0.6, -0.1); // franja
        b.box(0.6, 0.2, 0.3, '#ffd23f', 0, bottom + H + 0.1, cabZ); // cartel TAXI
        L.box(0.5, 0.12, 0.31, '#fff6a0', 0, bottom + H + 0.12, cabZ);
      }
      if (k === 'police') {
        b.box(W * 1.005, lowH * 0.55, D * 0.42, '#f1faee', 0, bottom + lowH * 0.55, 0.05); // puertas blancas
        b.box(W * 0.6, 0.08, 0.35, DARK, 0, bottom + H + 0.03, cabZ);
        const sb = new GeoBuilder();
        sb.box(0.45, 0.14, 0.25, '#ff2040', 0.3, 0, 0);
        sb.box(0.45, 0.14, 0.25, '#2060ff', -0.3, 0, 0);
        siren = new THREE.Mesh(sb.build(), new THREE.MeshBasicMaterial({ vertexColors: true }));
        siren.position.set(0, bottom + H + 0.14, cabZ);
      }
    }
  }

  const bodyGeo = b.build();
  const body = new THREE.Mesh(bodyGeo, vehicleBodyMaterial);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  const lights = new THREE.Mesh(L.empty ? new THREE.BufferGeometry() : L.build(), headlightMaterial);
  group.add(lights);
  for (const d of decals) group.add(d);
  if (siren) group.add(siren);

  // ruedas
  const wheels: THREE.Object3D[] = [];
  const wg = wheelGeometry(spec.wheelRadius, spec.kind === 'cart' ? 0.06 : Math.max(0.12, spec.wheelRadius * 0.62), spec.kind === 'sports' ? '#ffd23f' : '#c9ccd1');
  const positions: [number, number][] = [
    [spec.wheelX, spec.wheelZFront],
    [-spec.wheelX, spec.wheelZFront],
    [spec.wheelX, spec.wheelZBack],
    [-spec.wheelX, spec.wheelZBack],
  ];
  positions.forEach(([x, z], i) => {
    const pivot = new THREE.Object3D();
    pivot.position.set(x, spec.wheelY - spec.suspension, z);
    const visible = !spec.twoWheels || i % 2 === 0;
    if (visible) {
      const m = new THREE.Mesh(wg, wheelMaterial);
      m.castShadow = true;
      if (spec.twoWheels) m.position.x = -x; // centrada
      pivot.add(m);
    }
    group.add(pivot);
    wheels.push(pivot);
  });

  return { group, body, wheels, lights, siren, bodyGeo };
}

/** Enciende faros de noche (material compartido). */
export function setHeadlightsNight(night: number) {
  const k = 0.55 + night * 0.9;
  headlightMaterial.color.setRGB(k, k, k);
}
