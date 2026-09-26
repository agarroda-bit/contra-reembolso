// Geometría del muñeco a partir de su aspecto: todas las piezas en UNA geometría,
// cada pieza pegada a su hueso y con su color por vértice.
import * as THREE from 'three';
import { MeshBuilder } from './builder';
import { B } from './skeleton';
import type { CharacterLookExtra } from './looks';

const _a = new THREE.Color();
const _b = new THREE.Color();

function shade(hex: string, f: number): THREE.Color {
  return new THREE.Color(hex).multiplyScalar(f);
}
function mix(hex1: string, hex2: string, t: number): THREE.Color {
  _a.set(hex1);
  _b.set(hex2);
  return _a.clone().lerp(_b, t);
}
function luminance(hex: string): number {
  _a.set(hex);
  return 0.2126 * _a.r + 0.7152 * _a.g + 0.0722 * _a.b;
}

export interface BuiltModel {
  geometry: THREE.BufferGeometry;
  triangles: number;
  /** Profundidad del pecho (para colocar los enganches de pecho y espalda). */
  chestZ: number;
}

export function buildCharacterGeometry(look: CharacterLookExtra): BuiltModel {
  const M = new MeshBuilder();
  const bld = look.build ?? 1;
  const bw = 1 + (bld - 1) * 0.9; // ancho de tronco
  const bd = 1 + (bld - 1) * 1.5; // barriga
  const lw = 1 + (bld - 1) * 0.6; // grosor de brazos y piernas
  const skin = look.skin;
  const skinD = shade(skin, 0.82);
  const hairC = look.hairColor;
  const hairLight = luminance(hairC) > 0.45;
  const browC = hairLight ? shade(hairC, 0.68) : shade(hairC, 0.6);
  const jacket = look.jacket ?? null;
  const top = jacket ?? look.shirt;
  const jStyle = look.jacketStyle ?? 'chandal';
  const kind = look.kind;
  const frontZ = 0.113 * bd;

  // ───────────── cadera y cinturón ─────────────
  M.setBone(B.hips).color(look.pants);
  M.loft(
    [
      { y: -0.12, hx: 0.15 * bw, hz: 0.095 * bd, ch: 0.035 },
      { y: -0.03, hx: 0.168 * bw, hz: 0.108 * bd, ch: 0.04 },
      { y: 0.065, hx: 0.166 * bw, hz: 0.108 * bd, ch: 0.04 },
    ],
    8, true, false,
  );
  M.color(kind === 'policia' || look.emblem === 'policia' ? '#111111' : shade(look.pants, 0.55));
  M.loft(
    [
      { y: 0.065, hx: 0.171 * bw, hz: 0.112 * bd, ch: 0.04 },
      { y: 0.1, hx: 0.169 * bw, hz: 0.11 * bd, ch: 0.04 },
    ],
    8, false, true,
  );
  M.color('#d8b24a').box(0, 0.082, 0.112 * bd + 0.004, 0.045, 0.028, 0.01);

  // ───────────── tronco ─────────────
  M.setBone(B.spine).color(top);
  M.loft(
    [
      { y: -0.06, hx: 0.155 * bw, hz: 0.1 * bd, ch: 0.035 },
      { y: 0.02, hx: 0.165 * bw, hz: frontZ, ch: 0.04 },
      { y: 0.2, hx: 0.178 * bw, hz: frontZ, ch: 0.04 },
      { y: 0.3, hx: 0.2 * bw, hz: frontZ, ch: 0.045 },
      { y: 0.355, hx: 0.205 * bw, hz: 0.106 * bd, ch: 0.05 },
      { y: 0.41, hx: 0.15 * bw, hz: 0.075 * bd, ch: 0.04 },
    ],
    8,
  );
  const fz = frontZ + 0.003;
  if (jacket) {
    if (jStyle === 'americana') {
      // cuello de pico con la camisa
      M.color(look.shirt).poly([[-0.075, 0.37], [0.075, 0.37], [0, 0.12]], fz, 1);
      M.color(shade(jacket, 0.72));
      M.poly([[-0.075, 0.37], [0, 0.12], [-0.02, 0.12], [-0.1, 0.33]], fz + 0.001, 1);
      M.poly([[0.075, 0.37], [0.1, 0.33], [0.02, 0.12], [0, 0.12]], fz + 0.001, 1);
      M.color('#e63946').decal(0.11 * bw, 0.27, fz, 0.035, 0.018); // pañuelo
      // botones
      M.color('#222222').decal(0, 0.09, fz, 0.016, 0.016).decal(0, 0.04, fz, 0.016, 0.016);
    } else {
      const w = jStyle === 'rebeca' ? 0.085 : 0.06;
      M.color(look.shirt).decal(0, 0.19, fz, w, 0.34);
      if (jStyle === 'rebeca') {
        M.color('#f4efe3');
        for (let i = 0; i < 4; i++) M.decal(w / 2 + 0.014, 0.3 - i * 0.075, fz, 0.016, 0.016);
      } else {
        // cremallera y cuello alto de chándal
        M.color('#dddddd').decal(-w / 2 - 0.004, 0.19, fz, 0.006, 0.34).decal(w / 2 + 0.004, 0.19, fz, 0.006, 0.34);
        M.color(jacket);
        M.loft(
          [
            { y: 0.36, hx: 0.105, hz: 0.085, ch: 0.035 },
            { y: 0.44, hx: 0.095, hz: 0.08, ch: 0.035 },
          ],
          8, false, false,
        );
      }
    }
  } else if (look.emblem === 'policia' || look.emblem === 'devueltos' || look.emblem === 'reparto') {
    // cuello de polo
    M.color(shade(look.shirt, 0.8));
    M.loft(
      [
        { y: 0.37, hx: 0.1, hz: 0.082, ch: 0.035 },
        { y: 0.425, hx: 0.092, hz: 0.078, ch: 0.035 },
      ],
      8, false, false,
    );
  }
  // emblema en el pecho (izquierda del personaje = +X) y grande en la espalda
  if (look.emblem) {
    drawEmblem(M, look.emblem, 0.08 * bw, 0.26, fz + 0.001, 0.075, 1, false);
    drawEmblem(M, look.emblem, 0, 0.2, -frontZ - 0.004, 0.17, -1, true);
  }
  if (look.chain) {
    M.color('#f2c230');
    const z = frontZ + 0.006;
    M.flatBar(-0.075, 0.36, -0.045, 0.262, z, 0.017).flatBar(-0.045, 0.262, 0, 0.226, z, 0.017);
    M.flatBar(0.075, 0.36, 0.045, 0.262, z, 0.017).flatBar(0.045, 0.262, 0, 0.226, z, 0.017);
    M.box(0, 0.198, z + 0.004, 0.05, 0.056, 0.014);
  }

  // ───────────── cuello y cabeza ─────────────
  M.setBone(B.neck).color(skin);
  M.loft(
    [
      { y: -0.03, hx: 0.052 * lw, hz: 0.05 * lw },
      { y: 0.07, hx: 0.048 * lw, hz: 0.047 * lw },
    ],
    6, false, false,
  );

  M.setBone(B.head).color(skin);
  M.loft(
    [
      { y: -0.005, hx: 0.11, hz: 0.11, ch: 0.04 },
      { y: 0.035, hx: 0.135, hz: 0.135, ch: 0.042 },
      { y: 0.245, hx: 0.135, hz: 0.135, ch: 0.042 },
      { y: 0.29, hx: 0.108, hz: 0.108, ch: 0.035 },
    ],
    8,
  );
  // orejas y nariz
  M.color(skin).box(0.142, 0.125, -0.005, 0.022, 0.068, 0.05).box(-0.142, 0.125, -0.005, 0.022, 0.068, 0.05);
  M.color(skinD).box(0, 0.098, 0.148, 0.036, 0.048, 0.03);
  if (kind === 'abuela' || kind === 'fiestero') {
    const blush = mix(skin, '#ff6b81', 0.4);
    M.color(blush).decal(0.08, 0.075, 0.136, 0.034, 0.02).decal(-0.08, 0.075, 0.136, 0.034, 0.02);
  }
  // vello facial
  if (look.facial === 'barba') {
    M.color(hairC);
    M.box(0, 0.016, 0.075, 0.24, 0.046, 0.15);
    M.box(0.11, 0.062, 0.07, 0.056, 0.072, 0.14);
    M.box(-0.11, 0.062, 0.07, 0.056, 0.072, 0.14);
  }
  if (look.facial === 'bigote' || look.facial === 'barba') {
    M.color(look.facial === 'barba' ? hairC : browC);
    // bigote: barra y dos puntas caídas (pegatinas)
    M.box(0, 0.076, 0.141, 0.108, 0.024, 0.016);
    M.decal(0.048, 0.058, 0.1495, 0.022, 0.03).decal(-0.048, 0.058, 0.1495, 0.022, 0.03);
  }

  // ojos normales
  M.setBone(B.eyes);
  if (!look.glasses) {
    for (const s of [1, -1]) {
      M.color('#ffffff').oct(s * 0.055, 0, 0.0015, 0.066, 0.082);
      M.color('#1e1b2e').oct(s * 0.05, -0.008, 0.003, 0.037, 0.05);
      M.color('#ffffff').decal(s * 0.043, 0.005, 0.0045, 0.013, 0.013);
    }
  }
  // cara de "muerto": ojos en X y lengua fuera (con gafas, la X va blanca encima del cristal)
  const xz = look.glasses ? 0.0195 : 0.003;
  M.setBone(B.eyesX).color(look.glasses ? '#f4f4f4' : '#1e1b2e');
  for (const s of [1, -1]) {
    const ex = s * 0.054;
    M.rotated(0, 0, Math.PI / 4, ex, 0, xz, () => M.decal(ex, 0, xz, 0.07, 0.017));
    M.rotated(0, 0, -Math.PI / 4, ex, 0, xz, () => M.decal(ex, 0, xz, 0.07, 0.017));
  }
  M.color('#ff6f91').box(0.014, -0.1, 0.008, 0.036, 0.046, 0.012);

  // cejas
  M.setBone(B.browL).color(browC).decal(0, 0, 0.002, 0.072, 0.024);
  M.setBone(B.browR).color(browC).decal(0, 0, 0.002, 0.072, 0.024);

  // boca (sonrisa en D) con dientes
  M.setBone(B.mouth).color('#5b1720');
  M.poly(
    [[-0.05, 0.013], [0.05, 0.013], [0.037, -0.006], [0.015, -0.018], [-0.015, -0.018], [-0.037, -0.006]],
    0.0015, 1,
  );
  M.color('#ffffff').decal(0, 0.007, 0.003, 0.076, 0.011);

  // pelo y gorra
  buildHair(M, look);
  if (look.cap) buildCap(M, look);
  if (look.glasses) {
    M.setBone(B.head).color('#111111');
    M.box(0, 0.16, 0.147, 0.222, 0.024, 0.012);
    for (const s of [1, -1]) {
      const x = s * 0.137;
      M.quad([x, 0.152, 0.14], [x, 0.166, 0.14], [x, 0.166, -0.01], [x, 0.152, -0.01], [s, 0, 0], true);
    }
    M.color(kind === 'fiestero' ? '#b0126b' : '#1a1f3a');
    M.decal(0.055, 0.122, 0.1535, 0.08, 0.064).decal(-0.055, 0.122, 0.1535, 0.08, 0.064);
    M.color('#8fa3ff').decal(0.034, 0.138, 0.154, 0.018, 0.009).decal(-0.076, 0.138, 0.154, 0.018, 0.009);
  }

  // ───────────── brazos ─────────────
  const sleeve = jacket ?? look.shirt;
  for (const s of [1, -1]) {
    const arm = s > 0 ? B.armL : B.armR, fore = s > 0 ? B.foreL : B.foreR, hand = s > 0 ? B.handL : B.handR;
    M.setBone(arm).color(sleeve);
    if (jacket) {
      M.loft([
        { y: 0.055, hx: 0.038, hz: 0.042, ch: 0.016 },
        { y: 0.01, hx: 0.055 * lw, hz: 0.058 * lw, ch: 0.02 },
        { y: -0.3, hx: 0.048 * lw, hz: 0.051 * lw, ch: 0.018 },
      ]);
    } else {
      M.loft([
        { y: 0.055, hx: 0.04, hz: 0.044, ch: 0.016 },
        { y: 0.01, hx: 0.058 * lw, hz: 0.06 * lw, ch: 0.02 },
        { y: -0.14, hx: 0.056 * lw, hz: 0.058 * lw, ch: 0.02 },
      ]);
      M.color(skin).loft([
        { y: -0.12, hx: 0.043 * lw, hz: 0.046 * lw, ch: 0.016 },
        { y: -0.3, hx: 0.041 * lw, hz: 0.043 * lw, ch: 0.016 },
      ], 8, false, true);
    }
    M.setBone(fore);
    if (jacket) {
      M.color(jacket).loft([
        { y: 0.03, hx: 0.047 * lw, hz: 0.049 * lw, ch: 0.018 },
        { y: -0.2, hx: 0.041 * lw, hz: 0.043 * lw, ch: 0.016 },
      ], 8, false, false);
      M.color(shade(jacket, 0.75)).loft([
        { y: -0.2, hx: 0.044 * lw, hz: 0.046 * lw, ch: 0.016 },
        { y: -0.24, hx: 0.043 * lw, hz: 0.045 * lw, ch: 0.016 },
      ]);
      if (jStyle === 'chandal') {
        M.color('#f7f7f7');
        M.setBone(arm).box(s * (0.052 * lw + 0.001), -0.13, 0, 0.008, 0.3, 0.022);
        M.setBone(fore).box(s * (0.044 * lw + 0.001), -0.09, 0, 0.008, 0.21, 0.02);
      }
    } else {
      M.color(skin).loft([
        { y: 0.03, hx: 0.041 * lw, hz: 0.043 * lw, ch: 0.016 },
        { y: -0.25, hx: 0.035 * lw, hz: 0.037 * lw, ch: 0.014 },
      ], 8, false, true);
    }
    // mano grande de muñeco con pulgar
    M.setBone(hand).color(skin);
    M.loft([
      { y: 0.012, hx: 0.028, hz: 0.042, ch: 0.012 },
      { y: -0.05, hx: 0.035, hz: 0.054, ch: 0.017 },
      { y: -0.12, hx: 0.027, hz: 0.045, ch: 0.016 },
    ], 8, false, true);
    M.box(-s * 0.02, -0.035, 0.045, 0.026, 0.05, 0.03);
  }

  // ───────────── piernas ─────────────
  for (const s of [1, -1]) {
    const thigh = s > 0 ? B.thighL : B.thighR, shin = s > 0 ? B.shinL : B.shinR, foot = s > 0 ? B.footL : B.footR;
    M.setBone(thigh).color(look.pants);
    if (look.shorts) {
      M.loft([
        { y: 0.06, hx: 0.076 * lw, hz: 0.082 * lw, ch: 0.03 },
        { y: -0.2, hx: 0.072 * lw, hz: 0.078 * lw, ch: 0.028 },
        { y: -0.25, hx: 0.073 * lw, hz: 0.079 * lw, ch: 0.028 },
      ], 8, false, true);
      M.color(skin).loft([
        { y: -0.23, hx: 0.058 * lw, hz: 0.062 * lw, ch: 0.024 },
        { y: -0.43, hx: 0.05 * lw, hz: 0.054 * lw, ch: 0.02 },
      ], 8, false, false);
      M.setBone(shin).color(skin).loft([
        { y: 0.035, hx: 0.05 * lw, hz: 0.054 * lw, ch: 0.02 },
        { y: -0.17, hx: 0.05 * lw, hz: 0.056 * lw, ch: 0.02 },
        { y: -0.33, hx: 0.04 * lw, hz: 0.042 * lw, ch: 0.016 },
      ], 8, true, false);
      M.color('#f4f4f4').loft([
        { y: -0.33, hx: 0.044 * lw, hz: 0.046 * lw, ch: 0.016 },
        { y: -0.39, hx: 0.043 * lw, hz: 0.045 * lw, ch: 0.016 },
      ]);
    } else {
      M.loft([
        { y: 0.06, hx: 0.074 * lw, hz: 0.08 * lw, ch: 0.03 },
        { y: -0.2, hx: 0.068 * lw, hz: 0.074 * lw, ch: 0.028 },
        { y: -0.43, hx: 0.056 * lw, hz: 0.06 * lw, ch: 0.022 },
      ], 8, false, true);
      M.setBone(shin).color(look.pants).loft([
        { y: 0.06, hx: 0.058 * lw, hz: 0.062 * lw, ch: 0.022 },
        { y: -0.17, hx: 0.055 * lw, hz: 0.062 * lw, ch: 0.022 },
        { y: -0.35, hx: 0.049 * lw, hz: 0.051 * lw, ch: 0.02 },
        { y: -0.385, hx: 0.053 * lw, hz: 0.055 * lw, ch: 0.02 },
      ]);
    }
    // zapatilla
    M.setBone(foot).color(look.shoes);
    M.loft([
      { y: -0.066, hx: 0.062, hz: 0.142, ch: 0.045, cz: 0.058 },
      { y: -0.018, hx: 0.06, hz: 0.136, ch: 0.045, cz: 0.052 },
      { y: 0.03, hx: 0.052, hz: 0.07, ch: 0.03, cz: -0.012 },
    ]);
    const soleC = luminance(look.shoes) > 0.5 ? '#8f8a86' : '#f1f1f1';
    M.color(soleC).box(0, -0.077, 0.058, 0.132, 0.026, 0.298);
  }

  // ───────────── accesorios que se muestran según la pose ─────────────
  // estrellitas de mareo alrededor de la cabeza
  M.setBone(B.stars).color('#ffe14d');
  const star: [number, number][] = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const r = k % 2 === 0 ? 0.075 : 0.026;
    star.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const x = Math.sin(a) * 0.22, z = Math.cos(a) * 0.22;
    M.rotated(0, a, 0, x, 0, z, () => {
      M.poly(star, z, 1, x, 0, true);
      M.poly(star, z, -1, x, 0, true);
    });
  }
  // móvil en la mano derecha (palma hacia +X)
  M.setBone(B.phone).color('#1d1d24').box(0.04, 0, 0.0, 0.012, 0.125, 0.066);
  M.color('#6fd3ff');
  M.rotated(0, Math.PI / 2, 0, 0.047, 0, 0, () => M.decal(0.047, 0.005, 0, 0.056, 0.1));
  // cinta de embalar en el suelo (para la pose "taped", cuerpo tumbado boca arriba)
  M.setBone(B.ground).color('#d9b27a');
  // alturas según la complexión (el cuerpo tumbado tiene la espalda a 0,135 m)
  const tapes: [number, number, number][] = [
    [-0.28, 0.135 + frontZ + 0.014, 0.25 * bw + 0.08],
    [0.27, 0.135 + 0.08 * lw + 0.032, 0.2 * lw + 0.06],
    [0.68, 0.135 + 0.06 * lw + 0.02, 0.15 * lw + 0.05],
  ];
  for (const [z, h, w] of tapes) {
    const z0 = z - 0.055, z1 = z + 0.055, y0 = 0.004;
    M.quad([-w, h, z0], [w, h, z0], [w, h, z1], [-w, h, z1], [0, 1, 0], true);
    for (const s of [1, -1]) {
      const x = s * w, x2 = s * (w + 0.09);
      M.quad([x, h, z0], [x, h, z1], [x, y0, z1], [x, y0, z0], [s, 0, 0], true);
      M.quad([x, y0, z0], [x, y0, z1], [x2, y0, z1], [x2, y0, z0], [0, 1, 0], true);
    }
  }

  const triangles = M.triangles;
  return { geometry: M.build(), triangles, chestZ: frontZ };
}

