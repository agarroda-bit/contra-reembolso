// Arranque del juego. Los sistemas se activan por fases (FASE) para publicar cada fase probada.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { SOLID } from './core/physics';
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
export const FASE = 8;

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

  // que no empiece con una farola pegada a la cámara: si hay algo sólido detrás, se aparta
  nudgeSpawn(game);

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

  // el menú principal se crea ya: así su vista de la isla también se prepara con la pantalla de carga
  const menus = fase >= 5 && !prueba ? new Menus(game) : null;

  // los shaders se compilan con la pantalla de carga puesta: si no, el primer frame se congela un momento
  await loading.step(0.85, 'Calentando motores…');
  await warmUp(game, menus);
  await loading.step(1, '¡A repartir!');
  loading.hide();
  game.start();

  if (menus) {
    game.addSystem(menus);
    // en el menú no llegan encargos ni persecuciones
    if (game.mod.jobs) game.mod.jobs.autoOffers = false;
    if (game.mod.gang) game.mod.gang.calm = true;
    // ni se guarda nada: la partida guardada no se toca hasta pulsar «Continuar» o «¡A repartir!»
    const save = game.mod.save as SaveSystem | undefined;
    if (save) save.enabled = false;
    menus.onNewGame = (p) => {
      SaveSystem.wipe();
      if (save) save.enabled = true;
      // la ropa de serie de la tienda no debe tapar el uniforme y la gorra elegidos al crear el personaje
      game.mod.shops?.resetOutfit(p.look);
      setProfile(p);
      player.teleport(game.world.playerSpawn.pos, game.world.playerSpawn.heading);
      menus.play();
      game.mod.tutorial?.begin();
      game.mod.save?.save();
    };
    menus.onContinue = () => {
      // antes de cargar: si el tutorial se quedó a medias, al reanudarlo vuelve a parar los encargos
      if (game.mod.jobs) game.mod.jobs.autoOffers = true;
      if (game.mod.gang) game.mod.gang.calm = false;
      save?.readFromStorage();
      if (save) save.enabled = true;
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

/**
 * Compila en paralelo los shaders de todo lo que hay en la escena antes de quitar la pantalla de carga
 * (si el navegador no sabe, o tarda demasiado, se sigue igual: se compilarán al usarlos).
 */
async function warmUp(game: Game, menus: Menus | null) {
  try {
    // sin compilación en paralelo (p. ej. WebGL por software) compilar todo de golpe congela el arranque
    // decenas de segundos: entonces solo se prepara lo que se ve primero (como hace game.warmShaders)
    const parallel = game.renderer.extensions.has('KHR_parallel_shader_compile');
    if (parallel) await Promise.race([game.renderer.compileAsync(game.scene, game.camera), new Promise((r) => setTimeout(r, 10000))]);
    // y un dibujado de prueba, tapado por la pantalla de carga: sube a la tarjeta gráfica las mallas y
    // texturas que se ven al empezar (detrás del jugador y, si hay menú, la vista de la isla) y prepara las sombras
    game.mod.cameraRig?.postUpdate?.(1 / 60);
    if (parallel || !menus) game.render();
    if (menus) {
      menus.update(0);
      game.render();
    }
  } catch {
    /* nada: se hará en el primer frame */
  }
}

/** Mueve el punto de inicio si la cámara (detrás del jugador) quedaría tapada por algo cercano. */
function nudgeSpawn(game: Game) {
  const sp = game.world.playerSpawn;
  const h = sp.heading;
  const back = new THREE.Vector3(-Math.sin(h), 0, -Math.cos(h));
  const right = new THREE.Vector3(Math.cos(h), 0, -Math.sin(h));
  const clear = (p: THREE.Vector3) => {
    const eye = p.clone().setY(p.y + 1.7);
    for (const off of [-1.6, -1, -0.5, 0, 0.5, 1, 1.6]) {
      const o = eye.clone().addScaledVector(right, off);
      if (game.physics.raycast(o, back, 5.5, SOLID)) return false;
    }
    // farolas sin colisor: se miran en la lista de bombillas
    for (const l of game.world.lampPositions) {
      const dx = l.x - p.x, dz = l.z - p.z;
      const along = -(dx * back.x + dz * back.z);
      const side = Math.abs(dx * right.x + dz * right.z);
      if (along < 0 && along > -5.5 && side < 1.8) return false;
    }
    return true;
  };
  if (clear(sp.pos)) return;
  const fwd = back.clone().negate();
  for (const [s, f] of [[0, 2], [0, 3], [1.5, 0], [-1.5, 0], [1.5, 2], [-1.5, 2], [3, 0], [-3, 0], [0, 4]]) {
    const p = sp.pos.clone().addScaledVector(right, s).addScaledVector(fwd, f);
    p.y = game.world.heightAt(p.x, p.z);
    if (clear(p)) {
      sp.pos.copy(p);
      return;
    }
  }
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
