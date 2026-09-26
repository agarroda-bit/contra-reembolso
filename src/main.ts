// Arranque del juego.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from './core/game';
import { installDebug } from './core/debug';
import { LoadingScreen } from './ui/loading';
import { buildPlaceholderWorld } from './world/placeholder';
import { Player } from './actors/player';
import { CameraRig } from './actors/cameraRig';
import { VehicleManager } from './vehicles/manager';
import { AudioEngine } from './audio/audio';
import { Particles } from './fx/particles';
import { VehicleDamageFx } from './vehicles/damageFx';

async function boot() {
  const loading = new LoadingScreen();
  await loading.step(0.1, 'Despertando la física…');
  await RAPIER.init();
  const game = new Game(document.getElementById('app')!, document.getElementById('ui')!);
  await loading.step(0.3, 'Levantando Puerto Paquete…');
  game.world = buildPlaceholderWorld(game);
  installDebug(game);

  // Luz y cámara provisionales (hasta integrar día/noche y jugador)
  game.scene.add(new THREE.HemisphereLight('#fff2d0', '#5a3a7a', 1.2));
  const sun = new THREE.DirectionalLight('#ffffff', 1.6);
  sun.position.set(30, 50, 20);
  game.scene.add(sun);
  const cam = new CameraRig(game);
  const player = new Player(game);
  const audio = new AudioEngine(game);
  const vehicles = new VehicleManager(game);
  game.addSystem(player);
  game.addSystem(vehicles);
  game.addSystem(new VehicleDamageFx(game));
  game.addSystem(new Particles(game));
  game.addSystem(cam);
  game.addSystem(audio);
  player.teleport(game.world.playerSpawn.pos, game.world.playerSpawn.heading);
  // la furgoneta de reparto, aparcada al lado
  const sp = game.world.playerSpawn;
  vehicles.spawn('van', sp.pos.clone().add(new THREE.Vector3(4, 0, -2)), sp.heading + Math.PI / 2).owned = true;

  await loading.step(1, '¡Listo!');
  loading.hide();
  game.start();
  (window as any).__ready = true;
}

boot().catch((e) => {
  console.error(e);
  new LoadingScreen().error(String(e?.message ?? e));
});