// ─────────────────────────────── pelo ───────────────────────────────

function topCap(M: MeshBuilder, y0: number, grow: number, height: number) {
  M.loft([
    { y: y0, hx: 0.14 + grow, hz: 0.141 + grow, ch: 0.045 },
    { y: 0.255, hx: 0.142 + grow, hz: 0.143 + grow, ch: 0.046, cz: -0.002 },
    { y: 0.295 + height, hx: 0.115 + grow * 0.7, hz: 0.118 + grow * 0.7, ch: 0.04, cz: -0.006 },
  ]);
}
function backBlock(M: MeshBuilder, grow: number, low = 0.045) {
  const yTop = 0.215;
  M.roundBox(0, (low + yTop) / 2, -0.092 - grow * 0.5, 0.284 + grow * 2, yTop - low, 0.112 + grow, 0.04);
}

function buildHair(M: MeshBuilder, look: CharacterLookExtra) {
  const style = look.hair;
  const c = look.hairColor;
  M.setBone(B.head);
  if (look.cap) {
    // con gorra solo asoma lo de detrás y los lados
    M.color(c);
    switch (style) {
      case 'calvo':
        M.box(0.141, 0.172, -0.078, 0.014, 0.05, 0.1).box(-0.141, 0.172, -0.078, 0.014, 0.05, 0.1);
        break;
      case 'largo':
        M.roundBox(0, 0.06, -0.1, 0.3, 0.3, 0.1, 0.035);
        M.box(0.145, 0.09, -0.03, 0.028, 0.22, 0.15).box(-0.145, 0.09, -0.03, 0.028, 0.22, 0.15);
        break;
      case 'coleta':
        backBlock(M, 0.004);
        ponytail(M);
        break;
      case 'afro':
        M.roundBox(0.15, 0.16, -0.03, 0.09, 0.14, 0.24, 0.04);
        M.roundBox(-0.15, 0.16, -0.03, 0.09, 0.14, 0.24, 0.04);
        M.roundBox(0, 0.13, -0.12, 0.3, 0.18, 0.1, 0.04);
        break;
      case 'moño':
        backBlock(M, 0.004);
        M.roundBox(0, 0.09, -0.16, 0.1, 0.08, 0.07, 0.03);
        break;
      default:
        backBlock(M, style === 'rapado' ? 0.002 : 0.005);
        break;
    }
    return;
  }
  switch (style) {
    case 'calvo':
      M.color(c);
      M.box(0.141, 0.172, -0.078, 0.014, 0.055, 0.1).box(-0.141, 0.172, -0.078, 0.014, 0.055, 0.1);
      M.roundBox(0, 0.16, -0.137, 0.23, 0.06, 0.03, 0.01);
      break;
    case 'rapado':
      M.color(mix(c, look.skin, 0.25));
      topCap(M, 0.215, 0.002, 0.004);
      backBlock(M, 0.002);
      break;
    case 'corto':
      M.color(c);
      topCap(M, 0.205, 0.008, 0.03);
      backBlock(M, 0.006);
      M.rotated(0, 0, 0.18, 0.02, 0.23, 0.15, () => M.box(0.02, 0.23, 0.148, 0.2, 0.04, 0.022));
      M.box(0.141, 0.17, 0.06, 0.012, 0.08, 0.045).box(-0.141, 0.17, 0.06, 0.012, 0.08, 0.045);
      break;
    case 'largo':
      M.color(c);
      topCap(M, 0.205, 0.008, 0.025);
      M.roundBox(0, 0.06, -0.1, 0.3, 0.33, 0.1, 0.035);
      M.box(0.145, 0.08, -0.03, 0.028, 0.26, 0.15).box(-0.145, 0.08, -0.03, 0.028, 0.26, 0.15);
      M.rotated(0, 0, -0.12, 0, 0.23, 0.15, () => M.box(-0.02, 0.232, 0.148, 0.22, 0.036, 0.022));
      break;
    case 'cresta':
      M.color(mix(c, look.skin, 0.55));
      topCap(M, 0.215, 0.002, 0.004);
      backBlock(M, 0.002);
      M.color(c);
      for (let i = 0; i < 4; i++) {
        const z = 0.1 - i * 0.075;
        const h = 0.13 - Math.abs(i - 1.2) * 0.02;
        M.rotated(-0.35, 0, 0, 0, 0.28, z, () =>
          M.loft([
            { y: 0.27, hx: 0.028, hz: 0.045, cz: z },
            { y: 0.28 + h, hx: 0.004, hz: 0.006, cz: z },
          ], 4, false, false),
        );
      }
      break;
    case 'moño':
      M.color(c);
      topCap(M, 0.205, 0.006, 0.012);
      backBlock(M, 0.005);
      M.roundBox(0, 0.345, -0.05, 0.13, 0.1, 0.13, 0.04, 0.02);
      break;
    case 'afro':
      M.color(c);
      M.loft([
        { y: 0.2, hx: 0.19, hz: 0.175, ch: 0.08, cz: -0.03 },
        { y: 0.27, hx: 0.22, hz: 0.21, ch: 0.09, cz: -0.025 },
        { y: 0.38, hx: 0.205, hz: 0.195, ch: 0.085, cz: -0.025 },
        { y: 0.435, hx: 0.14, hz: 0.13, ch: 0.06, cz: -0.025 },
      ]);
      M.roundBox(0, 0.12, -0.1, 0.4, 0.2, 0.2, 0.07);
      break;
    case 'coleta':
      M.color(c);
      topCap(M, 0.205, 0.006, 0.012);
      backBlock(M, 0.005);
      ponytail(M);
      break;
  }
}

