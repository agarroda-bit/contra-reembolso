// Daño visible de los vehículos: humo, fuego y explosión con piezas que salen volando.
import * as THREE from 'three';
import type { Game, System } from '../core/game';
import type { Vehicle } from './vehicle';
import type { VehicleManager } from './manager';
import type { Particles } from '../fx/particles';
import { RAPIER, G, groups } from '../core/physics';
import { fx as rnd } from '../core/rng';

const burntMaterial = new THREE.MeshLambertMaterial({ color: '#2a2622', flatShading: true });
const tmpV = new THREE.Vector3();
const tmpL = new THREE.Vector3();

interface Debris {
  body: RAPIER.RigidBody;
  mesh: THREE.Mesh;
  t: number;
}

export class VehicleDamageFx implements System {
  name = 'vehicleDamageFx';
  private timers = new Map<number, { smoke: number; fire: number; burning: number; dead: number }>();
  private debris: Debris[] = [];
  private debrisGeo = new THREE.BoxGeometry(1, 1, 1);

  constructor(private game: Game) {
    game.mod.vehicleFx = this;
    game.events.on('vehicle:destroyed' as any, (e: any) => this.explode(e.vehicle as Vehicle));
  }

  private get vm(): VehicleManager {
    return this.game.mod.vehicles;
  }
  private get particles(): Particles | undefined {
    return this.game.mod.particles;
  }

