// Cosas que se rompen: vallas, cajas, puestos de fruta, papeleras, bancos y conos.
// Se dibujan con InstancedMesh (un draw call por tipo). Los coches las atraviesan rompiéndolas,
// las balas y explosiones también. Vuelven a aparecer al rato si no las estás mirando.
import * as THREE from 'three';
import type { Game, System } from '../core/game';
import { G, groups } from '../core/physics';
import { GeoBuilder, vertexColorMaterial } from '../core/geo';
import { OVERHANG_FILTER } from '../world/island/ctx';
import type { Vehicle } from '../vehicles/vehicle';
import type { ParticleKind } from './particles';
import type { RAPIER } from '../core/physics';

type Kind = 'fence' | 'crate' | 'fruit' | 'bin' | 'bench' | 'cone';

interface KindDef {
  half: [number, number, number]; // medias medidas del colisor
  radius: number;
  particles: ParticleKind;
  colors: string[];
  sound: 'wood' | 'crash_small' | 'glass';
  slow: number; // cuánto frena al coche (0..1)
  heat: number; // lo que molesta a la policía
}

const DEFS: Record<Kind, KindDef> = {
  fence: { half: [1.1, 0.55, 0.08], radius: 1.2, particles: 'cardboard', colors: ['#f1faee', '#d9d2c5'], sound: 'wood', slow: 0.05, heat: 0.05 },
  crate: { half: [0.45, 0.45, 0.45], radius: 0.7, particles: 'cardboard', colors: ['#b07b48', '#8f6238', '#c8915a'], sound: 'wood', slow: 0.04, heat: 0.02 },
  fruit: { half: [0.95, 0.5, 0.5], radius: 1.1, particles: 'fruit', colors: [], sound: 'wood', slow: 0.08, heat: 0.15 },
  bin: { half: [0.28, 0.45, 0.28], radius: 0.45, particles: 'debris', colors: ['#2a9d8f', '#e9c46a', '#ffffff'], sound: 'crash_small', slow: 0.02, heat: 0.03 },
  bench: { half: [0.9, 0.4, 0.3], radius: 1, particles: 'cardboard', colors: ['#8a5a33', '#6b4226'], sound: 'wood', slow: 0.06, heat: 0.05 },
  cone: { half: [0.2, 0.35, 0.2], radius: 0.35, particles: 'debris', colors: ['#ff7b54', '#ffffff'], sound: 'crash_small', slow: 0, heat: 0 },
};

function buildGeo(kind: Kind): THREE.BufferGeometry {
  const b = new GeoBuilder();
  switch (kind) {
    case 'fence':
      for (let i = 0; i < 5; i++) b.box(0.08, 1.0, 0.06, '#f1faee', -0.9 + i * 0.45, 0.5, 0);
      b.box(2.2, 0.08, 0.05, '#e6dfd3', 0, 0.8, 0.03);
      b.box(2.2, 0.08, 0.05, '#e6dfd3', 0, 0.35, 0.03);
      break;
    case 'crate':
      b.box(0.9, 0.9, 0.9, '#b07b48', 0, 0.45, 0);
      b.box(0.92, 0.12, 0.92, '#8f6238', 0, 0.2, 0);
      b.box(0.92, 0.12, 0.92, '#8f6238', 0, 0.7, 0);
      break;
    case 'fruit':
      b.box(1.8, 0.08, 0.9, '#8a5a33', 0, 0.8, 0);
      for (const [x, z] of [[-0.85, -0.4], [0.85, -0.4], [-0.85, 0.4], [0.85, 0.4]]) b.box(0.08, 0.8, 0.08, '#6b4226', x, 0.4, z);
      [['#ff9f1c', -0.55], ['#e63946', 0], ['#7cb342', 0.55]].forEach(([c, x]) => {
        b.box(0.5, 0.18, 0.7, '#c8915a', x as number, 0.93, 0);
        b.box(0.44, 0.1, 0.62, c as string, x as number, 1.05, 0);
      });
      b.box(2.0, 0.06, 1.2, '#ff4f81', 0, 1.9, 0, 0.12, 0, 0);
      b.box(2.0, 0.06, 1.2, '#ffffff', 0, 1.91, 0.0, 0.12, 0, 0); // toldo a rayas (queda por encima)
      for (const x of [-0.95, 0.95]) b.box(0.05, 1.1, 0.05, '#6b4226', x, 1.35, -0.5);
      break;
    case 'bin':
      b.cyl(0.26, 0.22, 0.85, 8, '#2a9d8f', 0, 0.42, 0);
      b.cyl(0.28, 0.28, 0.06, 8, '#1f7a6f', 0, 0.86, 0);
      break;
    case 'bench':
      b.box(1.8, 0.07, 0.45, '#8a5a33', 0, 0.45, 0);
      b.box(1.8, 0.35, 0.06, '#8a5a33', 0, 0.72, -0.2, -0.15, 0, 0);
      for (const x of [-0.75, 0.75]) b.box(0.08, 0.45, 0.45, '#3d405b', x, 0.22, 0);
      break;
    case 'cone':
      b.cyl(0.02, 0.18, 0.65, 8, '#ff7b54', 0, 0.36, 0);
      b.cyl(0.13, 0.15, 0.1, 8, '#ffffff', 0, 0.36, 0);
      b.box(0.4, 0.05, 0.4, '#ff7b54', 0, 0.025, 0);
      break;
  }
  return b.build();
}

