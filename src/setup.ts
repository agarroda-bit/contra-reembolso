// Monta todos los sistemas del juego en el orden correcto, según la fase activada.
import * as THREE from 'three';
import type { Game } from './core/game';
import { Player } from './actors/player';
import { CameraRig } from './actors/cameraRig';
import { makeCharacter, defaultPlayerLook } from './actors/character';
import { NpcManager } from './actors/npcManager';
import { installDayNight } from './world/daynight';
import { installHud } from './ui/hud';
import { VehicleManager } from './vehicles/manager';
import { VehicleDamageFx } from './vehicles/damageFx';
import { CrazyVehicles } from './vehicles/crazy';
import { Particles } from './fx/particles';
import { Breakables } from './fx/breakables';
import { AudioEngine } from './audio/audio';
import { Traffic } from './ai/traffic';
import { Pedestrians } from './ai/pedestrians';
import { Combat } from './combat/combat';
import { Police } from './ai/police';
import { Gang } from './ai/gang';
import { Economy } from './gameplay/economy';
import { Pickups } from './gameplay/pickups';
import { Respawn } from './gameplay/respawn';
import { Messages } from './gameplay/messages';
import { Jobs } from './gameplay/jobs/jobs';
import { Interaction } from './gameplay/interact';
import { Loot } from './gameplay/loot';
import { Phone } from './ui/phone';
import { Bubbles } from './ui/bubbles';
import { Markers3D } from './ui/markers3d';
import { CombatHud } from './ui/combatHud';
import { RandomEvents } from './gameplay/randomEvents';
import { PhotoMode } from './ui/photoMode';
import { ShopUI } from './ui/shop';
import { Shops } from './gameplay/shops';
import { Company } from './gameplay/company';
import { SaveSystem } from './gameplay/save';
import { Tutorial } from './gameplay/tutorial';
import { Story } from './gameplay/story';
import { Interiors } from './world/interiors';
import type { CharacterLook } from './core/contracts';

export interface Systems {
  player: Player;
  cam: CameraRig;
}

/** Crea y registra los sistemas hasta la fase `fase` (1..9). */
export function setupSystems(game: Game, fase: number, look: CharacterLook = defaultPlayerLook()): Systems {
  const add = <T extends { name: string }>(s: T): T => {
    game.addSystem(s as any);
    return s;
  };
  const cam = new CameraRig(game);
  const player = new Player(game, makeCharacter, look);
  add(player);

  // módulos que otros necesitan al construirse
  const audio = fase >= 2 ? new AudioEngine(game) : null;
  const interaction = fase >= 4 ? new Interaction(game) : null;
  const shopUI = fase >= 5 ? new ShopUI(game) : null;
  void shopUI;
  const messages = fase >= 4 ? new Messages(game) : null;
  void messages;
  add(new Economy(game));
  add(new Pickups(game)); // los 20 paquetes perdidos existen desde la fase 1

  if (fase >= 2) {
    add(new VehicleManager(game));
    const npcs = add(new NpcManager(game));
    npcs.makeRig = makeCharacter;
    add(new Traffic(game));
    add(new Pedestrians(game));
  }
  if (fase >= 3) {
    add(new Combat(game));
    add(new Police(game));
    add(new Gang(game));
    add(new Respawn(game));
  }
  if (fase >= 4) {
    add(new Phone(game));
    add(new Jobs(game));
    interaction!.add(() => game.mod.jobs.interactHint(), 10);
    if (fase >= 7) add(new Story(game));
    add(new Loot(game));
  }
  if (fase >= 5) {
    add(new Interiors(game));
    add(new Company(game));
    add(new Shops(game));
    add(new Tutorial(game));
    add(new SaveSystem(game));
  }
  if (fase >= 4) add(interaction!);
  if (fase >= 2) {
    add(new VehicleDamageFx(game));
    add(new Breakables(game));
    add(new Particles(game));
  }
  if (fase >= 6) add(new CrazyVehicles(game));
  if (fase >= 9) {
    add(new RandomEvents(game));
    add(new PhotoMode(game));
  }

  installDayNight(game);
  add(cam);
  installHud(game);
  if (fase >= 2) add(new Bubbles(game));
  if (fase >= 4) add(new Markers3D(game));
  if (fase >= 3) add(new CombatHud(game));
  if (audio) add(audio);
  return { player, cam };
}

/** Coloca la furgoneta de reparto delante de la oficina. */
export function spawnStartVan(game: Game) {
  const w = game.world;
  const office = w.pois.find((p) => p.kind === 'office');
  const sp = w.playerSpawn;
  let pos = office?.parking?.clone() ?? sp.pos.clone().add(new THREE.Vector3(5, 0, 4));
  let heading = sp.heading + Math.PI / 2;
  const roads = game.mod.traffic?.roads;
  if (roads && !office?.parking) {
    const ne = roads.nearestEdge(sp.pos, true);
    if (ne) {
      const e = roads.g.edges[ne.edge];
      pos = roads.lanePoint(ne.edge, 1, ne.t, e.width / 4, new THREE.Vector3());
      heading = roads.heading(ne.edge, 1);
    }
  }
  const vm = game.mod.vehicles;
  const v = vm.spawn('van', pos, heading, '#ffd23f');
  v.owned = true;
  v.transient = false;
  v.lastDriven = 0;
  game.mod.shops?.addOwned('van', '#ffd23f', v);
  return v;
}
