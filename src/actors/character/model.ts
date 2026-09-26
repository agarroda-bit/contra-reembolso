// Geometría del muñeco a partir de su aspecto: todas las piezas en UNA geometría,
// cada pieza pegada a su hueso y con su color por vértice.
import * as THREE from 'three';
import { MeshBuilder } from './builder';
import { B, BIND_WORLD } from './skeleton';
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
  /** Altura de lo más alto de la cabeza (pelo, gorra) sobre el hueso de la cabeza. */
  headTop: number;
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
  // disfraces: el de pollo es un mono amarillo de mangas largas; el de paquete, una caja de cartón
  const costume = look.costume ?? null;
  const chicken = costume === 'pollo';
  const boxSuit = costume === 'paquete';
  const jacket = chicken ? CHICKEN_YELLOW : costume ? null : (look.jacket ?? null);
  const top = jacket ?? look.shirt;
  const jStyle = look.jacketStyle ?? 'chandal';
  const kind = look.kind;
  const frontZ = 0.113 * bd;
  // lo que va en la cabeza: casco y peluca tapan todo el pelo; sombrero y gorra dejan ver lo de detrás
  const hat = chicken ? 'pollo' : costume ? null : (look.hat ?? null);
  const capOn = look.cap && !hat && !costume;
  const hairShown = hat === 'casco' || hat === 'peluca' || hat === 'pollo' ? 'none' : capOn || hat === 'paja' ? 'covered' : 'full';

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
    8, false, true, // la tapa de abajo queda dentro del cinturón
  );
  const fz = frontZ + 0.003;
  if (chicken) {
    // pechuga blanca de peluche
    M.color('#fff8e7').poly([[-0.1, 0.34], [0.1, 0.34], [0.13, 0.16], [0.06, 0.02], [-0.06, 0.02], [-0.13, 0.16]], fz, 1);
  } else if (jacket && (jStyle === 'bata' || jStyle === 'gala')) {
    buildWrapFront(M, look, jacket, jStyle, fz, frontZ, bw);
  } else if (jacket) {
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
  if (look.emblem && !costume) {
    drawEmblem(M, look.emblem, 0.08 * bw, 0.26, fz + 0.001, 0.075, 1, false);
    // con capa, el de la espalda no se ve: se ahorra
    if (!look.cape) drawEmblem(M, look.emblem, 0, 0.2, -frontZ - 0.004, 0.17, -1, true);
  }
  if (!costume) {
    if (look.bumBag) buildBumBag(M, look.bumBag, frontZ, bw);
    if (look.cape) buildCape(M, look.cape, frontZ, bw, bd);
  }
  if (boxSuit) buildBoxSuit(M);
  if (look.chain && !costume) {
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
  if ((look.facial === 'bigote' || look.facial === 'barba') && look.fake !== 'bigotazo') {
    M.color(look.facial === 'barba' ? hairC : browC);
    // bigote: barra y dos puntas caídas (pegatinas)
    M.box(0, 0.076, 0.141, 0.108, 0.024, 0.016);
    M.decal(0.048, 0.058, 0.1495, 0.022, 0.03).decal(-0.048, 0.058, 0.1495, 0.022, 0.03);
  }
  if (look.fake === 'bigotazo') buildBigotazo(M);

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

  // pelo y gorra (o lo que se lleve en la cabeza)
  if (hairShown !== 'none') buildHair(M, look, hairShown === 'covered');
  if (capOn) buildCap(M, look);
  if (hat) buildHat(M, hat);
  if (look.glasses) {
    const heart = look.glassesStyle === 'corazon';
    M.setBone(B.head).color(heart ? '#ff2e88' : '#111111');
    M.box(0, 0.16, 0.147, 0.222, 0.024, 0.012);
    for (const s of [1, -1]) {
      const x = s * 0.137;
      M.quad([x, 0.152, 0.14], [x, 0.166, 0.14], [x, 0.166, -0.01], [x, 0.152, -0.01], [s, 0, 0], true);
    }
    if (heart) {
      // cristales en forma de corazón, más grandes que la cara
      M.color('#ff4f81');
      M.poly(HEART.map(([u, v]) => [u * 1.3, v * 1.3] as [number, number]), 0.1535, 1, 0.058, 0.118, true);
      M.poly(HEART.map(([u, v]) => [u * 1.3, v * 1.3] as [number, number]), 0.1535, 1, -0.058, 0.118, true);
      M.color('#ffd0e4').decal(0.036, 0.142, 0.154, 0.016, 0.016).decal(-0.08, 0.142, 0.154, 0.016, 0.016);
    } else {
      M.color(kind === 'fiestero' ? '#b0126b' : '#1a1f3a');
      M.decal(0.055, 0.122, 0.1535, 0.08, 0.064).decal(-0.055, 0.122, 0.1535, 0.08, 0.064);
      M.color('#8fa3ff').decal(0.034, 0.138, 0.154, 0.018, 0.009).decal(-0.076, 0.138, 0.154, 0.018, 0.009);
    }
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
      if (jStyle === 'chandal' && !chicken) {
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
    M.setBone(foot);
    if (chicken) {
      buildChickenFoot(M);
      continue;
    }
    if (look.shoesStyle === 'pantuflas') {
      buildSlipper(M);
      continue;
    }
    // zapatilla
    M.color(look.shoes);
    M.loft([
      { y: -0.066, hx: 0.062, hz: 0.142, ch: 0.045, cz: 0.058 },
      { y: -0.018, hx: 0.06, hz: 0.136, ch: 0.045, cz: 0.052 },
      { y: 0.03, hx: 0.052, hz: 0.07, ch: 0.03, cz: -0.012 },
    ], 8, false, true); // la tapa de abajo la tapa la suela
    const soleC = luminance(look.shoes) > 0.5 ? '#8f8a86' : '#f1f1f1';
    M.color(soleC).loft([
      { y: -0.09, hx: 0.066, hz: 0.149, cz: 0.058 },
      { y: -0.064, hx: 0.066, hz: 0.149, cz: 0.058 },
    ], 4, true, false);
  }
  // faldón de la bata (hasta las rodillas) y cola de plumas del pollo
  if (jacket && jStyle === 'bata' && !costume) buildRobeSkirt(M, jacket, bw, bd);
  if (chicken) buildChickenTail(M, bd);

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
  const geometry = M.build();
  // lo más alto de la cabeza (para el enganche 'head': sombreros, paquetes...)
  const pos = geometry.getAttribute('position'), si = geometry.getAttribute('skinIndex');
  let topY = 0;
  for (let i = 0; i < pos.count; i++) if (si.getX(i) === B.head) topY = Math.max(topY, pos.getY(i));
  const headTop = Math.max(0.29, topY - BIND_WORLD[B.head][1]);
  // con el disfraz de paquete, lo que se lleva en el pecho (el paquete del encargo) va por fuera de la caja
  return { geometry, triangles, chestZ: boxSuit ? BOX_SUIT.hz : frontZ, headTop };
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

function buildHair(M: MeshBuilder, look: CharacterLookExtra, covered = !!look.cap) {
  const style = look.hair;
  const c = look.hairColor;
  M.setBone(B.head);
  if (covered) {
    // con gorra (o sombrero) solo asoma lo de detrás y los lados
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
        // cajas simples (con gorra casi no se ve): así el peor caso de ropa sigue por debajo de 1.500 triángulos
        M.box(0.15, 0.16, -0.03, 0.08, 0.14, 0.23);
        M.box(-0.15, 0.16, -0.03, 0.08, 0.14, 0.23);
        M.box(0, 0.13, -0.12, 0.3, 0.18, 0.1);
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
  M.color(shade(c, 0.7));
  M.rotated(0.14, 0, 0, 0, 0.222, 0.14, () => M.box(0, 0.222, 0.205, 0.235, 0.016, 0.135));
  if (look.emblem) drawEmblem(M, look.emblem, 0, 0.254, 0.1505, 0.056, 1, false);
}

// ─────────────────────────────── ropa de Moda Paquetona ───────────────────────────────
// Cada pieza cuesta pocos triángulos: el peor caso de ropa comprada sigue en torno a 1.500.

const CHICKEN_YELLOW = '#ffd93b';
/** Corazón (centro aproximado en 0,0): ancho 0,08, alto 0,07. */
const HEART: [number, number][] = [
  [0, -0.049], [0.026, -0.025], [0.04, -0.005], [0.038, 0.011], [0.026, 0.021], [0.012, 0.019], [0, 0.007],
  [-0.012, 0.019], [-0.026, 0.021], [-0.038, 0.011], [-0.04, -0.005], [-0.026, -0.025],
];
/** Caja del disfraz de paquete (espacio del hueso spine). */
const BOX_SUIT = { hx: 0.225, hz: 0.215, y0: -0.27, y1: 0.29 };

/** Casco de moto, sombrero de paja, peluca afro arcoíris o la capucha del disfraz de pollo. */
function buildHat(M: MeshBuilder, hat: 'casco' | 'paja' | 'peluca' | 'pollo') {
  M.setBone(B.head);
  if (hat === 'casco' || hat === 'pollo') {
    const chick = hat === 'pollo';
    const c = chick ? CHICKEN_YELLOW : '#e63946';
    const g = chick ? 0.012 : 0;
    // cúpula por encima de las cejas y protecciones a los lados y en la nuca (la cara queda al aire)
    M.color(c).loft([
      { y: 0.22, hx: 0.172 + g, hz: 0.176 + g, ch: 0.06, cz: -0.012 },
      { y: 0.33, hx: 0.16 + g, hz: 0.164 + g, ch: 0.056, cz: -0.014 },
      { y: 0.405 + g * 2, hx: 0.092 + g, hz: 0.096 + g, ch: 0.034, cz: -0.018 },
    ], 8, false, true);
    M.box(0.16 + g, 0.105, -0.03, 0.032, 0.24, 0.25).box(-0.16 - g, 0.105, -0.03, 0.032, 0.24, 0.25);
    M.box(0, 0.105, -0.162 - g, 0.3 + g * 2, 0.24, 0.04);
    if (!chick) {
      // visera subida sobre la frente y un rayo amarillo a cada lado
      M.color('#223a70');
      M.rotated(-0.42, 0, 0, 0, 0.27, 0.17, () => M.box(0, 0.27, 0.17, 0.28, 0.075, 0.02));
      M.color('#ffd23f');
      for (const s of [1, -1]) {
        const px = s * 0.1765, py = 0.105, pz = -0.03;
        M.rotated(0, (s * Math.PI) / 2, 0, px, py, pz, () => {
          M.poly([[-0.005, 0.075], [0.035, 0.075], [0.01, 0.01], [-0.025, 0.01]], pz, 1, px, py);
          M.poly([[-0.03, 0.02], [0.03, 0.02], [-0.035, -0.08]], pz, 1, px, py);
        });
      }
      return;
    }
    // pollo: cresta roja, pico naranja, barbilla roja y ojos de peluche
    M.color('#ff3b3b');
    ([[0.07, 0.1], [-0.01, 0.13], [-0.09, 0.09]] as [number, number][]).forEach(([z, h]) =>
      M.rotated(-0.25, 0, 0, 0, 0.43, z, () => M.box(0, 0.42 + h / 2, z, 0.036, h, 0.075)),
    );
    M.box(0, 0.235, 0.205, 0.04, 0.055, 0.03);
    M.color('#ff9f1c');
    const beak: [number, number, number][] = [[0.06, 0.255, 0.17], [-0.06, 0.255, 0.17], [-0.06, 0.315, 0.16], [0.06, 0.315, 0.16]];
    const tip: [number, number, number] = [0, 0.27, 0.29];
    const inside: [number, number, number] = [0, 0.285, 0.19];
    for (let k = 0; k < 4; k++) M.tri(beak[k], beak[(k + 1) % 4], tip, inside);
    M.rotated(-0.63, 0, 0, 0, 0.35, 0.155, () => {
      M.color('#ffffff').decal(0.07, 0.35, 0.158, 0.05, 0.05).decal(-0.07, 0.35, 0.158, 0.05, 0.05);
      M.color('#1b1030').decal(0.072, 0.345, 0.16, 0.025, 0.028).decal(-0.068, 0.345, 0.16, 0.025, 0.028);
    });
    return;
  }
  if (hat === 'paja') {
    // un poco echado hacia atrás, de ir a la feria
    M.rotated(-0.14, 0, 0, 0, 0.26, 0, () => {
      M.color('#d9b04f').loft([
        { y: 0.236, hx: 0.37, hz: 0.365 },
        { y: 0.254, hx: 0.35, hz: 0.345 },
      ], 10);
      M.color('#f1cf6e').loft([
        { y: 0.22, hx: 0.158, hz: 0.162, ch: 0.05 },
        { y: 0.35, hx: 0.148, hz: 0.152, ch: 0.05 },
        { y: 0.38, hx: 0.118, hz: 0.122, ch: 0.04 },
      ], 8, false, true);
      M.color('#e63946').loft([
        { y: 0.252, hx: 0.162, hz: 0.166, ch: 0.05 },
        { y: 0.292, hx: 0.16, hz: 0.164, ch: 0.05 },
      ], 8, false, false);
    });
    return;
  }
  // peluca afro arcoíris: por delante empieza detrás de la frente, para que se vean cejas y ojos
  const R = [
    { y: -0.01, hx: 0.19, hz: 0.15, ch: 0.07, cz: -0.08 },
    { y: 0.19, hx: 0.25, hz: 0.19, ch: 0.09, cz: -0.07 },
    { y: 0.31, hx: 0.29, hz: 0.28, ch: 0.12, cz: -0.02 },
    { y: 0.45, hx: 0.28, hz: 0.27, ch: 0.12, cz: -0.02 },
    { y: 0.56, hx: 0.2, hz: 0.19, ch: 0.08, cz: -0.02 },
    { y: 0.6, hx: 0.1, hz: 0.1, ch: 0.04, cz: -0.02 },
  ];
  const cols = ['#3a86ff', '#06d6a0', '#ffd23f', '#ff7b1a', '#e63946'];
  for (let i = 0; i < 5; i++) M.color(cols[i]).loft([R[i], R[i + 1]], 8, i === 0, i === 4);
}

/** Bigotazo postizo de manillar, con las puntas enroscadas hacia arriba. */
function buildBigotazo(M: MeshBuilder) {
  M.setBone(B.head).color('#2a1a12');
  M.box(0, 0.075, 0.15, 0.1, 0.034, 0.024);
  for (const s of [1, -1]) {
    rod(M, s * 0.045, 0.073, s * 0.105, 0.061, 0.148, 0.03, 0.022);
    rod(M, s * 0.105, 0.061, s * 0.137, 0.093, 0.146, 0.022, 0.02);
  }
}

/** Barra fina entre dos puntos del plano XY, sin tapas en las puntas (8 triángulos). */
function rod(M: MeshBuilder, x1: number, y1: number, x2: number, y2: number, z: number, thick: number, depth: number) {
  const len = Math.hypot(x2 - x1, y2 - y1) + thick * 0.5;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const ang = Math.atan2(y2 - y1, x2 - x1) - Math.PI / 2;
  M.rotated(0, 0, ang, mx, my, z, () =>
    M.loft([
      { y: my - len / 2, hx: thick / 2, hz: depth / 2, cx: mx, cz: z },
      { y: my + len / 2, hx: thick / 2, hz: depth / 2, cx: mx, cz: z },
    ], 4, false, false),
  );
}

/** Frente de la bata de guatiné (cuello cruzado y cinturón con lazo) o del traje de gala (pajarita y lentejuelas). */
function buildWrapFront(M: MeshBuilder, look: CharacterLookExtra, jacket: string, style: 'bata' | 'gala', fz: number, frontZ: number, bw: number) {
  if (style === 'gala') {
    M.color(look.shirt).poly([[-0.075, 0.37], [0.075, 0.37], [0, 0.12]], fz, 1);
    M.color(shade(jacket, 0.72));
    M.poly([[-0.075, 0.37], [0, 0.12], [-0.02, 0.12], [-0.1, 0.33]], fz + 0.001, 1);
    M.poly([[0.075, 0.37], [0.1, 0.33], [0.02, 0.12], [0, 0.12]], fz + 0.001, 1);
    // pajarita
    M.color('#111111');
    M.poly([[-0.062, 0.372], [-0.062, 0.312], [0, 0.342]], fz + 0.003, 1);
    M.poly([[0.062, 0.372], [0, 0.342], [0.062, 0.312]], fz + 0.003, 1);
    M.decal(0, 0.342, fz + 0.004, 0.024, 0.028);
    M.decal(0, 0.09, fz, 0.016, 0.016).decal(0, 0.04, fz, 0.016, 0.016);
    // lentejuelas que brillan (delante y detrás)
    M.color('#fff6c9');
    for (const [x, y] of [[0.13, 0.12], [-0.13, 0.21], [0.15, 0.29], [-0.14, 0.05], [0.11, 0.01]] as [number, number][]) M.decal(x * bw, y, fz, 0.02, 0.02);
    for (const [x, y] of [[0.1, 0.3], [-0.08, 0.22], [0.05, 0.08], [-0.13, 0.04], [0.15, 0.16], [-0.02, 0.33]] as [number, number][]) M.decal(x * bw, y, -frontZ - 0.003, 0.02, 0.02, -1);
    return;
  }
  // bata: el pijama asoma por el cuello; solapas cruzadas y cinturón de la misma tela con lazo
  const trim = shade(jacket, 0.78);
  M.color(look.shirt).poly([[-0.07, 0.37], [0.07, 0.37], [0, 0.2]], fz, 1);
  M.color(trim);
  M.flatBar(-0.07, 0.37, 0.055, 0.02, fz + 0.001, 0.04);
  M.flatBar(0.07, 0.37, -0.005, 0.19, fz + 0.002, 0.04);
  M.loft([
    { y: -0.035, hx: 0.166 * bw, hz: frontZ * 0.97 + 0.007, ch: 0.04 },
    { y: 0.02, hx: 0.171 * bw, hz: frontZ + 0.007, ch: 0.045 },
  ], 8, false, false);
  M.decal(0.07 * bw, -0.008, frontZ + 0.012, 0.055, 0.045);
  M.decal(0.058 * bw, -0.085, frontZ + 0.021, 0.024, 0.11).decal(0.086 * bw, -0.078, frontZ + 0.022, 0.024, 0.1);
}

/** Faldón de la bata, colgado de la cadera (hasta medio muslo), con dobladillo y bolsillos. */
function buildRobeSkirt(M: MeshBuilder, color: string, bw: number, bd: number) {
  M.setBone(B.hips).color(color);
  M.loft([
    { y: 0.1, hx: 0.176 * bw, hz: 0.118 * bd, ch: 0.045 },
    { y: -0.16, hx: 0.19 * bw, hz: 0.138 * bd, ch: 0.05 },
    { y: -0.36, hx: 0.2 * bw, hz: 0.158 * bd, ch: 0.055 },
  ], 8, false, false);
  M.color(shade(color, 0.78)).decal(0.095 * bw, -0.12, 0.142 * bd, 0.07, 0.07).decal(-0.095 * bw, -0.12, 0.142 * bd, 0.07, 0.07);
}

/** Pantufla rosa de conejito (una por pie). */
function buildSlipper(M: MeshBuilder) {
  const pink = '#ffb3d1';
  M.color(pink).loft([
    { y: -0.09, hx: 0.07, hz: 0.152, ch: 0.05, cz: 0.058 },
    { y: -0.035, hx: 0.074, hz: 0.152, ch: 0.056, cz: 0.056 },
    { y: 0.025, hx: 0.06, hz: 0.085, ch: 0.04, cz: 0.0 },
  ], 8, false, true); // la suela no se ve: pisa el suelo
  // orejas de conejo sobre la puntera, un poco abiertas (planas, por las dos caras)
  M.color('#fff0f6');
  for (const e of [1, -1]) {
    M.rotated(-0.3, 0, -e * 0.25, e * 0.03, -0.03, 0.15, () => M.decal(e * 0.03, 0.03, 0.15, 0.032, 0.12, 1).decal(e * 0.03, 0.03, 0.15, 0.032, 0.12, -1));
  }
}

/** Pata de pollo naranja con tres dedos. */
function buildChickenFoot(M: MeshBuilder) {
  M.color('#ff9f1c');
  M.box(0, -0.055, 0.0, 0.05, 0.07, 0.06);
  for (const a of [-0.5, 0, 0.5]) M.rotated(0, a, 0, 0, -0.078, 0.0, () => M.box(0, -0.078, 0.1, 0.03, 0.024, 0.2));
}

/** Cola de plumas blancas del disfraz de pollo (en la cadera, por detrás). */
function buildChickenTail(M: MeshBuilder, bd: number) {
  M.setBone(B.hips).color('#fff8e7');
  const z = -0.1 * bd;
  for (const k of [-1, 0, 1]) M.rotated(-0.75, 0, k * 0.5, 0, 0, z, () => M.box(0, 0.11, z, 0.07, 0.24, 0.03));
}

/** Riñonera cruzada al pecho: bolso delante y correa en bandolera por delante y por detrás. */
function buildBumBag(M: MeshBuilder, color: string, frontZ: number, bw: number) {
  M.setBone(B.spine);
  const z = frontZ + 0.006;
  M.color('#1b1030');
  M.flatBar(-0.06 * bw, 0.13, 0.15 * bw, 0.39, z, 0.03);
  M.rotated(0, Math.PI, 0, 0, 0, 0, () => M.flatBar(-0.15 * bw, 0.39, 0.16 * bw, 0.02, z + 0.003, 0.03));
  M.box(0.15 * bw, 0.412, 0, 0.035, 0.02, 0.23);
  M.color(color).box(-0.07 * bw, 0.1, z + 0.035, 0.2, 0.1, 0.07);
  M.color('#d8d8d8').decal(-0.07 * bw, 0.126, z + 0.071, 0.17, 0.01);
  M.color('#ffd23f').decal(-0.07 * bw, 0.086, z + 0.071, 0.05, 0.03);
}

/** Capa de superhéroe con un paquete dorado a la espalda. Cae hacia atrás, como si hubiera viento. */
function buildCape(M: MeshBuilder, color: string, frontZ: number, bw: number, bd: number) {
  M.setBone(B.spine).color(color);
  const t = 0.012;
  const zTop = -(frontZ + t + 0.004), zMid = -(0.16 * bd + t);
  M.loft([
    { y: 0.4, hx: 0.15 * bw, hz: t, cz: -0.07 * bd - t },
    { y: 0.3, hx: 0.2 * bw, hz: t, cz: zTop },
    { y: -0.1, hx: 0.23 * bw, hz: t, cz: zMid },
    { y: -0.55, hx: 0.28 * bw, hz: t, cz: -(0.3 * bd + t) },
  ], 4, true, true);
  // escudo: círculo amarillo con una caja de cartón precintada
  const slope = (zTop - zMid) / 0.4;
  const ey = 0.08;
  const ez = zTop - t - slope * (0.3 - ey) - 0.003;
  M.rotated(Math.atan(slope), 0, 0, 0, ey, ez, () => {
    M.color('#ffd23f').oct(0, ey, ez, 0.2, 0.2, -1);
    M.color('#c8915a').decal(0, ey - 0.008, ez - 0.001, 0.1, 0.085, -1);
    M.color('#e63946').decal(0, ey + 0.016, ez - 0.002, 0.1, 0.018, -1);
  });
  // broches dorados en los hombros
  M.color('#ffd23f').decal(0.14 * bw, 0.37, 0.108 * bd, 0.03, 0.03).decal(-0.14 * bw, 0.37, 0.108 * bd, 0.03, 0.03);
}

/** Disfraz de paquete gigante: caja de cartón con solapas abiertas, precinto, FRÁGIL y el logo de la empresa. */
function buildBoxSuit(M: MeshBuilder) {
  M.setBone(B.spine);
  const { hx, hz, y0, y1 } = BOX_SUIT;
  const cy = (y0 + y1) / 2, h = y1 - y0;
  M.color('#c8915a').box(0, cy, 0, hx * 2, h, hz * 2);
  M.color('#b07b48');
  M.rotated(0.95, 0, 0, 0, y1, hz, () => M.box(0, y1 + 0.065, hz, hx * 2, 0.13, 0.012));
  M.rotated(-0.95, 0, 0, 0, y1, -hz, () => M.box(0, y1 + 0.065, -hz, hx * 2, 0.13, 0.012));
  // precinto por delante y por detrás
  M.color('#e3d3a8').decal(0, cy, hz + 0.001, 0.07, h).decal(0, cy, -hz - 0.001, 0.07, h, -1);
  // delante: etiqueta con la dirección
  M.color('#ffffff').decal(0.07, 0.05, hz + 0.002, 0.15, 0.1);
  M.color('#1b1030');
  for (let i = 0; i < 3; i++) M.decal(0.07 - (i === 2 ? 0.02 : 0), 0.077 - i * 0.026, hz + 0.003, i === 2 ? 0.08 : 0.12, 0.01);
  // detrás: el logo de la empresa y FRÁGIL en rojo (con su copa)
  drawEmblem(M, 'reparto', 0, 0.02, -hz - 0.002, 0.2, -1, true);
  M.color('#e63946').decal(0, 0.2, -hz - 0.002, 0.3, 0.065, -1);
  M.color('#ffffff');
  M.poly([[-0.1, 0.225], [-0.06, 0.225], [-0.08, 0.2]], -hz - 0.003, -1);
  M.decal(-0.08, 0.19, -hz - 0.003, 0.008, 0.022, -1);
  for (let i = 0; i < 4; i++) M.decal(-0.03 + i * 0.037, 0.2, -hz - 0.003, 0.025, 0.035, -1);
  // flechas «este lado arriba» en los costados
  for (const s of [1, -1]) {
    const px = s * (hx + 0.002), py = 0.02, pz = 0;
    M.rotated(0, (s * Math.PI) / 2, 0, px, py, pz, () => {
      M.color('#1b1030');
      M.poly([[-0.05, 0.05], [0.05, 0.05], [0, 0.11]], pz, 1, px, py);
      M.decal(px, py, pz, 0.03, 0.1);
    });
  }
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