  update(dt: number) {
    const cam = this.game.camera.position;
    for (const v of this.vm.list) {
      let t = this.timers.get(v.id);
      if (!t) this.timers.set(v.id, (t = { smoke: 0, fire: 0, burning: 0, dead: 0 }));
      v.getPosition(tmpV);
      const far = tmpV.distanceToSquared(cam) > 150 * 150;
      if (v.destroyed) {
        t.dead += dt;
        // restos humeantes
        if (!far && t.dead < 20) {
          t.smoke -= dt;
          if (t.smoke <= 0) {
            t.smoke = 0.12;
            this.particles?.emit('blacksmoke', tmpV, { count: 1, scale: 1.2 });
            if (t.dead < 8) this.particles?.emit('fire', tmpV, { count: 2, scale: 1.2 });
          }
        }
        if (t.dead > 40 && v.transient && far && v !== this.vm.current) {
          this.vm.remove(v);
          this.timers.delete(v.id);
        }
        continue;
      }
      const hp = v.health / v.spec.health;
      if (hp < 0.45 && !far) {
        // humo del motor
        const engine = v.localToWorld(tmpL.set(0, v.spec.half.y * 0.4, v.spec.half.z * 0.75), new THREE.Vector3());
        t.smoke -= dt;
        if (t.smoke <= 0) {
          t.smoke = hp < 0.2 ? 0.06 : 0.14;
          this.particles?.emit(hp < 0.25 ? 'blacksmoke' : 'smoke', engine, { count: 1, scale: 0.8 });
        }
        if (hp < 0.18) {
          t.fire -= dt;
          if (t.fire <= 0) {
            t.fire = 0.07;
            this.particles?.emit('fire', engine, { count: 2, scale: 0.7 });
          }
          // arde y acaba explotando
          t.burning += dt;
          if (!v.onFire) {
            v.onFire = true;
            if (v === this.vm.current) this.game.events.emit('toast', { text: '¡Está ardiendo! ¡Sal de ahí!', color: '#ff5400' });
          }
          this.game.mod.audio?.loop('fire' + v.id, 'fire', engine, 0.5);
          if (t.burning > 7) v.damage(99999);
        }
      }
    }
    // piezas sueltas
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.t += dt;
      const p = d.body.translation();
      const r = d.body.rotation();
      d.mesh.position.set(p.x, p.y, p.z);
      d.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      if (d.t > 6) {
        const s = Math.max(0, 1 - (d.t - 6) / 1);
        d.mesh.scale.multiplyScalar(s > 0 ? 0.92 : 0);
        if (d.t > 7) {
          this.game.scene.remove(d.mesh);
          this.game.physics.world.removeRigidBody(d.body);
          this.debris.splice(i, 1);
        }
      }
    }
  }

  /** Explosión de un vehículo. */
  explode(v: Vehicle) {
    if (v.destroyed) return;
    v.destroyed = true;
    v.onFire = false;
    const g = this.game;
    const pos = v.getPosition(new THREE.Vector3());
    const big = v.spec.mass > 2500;
    this.particles?.explosion(pos, big);
    g.events.emit('explosion', { pos: pos.clone(), radius: big ? 9 : 7, big });
    if (big || this.vm.current === v) g.slowMo(0.9, 0.35);
    // carrocería quemada
    v.mesh.body.material = burntMaterial;
    v.mesh.lights.visible = false;
    if (v.mesh.siren) v.mesh.siren.visible = false;
    // los carteles laterales se queman
    for (const c of v.mesh.group.children) if ((c as THREE.Mesh).isMesh && (c.userData.decal || (c as THREE.Mesh).geometry.type === 'PlaneGeometry')) c.visible = false;
    // salto del chasis
    const m = v.spec.mass;
    v.body.applyImpulse({ x: (rnd.next() - 0.5) * m * 3, y: m * 7, z: (rnd.next() - 0.5) * m * 3 }, true);
    v.body.applyTorqueImpulse({ x: (rnd.next() - 0.5) * m * 4, y: (rnd.next() - 0.5) * m * 2, z: (rnd.next() - 0.5) * m * 6 }, true);
    // piezas que salen volando (puertas, capó, ruedas)
    const n = g.settings.quality === 'baja' ? 3 : 6;
    for (let i = 0; i < n; i++) this.spawnDebris(pos, i < 2 ? '#1e1e24' : v.color, i < 2 ? 0.5 : 0.9);
    // el jugador dentro: sale despedido
    if (this.vm.current === v) {
      this.vm.forceExit();
      const p = g.mod.player;
      p?.push.set((rnd.next() - 0.5) * 12, 9, (rnd.next() - 0.5) * 12);
      if (p) {
        p.pose = 'knocked';
        p.poseTimer = 1.6;
        p.hurt(70, { cause: 'explosión' });
      }
    }
    // onda expansiva: daña y empuja vehículos cercanos
    const radius = big ? 10 : 8;
    for (const o of this.vm.list) {
      if (o === v || o.destroyed) continue;
      const d = o.getPosition(tmpV).distanceTo(pos);
      if (d < radius) {
        const k = 1 - d / radius;
        const dir = tmpV.clone().sub(pos).normalize();
        o.body.applyImpulse({ x: dir.x * o.spec.mass * 6 * k, y: o.spec.mass * 4 * k, z: dir.z * o.spec.mass * 6 * k }, true);
        o.damage(o.spec.health * 0.55 * k);
      }
    }
    const p = g.mod.player;
    if (p && p.state === 'foot') {
      const d = p.position.distanceTo(pos);
      if (d < radius) {
        const k = 1 - d / radius;
        const dir = p.position.clone().sub(pos).setY(0).normalize();
        p.push.set(dir.x * 14 * k, 6 * k, dir.z * 14 * k);
        p.pose = 'knocked';
        p.poseTimer = 1.2;
        p.hurt(60 * k, { cause: 'explosión' });
      }
    }
  }

  private spawnDebris(pos: THREE.Vector3, color: string, size: number) {
    const w = this.game.physics.world;
    const sx = size * (0.4 + rnd.next() * 0.6), sy = size * 0.15, sz = size * (0.4 + rnd.next() * 0.6);
    const body = w.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, pos.y + 1, pos.z)
        .setLinvel((rnd.next() - 0.5) * 16, 8 + rnd.next() * 8, (rnd.next() - 0.5) * 16)
        .setAngvel({ x: rnd.next() * 10, y: rnd.next() * 10, z: rnd.next() * 10 }),
    );
    w.createCollider(
      RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2).setDensity(80).setCollisionGroups(groups(G.DEBRIS, G.GROUND | G.STATIC | G.VEHICLE)),
      body,
    );
    const mesh = new THREE.Mesh(this.debrisGeo, new THREE.MeshLambertMaterial({ color, flatShading: true }));
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true;
    this.game.scene.add(mesh);
    this.debris.push({ body, mesh, t: 0 });
    if (this.debris.length > 30) {
      const old = this.debris.shift()!;
      this.game.scene.remove(old.mesh);
      w.removeRigidBody(old.body);
    }
  }
}
