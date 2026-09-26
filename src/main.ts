// Arranque del juego. Los sistemas se activan por fases (FASE) para publicar cada fase probada.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from './core/game';
import { installDebug } from './core/debug';
import { LoadingScreen } from './ui/loading';
import { buildPlaceholderWorld } from './world/placeholder';
import { Player } from './actors/player';
import { CameraRig } from './actors/cameraRig';
import { makeCharacter, randomLook, defaultPlayerLook } from './actors/character';
import { setLookFactory } from './actors/looks';
import { installDayNight } from './world/daynight';
import { installHud } from './ui/hud';

/** Fase publicada: los sistemas de fases posteriores no se activan todavía. */
export const FASE = 1;

async function boot() {
  const loading = new LoadingScreen();
  await loading.step(0.08, 'Despertando la física…');
  await RAPIER.init();
  const game = new Game(document.getElementById('app')!, document.getElementById('ui')!);
  setLookFactory((rng, kind) => randomLook(rng, kind));

  await loading.step(0.25, 'Levantando Puerto Paquete…');
  game.world = await buildWorld(game);
  installDebug(game);

  await loading.step(0.6, 'Colocando al repartidor…');
  const cam = new CameraRig(game);
  const player = new Player(game, makeCharacter, defaultPlayerLook());
  game.addSystem(player);

  await loading.step(0.75, 'Encendiendo el sol…');
  installDayNight(game);
  game.addSystem(cam);
  installHud(game);

  player.teleport(game.world.playerSpawn.pos, game.world.playerSpawn.heading);
  game.clock.hour = Number(game.params.get('hora') ?? 9.5);

  await loading.step(1, '¡A repartir!');
  loading.hide();
  game.start();
  // aviso del barrio al moverse
  let lastDistrict = '';
  game.addSystem({
    name: 'barrio',
    update: () => {
      if (game.time.frame % 15) return;
      const p = player.position;
      const id = game.world.districtAt(p.x, p.z);
      if (id && id !== lastDistrict) {
        lastDistrict = id;
        const d = game.world.districts.find((x) => x.id === id);
        if (d) game.events.emit('district', { id, name: d.name });
      }
    },
  });
  (window as any).__ready = true;
}

/** La isla (si existe el módulo) o el mundo provisional. */
async function buildWorld(game: Game) {
  const mods = import.meta.glob('./world/island/index.ts');
  const loader = mods['./world/island/index.ts'];
  if (loader) {
    const m: any = await loader();
    return m.buildIsland(game);
  }
  const w = buildPlaceholderWorld(game);
  return w;
}

boot().catch((e) => {
  console.error(e);
  new LoadingScreen().error(String(e?.message ?? e));
});

void THREE;
