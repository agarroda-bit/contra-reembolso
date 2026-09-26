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
  collectibles: THREE.Vector3[];
  ramps: WorldData['ramps'];
  breakables: WorldData['breakableSpots'];
  specials: WorldData['specialVehicleSpots'];
  /** Recorridos para subir a azoteas y cubiertas (para pruebas y para otros sistemas): a = abajo, b = arriba, c = azotea. */
  climbs: { name: string; a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3 }[];
  /** Añade un colisor de caja estático (rotación en Y). */
  box(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, rot?: number, group?: number): void;
  /** Caja con giro completo (rampas, escaleras): cuaternión. */
  boxQ(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, q: THREE.Quaternion, group?: number): void;
  cyl(cx: number, cy: number, cz: number, halfH: number, r: number): void;
}

export function makeColliderHelpers(game: Game) {
  return {
    box(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, rot = 0, group: number = G.STATIC) {
      game.physics.addStaticBox(cx, cy, cz, hx, hy, hz, rot, group);
    },
    boxQ(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, q: THREE.Quaternion, group: number = G.STATIC) {
      const desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
        .setTranslation(cx, cy, cz)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setFriction(0.8)
        .setCollisionGroups(groups(group, G.ALL));
      game.physics.world.createCollider(desc);
    },
    cyl(cx: number, cy: number, cz: number, halfH: number, r: number) {
      game.physics.addStaticCylinder(cx, cy, cz, halfH, r, G.STATIC);
    },
  };
}

/** Pequeñas utilidades de ángulo/dirección (0 = +Z). */
export function fwd(rot: number): { x: number; z: number } {
  return { x: Math.sin(rot), z: Math.cos(rot) };
}
