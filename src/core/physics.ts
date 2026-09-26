// Envoltorio fino de Rapier: grupos de colisión, colisores estáticos y rayos.
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

export { RAPIER };

/** Grupos de colisión (bit = pertenencia). */
export const G = {
  GROUND: 1 << 0, // terreno, carreteras
  STATIC: 1 << 1, // edificios, muros, farolas
  PLAYER: 1 << 2,
  VEHICLE: 1 << 3,
  NPC: 1 << 4,
  PROJECTILE: 1 << 5,
  DEBRIS: 1 << 6,
  TRIGGER: 1 << 7,
  PROP: 1 << 8, // cosas rompibles: vallas, cajas, papeleras
  ALL: 0xffff,
} as const;

/** Rapier empaqueta pertenencia (16 bits altos) y filtro (16 bits bajos). */
export function groups(membership: number, filter: number): number {
  return ((membership & 0xffff) << 16) | (filter & 0xffff);
}

/** Lo que choca con el mundo sólido (para cámara, balas, etc.). */
export const SOLID = G.GROUND | G.STATIC;

/** Temporales de raycast() y groundHeight() (se llaman muchísimo: nada de objetos nuevos si no hay impacto). */
const rayDir = new THREE.Vector3();
const groundFrom = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);
let sharedRay: RAPIER.Ray | null = null;

export interface RayHit {
  /** Punto de impacto: objeto nuevo en cada impacto (se puede guardar). */
  point: THREE.Vector3;
  /** Normal en el punto de impacto: objeto nuevo en cada impacto (se puede guardar). */
  normal: THREE.Vector3;
  distance: number;
  collider: RAPIER.Collider;
  /** Lo que se registró con `tag()` para ese colisor (vehículo, peatón...). */
  owner: unknown;
}

export class Physics {
  readonly world: RAPIER.World;
  readonly R = RAPIER;
  private owners = new Map<number, unknown>();
  readonly fixedDt = 1 / 60;

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -22, z: 0 });
    this.world.timestep = this.fixedDt;
  }

  step() {
    this.world.step();
  }

  /** Asocia un objeto del juego a un colisor (para saber qué ha tocado un rayo). */
  tag(collider: RAPIER.Collider, owner: unknown) {
    this.owners.set(collider.handle, owner);
  }
  untag(collider: RAPIER.Collider) {
    this.owners.delete(collider.handle);
  }
  ownerOf(collider: RAPIER.Collider | null | undefined): unknown {
    return collider ? this.owners.get(collider.handle) : undefined;
  }

  /** Caja estática. Centro y medias extensiones en metros; rotación en Y (radianes). */
  addStaticBox(
    cx: number, cy: number, cz: number,
    hx: number, hy: number, hz: number,
    rotY = 0,
    group: number = G.STATIC,
    friction = 0.7,
  ): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setTranslation(cx, cy, cz)
      .setFriction(friction)
      .setCollisionGroups(groups(group, G.ALL));
    if (rotY) {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
      desc.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    }
    return this.world.createCollider(desc);
  }

  /** Malla estática (terreno). */
  addStaticTrimesh(vertices: Float32Array, indices: Uint32Array, group: number = G.GROUND): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.trimesh(vertices, indices)
      .setFriction(0.9)
      .setCollisionGroups(groups(group, G.ALL));
    return this.world.createCollider(desc);
  }

  /** Cilindro estático vertical (farolas, árboles, postes). */
  addStaticCylinder(cx: number, cy: number, cz: number, halfHeight: number, radius: number, group: number = G.STATIC) {
    const desc = RAPIER.ColliderDesc.cylinder(halfHeight, radius)
      .setTranslation(cx, cy, cz)
      .setCollisionGroups(groups(group, G.ALL));
    return this.world.createCollider(desc);
  }

  /**
   * Lanza un rayo. `mask` = grupos contra los que choca.
   * `exclude` = colisor o cuerpo a ignorar (el propio jugador, el propio coche...).
   * No toca `origin` ni `dir`. Si no choca no crea ningún objeto; si choca, `point` y `normal` son nuevos.
   */
  raycast(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    maxDist: number,
    mask: number = SOLID,
    exclude?: RAPIER.Collider | RAPIER.RigidBody | null,
  ): RayHit | null {
    const d = rayDir.copy(dir).normalize();
    // un solo rayo de Rapier para todo (se le cambian el origen y la dirección)
    const ray = sharedRay ?? (sharedRay = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }));
    ray.origin.x = origin.x;
    ray.origin.y = origin.y;
    ray.origin.z = origin.z;
    ray.dir.x = d.x;
    ray.dir.y = d.y;
    ray.dir.z = d.z;
    const exCol = exclude && 'handle' in exclude && !(exclude as any).numColliders ? (exclude as RAPIER.Collider) : undefined;
    const exBody = exclude && (exclude as any).numColliders ? (exclude as RAPIER.RigidBody) : undefined;
    const hit = this.world.castRayAndGetNormal(
      ray, maxDist, true, undefined, groups(G.ALL, mask), exCol, exBody,
    );
    if (!hit) return null;
    const toi = (hit as any).timeOfImpact ?? (hit as any).toi;
    const point = new THREE.Vector3(origin.x + d.x * toi, origin.y + d.y * toi, origin.z + d.z * toi);
    return {
      point,
      normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
      distance: toi,
      collider: hit.collider,
      owner: this.ownerOf(hit.collider),
    };
  }

  /** Altura del suelo sólido bajo (x, z), o null. */
  groundHeight(x: number, z: number, fromY = 200, mask: number = SOLID): number | null {
    const hit = this.raycast(groundFrom.set(x, fromY, z), DOWN, fromY + 50, mask);
    return hit ? hit.point.y : null;
  }

  /** Todos los colisores que tocan una esfera (explosiones, golpes cuerpo a cuerpo). */
  overlapSphere(center: THREE.Vector3, radius: number, mask: number = G.ALL): RAPIER.Collider[] {
    const out: RAPIER.Collider[] = [];
    const shape = new RAPIER.Ball(radius);
    this.world.intersectionsWithShape(
      { x: center.x, y: center.y, z: center.z },
      { x: 0, y: 0, z: 0, w: 1 },
      shape,
      (c) => {
        out.push(c);
        return true;
      },
      undefined,
      groups(G.ALL, mask),
    );
    return out;
  }
}