function ponytail(M: MeshBuilder) {
  M.loft(
    [
      { y: 0.2, hx: 0.04, hz: 0.035, cz: -0.17 },
      { y: 0.06, hx: 0.048, hz: 0.042, cz: -0.19 },
      { y: -0.08, hx: 0.018, hz: 0.018, cz: -0.175 },
    ],
    6,
  );
  M.color('#ff4f8b').box(0, 0.19, -0.165, 0.06, 0.03, 0.045);
}

function buildCap(M: MeshBuilder, look: CharacterLookExtra) {
  M.setBone(B.head);
  const c = look.capColor;
  if (look.emblem === 'policia') {
    M.color('#111111').loft([
      { y: 0.212, hx: 0.146, hz: 0.146, ch: 0.05 },
      { y: 0.25, hx: 0.149, hz: 0.149, ch: 0.05 },
    ], 8, true, false);
    M.color(c).loft([
      { y: 0.25, hx: 0.149, hz: 0.149, ch: 0.05 },
      { y: 0.318, hx: 0.174, hz: 0.174, ch: 0.065 },
      { y: 0.338, hx: 0.167, hz: 0.167, ch: 0.06 },
    ], 8, false, true);
    M.color('#0c0c0c');
    M.rotated(0.3, 0, 0, 0, 0.222, 0.14, () => M.box(0, 0.222, 0.2, 0.24, 0.014, 0.12));
    drawEmblem(M, 'policia', 0, 0.29, 0.165, 0.06, 1, false);
    return;
  }
  M.color(c).loft([
    { y: 0.212, hx: 0.149, hz: 0.149, ch: 0.05 },
    { y: 0.285, hx: 0.147, hz: 0.147, ch: 0.05 },
    { y: 0.338, hx: 0.116, hz: 0.116, ch: 0.045 },
  ]);
  M.box(0, 0.345, 0, 0.03, 0.014, 0.03);
  M.color(shade(c, 0.7));
  M.rotated(0.14, 0, 0, 0, 0.222, 0.14, () => M.box(0, 0.222, 0.205, 0.235, 0.016, 0.135));
  if (look.emblem) drawEmblem(M, look.emblem, 0, 0.254, 0.1505, 0.056, 1, false);
}

