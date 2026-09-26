// Aspectos aleatorios por tipo de personaje (envoltorio del kit de personajes).
import type { CharacterLook } from '../core/contracts';
import type { Rng } from '../core/rng';

export type LookKind = 'civil' | 'devuelto' | 'policia' | 'repartidor' | 'rico' | 'abuela' | 'fiestero';

/** Se sustituye por randomLook del kit de personajes al arrancar (ver main.ts). */
export let randomLookFor: (rng: Rng, kind: LookKind) => CharacterLook = (rng, kind) => ({
  skin: rng.pick(['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac']),
  hair: rng.pick(['corto', 'largo', 'rapado', 'moño'] as const),
  hairColor: rng.pick(['#2b1b0f', '#5a3a1a', '#d6b370', '#9a9a9a']),
  shirt: kind === 'devuelto' ? '#6c3bd1' : kind === 'policia' ? '#1d3557' : rng.pick(['#e63946', '#457b9d', '#2a9d8f', '#f4a261', '#ffffff']),
  pants: rng.pick(['#264653', '#3d405b', '#6d597a', '#222222']),
  shoes: '#222222',
  cap: kind === 'policia' || kind === 'devuelto',
  capColor: kind === 'devuelto' ? '#4a2a8a' : '#1d3557',
});

export function setLookFactory(fn: (rng: Rng, kind: LookKind) => CharacterLook) {
  randomLookFor = fn;
}
