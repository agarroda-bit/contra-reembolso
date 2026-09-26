// Arranque del juego. Los sistemas se activan por fases (FASE) para publicar cada fase probada.
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from './core/game';
import { installDebug } from './core/debug';
import { LoadingScreen } from './ui/loading';
import { buildPlaceholderWorld } from './world/placeholder';
import { randomLook } from './actors/character';
import { setLookFactory } from './actors/looks';
import { setupSystems, spawnStartVan } from './setup';
import { Menus, defaultProfile, type Profile } from './ui/menus';
import { SaveSystem } from './gameplay/save';
import { registerSaveSections } from './gameplay/saveSections';
import type { WorldData } from './core/contracts';

/** Fase publicada: los sistemas de fases posteriores no se activan todavía. */
export const FASE = 1;

async function boot() {
  const loading = new LoadingScreen();
  await loading.step(0.08, 'Despertando la física…');
  await RAPIER.init();
  const game = new Game(document.getElementById('app')!, document.getElementById('ui')!);
  setLookFactory((rng, kind) => randomLook(rng, kind));
  const prueba = game.params.has('prueba');
  // ?fase=N permite probar fases en preparación sin publicarlas
  const fase = Number(game.params.get('fase') ?? FASE);

  await loading.step(0.2, 'Levantando Puerto Paquete…');
  game.world = await buildWorld(game);
  installDebug(game);

  await loading.step(0.55, 'Contratando repartidores…');
  let profile: Profile = defaultProfile();
  const { player } = setupSystems(game, fase, profile.look);
  if (fase >= 2) spawnStartVan(game);
  game.mod.pickups?.placeCollectibles([]);
  player.teleport(game.world.playerSpawn.pos, game.world.playerSpawn.heading);
  game.clock.hour = Number(game.params.get('hora') ?? 9.5);

  // aviso del barrio al entrar en otro
  let lastDistrict = '';
  game.addSystem({
    name: 'barrio',
    update: () => {
      if (game.time.frame % 15 || game.mod.interiors?.inside) return;
      const p = player.position;
      const id = game.world.districtAt(p.x, p.z);
      if (id && id !== lastDistrict) {
        lastDistrict = id;
        const d = game.world.districts.find((x) => x.id === id);
        if (d) game.events.emit('district', { id, name: d.name });
      }
    },
  });

  const setProfile = (p: Profile) => {
    profile = p;
    player.rig?.setLook({ ...p.look });
    if (game.mod.shops) {
      game.mod.shops.profile = p;
      game.mod.shops.applyClothes();
    }
  };
  if (fase >= 5) {
    registerSaveSections(game, () => profile, setProfile);
    if (game.mod.shops) game.mod.shops.profile = profile;
  }

  await loading.step(1, '¡A repartir!');
  loading.hide();
  game.start();

  if (fase >= 5 && !prueba) {
    const menus = new Menus(game);
    game.addSystem(menus);
    menus.onNewGame = (p) => {
      SaveSystem.wipe();
      setProfile(p);
      player.teleport(game.world.playerSpawn.pos, game.world.playerSpawn.heading);
      menus.play();
      game.mod.tutorial?.begin();
      game.mod.save?.save();
    };
    menus.onContinue = () => {
      game.mod.save?.readFromStorage();
      menus.play();
      game.events.emit('toast', { text: `¡Hola otra vez, ${profile.name}!`, color: '#ffd23f', time: 2.5 });
    };
    menus.showMain();
  } else {
    game.mod.tutorial?.skip();
    if (game.mod.economy && prueba) game.mod.economy.cash = 500;
  }
  (window as any).__ready = true;
}

/** La isla (si existe el módulo) o el mundo provisional. */
async function buildWorld(game: Game): Promise<WorldData> {
  const mods = import.meta.glob('./world/island/index.ts');
  const loader = mods['./world/island/index.ts'];
  if (loader) {
    const m: any = await loader();
    return m.buildIsland(game);
  }
  return buildPlaceholderWorld(game);
}

boot().catch((e) => {
  console.error(e);
  new LoadingScreen().error(String(e?.message ?? e));
});
