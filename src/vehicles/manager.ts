// Gestor de vehículos: los actualiza, y lleva subir, bajar y robar (tecla F) y la conducción del jugador.
import * as THREE from 'three';
import type { Game, System } from '../core/game';
import { Vehicle } from './vehicle';
import type { VehicleKind } from './types';
import type { Player } from '../actors/player';
import type { CameraRig } from '../actors/cameraRig';
import { SOLID } from '../core/physics';

/** Lo que tiene que cumplir un conductor NPC para que se le pueda sacar del coche. */
export interface NpcDriver {
  /** El jugador le saca del coche: el NPC hace la animación y sale por `exitPos`. */
  pulledOut(vehicle: Vehicle, exitPos: THREE.Vector3): void;
  /** true = es policía o de la banda (reacciona distinto). */
  hostile?: boolean;
  police?: boolean;
}

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();

type Transition = { kind: 'enter' | 'steal' | 'exit'; t: number; dur: number; vehicle: Vehicle; from: THREE.Vector3; to: THREE.Vector3 } | null;

export class VehicleManager implements System {
  name = 'vehicles';
  readonly list: Vehicle[] = [];
  /** Vehículo que conduce el jugador. */
  current: Vehicle | null = null;
  private transition: Transition = null;
  private hornCooldown = 0;

  constructor(private game: Game) {
    game.mod.vehicles = this;
  }

  spawn(kind: VehicleKind, pos: THREE.Vector3, heading: number, color?: string): Vehicle {
    const v = new Vehicle(this.game, kind, pos, heading, color);
    this.list.push(v);
    this.game.events.emit('vehicle:spawn' as any, { vehicle: v } as any);
    return v;
  }

  remove(v: Vehicle) {
    const i = this.list.indexOf(v);
    if (i >= 0) this.list.splice(i, 1);
    if (this.current === v) this.forceExit();
    v.dispose();
  }

  /** Vehículo más cercano a una posición (dentro de maxDist). */
  nearest(pos: THREE.Vector3, maxDist: number, filter?: (v: Vehicle) => boolean): Vehicle | null {
    let best: Vehicle | null = null;
    let bd = maxDist * maxDist;
    for (const v of this.list) {
      if (v.destroyed || (filter && !filter(v))) continue;
      v.getPosition(tmpV);
      const d = tmpV.distanceToSquared(pos);
      if (d < bd) {
        bd = d;
        best = v;
      }
    }
    return best;
  }

  private get player(): Player {
    return this.game.mod.player as Player;
  }
  private get cam(): CameraRig {
    return this.game.mod.cameraRig as CameraRig;
  }

  fixedUpdate(dt: number) {
    const v = this.current;
    const input = this.game.input;
    if (v && !this.transition && this.player.state === 'vehicle') {
      const ax = input.enabled ? input.moveAxis() : { x: 0, y: 0 };
      v.controls.throttle = ax.y;
      v.controls.steer = ax.x;
      v.controls.handbrake = input.enabled && input.down('jump');
      v.controls.boost = input.enabled && input.down('sprint');
    }
    for (const veh of this.list) {
      if (veh !== this.current && (!veh.driver || veh.destroyed)) {
        veh.controls.throttle = 0;
        veh.controls.steer = 0;
        veh.controls.handbrake = !veh.destroyed;
        veh.controls.boost = false;
      }
      veh.fixedUpdate(dt);
    }
  }

