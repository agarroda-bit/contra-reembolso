// Prueba de todos los sistemas (fases 2-7) en la ciudad de pruebas, sin la isla.
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../core/game';
import { installDebug } from '../core/debug';
import { buildTestCity } from '../world/testcity';
import { setupSystems, spawnStartVan } from '../setup';
import { setLookFactory } from '../actors/looks';
import { randomLook } from '../actors/character';

async function main() {
  await RAPIER.init();
  document.getElementById('carga')?.remove();
  const game = new Game(document.getElementById('app')!, document.getElementById('ui')!);
  setLookFactory((rng, kind) => randomLook(rng, kind));
  game.world = buildTestCity(game);
  installDebug(game);
  const fase = Number(game.params.get('fase') ?? 7);
  const { player } = setupSystems(game, fase);
  spawnStartVan(game);
  player.teleport(game.world.playerSpawn.pos, game.world.playerSpawn.heading);
  game.clock.hour = Number(game.params.get('hora') ?? 11);
  if (game.mod.economy) game.mod.economy.cash = 5000;
  if (game.mod.tutorial) game.mod.tutorial.skip();
  game.start();
  (window as any).__ready = true;
}
main().catch((e) => console.error(e));
