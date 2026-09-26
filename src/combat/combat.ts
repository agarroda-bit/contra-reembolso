// Combate: inventario y disparo del jugador, proyectiles (cajas, cinta, paquete FRÁGIL), daño y explosiones.
// Las mismas funciones de disparo las usan los enemigos (fire()).
import * as THREE from 'three';
import type { Game, System } from '../core/game';
import { RAPIER, G, groups, SOLID, type RayHit } from '../core/physics';
import { WEAPONS, WEAPON_ORDER, type WeaponDef, type WeaponId } from './weapons';
import { makeGunMesh, muzzleOffset } from './gunModels';
import type { Player } from '../actors/player';
import type { CameraRig } from '../actors/cameraRig';
import { Npc } from '../actors/npc';
import { Vehicle } from '../vehicles/vehicle';
import type { Particles } from '../fx/particles';
import { fx as rnd } from '../core/rng';

export interface AmmoState {
  clip: number;
  reserve: number;
}

export interface Shooter {
  kind: 'player' | 'npc';
  npc?: Npc;
  /** Colisor o cuerpo a ignorar al disparar. */
  exclude?: RAPIER.Collider | RAPIER.RigidBody | null;
}

interface Projectile {
  kind: 'package' | 'tape' | 'grenade';
  mesh: THREE.Object3D;
  body?: RAPIER.RigidBody;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  t: number;
  fuse: number;
  owner: Shooter;
  hit: Set<Npc>;
}

const HIT_MASK = SOLID | G.NPC | G.VEHICLE | G.PLAYER | G.PROP;
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
const tmpO = new THREE.Vector3();

const tracerGeo = new THREE.BoxGeometry(0.03, 0.03, 1);
const tracerMat = new THREE.MeshBasicMaterial({ color: '#fff3b0', toneMapped: false });
const packageGeo = new THREE.BoxGeometry(0.45, 0.35, 0.45);
const packageMat = new THREE.MeshLambertMaterial({ color: '#c8915a', flatShading: true });
const tapeGeo = new THREE.TorusGeometry(0.12, 0.05, 6, 10);
const tapeMat = new THREE.MeshLambertMaterial({ color: '#d9b26f', flatShading: true });
const fragileGeo = new THREE.BoxGeometry(0.4, 0.32, 0.4);
const fragileMat = new THREE.MeshLambertMaterial({ color: '#d9a870', flatShading: true });

export class Combat implements System {
  name = 'combat';
  readonly owned = new Set<WeaponId>(['fists']);
  readonly ammo: Record<WeaponId, AmmoState> = Object.fromEntries(WEAPON_ORDER.map((w) => [w, { clip: 0, reserve: 0 }])) as any;
  current: WeaponId = 'fists';
  private cooldown = 0;
  private reloading = 0;
  private gunMesh: THREE.Mesh | null = null;
  private projectiles: Projectile[] = [];
  private tracers: { mesh: THREE.Mesh; t: number }[] = [];
  private wheelTimer = 0;
  /** Sin munición infinita salvo trucos. */
  infiniteAmmo = false;

  constructor(private game: Game) {
    game.mod.combat = this;
  }

  private get player(): Player {
    return this.game.mod.player;
  }
  private get cam(): CameraRig {
    return this.game.mod.cameraRig;
  }
  private get particles(): Particles | undefined {
    return this.game.mod.particles;
  }

  // ─────────── Inventario ───────────

  give(id: WeaponId, ammo?: number) {
    const def = WEAPONS[id];
    const firstTime = !this.owned.has(id);
    this.owned.add(id);
    const a = this.ammo[id];
    a.reserve += ammo ?? def.startAmmo;
    if (firstTime && def.clip > 0) {
      const take = Math.min(def.clip, a.reserve);
      a.clip = take;
      a.reserve -= take;
    }
    if (firstTime) this.select(id);
  }