  update(dt: number) {
    const g = this.game;
    const player = this.player;
    for (const v of this.list) v.syncVisual(dt);
    this.hornCooldown -= dt;
    this.updateAudio();

    if (this.transition) {
      this.runTransition(dt);
    } else if (g.input.enabled && g.input.pressed('vehicle')) {
      if (player.state === 'foot') this.tryEnter();
      else if (player.state === 'vehicle') this.exit();
    }

    const v = this.current;
    if (v && player.state === 'vehicle') {
      if (g.input.enabled && g.input.pressed('horn') && this.hornCooldown <= 0) {
        this.hornCooldown = 0.3;
        v.hornTimer = 0.5;
        g.events.emit('vehicle:horn' as any, { vehicle: v } as any);
      }
      v.hornTimer = Math.max(0, v.hornTimer - dt);
      // cámara de persecución
      const cam = this.cam;
      if (cam && cam.mode !== 'cinematic') {
        cam.mode = 'vehicle';
        v.getPosition(cam.target);
        cam.target.y -= v.spec.half.y * 0.5;
        cam.vehicleHeading = v.heading;
        cam.targetSpeed = v.speed;
        cam.vehicleDistance = v.spec.camDistance;
        cam.vehicleHeight = v.spec.camHeight;
        cam.excludeBody = v.body;
      }
      // el jugador va sentado
      player.position.copy(v.getPosition(tmpV));
      g.hud.vehicle = {
        name: v.spec.name,
        speedKmh: Math.abs(v.speed) * 3.6,
        health: Math.max(0, (v.health / v.spec.health) * 100),
        packages: v.packages,
        capacity: v.spec.capacity + v.upgrades.trunk * 2,
      };
    } else {
      g.hud.vehicle = null;
    }

    // Pista de interacción a pie (la compone el sistema de interacción)
    this.hintText = null;
    if (player.state === 'foot' && !this.transition) {
      const near = this.nearest(player.position, 3.4, (x) => !x.sinking);
      if (near) {
        const npc = near.driver && near.driver.kind === 'npc' ? near.driver.npc : null;
        this.hintText = npc ? `F — Robar ${near.spec.name.toLowerCase()}` : `F — Subir a ${near.spec.name.toLowerCase()}`;
      }
    }
    if (!g.mod.interaction) g.hud.hint = this.hintText;
  }

  /** Pista "F — Subir a…" para la interfaz. */
  hintText: string | null = null;

  /** Motores y derrapes: el del jugador siempre, y los 3 más cercanos con motor en marcha. */
  private updateAudio() {
    const audio = this.game.mod.audio;
    if (!audio?.ctx) return;
    const cam = this.game.camera.position;
    const near = this.list
      .filter((v) => !v.destroyed && (v === this.current || v.driver))
      .map((v) => ({ v, d: v.getPosition(tmpV).distanceToSquared(cam) }))
      .filter((x) => x.d < 70 * 70 || x.v === this.current)
      .sort((a, b) => (a.v === this.current ? -1 : b.v === this.current ? 1 : a.d - b.d))
      .slice(0, 4);
    for (const { v } of near) {
      const s = v.spec;
      const sp = Math.abs(v.speed);
      const gearSpan = s.maxSpeed / 5;
      const gear = Math.min(4, Math.floor(sp / gearSpan));
      const within = (sp - gear * gearSpan) / gearSpan;
      const thr = Math.max(0, v.controls.throttle);
      const rpm = Math.min(1, 0.12 + within * 0.7 + thr * 0.12 + (v.wheelContact.some((c) => c) ? 0 : thr * 0.3));
      const pos = v.getPosition(new THREE.Vector3());
      audio.engine(v.id, s.kind, pos, rpm, thr, v === this.current ? 1.2 : 0.8);
      if (v.slip > 4.5 && sp > 4) audio.loop('skid' + v.id, 'skid', pos, Math.min(0.5, (v.slip - 4.5) / 10), Math.min(1, sp / 30));
      if (v.sirenOn) audio.loop('siren' + v.id, 'siren', pos, 0.8);
    }
  }

  /** Punto de la puerta del conductor (lado izquierdo, +X local) en mundo. */
  doorPoint(v: Vehicle, out: THREE.Vector3, side = 1): THREE.Vector3 {
    const s = v.spec;
    return v.localToWorld(tmpV2.set(side * (s.half.x + 0.75), -s.half.y + 0.2, s.seat.z), out);
  }

  tryEnter() {
    const p = this.player;
    const v = this.nearest(p.position, 3.4, (x) => !x.sinking && !x.destroyed);
    if (!v) return false;
    const npc = v.driver && v.driver.kind === 'npc' ? (v.driver.npc as NpcDriver) : null;
    const door = this.doorPoint(v, new THREE.Vector3());
    if (npc) {
      // robar: sacar al conductor
      this.transition = { kind: 'steal', t: 0, dur: 1.0, vehicle: v, from: p.position.clone(), to: door };
      p.state = 'busy';
      p.pose = 'pull_out';
      npc.pulledOut(v, door.clone().add(new THREE.Vector3(0, 0, 0)));
      v.driver = null;
      this.game.events.emit('vehicle:steal' as any, { vehicle: v, npc } as any);
    } else {
      this.transition = { kind: 'enter', t: 0, dur: 0.45, vehicle: v, from: p.position.clone(), to: door };
      p.state = 'busy';
      p.pose = 'enter_car';
    }
    return true;
  }