// ─────────────────────────────── emblemas ───────────────────────────────

/**
 * Dibuja un logotipo plano. (cx, cy) centro, z profundidad, s tamaño, dir +1 = mira a +Z, -1 = a -Z.
 * En la espalda se invierte X para que se lea igual desde detrás.
 */
function drawEmblem(M: MeshBuilder, kind: 'reparto' | 'devueltos' | 'policia', cx: number, cy: number, z: number, s: number, dir: number, back: boolean) {
  const U = (u: number) => cx + u * s * dir;
  const V = (v: number) => cy + v * s;
  const P = (pts: [number, number][], dz: number) =>
    M.poly(pts.map(([u, v]) => [U(u) - cx, V(v) - cy] as [number, number]), z + dz * dir, dir, cx, cy);
  const R = (u0: number, v0: number, u1: number, v1: number, dz: number) =>
    P([[u0, v0], [u1, v0], [u1, v1], [u0, v1]], dz);
  if (kind === 'reparto') {
    M.color('#3a2414');
    R(-0.5, -0.5, 0.5, 0.5, 0);
    M.color('#ffd23f');
    R(-0.43, -0.43, 0.43, 0.43, 0.001);
    M.color('#c98f4a');
    R(-0.43, 0.12, 0.43, 0.26, 0.002);
    M.color('#d62828');
    R(-0.32, -0.25, 0.08, -0.1, 0.002);
    P([[0.06, -0.36], [0.33, -0.175], [0.06, 0.01]], 0.002);
  } else if (kind === 'devueltos') {
    const oct: [number, number][] = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      oct.push([Math.cos(a) * 0.52, Math.sin(a) * 0.52]);
    }
    M.color('#f3e8ff');
    P(oct, 0);
    M.color('#3c096c');
    // flecha de "devolver": gancho que vuelve hacia la izquierda
    R(-0.08, 0.06, 0.26, 0.2, 0.001);
    R(0.14, -0.26, 0.28, 0.2, 0.001);
    R(-0.1, -0.26, 0.28, -0.12, 0.001);
    P([[-0.08, -0.04], [-0.08, 0.3], [-0.34, 0.13]], 0.001);
  } else {
    // placa de policía (dorada) o banda reflectante en la espalda
    if (back) {
      M.color('#ffe14d');
      R(-0.88, 0.3, 0.88, 0.6, 0);
      M.color('#1d2d5c');
      for (let i = 0; i < 4; i++) R(-0.72 + i * 0.42, 0.37, -0.52 + i * 0.42, 0.53, 0.001);
    } else {
      const hex = (r: number): [number, number][] => {
        const pts: [number, number][] = [];
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + Math.PI / 2;
          pts.push([Math.cos(a) * r, Math.sin(a) * r]);
        }
        return pts;
      };
      M.color('#f5c518');
      P(hex(0.55), 0);
      M.color('#b8860b');
      P(hex(0.32), 0.001);
      M.color('#fff3a0');
      P(hex(0.14), 0.002);
    }
  }
}
