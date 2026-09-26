// Gaviotas que vuelan en círculos sobre el puerto y las playas. Una sola InstancedMesh (una llamada
// de dibujo, sin sombra); el aleteo es la escala vertical de la instancia (las alas son una V: al
// aplastarla bajan). Solo se mueven si la cámara está cerca (lejos no se distinguen).
import * as THREE from 'three';
import type { Ctx } from './ctx';
import type { Out } from './special';
import { GeoBuilder } from './geo';
import { Rng } from '../../core/rng';

interface Bird {
  cx: number;
  cy: number;
  cz: number;
  r: number;
  w: number;
  ph: number;
  flap: number;
}

function gullGeo(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const white = '#f6f6f2', grey = '#a3acb6', tip = '#2a2a2e';
  // cuerpo (mira a +Z) y cabeza con pico
  b.box(0, 0, 0, 0.16, 0.14, 0.5, white);
  b.box(0, 0.03, 0.3, 0.12, 0.12, 0.12, white);
  b.box(0, 0.02, 0.4, 0.04, 0.04, 0.1, '#f2b233');
  b.box(0, 0.02, -0.3, 0.2, 0.03, 0.14, white);
  // alas en V (a dos caras): raíz en el cuerpo, punta arriba y hacia fuera
  for (const s of [-1, 1]) {
    const r0 = s * 0.07, r1 = s * 0.5, r2 = s * 0.95;
    const w0 = 0.16, w1 = 0.14;
    const quad = (xa: number, ya: number, xb: number, yb: number, za: number, zb: number, c: string) => {
      if (s > 0) {
        b.quadW(xa, ya, za, xb, yb, zb, xb, yb, -zb, xa, ya, -za, c);
        b.quadW(xa, ya - 0.005, -za, xb, yb - 0.005, -zb, xb, yb - 0.005, zb, xa, ya - 0.005, za, c);
      } else {
        b.quadW(xa, ya, -za, xb, yb, -zb, xb, yb, zb, xa, ya, za, c);
        b.quadW(xa, ya - 0.005, za, xb, yb - 0.005, zb, xb, yb - 0.005, -zb, xa, ya - 0.005, -za, c);
      }
    };
    quad(r0, 0.02, r1, 0.2, w0, w1, grey);
    quad(r1, 0.2, r2, 0.36, w1, 0.08, tip);
  }
  return b.toGeometry();
}

/** Zonas por donde vuelan: [centro x, z, radio de la zona, altura, número]. */
const FLOCKS: [number, number, number, number, number][] = [
  [-60, 245, 40, 18, 5],
  [60, 250, 45, 22, 5],
  [-125, 275, 22, 12, 4],
  [130, 280, 30, 26, 3],
  [-285, 60, 30, 14, 3],
  [285, 110, 30, 14, 3],
  [-200, 262, 25, 12, 3],
];

export function buildBirds(ctx: Ctx, out: Out) {
  const rng = new Rng('gaviotas');
  const birds: Bird[] = [];
  for (const [x, z, R, h, n] of FLOCKS) {
    for (let i = 0; i < n; i++) {
      birds.push({
        cx: x + rng.range(-R * 0.4, R * 0.4),
        cy: h + rng.range(-3, 5),
        cz: z + rng.range(-R * 0.4, R * 0.4),
        r: rng.range(R * 0.35, R * 0.8),
        w: (rng.chance(0.5) ? 1 : -1) * rng.range(0.25, 0.45),
        ph: rng.range(0, Math.PI * 2),
        flap: rng.range(0, 10),
      });
    }
  }
  const im = new THREE.InstancedMesh(gullGeo(), ctx.mat, birds.length);
  im.name = 'gaviotas';
  im.castShadow = false;
  im.receiveShadow = false;
  // la esfera de recorte cubre toda la isla (las gaviotas se mueven): se recorta a mano por distancia
  im.frustumCulled = false;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const cam = ctx.game.camera;
  const place = (t: number) => {
    for (let i = 0; i < birds.length; i++) {
      const bd = birds[i];
      const a = bd.ph + t * bd.w;
      const x = bd.cx + Math.cos(a) * bd.r, z = bd.cz + Math.sin(a) * bd.r;
      const y = bd.cy + Math.sin(t * 0.4 + bd.ph) * 1.5;
      // rumbo tangente al círculo e inclinadas hacia dentro
      const dx = -Math.sin(a) * bd.w, dz = Math.cos(a) * bd.w;
      e.set(0, Math.atan2(dx, dz), bd.w > 0 ? -0.35 : 0.35, 'YXZ');
      q.setFromEuler(e);
      // ratos aleteando y ratos planeando
      const cyc = (t * 0.35 + bd.flap) % 3;
      const k = cyc < 1.2 ? 0.55 + 0.45 * Math.cos(t * 11 + bd.flap) : 0.75;
      m.compose(p.set(x, y, z), q, sc.set(1.3, Math.max(0.12, k) * 1.3, 1.3));
      im.setMatrixAt(i, m);
    }
    im.instanceMatrix.needsUpdate = true;
  };
  place(0);
  ctx.game.scene.add(im);
  // solo cuando la cámara anda por la costa sur o las playas (lejos, ni se ven)
  let fr = 0;
  out.animated.push((_dt, t) => {
    const c = cam.position;
    const near = c.z > 120 || Math.abs(c.x) > 200;
    im.visible = near;
    if (!near || fr++ % 2) return;
    place(t);
  });
}