  /** Pierde las armas pequeñas (al ser arrestado). */
  loseSmallWeapons() {
    for (const id of ['pistol', 'stamp', 'smg', 'tape'] as WeaponId[]) {
      this.owned.delete(id);
      this.ammo[id] = { clip: 0, reserve: 0 };
    }
    if (!this.owned.has(this.current)) this.select('fists');
  }

  select(id: WeaponId) {
    if (!this.owned.has(id)) return;
    const vm = this.game.mod.vehicles;
    if (vm?.current && !WEAPONS[id].driveBy && id !== 'fists') return;
    this.current = id;
    this.reloading = 0;
    this.attachModel();
    this.game.events.emit('weapon:switch' as any, { id } as any);
  }

  private attachModel() {
    const rig = this.player?.rig;
    if (this.gunMesh) {
      rig?.detach(this.gunMesh);
      this.gunMesh.parent?.remove(this.gunMesh);
      this.gunMesh = null;
    }
    const m = makeGunMesh(this.current);
    if (m && rig) {
      rig.attach('handR', m);
      this.gunMesh = m;
    }
  }

  private cycle(delta: number, onlyDriveBy = false) {
    const list = WEAPON_ORDER.filter((w) => this.owned.has(w) && (!onlyDriveBy || WEAPONS[w].driveBy || w === 'fists'));
    if (!list.length) return;
    const i = Math.max(0, list.indexOf(this.current));
    this.select(list[(i + delta + list.length) % list.length]);
  }

  private selectSlot(slot: number, onlyDriveBy: boolean) {
    const list = WEAPON_ORDER.filter((w) => WEAPONS[w].slot === slot && this.owned.has(w) && (!onlyDriveBy || WEAPONS[w].driveBy || w === 'fists'));
    if (!list.length) return;
    const i = list.indexOf(this.current);
    this.select(list[(i + 1) % list.length]);
  }

  // ─────────── Bucle ───────────

