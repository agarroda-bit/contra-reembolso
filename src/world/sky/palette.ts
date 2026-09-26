// Paleta del cielo por horas: colores en sRGB (tal cual se ven en pantalla) e intensidades.
// Se interpola linealmente entre fotogramas clave. Retocar aquí para cambiar el "look" del día.

export interface SkyKey {
  h: number; // hora 0..24
  zenith: string; // cenit
  mid: string; // media altura
  horizon: string; // horizonte
  fog: string; // niebla (bajo el horizonte y a lo lejos)
  glow: string; // resplandor del lado del sol
  glowK: number; // fuerza del resplandor
  key: string; // color de la luz principal (sol o luna)
  keyI: number; // intensidad de la luz principal
  hemiSky: string;
  hemiGround: string;
  hemiI: number;
  amb: string;
  ambI: number;
  exp: number; // exposición del tone mapping
  cloudLit: string; // nube iluminada
  cloudShade: string; // nube en sombra
  stars: number; // 0..1
}

// Orden de los campos en el array plano.
const COLORS = ['zenith', 'mid', 'horizon', 'fog', 'glow', 'key', 'hemiSky', 'hemiGround', 'amb', 'cloudLit', 'cloudShade'] as const;
const SCALARS = ['glowK', 'keyI', 'hemiI', 'ambI', 'exp', 'stars'] as const;
type ColorField = (typeof COLORS)[number];
type ScalarField = (typeof SCALARS)[number];

export const SKY_STRIDE = COLORS.length * 3 + SCALARS.length;

/** Desplazamiento de cada campo dentro del array plano. */
export const OFF = {} as Record<ColorField | ScalarField, number>;
COLORS.forEach((c, i) => (OFF[c] = i * 3));
SCALARS.forEach((s, i) => (OFF[s] = COLORS.length * 3 + i));

const NIGHT: Omit<SkyKey, 'h'> = {
  zenith: '#070f2e', mid: '#10205a', horizon: '#26407e', fog: '#1d3068',
  glow: '#3a4f96', glowK: 0.0,
  key: '#9db4ff', keyI: 0.9,
  hemiSky: '#6680cc', hemiGround: '#32294f', hemiI: 1.35,
  amb: '#4a4f86', ambI: 0.75,
  exp: 1.3,
  cloudLit: '#56679a', cloudShade: '#243058',
  stars: 1,
};

