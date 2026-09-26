// Cámara en tercera persona: a pie (con hombro al apuntar) y persiguiendo al vehículo.
// No atraviesa paredes: lanza un rayo desde el personaje hasta la cámara y la acerca si choca.
import * as THREE from 'three';
import type { Game, System } from '../core/game';
import { SOLID } from '../core/physics';

export type CameraMode = 'foot' | 'vehicle' | 'free' | 'cinematic';

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpDir = new THREE.Vector3();

export class CameraRig implements System {
  name = 'cameraRig';
  mode: CameraMode = 'foot';
  /** Ángulos de la cámara: yaw 0 = mirando hacia -Z (norte). */
  yaw = Math.PI;
  pitch = -0.18;
  /** Punto que sigue la cámara (lo pone el jugador o el vehículo cada frame). */
  readonly target = new THREE.Vector3();
  /** Velocidad del objetivo (m/s) para alejar la cámara en vehículo. */
  targetSpeed = 0;
  /** Rumbo del vehículo (para volver detrás automáticamente). */
  vehicleHeading = 0;
  aiming = false;
  sprinting = false;
  /** Distancia base en vehículo (cada vehículo la ajusta: la furgoneta más lejos). */
  vehicleDistance = 7.5;
  vehicleHeight = 2.4;
  private dist = 4.6;
  private shoulder = 0;
  private fovExtra = 0;
  private idleLook = 0;
  private readonly smoothPos = new THREE.Vector3();
  private initialized = false;
  /** Colisores a ignorar por la cámara (el propio vehículo). */
  excludeBody: any = null;
  private cinematic: { from: THREE.Vector3; to: THREE.Vector3; look: THREE.Vector3; t: number; dur: number } | null = null;

  constructor(private game: Game) {
    game.mod.cameraRig = this;
  }

  /** Dirección horizontal hacia donde mira la cámara (para mover al jugador). */
  forwardXZ(target = new THREE.Vector3()): THREE.Vector3 {
    return target.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }
  rightXZ(target = new THREE.Vector3()): THREE.Vector3 {
    return target.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  /** Rayo de apuntado desde el centro de la pantalla. */
  aimRay(origin: THREE.Vector3, dir: THREE.Vector3) {
    origin.copy(this.game.camera.position);
    this.game.camera.getWorldDirection(dir);
  }

  /** Plano cinematográfico: la cámara viaja de `from` a `to` mirando a `look` durante `dur` segundos. */
  playCinematic(from: THREE.Vector3, to: THREE.Vector3, look: THREE.Vector3, dur: number) {
    this.cinematic = { from: from.clone(), to: to.clone(), look: look.clone(), t: 0, dur };
    this.mode = 'cinematic';
  }
  stopCinematic() {
    this.cinematic = null;
    if (this.mode === 'cinematic') this.mode = 'foot';
  }

  postUpdate(dt: number) {
    const g = this.game;
    const cam = g.camera;
    const input = g.input;
    const realDt = Math.max(dt, 1e-4);

    if (this.mode === 'cinematic' && this.cinematic) {
      const c = this.cinematic;
      c.t += realDt;
      const k = Math.min(1, c.t / c.dur);
      const e = k * k * (3 - 2 * k);
      cam.position.lerpVectors(c.from, c.to, e);
      cam.lookAt(c.look);
      if (k >= 1 && c.dur > 0) {
        /* se queda quieta hasta stopCinematic */
      }
      return;
    }
    if (this.mode === 'free') return;

    // Ratón
    const sens = 0.0022 * g.settings.sensitivity * (this.aiming ? 0.6 : 1);
    const dx = input.lookDX;
    const dy = input.lookDY * (g.settings.invertY ? -1 : 1);
    this.yaw -= dx * sens;
    this.pitch -= dy * sens;
    const moved = Math.abs(dx) + Math.abs(dy) > 0.5;
    this.idleLook = moved ? 0 : this.idleLook + realDt;

    let distTarget: number;
    let heightOff: number;
    let shoulderTarget = 0;
    if (this.mode === 'vehicle') {
      this.pitch = THREE.MathUtils.clamp(this.pitch, -0.7, 0.35);
      // si no tocas el ratón, la cámara vuelve detrás del vehículo
      if (this.idleLook > 1.2 && this.targetSpeed > 2) {
        const behind = this.vehicleHeading + Math.PI;
        let d = behind - this.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        this.yaw += d * Math.min(1, realDt * 2.5);
        this.pitch += (-0.2 - this.pitch) * Math.min(1, realDt * 1.5);
      }
      const speedK = Math.min(1, Math.abs(this.targetSpeed) / 35);
      distTarget = this.vehicleDistance + speedK * 3.5;
      heightOff = this.vehicleHeight;
      this.fovExtra += (speedK * 12 - this.fovExtra) * Math.min(1, realDt * 2);
    } else {
      this.pitch = THREE.MathUtils.clamp(this.pitch, -1.2, 0.9);
      distTarget = this.aiming ? 2.1 : 4.4;
      heightOff = this.aiming ? 1.55 : 1.65;
      shoulderTarget = this.aiming ? 0.75 : 0.35;
      this.fovExtra += ((this.sprinting ? 6 : this.aiming ? -14 : 0) - this.fovExtra) * Math.min(1, realDt * 6);
    }
    this.dist += (distTarget - this.dist) * Math.min(1, realDt * (this.aiming ? 14 : 6));
    this.shoulder += (shoulderTarget - this.shoulder) * Math.min(1, realDt * 10);

    const fov = g.settings.fov + this.fovExtra;
    if (Math.abs(cam.fov - fov) > 0.05) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }

    // Punto de mira (cabeza del personaje / techo del coche)
    const pivot = tmpV.copy(this.target);
    pivot.y += heightOff;
    const right = this.rightXZ(tmpV2);
    pivot.addScaledVector(right, this.shoulder);

    // Dirección desde el pivote hasta la cámara
    const cp = Math.cos(this.pitch);
    tmpDir.set(Math.sin(this.yaw) * cp, -Math.sin(this.pitch), Math.cos(this.yaw) * cp).normalize();

    // Colisión con el mundo
    let d = this.dist;
    const hit = g.physics.raycast(pivot, tmpDir, d + 0.3, SOLID, this.excludeBody);
    if (hit) d = Math.max(0.35, hit.distance - 0.3);

    const desired = new THREE.Vector3().copy(pivot).addScaledVector(tmpDir, d);
    // nunca por debajo del suelo
    if (g.world) {
      const gy = g.world.heightAt(desired.x, desired.z) + 0.35;
      if (desired.y < gy) desired.y = gy;
    }

    if (!this.initialized) {
      this.smoothPos.copy(desired);
      this.initialized = true;
    } else {
      // suavizado, pero si hay que acercarse por una pared, instantáneo
      const k = this.mode === 'vehicle' ? 18 : 30;
      this.smoothPos.lerp(desired, Math.min(1, realDt * k));
      const toPivot = this.smoothPos.distanceTo(pivot);
      if (toPivot > d + 0.05) {
        this.smoothPos.copy(pivot).addScaledVector(tmpDir, d);
      }
    }
    cam.position.copy(this.smoothPos);
    // mirar al pivote proyectado un poco hacia delante
    const look = pivot.clone().addScaledVector(tmpDir, -6);
    cam.lookAt(look);
  }

  /** Coloca la cámara detrás de un rumbo dado (al empezar, al reaparecer). */
  snapBehind(heading: number) {
    this.yaw = heading + Math.PI;
    this.pitch = -0.18;
    this.initialized = false;
  }
}
