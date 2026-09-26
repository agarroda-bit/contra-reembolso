// Paletas y aspectos aleatorios (con semilla) para cada tipo de personaje.
import type { CharacterLook, HairStyle } from '../../core/contracts';
import type { Rng } from '../../core/rng';

export type CharacterKind = 'civil' | 'devuelto' | 'policia' | 'repartidor' | 'rico' | 'abuela' | 'fiestero';

/**
 * Campos extra opcionales (compatibles con CharacterLook). Los rellena randomLook;
 * un look "normal" sin ellos también funciona.
 */
export interface CharacterLookExtra extends CharacterLook {
  /** Tipo de personaje: cambia la postura y la forma de andar (la abuela va encorvada...). */
  kind?: CharacterKind;
  /** Vello facial. */
  facial?: 'bigote' | 'barba' | null;
  /** Pantalón corto. */
  shorts?: boolean;
  /** Estilo de la chaqueta: chándal (rayas), rebeca (botones) o americana. */
  jacketStyle?: 'chandal' | 'rebeca' | 'americana';
  /** Semilla de gestos (variante de baile, parpadeo...). */
  seed?: number;
}

/** Tonos de piel, de claro a oscuro. */
export const SKIN_TONES: string[] = ['#fbe3d4', '#f4cfb6', '#e8ba9a', '#d6a27e', '#bd8862', '#9e6c4a', '#7f5035', '#613b27', '#462b1d'];

export const HAIR_STYLES: HairStyle[] = ['rapado', 'corto', 'largo', 'cresta', 'moño', 'afro', 'coleta', 'calvo'];

/** Colores de uniforme para la pantalla de creación (sin morado: es de Los Devueltos). */
export const UNIFORM_COLORS: string[] = ['#ffc53d', '#ff8a1f', '#e63946', '#2ec4b6', '#3a86ff', '#8ac926', '#ff5fa2', '#f4f1e8', '#2b2d42'];

export const HAIR_COLORS: string[] = ['#1c1714', '#2e1f16', '#4d3120', '#6e4428', '#8e3e1f', '#c2612b', '#d9ad5b', '#ead38c'];
const GREY_HAIR = ['#b9b9b9', '#d6d6d6', '#eeeeee', '#9e9e9e'];
const FANCY_HAIR = ['#ff3ea5', '#35d0ff', '#7cff4f', '#ffe14d', '#b14dff', '#ff7b1a'];
const CASUAL_SHIRTS = ['#e63946', '#f1faee', '#a8dadc', '#457b9d', '#2a9d8f', '#e9c46a', '#f4a261', '#264653', '#ff6b6b', '#6a994e', '#bc4749', '#8d99ae', '#ffb4a2', '#ffffff', '#3d405b'];
const PANTS = ['#2f4a7a', '#3b5998', '#233a5e', '#1f1f24', '#6b5b45', '#8a7d62', '#4a4e57', '#5a3e2b', '#7d8597'];
const SHOES = ['#1c1c1c', '#f2f2f2', '#6b4226', '#c0392b', '#2d6cdf', '#3a3a3a', '#e9e2d0'];
const NEON = ['#ff2e88', '#39ff14', '#00e5ff', '#ffea00', '#ff6d00', '#d500f9', '#76ff03'];

/** Peso de cada tono de piel en la calle (más claros y medios, pero de todo). */
const SKIN_WEIGHTS = [2, 3, 3, 3, 2, 1.5, 1.2, 1, 0.8];
function pickWeighted<T>(rng: Rng, items: readonly T[], weights: readonly number[]): T {
  let total = 0;
  for (let i = 0; i < items.length; i++) total += weights[i] ?? 1;
  let r = rng.next() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i] ?? 1;
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}

let seedCounter = 1;