export const SKY_KEYS: SkyKey[] = [
  { h: 0, ...NIGHT },
  { h: 4.6, ...NIGHT },
  {
    // antes del alba: azul profundo con el horizonte violeta
    h: 5.6,
    zenith: '#0f1c4c', mid: '#2a3a7c', horizon: '#6c5a9e', fog: '#4c4c88',
    glow: '#e88a9a', glowK: 0.35,
    key: '#a9b4f0', keyI: 0.5,
    hemiSky: '#7282c4', hemiGround: '#3a2c54', hemiI: 1.3,
    amb: '#5a5288', ambI: 0.7,
    exp: 1.25,
    cloudLit: '#8c7cb0', cloudShade: '#3a3a6c',
    stars: 0.55,
  },
  {
    // alba: rosa melocotón
    h: 6.4,
    zenith: '#3a5aa2', mid: '#8c88c6', horizon: '#f6a89e', fog: '#d0a6ba',
    glow: '#ffb48c', glowK: 0.8,
    key: '#ff9e7a', keyI: 1.0,
    hemiSky: '#b4bce8', hemiGround: '#6a4c60', hemiI: 1.6,
    amb: '#86729a', ambI: 0.55,
    exp: 1.16,
    cloudLit: '#ffb4a2', cloudShade: '#8a78ac',
    stars: 0.1,
  },
  {
    // salida del sol: dorado suave
    h: 7.2,
    zenith: '#5a8ed8', mid: '#a8c6ec', horizon: '#ffd8ae', fog: '#f0d8c4',
    glow: '#ffc684', glowK: 0.75,
    key: '#ffcc94', keyI: 2.5,
    hemiSky: '#c8daf6', hemiGround: '#806a54', hemiI: 1.95,
    amb: '#9c90a2', ambI: 0.42,
    exp: 1.14,
    cloudLit: '#fff0de', cloudShade: '#b6b0d0',
    stars: 0,
  },
  {
    // mañana clara
    h: 8.6,
    zenith: '#3d86e2', mid: '#88bcf0', horizon: '#d2e8f8', fog: '#c9e0f4',
    glow: '#fff2d6', glowK: 0.35,
    key: '#fff2de', keyI: 2.85,
    hemiSky: '#d0e4ff', hemiGround: '#7c6c54', hemiI: 1.6,
    amb: '#9098aa', ambI: 0.3,
    exp: 1.07,
    cloudLit: '#ffffff', cloudShade: '#c6d2ea',
    stars: 0,
  },
  {
    // mediodía: azul intenso
    h: 13,
    zenith: '#1c6ae0', mid: '#5aa2f2', horizon: '#bfe0fb', fog: '#bad8f3',
    glow: '#ffffff', glowK: 0.25,
    key: '#fff8ec', keyI: 3.1,
    hemiSky: '#d6eaff', hemiGround: '#88765a', hemiI: 1.4,
    amb: '#98a2b4', ambI: 0.3,
    exp: 1.0,
    cloudLit: '#ffffff', cloudShade: '#c8d8f0',
    stars: 0,
  },
  {
    // tarde
    h: 16.6,
    zenith: '#2670da', mid: '#68a8ee', horizon: '#d6e6f2', fog: '#cddeee',
    glow: '#ffe6b4', glowK: 0.4,
    key: '#ffeed0', keyI: 2.95,
    hemiSky: '#d6e2fa', hemiGround: '#8a7054', hemiI: 1.45,
    amb: '#9c9cae', ambI: 0.3,
    exp: 1.02,
    cloudLit: '#fffaf0', cloudShade: '#c6cce4',
    stars: 0,
  },
  {
    // hora dorada
    h: 18.1,
    zenith: '#3470c8', mid: '#8eb0e0', horizon: '#ffd8a0', fog: '#f0d4ac',
    glow: '#ffb65c', glowK: 0.7,
    key: '#ffc47c', keyI: 2.6,
    hemiSky: '#d4cce4', hemiGround: '#8c6248', hemiI: 1.65,
    amb: '#a08a90', ambI: 0.32,
    exp: 1.07,
    cloudLit: '#ffdcaa', cloudShade: '#bcaac8',
    stars: 0,
  },
  {
    // puesta de sol: naranja, rosa y morado
    h: 19.05,
    zenith: '#3a4c9e', mid: '#c46ca2', horizon: '#ff9c58', fog: '#ea9a80',
    glow: '#ff7a2c', glowK: 1.0,
    key: '#ffa458', keyI: 2.5,
    hemiSky: '#c4a8dc', hemiGround: '#865040', hemiI: 1.85,
    amb: '#8e6c8e', ambI: 0.38,
    exp: 1.12,
    cloudLit: '#ffa878', cloudShade: '#a070a8',
    stars: 0,
  },
  {
    // clímax del atardecer
    h: 19.7,
    zenith: '#2a2c7c', mid: '#b24c92', horizon: '#ff7a3a', fog: '#dc727c',
    glow: '#ff5a1e', glowK: 1.2,
    key: '#ff8a48', keyI: 2.2,
    hemiSky: '#b898d4', hemiGround: '#74404c', hemiI: 1.9,
    amb: '#805c8c', ambI: 0.42,
    exp: 1.15,
    cloudLit: '#ff9468', cloudShade: '#8e5294',
    stars: 0,
  },
  {
    // el sol toca el horizonte
    h: 20.3,
    zenith: '#1e2268', mid: '#7c3a88', horizon: '#f2623c', fog: '#a4527c',
    glow: '#ff4a2a', glowK: 1.0,
    key: '#ff6444', keyI: 1.2,
    hemiSky: '#a884bc', hemiGround: '#54304c', hemiI: 1.7,
    amb: '#6c5290', ambI: 0.55,
    exp: 1.2,
    cloudLit: '#f27c6c', cloudShade: '#5c3a72',
    stars: 0.05,
  },
  {
    // resplandor final: rosa y violeta
    h: 20.85,
    zenith: '#131a54', mid: '#402e74', horizon: '#a44c7a', fog: '#5c3c6e',
    glow: '#d44a5c', glowK: 0.6,
    key: '#a2b2ff', keyI: 0.7,
    hemiSky: '#6c70b8', hemiGround: '#382a50', hemiI: 1.4,
    amb: '#4e4c80', ambI: 0.7,
    exp: 1.24,
    cloudLit: '#a45c7e', cloudShade: '#302c56',
    stars: 0.35,
  },
  { h: 21.6, ...NIGHT },
  { h: 24, ...NIGHT },
];

function hexToRgb(hex: string, out: Float32Array, o: number) {
  const v = parseInt(hex.slice(1), 16);
  out[o] = ((v >> 16) & 255) / 255;
  out[o + 1] = ((v >> 8) & 255) / 255;
  out[o + 2] = (v & 255) / 255;
}

// Fotogramas clave ya convertidos a arrays planos.
const HOURS = SKY_KEYS.map((k) => k.h);
const FLAT = SKY_KEYS.map((k) => {
  const a = new Float32Array(SKY_STRIDE);
  for (const c of COLORS) hexToRgb(k[c], a, OFF[c]);
  for (const s of SCALARS) a[OFF[s]] = k[s];
  return a;
});

/** Escribe en `out` el estado del cielo a la hora `h` (0..24). No reserva memoria. */
export function sampleSky(h: number, out: Float32Array): Float32Array {
  h = ((h % 24) + 24) % 24;
  let i = 0;
  while (i < HOURS.length - 2 && h >= HOURS[i + 1]) i++;
  const h0 = HOURS[i], h1 = HOURS[i + 1];
  const t = h1 > h0 ? Math.min(1, Math.max(0, (h - h0) / (h1 - h0))) : 0;
  const a = FLAT[i], b = FLAT[i + 1];
  for (let k = 0; k < SKY_STRIDE; k++) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}