interface Item {
  kind: Kind;
  index: number; // instancia dentro de su InstancedMesh
  pos: THREE.Vector3;
  rotY: number;
  broken: boolean;
  brokenAt: number;
  collider: RAPIER.Collider;
  /** Toldo del puesto de fruta: colisor aparte para que la cámara no se meta dentro de la lona. */
  awning?: RAPIER.Collider;
}

/** Toldo de los puestos de fruta (mismas medidas que en buildGeo): centro a 1,9 m, 2 x 1,2 m, inclinado 0,12. */
const FRUIT_AWNING = { y: 1.9, hx: 1.02, hy: 0.09, hz: 0.62, tilt: 0.12 };

const dummy = new THREE.Object3D();
const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpL = new THREE.Vector3();
const CELL = 12;

export class Breakables implements System {
  name = 'breakables';
  private meshes = new Map<Kind, THREE.InstancedMesh>();
  private items: Item[] = [];
  /** Rejilla de celdas (clave numérica: sin crear textos en cada consulta). */
  private grid = new Map<number, Item[]>();
  private respawnTimer = 0;

  constructor(private game: Game) {
    game.mod.breakables = this;
    const spots = game.world.breakableSpots;
    const byKind = new Map<Kind, typeof spots>();
    for (const s of spots) {
      const list = byKind.get(s.kind) ?? [];
      list.push(s);
      byKind.set(s.kind, list);
    }
    for (const [kind, list] of byKind) {
      const mesh = new THREE.InstancedMesh(buildGeo(kind), vertexColorMaterial, list.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      list.forEach((s, i) => {
        dummy.position.copy(s.pos);
        dummy.rotation.set(0, s.rotY, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        const d = DEFS[kind];
        const col = game.physics.addStaticBox(s.pos.x, s.pos.y + d.half[1], s.pos.z, d.half[0], d.half[1], d.half[2], s.rotY, G.PROP);
        const item: Item = { kind, index: i, pos: s.pos.clone(), rotY: s.rotY, broken: false, brokenAt: 0, collider: col };
        const owner = { hit: () => this.breakItem(item, null) };
        game.physics.tag(col, owner);
        if (kind === 'fruit') {
          // La lona está a 1,9 m y el colisor del puesto solo llega a 1 m: sin esto, la cámara (que solo
          // choca con lo estático) se metía dentro del toldo al pasar al lado. Es un voladizo como los
          // toldos de las tiendas: chocan la cámara, el personaje y las balas; los coches no (lo rompen).
          const a = FRUIT_AWNING;
          const q = tmpQ.setFromEuler(tmpE.set(a.tilt, s.rotY, 0, 'YXZ'));
          const desc = game.physics.R.ColliderDesc.cuboid(a.hx, a.hy, a.hz)
            .setTranslation(s.pos.x, s.pos.y + a.y, s.pos.z)
            .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
            .setCollisionGroups(groups(G.STATIC, OVERHANG_FILTER));
          item.awning = game.physics.world.createCollider(desc);
          game.physics.tag(item.awning, owner);
          // en vehículo se apaga con los demás voladizos del mundo (ver setOverhangs en world/island)
          ((game.world as any).extra?.overhangs as RAPIER.Collider[] | undefined)?.push(item.awning);
        }
        this.items.push(item);
        const key = this.key(s.pos.x, s.pos.z);
        const cell = this.grid.get(key) ?? [];
        cell.push(item);
        this.grid.set(key, cell);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      game.scene.add(mesh);
      this.meshes.set(kind, mesh);
    }
  }

  private cellKey(cx: number, cz: number) {
    return (cx + 20000) * 40000 + (cz + 20000);
  }
  private key(x: number, z: number) {
    return this.cellKey(Math.floor(x / CELL), Math.floor(z / CELL));
  }

  private near(x: number, z: number, cb: (it: Item) => void) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) {
        const cell = this.grid.get(this.cellKey(cx + i, cz + j));
        if (cell) for (const it of cell) cb(it);
      }
  }

  breakItem(it: Item, by: Vehicle | null) {
    if (it.broken) return;
    const g = this.game;
    it.broken = true;
    it.brokenAt = g.time.elapsed;
    it.collider.setEnabled(false);
    it.awning?.setEnabled(false);
    const mesh = this.meshes.get(it.kind)!;
    dummy.position.copy(it.pos);
    dummy.scale.setScalar(0);
    dummy.updateMatrix();
    mesh.setMatrixAt(it.index, dummy.matrix);
    mesh.instanceMatrix.needsUpdate = true;
    const d = DEFS[it.kind];
    const center = tmpV.copy(it.pos).setY(it.pos.y + d.half[1]);
    let dir: THREE.Vector3 | undefined;
    if (by) {
      const lv = by.body.linvel();
      dir = new THREE.Vector3(lv.x, 2, lv.z).normalize();
    }
    g.mod.particles?.emit(d.particles, center, { count: it.kind === 'fruit' ? 22 : 12, dir, spread: 0.7, color: d.colors.length ? d.colors : undefined });
    if (it.kind === 'fruit') g.mod.particles?.emit('cardboard', center, { count: 6, dir });
    if (it.kind === 'bin') g.mod.particles?.emit('confetti', center, { count: 8, color: ['#ffffff', '#dddddd', '#c8915a'] });
    g.mod.audio?.play(d.sound, { pos: center, volume: 0.8 });
    if (by) {
      const lv = by.body.linvel();
      by.body.applyImpulse({ x: -lv.x * by.spec.mass * d.slow * 0.1, y: 0, z: -lv.z * by.spec.mass * d.slow * 0.1 }, true);
    }
    g.events.emit('prop:broken' as any, { kind: it.kind, pos: it.pos.clone(), heat: d.heat, byPlayer: !by || by === g.mod.vehicles?.current } as any);
  }

  explosion(pos: THREE.Vector3, radius: number) {
    this.near(pos.x, pos.z, (it) => {
      if (!it.broken && it.pos.distanceTo(pos) < radius + DEFS[it.kind].radius) this.breakItem(it, null);
    });
  }

  update(dt: number) {
    const vm = this.game.mod.vehicles;
    if (vm) {
      for (const v of vm.list as Vehicle[]) {
        if (v.destroyed || Math.abs(v.speed) < 2.5) continue;
        v.getPosition(tmpV);
        const h = v.spec.half;
        v.getQuaternion(tmpQ).invert();
        // (sin funciones nuevas: se recorre la rejilla aquí mismo)
        const cx = Math.floor(tmpV.x / CELL), cz = Math.floor(tmpV.z / CELL);
        for (let i = -1; i <= 1; i++)
          for (let j = -1; j <= 1; j++) {
            const cell = this.grid.get(this.cellKey(cx + i, cz + j));
            if (!cell) continue;
            for (const it of cell) {
              if (it.broken) continue;
              const d = DEFS[it.kind];
              tmpL.set(it.pos.x - tmpV.x, it.pos.y + d.half[1] - tmpV.y, it.pos.z - tmpV.z).applyQuaternion(tmpQ);
              if (Math.abs(tmpL.x) < h.x + d.radius * 0.8 && Math.abs(tmpL.z) < h.z + d.radius * 0.8 && Math.abs(tmpL.y) < h.y + d.half[1] + 0.5) {
                this.breakItem(it, v);
              }
            }
          }
      }
    }
    // reaparecen al rato, lejos de la vista
    this.respawnTimer -= dt;
    if (this.respawnTimer <= 0) {
      this.respawnTimer = 3;
      const cam = this.game.camera.position;
      const now = this.game.time.elapsed;
      for (const it of this.items) {
        if (!it.broken || now - it.brokenAt < 90 || it.pos.distanceTo(cam) < 70) continue;
        it.broken = false;
        it.collider.setEnabled(true);
        it.awning?.setEnabled(true);
        const mesh = this.meshes.get(it.kind)!;
        dummy.position.copy(it.pos);
        dummy.rotation.set(0, it.rotY, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        mesh.setMatrixAt(it.index, dummy.matrix);
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }
}