  private runTransition(dt: number) {
    const tr = this.transition!;
    const p = this.player;
    tr.t += dt;
    const k = Math.min(1, tr.t / tr.dur);
    if (tr.kind === 'enter' || tr.kind === 'steal') {
      // andar hasta la puerta y mirar al coche
      this.doorPoint(tr.vehicle, tr.to);
      const walkK = Math.min(1, k * (tr.kind === 'steal' ? 2.2 : 1.5));
      p.position.lerpVectors(tr.from, tr.to, walkK);
      tr.vehicle.getPosition(tmpV);
      p.heading = Math.atan2(tmpV.x - p.position.x, tmpV.z - p.position.z);
      if (k >= 1) this.seatPlayer(tr.vehicle);
    } else if (tr.kind === 'exit') {
      if (k >= 1) this.transition = null;
    }
  }

  private seatPlayer(v: Vehicle) {
    const p = this.player;
    this.transition = null;
    this.current = v;
    v.driver = { kind: 'player' };
    v.transient = false;
    v.lastDriven = this.game.time.elapsed;
    p.state = 'vehicle';
    p.pose = v.spec.pose;
    p.setActive(false);
    // el muñeco va sentado dentro
    p.root.visible = true;
    v.mesh.group.add(p.root);
    p.root.position.set(v.spec.seat.x, v.spec.seat.y - v.spec.half.y * 0.2, v.spec.seat.z);
    p.root.rotation.set(0, 0, 0);
    p.seated = true;
    this.cam.snapBehind(v.heading);
    this.cam.mode = 'vehicle';
    this.game.events.emit('vehicle:enter', { vehicle: v });
  }

  exit() {
    const v = this.current;
    if (!v) return;
    const p = this.player;
    const fast = Math.abs(v.speed) > 7;
    // buscar sitio libre: puerta izquierda, derecha o encima
    const out = new THREE.Vector3();
    let ok = false;
    for (const side of [1, -1]) {
      this.doorPoint(v, out, side);
      v.getPosition(tmpV);
      const dir = tmpV2.copy(out).sub(tmpV);
      const dist = dir.length();
      const hit = this.game.physics.raycast(tmpV, dir, dist, SOLID, v.body);
      if (!hit) {
        ok = true;
        break;
      }
    }
    if (!ok) {
      v.getPosition(out);
      out.y += v.spec.half.y + 1.2;
    }
    if (this.game.world) out.y = Math.max(out.y, this.game.world.heightAt(out.x, out.z) + 0.05);
    this.detachPlayer(v);
    p.teleport(out);
    p.heading = v.heading;
    if (fast) {
      // tirarse en marcha: sale rodando
      const lv = v.body.linvel();
      p.push.set(lv.x * 0.6, 4, lv.z * 0.6);
      p.pose = 'knocked';
      p.poseTimer = 1.3;
      p.hurt(Math.min(25, Math.abs(v.speed) * 0.8), { cause: 'tirarse del coche' });
    } else {
      p.pose = 'normal';
    }
    this.transition = { kind: 'exit', t: 0, dur: 0.3, vehicle: v, from: out.clone(), to: out.clone() };
    this.game.events.emit('vehicle:exit', { vehicle: v });
  }

  private detachPlayer(v: Vehicle) {
    const p = this.player;
    v.driver = null;
    v.controls.throttle = 0;
    v.controls.steer = 0;
    this.current = null;
    p.seated = false;
    this.game.scene.add(p.root);
    p.setActive(true);
    p.state = 'foot';
    p.pose = 'normal';
    const cam = this.cam;
    cam.mode = 'foot';
    cam.excludeBody = null;
  }

  /** Sacar al jugador sin animación (muerte, vehículo destruido, misión). */
  forceExit() {
    const v = this.current;
    if (!v) return;
    const out = this.doorPoint(v, new THREE.Vector3());
    if (this.game.world) out.y = Math.max(out.y, this.game.world.heightAt(out.x, out.z) + 0.05);
    this.detachPlayer(v);
    this.player.teleport(out);
  }

  /** Meter al jugador directamente en un vehículo (pedir al garaje, pruebas). */
  putPlayerIn(v: Vehicle) {
    if (this.current) this.forceExit();
    this.seatPlayer(v);
  }
}

void tmpQ;
