// Banco de pruebas de vehículos: alinea todos los modelos y mide la conducción.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../core/game';
import { installDebug } from '../core/debug';
import { buildPlaceholderWorld } from '../world/placeholder';
import { VehicleManager } from '../vehicles/manager';
import { VEHICLES, type VehicleKind } from '../vehicles/types';
import { Player } from '../actors/player';
import { CameraRig } from '../actors/cameraRig';
import { makeCharacter, defaultPlayerLook } from '../actors/character';
import { Particles } from '../fx/particles';
import { VehicleDamageFx } from '../vehicles/damageFx';

async function main() {
  await RAPIER.init();
  document.getElementById('carga')?.remove();
  const game = new Game(document.getElementById('app')!, document.getElementById('ui')!);
  game.world = buildPlaceholderWorld(game);
  installDebug(game);
  game.scene.background = new THREE.Color('#9fd3ff');
  game.scene.add(new THREE.HemisphereLight('#fff2d0', '#5a3a7a', 1.3));
  const sun = new THREE.DirectionalLight('#ffffff', 1.8);
  sun.position.set(30, 50, 20);
  game.scene.add(sun);
  const cam = new CameraRig(game);
  const player = new Player(game, makeCharacter, defaultPlayerLook());
  const vm = new VehicleManager(game);
  game.addSystem(player);
  game.addSystem(vm);
  game.addSystem(new VehicleDamageFx(game));
  game.addSystem(new Particles(game));
  game.addSystem(cam);
  const params = new URLSearchParams(location.search);
  const kinds = Object.keys(VEHICLES) as VehicleKind[];

  if (params.has('medir')) {
    // mediciones de física, sin render, en una explanada enorme
    game.physics.addStaticBox(0, -0.5, -2000, 3000, 0.5, 1800);
    const results: Record<string, any> = {};
    const list = (params.get('medir') || '').split(',').filter(Boolean) as VehicleKind[];
    const P = new THREE.Vector3();
    for (const kind of list.length ? list : kinds) {
      const start = new THREE.Vector3(0, 0, -1500);
      const v = vm.spawn(kind, start, 0);
      const step = (n: number) => { for (let i = 0; i < n; i++) { v.fixedUpdate(1 / 60); game.physics.step(); } };
      const reset = () => { v.place(start, 0); v.controls.throttle = 0; v.controls.steer = 0; v.controls.handbrake = false; step(40); };
      step(60);
      const r: any = {};
      // aceleración
      v.controls.throttle = 1;
      let n = 0, t100 = -1;
      while (n < 60 * 12) { step(1); n++; if (t100 < 0 && v.speed >= 27.7) t100 = n / 60; }
      r.t100 = t100 < 0 ? 'no' : +t100.toFixed(1);
      r.top = +(v.speed * 3.6).toFixed(0);
      // frenada desde 25 m/s
      reset(); v.controls.throttle = 1; n = 0;
      while (v.speed < 25 && n < 1200) { step(1); n++; }
      const vb = v.speed; v.getPosition(P); const p0 = P.clone();
      v.controls.throttle = -1; n = 0;
      while (v.speed > 0.5 && n < 900) { step(1); n++; }
      r.brakeFrom = +vb.toFixed(1); r.brakeTime = +(n / 60).toFixed(2); r.brakeDist = +v.getPosition(P).distanceTo(p0).toFixed(1);
      // giro a 12 y 22 m/s
      for (const target of [12, 22]) {
        reset(); v.controls.throttle = 1; n = 0;
        while (v.speed < target && n < 1200) { step(1); n++; }
        v.controls.throttle = 0.4; v.controls.steer = 1;
        step(30);
        const h0 = v.heading; step(30);
        let dh = v.heading - h0; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        const yaw = Math.abs(dh * 2);
        r['yaw' + target] = +yaw.toFixed(2);
        r['latG' + target] = +((yaw * Math.abs(v.speed)) / 9.8).toFixed(2);
        r['v' + target] = +v.speed.toFixed(1);
        r['ok' + target] = !v.upsideDown;
      }
      // freno de mano a 20 m/s: derrape
      reset(); v.controls.throttle = 1; n = 0;
      while (v.speed < 20 && n < 1200) { step(1); n++; }
      v.controls.steer = 1; v.controls.handbrake = true; v.controls.throttle = 0.3;
      const h1 = v.heading; step(60);
      let dh2 = v.heading - h1; dh2 = Math.atan2(Math.sin(dh2), Math.cos(dh2));
      r.drift = +Math.abs(dh2).toFixed(2); r.driftOk = !v.upsideDown;
      // toque de freno de mano a 60 km/h (como en una esquina): 0,4 s girando con el freno de mano,
      // luego se suelta y se endereza 1 s. Buen derrape = gira bastante y acaba sin trompo (yawEnd bajo).
      reset(); v.controls.throttle = 1; n = 0;
      while (v.speed < 16.7 && n < 1200) { step(1); n++; }
      const h3 = v.heading;
      v.controls.steer = 1; v.controls.handbrake = true; v.controls.throttle = 0.4; step(24);
      v.controls.handbrake = false; v.controls.steer = 0; v.controls.throttle = 0.5; step(60);
      let dh3 = v.heading - h3; dh3 = Math.atan2(Math.sin(dh3), Math.cos(dh3));
      r.tapTurn = +Math.abs(dh3).toFixed(2);
      r.tapYawEnd = +Math.abs(v.body.angvel().y).toFixed(2);
      r.tapKmh = +(v.speed * 3.6).toFixed(0);
      results[kind] = r;
      vm.remove(v);
    }
    (window as any).__tuning = results;
  } else {
    // fila de todos los vehículos
    kinds.forEach((k, i) => {
      const x = (i % 8) * 6 - 21;
      const z = Math.floor(i / 8) * 11 - 5;
      vm.spawn(k, new THREE.Vector3(x, 0, z), 0.6);
    });
    player.teleport(new THREE.Vector3(0, 0, 30), Math.PI);
    cam.mode = 'free';
    game.camera.position.set(18, 16, 34);
    game.camera.lookAt(0, 0, 0);
  }
  game.start();
  (window as any).__ready = true;
}
main();