  update(dt: number) {
    const g = this.game;
    const input = g.input;
    const p = this.player;
    if (!p) return;
    const inVehicle = p.state === 'vehicle';
    const canAct = input.enabled && (p.state === 'foot' || inVehicle);

    // cambio de arma
    if (canAct) {
      (['weapon1', 'weapon2', 'weapon3', 'weapon4', 'weapon5'] as const).forEach((a, i) => {
        if (input.pressed(a)) this.selectSlot(i + 1, inVehicle);
      });
      if (input.wheel !== 0) {
        this.cycle(input.wheel > 0 ? 1 : -1, inVehicle);
        this.wheelTimer = 1.2;
      }
    }
    if (this.wheelTimer > 0) this.wheelTimer -= dt;
    (g.hud as any).weaponWheel = this.wheelTimer > 0 ? WEAPON_ORDER.filter((w) => this.owned.has(w)) : null;
    if (inVehicle && !WEAPONS[this.current].driveBy && this.current !== 'fists') this.select('fists');

    const def = WEAPONS[this.current];
    const a = this.ammo[this.current];
    this.cooldown -= dt;

    // recarga
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        const need = def.clip - a.clip;
        const take = this.infiniteAmmo ? need : Math.min(need, a.reserve);
        a.clip += take;
        if (!this.infiniteAmmo) a.reserve -= take;
      }
    } else if (canAct && input.pressed('reload') && def.clip > 0 && a.clip < def.clip && (a.reserve > 0 || this.infiniteAmmo)) {
      this.startReload();
    }

    // apuntar desde el vehículo: solo si miras a un lado o atrás
    let driveByOk = false;
    if (inVehicle && def.driveBy && this.cam) {
      const v = g.mod.vehicles.current as Vehicle | null;
      if (v) {
        const camFwd = this.cam.forwardXZ(tmpV);
        const h = v.heading;
        const dot = camFwd.x * Math.sin(h) + camFwd.z * Math.cos(h);
        driveByOk = dot < 0.55;
      }
    }
    const aiming = (p.state === 'foot' && p.aiming) || (inVehicle && driveByOk && input.down('aim'));
    g.hud.crosshair = aiming || (inVehicle && driveByOk && def.id !== 'fists');
    p.weaponKind = def.hold === 'none' ? 'none' : def.hold;
    if (this.gunMesh) this.gunMesh.visible = p.state === 'foot' || driveByOk;

    // disparar
    const wantFire = canAct && (def.auto ? input.down('fire') : input.pressed('fire'));
    if (wantFire && this.cooldown <= 0 && this.reloading <= 0 && (p.state === 'foot' || driveByOk)) {
      if (def.clip > 0 && a.clip <= 0) {
        if (a.reserve > 0 || this.infiniteAmmo) this.startReload();
        else if (input.pressed('fire')) {
          g.mod.audio?.play('empty');
          g.events.emit('toast', { text: 'Sin munición. La armería del Polígono vende más.', time: 1.8 });
        }
      } else {
        this.playerFire(def);
      }
    }

    g.hud.weapon =
      this.current === 'fists' && this.owned.size === 1
        ? null
        : {
            name: def.name,
            icon: def.icon,
            clip: def.clip > 0 ? a.clip : 0,
            reserve: def.clip > 0 ? a.reserve : 0,
            infinite: def.clip === 0 || this.infiniteAmmo,
          };
    if (this.reloading > 0 && g.hud.weapon) g.hud.weapon.name = def.name + ' (recargando…)';

    this.updateProjectiles(dt);
    this.updateTracers(dt);
  }

  private startReload() {
    const def = WEAPONS[this.current];
    this.reloading = def.reload;
    this.game.mod.audio?.play('reload');
  }

  /** Disparo del jugador: apunta con el centro de la pantalla. */
  private playerFire(def: WeaponDef) {
    const g = this.game;
    const p = this.player;
    const a = this.ammo[def.id];
    this.cooldown = 1 / def.rate;
    if (def.clip > 0 && !this.infiniteAmmo) a.clip--;
    else if (def.clip > 0) a.clip = Math.max(1, a.clip);
    p.shotPulse = true;

    // punto al que apunta la cámara
    const origin = tmpO;
    const dir = tmpDir;
    this.cam.aimRay(origin, dir);
    const exclude = p.state === 'vehicle' ? g.mod.vehicles.current?.body : p.collider;
    const far = this.game.physics.raycast(origin, dir, def.range + 10, HIT_MASK, exclude);
    const target = far ? far.point.clone() : origin.clone().addScaledVector(dir, def.range);
    const muzzle = this.muzzleWorld(def);
    const spreadMul = p.aiming ? 0.6 : p.state === 'vehicle' ? 1.6 : 1.2;
    this.fire({ kind: 'player', exclude }, def, muzzle, target, spreadMul);
    // retroceso
    if (this.cam) {
      this.cam.pitch += def.recoil * (0.8 + rnd.next() * 0.4);
      this.cam.yaw += (rnd.next() - 0.5) * def.recoil * 0.5;
    }
    if (def.recoil > 0.07) g.events.emit('camera:shake', { amount: def.recoil });
  }

  private muzzleWorld(def: WeaponDef): THREE.Vector3 {
    if (this.gunMesh && this.gunMesh.visible) {
      this.gunMesh.updateWorldMatrix(true, false);
      return muzzleOffset(def.id).applyMatrix4(this.gunMesh.matrixWorld);
    }
    const p = this.player;
    return p.position.clone().add(tmpV.set(0, 1.4, 0));
  }

  /**
   * Disparo genérico (jugador o NPC): desde `muzzle` hacia `target`.
   * spreadMul multiplica la dispersión (los enemigos lejos fallan más).
   */
  fire(shooter: Shooter, def: WeaponDef, muzzle: THREE.Vector3, target: THREE.Vector3, spreadMul = 1) {
    const g = this.game;
    g.mod.audio?.play(def.sound, { pos: shooter.kind === 'player' ? null : muzzle, volume: shooter.kind === 'player' ? 0.9 : 1 });
    g.events.emit('weapon:shot' as any, { pos: muzzle.clone(), shooter, weapon: def.id } as any);
    const dir = tmpDir.copy(target).sub(muzzle).normalize();
    switch (def.mode) {
      case 'melee':
        this.melee(shooter, def, muzzle, dir);
        return;
      case 'package':
        this.spawnPackage(shooter, muzzle, dir, def);
        this.muzzleFx(muzzle, dir, '#ffd23f');
        return;
      case 'tape':
        this.spawnTape(shooter, muzzle, dir);
        return;
      case 'grenade':
        this.spawnGrenade(shooter, muzzle, dir);
        return;
    }
    // hitscan y sellos
    this.muzzleFx(muzzle, dir, def.mode === 'stamp' ? '#ff4f81' : '#fff3b0');
    for (let i = 0; i < def.pellets; i++) {
      const d = tmpV2.copy(dir);
      const s = def.spread * spreadMul;
      d.x += (rnd.next() - 0.5) * 2 * s;
      d.y += (rnd.next() - 0.5) * 2 * s;
      d.z += (rnd.next() - 0.5) * 2 * s;
      d.normalize();
      const hit = g.physics.raycast(muzzle, d, def.range, HIT_MASK, shooter.exclude);
      const end = hit ? hit.point : muzzle.clone().addScaledVector(d, def.range);
      if (def.mode === 'stamp') this.particles?.emit('stamps', end, { count: 2 });
      else if (i < 3) this.tracer(muzzle, end);
      if (hit) this.applyHit(hit, def, shooter, d);
    }
    if (def.mode === 'hitscan' && shooter.kind === 'player' && this.gunMesh) {
      this.particles?.emit('shell', muzzle, { count: 1, dir: new THREE.Vector3(1, 1, 0) });
    }
  }

  private muzzleFx(pos: THREE.Vector3, dir: THREE.Vector3, color: string) {
    this.particles?.emit('fire', pos.clone().addScaledVector(dir, 0.15), { count: 3, dir, spread: 0.3, speed: 0.6, scale: 0.35, life: 0.2, color: [color, '#ffffff'] });
    this.particles?.flash(pos, '#ffd89a', 12, 0.06, 8);
  }

  private tracer(from: THREE.Vector3, to: THREE.Vector3) {
    const len = from.distanceTo(to);
    if (len < 1) return;
    const m = new THREE.Mesh(tracerGeo, tracerMat);
    m.position.lerpVectors(from, to, 0.5);
    m.lookAt(to);
    m.scale.set(1, 1, len);
    this.game.scene.add(m);
    this.tracers.push({ mesh: m, t: 0 });
  }

  private updateTracers(dt: number) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.t += dt;
      t.mesh.scale.x = t.mesh.scale.y = Math.max(0.01, 1 - t.t / 0.07);
      if (t.t > 0.07) {
        this.game.scene.remove(t.mesh);
        this.tracers.splice(i, 1);
      }
    }
  }

  /** Aplica un impacto de bala/sello a lo que haya tocado. */
  applyHit(hit: RayHit, def: WeaponDef, shooter: Shooter, dir: THREE.Vector3) {
    const owner: any = hit.owner;
    const g = this.game;
    if (owner instanceof Npc) {
      if (shooter.kind === 'npc' && shooter.npc === owner) return;
      if (def.mode === 'stamp') {
        owner.stun(2.5);
        owner.hurt(def.damage, { cause: 'sellos', shooter }, dir, 0);
      } else {
        const knock = def.id === 'shotgun' ? 5 : def.id === 'rifle' ? 3 : 0;
        owner.hurt(def.damage, { cause: 'bala', shooter }, dir, knock);
      }
      this.particles?.emit(def.mode === 'stamp' ? 'stamps' : 'cardboard', hit.point, { count: 3, dir: dir.clone().negate(), spread: 0.6, scale: 0.6 });
      if (shooter.kind === 'player') g.events.emit('hitmarker' as any, { kill: !owner.alive } as any);
      return;
    }
    if (owner instanceof Vehicle) {
      owner.damage(def.damage * 1.3);
      this.particles?.emit('spark', hit.point, { count: 6, dir: hit.normal, spread: 0.5 });
      g.mod.audio?.play('crash_small', { pos: hit.point, volume: 0.3, pitch: 2 });
      return;
    }
    if (owner === this.player) {
      if (shooter.kind === 'player') return;
      this.player.hurt(def.damage, { cause: 'bala', shooter });
      return;
    }
    if (owner && typeof owner.hit === 'function') {
      owner.hit(def.damage, hit.point, dir);
      return;
    }
    // pared o suelo: chispas y polvo
    this.particles?.emit('spark', hit.point, { count: 4, dir: hit.normal, spread: 0.6, speed: 0.6 });
    this.particles?.emit('dust', hit.point, { count: 2, dir: hit.normal, scale: 0.5 });
  }

  private melee(shooter: Shooter, def: WeaponDef, pos: THREE.Vector3, dir: THREE.Vector3) {
    if (shooter.kind === 'player') this.cooldown = 1 / def.rate;
    const g = this.game;
    const origin = shooter.kind === 'player' ? this.player.position : shooter.npc!.position;
    const heading = shooter.kind === 'player' ? this.player.heading : shooter.npc!.heading;
    const fwd = tmpV.set(Math.sin(heading), 0, Math.cos(heading));
    if (shooter.kind === 'player') {
      const npcs: Npc[] = g.mod.npcs?.within(origin, def.range + 0.6) ?? [];
      let best: Npc | null = null;
      let bestDot = 0.3;
      for (const n of npcs) {
        if (!n.alive || n.vehicle) continue;
        const to = tmpV2.copy(n.position).sub(origin).setY(0).normalize();
        const d = to.dot(fwd);
        if (d > bestDot) {
          bestDot = d;
          best = n;
        }
      }
      this.player.pose = 'normal';
      if (best) {
        best.hurt(def.damage, { cause: 'puño', shooter }, fwd.clone(), 4);
        g.mod.audio?.play('punch', { pos: best.position });
        this.particles?.emit('stars', best.position.clone().setY(best.position.y + 1.6), { count: 5 });
        g.events.emit('weapon:shot' as any, { pos: origin.clone(), shooter, weapon: 'fists', melee: true } as any);
      }
    } else {
      const p = this.player;
      if (p.state === 'foot' && p.position.distanceTo(origin) < def.range + 0.5) {
        p.hurt(def.damage * 0.6, { cause: 'puñetazo', shooter });
        p.push.copy(fwd).multiplyScalar(4).setY(1);
        g.mod.audio?.play('punch', { pos: p.position });
      }
    }
    void dir;
    void pos;
  }

  // ─────────── Proyectiles ───────────

  private spawnPackage(owner: Shooter, pos: THREE.Vector3, dir: THREE.Vector3, def: WeaponDef) {
    const w = this.game.physics.world;
    const body = w.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos.x + dir.x * 0.5, pos.y + dir.y * 0.5, pos.z + dir.z * 0.5)
        .setLinvel(dir.x * 30, dir.y * 30 + 2, dir.z * 30)
        .setAngvel({ x: rnd.next() * 8, y: rnd.next() * 8, z: rnd.next() * 8 })
        .setCcdEnabled(true),
    );
    w.createCollider(
      RAPIER.ColliderDesc.cuboid(0.22, 0.17, 0.22).setDensity(40).setRestitution(0.6).setFriction(0.5)
        .setCollisionGroups(groups(G.PROJECTILE, G.GROUND | G.STATIC | G.VEHICLE)),
      body,
    );
    const mesh = new THREE.Mesh(packageGeo, packageMat);
    mesh.castShadow = true;
    this.game.scene.add(mesh);
    this.projectiles.push({ kind: 'package', mesh, body, pos: pos.clone(), vel: dir.clone(), t: 0, fuse: 0, owner, hit: new Set() });
    void def;
  }

  private spawnTape(owner: Shooter, pos: THREE.Vector3, dir: THREE.Vector3) {
    const mesh = new THREE.Mesh(tapeGeo, tapeMat);
    mesh.position.copy(pos);
    this.game.scene.add(mesh);
    this.projectiles.push({ kind: 'tape', mesh, pos: pos.clone(), vel: dir.clone().multiplyScalar(38), t: 0, fuse: 0, owner, hit: new Set() });
  }

  private spawnGrenade(owner: Shooter, pos: THREE.Vector3, dir: THREE.Vector3) {
    const w = this.game.physics.world;
    const throwDir = dir.clone();
    throwDir.y += 0.35;
    throwDir.normalize();
    const body = w.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos.x + dir.x * 0.6, pos.y + 0.3, pos.z + dir.z * 0.6)
        .setLinvel(throwDir.x * 17, throwDir.y * 17, throwDir.z * 17)
        .setAngvel({ x: rnd.next() * 6, y: rnd.next() * 6, z: rnd.next() * 6 }),
    );
    w.createCollider(
      RAPIER.ColliderDesc.cuboid(0.2, 0.16, 0.2).setDensity(60).setRestitution(0.35).setFriction(0.8)
        .setCollisionGroups(groups(G.PROJECTILE, G.GROUND | G.STATIC | G.VEHICLE)),
      body,
    );
    const mesh = new THREE.Mesh(fragileGeo, fragileMat);
    // cartel FRÁGIL (banda roja)
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.41, 0.08, 0.41), new THREE.MeshLambertMaterial({ color: '#e63946' }));
    mesh.add(band);
    mesh.castShadow = true;
    this.game.scene.add(mesh);
    this.projectiles.push({ kind: 'grenade', mesh, body, pos: pos.clone(), vel: dir.clone(), t: 0, fuse: 2.4, owner, hit: new Set() });
    this.game.mod.audio?.play('whoosh');
  }

  private removeProjectile(i: number) {
    const pr = this.projectiles[i];
    this.game.scene.remove(pr.mesh);
    if (pr.body) this.game.physics.world.removeRigidBody(pr.body);
    this.projectiles.splice(i, 1);
  }

  private updateProjectiles(dt: number) {
    const g = this.game;
    const npcs = g.mod.npcs;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.t += dt;
      if (pr.body) {
        const t = pr.body.translation();
        const r = pr.body.rotation();
        pr.pos.set(t.x, t.y, t.z);
        pr.mesh.position.copy(pr.pos);
        pr.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      }
      if (pr.kind === 'package') {
        const lv = pr.body!.linvel();
        const sp = Math.hypot(lv.x, lv.y, lv.z);
        if (sp > 5 && npcs) {
          for (const n of npcs.within(pr.pos, 1.1) as Npc[]) {
            if (pr.hit.has(n) || !n.alive || n.vehicle || (pr.owner.kind === 'npc' && pr.owner.npc === n)) continue;
            pr.hit.add(n);
            n.hurt(WEAPONS.launcher.damage, { cause: 'caja', shooter: pr.owner }, new THREE.Vector3(lv.x, 0, lv.z).normalize(), 7);
            g.mod.audio?.play('wood', { pos: pr.pos });
            this.particles?.emit('cardboard', pr.pos, { count: 4 });
            pr.body!.setLinvel({ x: -lv.x * 0.3, y: 4, z: -lv.z * 0.3 }, true);
          }
        }
        // el jugador también se lleva cajazos de la banda
        const p = this.player;
        if (pr.owner.kind === 'npc' && sp > 5 && p.state === 'foot' && p.position.distanceTo(pr.pos) < 1.3 && !pr.hit.size) {
          p.hurt(15, { cause: 'caja' });
          p.push.set(lv.x * 0.3, 3, lv.z * 0.3);
          pr.hit.add(null as any);
        }
        if (pr.t > 7) {
          this.particles?.emit('cardboard', pr.pos, { count: 5 });
          this.removeProjectile(i);
        }
      } else if (pr.kind === 'tape') {
        const step = tmpV.copy(pr.vel).multiplyScalar(dt);
        const len = step.length();
        const hit = g.physics.raycast(pr.pos, step, len + 0.3, HIT_MASK, pr.owner.exclude);
        pr.mesh.rotation.x += dt * 20;
        if (hit) {
          const owner: any = hit.owner;
          if (owner instanceof Npc) {
            owner.tape(4.5);
            this.particles?.emit('tape', hit.point, { count: 6 });
            g.mod.audio?.play('shot_tape', { pos: hit.point, volume: 0.5, pitch: 0.7 });
          } else if (owner === this.player && pr.owner.kind === 'npc') {
            this.player.speedMul = 0.3;
            setTimeout(() => (this.player.speedMul = 1), 2500);
            g.events.emit('toast', { text: '¡Te han precintado los pies!', time: 1.5 });
          } else {
            this.particles?.emit('tape', hit.point, { count: 4 });
          }
          this.removeProjectile(i);
          continue;
        }
        pr.pos.add(step);
        pr.vel.y -= 4 * dt;
        pr.mesh.position.copy(pr.pos);
        if (pr.t > 2) this.removeProjectile(i);
      } else if (pr.kind === 'grenade') {
        pr.fuse -= dt;
        // parpadeo al final
        const blink = pr.fuse < 0.8 && Math.sin(pr.t * 40) > 0;
        (pr.mesh as THREE.Mesh).scale.setScalar(blink ? 1.15 : 1);
        if (pr.fuse <= 0) {
          const pos = pr.pos.clone();
          this.removeProjectile(i);
          this.explode(pos, 7, WEAPONS.fragile.damage, pr.owner);
        }
      }
    }
  }

  // ─────────── Explosiones ───────────

  /** Explosión con daño (paquete FRÁGIL, bidones, misiones). */
  explode(pos: THREE.Vector3, radius: number, damage: number, source?: Shooter | null, big = false) {
    const g = this.game;
    this.particles?.explosion(pos, big);
    g.events.emit('explosion', { pos: pos.clone(), radius, big });
    g.events.emit('weapon:shot' as any, { pos: pos.clone(), shooter: source, weapon: 'explosion' } as any);
    if (big) g.slowMo(0.8, 0.35);
    const npcs: Npc[] = g.mod.npcs?.within(pos, radius) ?? [];
    for (const n of [...npcs]) {
      const d = n.position.distanceTo(pos);
      const k = 1 - d / radius;
      const dir = n.position.clone().sub(pos).setY(0).normalize();
      n.hurt(damage * k, { cause: 'explosión', shooter: source }, dir, 6 + k * 10);
    }
    for (const v of g.mod.vehicles?.list ?? []) {
      const d = (v as Vehicle).getPosition(tmpV).distanceTo(pos);
      if (d < radius) {
        const k = 1 - d / radius;
        const dir = tmpV.clone().sub(pos).normalize();
        (v as Vehicle).body.applyImpulse({ x: dir.x * v.spec.mass * 5 * k, y: v.spec.mass * 4 * k, z: dir.z * v.spec.mass * 5 * k }, true);
        (v as Vehicle).damage(damage * 6 * k);
      }
    }
    const p = this.player;
    if (p && p.state === 'foot') {
      const d = p.position.distanceTo(pos);
      if (d < radius) {
        const k = 1 - d / radius;
        const dir = p.position.clone().sub(pos).setY(0).normalize();
        p.push.set(dir.x * 12 * k, 5 * k, dir.z * 12 * k);
        if (k > 0.3) {
          p.pose = 'knocked';
          p.poseTimer = 1;
        }
        p.hurt(damage * 0.6 * k, { cause: 'explosión' });
      }
    }
    g.mod.breakables?.explosion?.(pos, radius);
  }
}
