// Contexto compartido por los generadores del mundo: mallas acumuladas, colisores, datos del mapa.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { Game } from '../../core/game';
import { G, groups } from '../../core/physics';
import { Rng } from '../../core/rng';
import { ChunkSet } from './geo';
import { Terrain } from './terrain';
import { Occupancy } from './occ';
import { RoadNet } from './network';
import { Signs } from './signs';
import { Props } from './props';
import type { RoadMeshes } from './roadmesh';
import type { WorldUniforms } from './materials';
import type { WorldData } from '../../core/contracts';

/** Huella de edificio para el mapa. */
export interface Footprint {
  x: number;
  z: number;
  hw: number;
  hd: number;
  rot: number;
  color: string;
  /** Altura (para sombrear en el mapa). */
  height: number;
  /** Estructura abierta (grúa, túnel, marquesina...): no tapa el suelo. */
  open?: boolean;
}

export interface Ctx {
  game: Game;
  rng: Rng;
  solid: ChunkSet;
  win: ChunkSet;
  signs: Signs;
  props: Props;
  /** Pintor de suelos (asfalto, aceras, marcas) pegados al terreno. */
  pave: RoadMeshes;
  /** Material sólido compartido (para mallas propias que se mueven: grúas, barcas...). */
  mat: THREE.Material;
  u: WorldUniforms;
  terrain: Terrain;
  occ: Occupancy;
  net: RoadNet;
  heightAt(x: number, z: number): number;
  foot: Footprint[];
  pools: { x: number; z: number; hw: number; hd: number; rot: number }[];
  /** Zonas pavimentadas extra para el mapa (plazas, patios, muelles). */
  paved: { x: number; z: number; hw: number; hd: number; rot: number; color: string }[];
  /** Puntos de color para el mapa (sombrillas de la playa, mesas de terraza, puestos...). */
  mapDots: { x: number; z: number; r: number; color: string }[];
  /** Rótulos pequeños para el mapa (parque, mercadillo, cancha...). */
  mapLabels: { x: number; z: number; text: string; color: string }[];
  collectibles: THREE.Vector3[];
  ramps: WorldData['ramps'];
  breakables: WorldData['breakableSpots'];
  specials: WorldData['specialVehicleSpots'];
  /** Recorridos para subir a azoteas y cubiertas (para pruebas y para otros sistemas): a = abajo, b = arriba, c = azotea. */
  climbs: { name: string; a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3 }[];
  /** Añade un colisor de caja estático (rotación en Y). `filter`: con qué grupos choca (por defecto, con todo). */
  box(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, rot?: number, group?: number, filter?: number): RAPIER.Collider;
  /** Caja con giro completo (rampas, escaleras, toldos): cuaternión. */
  boxQ(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, q: THREE.Quaternion, group?: number, filter?: number): RAPIER.Collider;
  /**
   * Colisores de voladizos bajos (toldos, balcones, marquesinas, tejadillos de 2,2 a ~4 m): se apagan
   * mientras vas en un vehículo (ver setOverhangs).
   */
  overhangs: RAPIER.Collider[];
  cyl(cx: number, cy: number, cz: number, halfH: number, r: number): void;
}

export function makeColliderHelpers(game: Game) {
  const helpers = {
    box(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, rot = 0, group: number = G.STATIC, filter: number = G.ALL) {
      if (filter === G.ALL) return game.physics.addStaticBox(cx, cy, cz, hx, hy, hz, rot, group);
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
      return helpers.boxQ(cx, cy, cz, hx, hy, hz, q, group, filter);
    },
    boxQ(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, q: THREE.Quaternion, group: number = G.STATIC, filter: number = G.ALL) {
      const desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
        .setTranslation(cx, cy, cz)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setFriction(0.8)
        .setCollisionGroups(groups(group, filter));
      return game.physics.world.createCollider(desc);
    },
    cyl(cx: number, cy: number, cz: number, halfH: number, r: number) {
      game.physics.addStaticCylinder(cx, cy, cz, halfH, r, G.STATIC);
    },
  };
  return helpers;
}

/**
 * Filtro para voladizos finos por encima de 2,2 m (toldos, balcones, marquesinas): la cámara y el
 * personaje chocan con ellos (se pasa por debajo sin tocarlos), los vehículos no (un camión por la
 * acera no se queda enganchado en un toldo).
 */
export const OVERHANG_FILTER = G.ALL & ~G.VEHICLE;

/**
 * Enciende o apaga los voladizos bajos. Apagados (filtro 0) no chocan con nada: se hace mientras vas
 * en un vehículo, porque el punto que sigue la cámara del vehículo (de 2,1 a 3 m en scooter, carrito o
 * turismo) queda dentro de la caja de un toldo o pegado a ella, y la bolita de la cámara, que ya sale
 * tocándola, se quedaría clavada a 0,35 m del conductor.
 */
export function setOverhangs(list: RAPIER.Collider[], on: boolean) {
  const gr = groups(G.STATIC, on ? OVERHANG_FILTER : 0);
  for (const c of list) c.setCollisionGroups(gr);
}

/** Pequeñas utilidades de ángulo/dirección (0 = +Z). */
export function fwd(rot: number): { x: number; z: number } {
  return { x: Math.sin(rot), z: Math.cos(rot) };
}
