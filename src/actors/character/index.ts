// Kit de personajes: muñecos low-poly articulados con animación procedural.
// Cada personaje es UN SkinnedMesh (un draw call) con un material compartido.
import type { CharacterLook } from '../../core/contracts';
import type { Rng } from '../../core/rng';
import { Character } from './rig';
import { randomLook as randomLookImpl, type CharacterKind } from './looks';

export { Character, characterMaterial, characterLod } from './rig';
export { DRIVE_LAYOUT, RIDE_LAYOUT, SIT_LAYOUT, HEIGHT as CHARACTER_HEIGHT } from './skeleton';
export { SKIN_TONES, HAIR_STYLES, UNIFORM_COLORS, HAIR_COLORS, defaultPlayerLook } from './looks';
export type { CharacterKind, CharacterLookExtra } from './looks';

/** Crea un personaje. Pon `rig.root` en la escena y llama a `rig.update(dt, params)` cada frame. */
export function makeCharacter(look: CharacterLook): Character {
  return new Character(look);
}

/** Aspecto aleatorio (con semilla) para un tipo de personaje. */
export function randomLook(rng: Rng, kind: CharacterKind): CharacterLook {
  return randomLookImpl(rng, kind);
}