/** Aspecto aleatorio creíble para un tipo de personaje. */
export function randomLook(rng: Rng, kind: CharacterKind): CharacterLookExtra {
  const skin = pickWeighted(rng, SKIN_TONES, SKIN_WEIGHTS);
  const base: CharacterLookExtra = {
    kind,
    seed: (rng.next() * 1e9) >>> 0 || seedCounter++,
    skin,
    hair: rng.pick(['rapado', 'rapado', 'corto', 'corto', 'corto', 'largo', 'largo', 'coleta', 'calvo', 'afro', 'moño'] as HairStyle[]),
    hairColor: rng.pick(HAIR_COLORS),
    shirt: rng.pick(CASUAL_SHIRTS),
    pants: rng.pick(PANTS),
    shoes: rng.pick(SHOES),
    cap: rng.chance(0.22),
    capColor: rng.pick(CASUAL_SHIRTS),
    glasses: rng.chance(0.12),
    chain: false,
    jacket: rng.chance(0.22) ? rng.pick(CASUAL_SHIRTS) : null,
    jacketStyle: 'chandal',
    build: rng.range(0.86, 1.2),
    height: rng.range(0.93, 1.07),
    emblem: null,
    facial: rng.chance(0.2) ? rng.pick(['bigote', 'barba'] as const) : null,
    shorts: rng.chance(0.15),
  };
  // la gente mayor a veces tiene canas
  if (rng.chance(0.12)) base.hairColor = rng.pick(GREY_HAIR);

  switch (kind) {
    case 'devuelto': {
      const purple = rng.pick(['#6a2c91', '#7b2cbf', '#5a189a', '#7209b7']);
      base.shirt = purple;
      base.pants = rng.pick(['#2b1b3d', '#1f1f24', '#3c2a4d']);
      base.shoes = rng.pick(['#1c1c1c', '#3a3a3a', '#f2f2f2']);
      base.cap = true;
      base.capColor = purple;
      base.emblem = 'devueltos';
      base.jacket = rng.chance(0.3) ? '#3c096c' : null;
      base.glasses = rng.chance(0.25);
      base.build = rng.range(1, 1.22);
      base.shorts = false;
      base.facial = rng.chance(0.35) ? rng.pick(['bigote', 'barba'] as const) : null;
      if (base.hair === 'moño' || base.hair === 'afro') base.hair = 'rapado';
      break;
    }
    case 'policia':
      base.shirt = '#1d2d5c';
      base.pants = '#141d3b';
      base.shoes = '#111111';
      base.cap = true;
      base.capColor = '#16224a';
      base.emblem = 'policia';
      base.jacket = null;
      base.glasses = rng.chance(0.2);
      base.shorts = false;
      base.facial = rng.chance(0.35) ? 'bigote' : null;
      if (base.hair === 'afro') base.hair = 'corto';
      break;
    case 'repartidor': {
      const c = rng.pick(['#ffc53d', '#ff8a1f', '#ffb000']);
      base.shirt = c;
      base.pants = rng.pick(['#4a3b2a', '#3d3d45', '#5a4632']);
      base.shoes = rng.pick(['#1c1c1c', '#6b4226']);
      base.cap = rng.chance(0.8);
      base.capColor = c === '#ff8a1f' ? '#ffc53d' : '#ff8a1f';
      base.emblem = 'reparto';
      base.jacket = null;
      base.shorts = rng.chance(0.2);
      break;
    }
    case 'rico':
      base.shirt = rng.pick(['#ffffff', '#f7e7ce', '#ffd6e0', '#cfe8ff']);
      base.jacket = rng.pick(['#1b263b', '#f5f0e1', '#7a1f2b', '#2d2d2d', '#c9a227']);
      base.jacketStyle = 'americana';
      base.pants = rng.pick(['#f5f0e1', '#1b263b', '#d9d4c7', '#2d2d2d']);
      base.shoes = rng.pick(['#6b4226', '#f2f2f2', '#1c1c1c']);
      base.glasses = true;
      base.chain = true;
      base.cap = false;
      base.shorts = false;
      base.hair = rng.pick(['corto', 'corto', 'rapado', 'largo', 'coleta', 'calvo'] as HairStyle[]);
      base.build = rng.range(1, 1.2);
      break;
    case 'abuela':
      base.hair = 'moño';
      base.hairColor = rng.pick(GREY_HAIR);
      base.shirt = rng.pick(['#f7d6e0', '#e0c3fc', '#ffffff', '#c1d3fe', '#fde2e4']);
      base.jacket = rng.pick(['#b56576', '#6d597a', '#e5989b', '#a3b18a', '#9c89b8', '#c9ada7']);
      base.jacketStyle = 'rebeca';
      base.pants = rng.pick(['#4a4e57', '#5c4d7d', '#3b3b3b', '#6b5b45']);
      base.shoes = rng.pick(['#1c1c1c', '#6b4226', '#e9e2d0']);
      base.cap = false;
      base.glasses = false;
      base.chain = false;
      base.height = rng.range(0.88, 0.94);
      base.build = rng.range(1.02, 1.15);
      base.facial = null;
      base.shorts = false;
      break;
    case 'fiestero':
      base.shirt = rng.pick(NEON);
      base.pants = rng.pick([...NEON, '#1f1f24', '#ffffff']);
      base.shoes = rng.pick(['#f2f2f2', '#ff2e88', '#00e5ff', '#ffea00']);
      base.hair = rng.pick(['cresta', 'afro', 'coleta', 'largo', 'corto'] as HairStyle[]);
      base.hairColor = rng.chance(0.6) ? rng.pick(FANCY_HAIR) : base.hairColor;
      if (FANCY_HAIR.includes(base.hairColor)) base.facial = null; // nada de barbas fosforito
      base.glasses = rng.chance(0.6);
      base.chain = rng.chance(0.5);
      base.shorts = rng.chance(0.4);
      base.jacket = rng.chance(0.25) ? rng.pick(NEON) : null;
      base.cap = rng.chance(0.2);
      base.capColor = rng.pick(NEON);
      break;
    case 'civil':
    default:
      break;
  }
  if (base.cap && base.hair === 'cresta') base.hair = 'rapado';
  return base;
}

/** Aspecto por defecto del protagonista (repartidor novato). */
export function defaultPlayerLook(): CharacterLookExtra {
  return {
    skin: SKIN_TONES[2],
    hair: 'corto',
    hairColor: HAIR_COLORS[2],
    shirt: UNIFORM_COLORS[0],
    pants: '#3d3d45',
    shoes: '#1c1c1c',
    cap: true,
    capColor: UNIFORM_COLORS[1],
    glasses: false,
    chain: false,
    jacket: null,
    build: 1,
    height: 1,
    emblem: 'reparto',
  };
}
