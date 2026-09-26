// Página de prueba del ÁTICO y de la OFICINA (interiores).
// Parámetros:
//   ?sitio=atico|oficina|fuera   entra directamente (fuera = delante de la puerta del ático)
//   ?todo=1                      ático comprado con todos los lujos y oficina con todos los lujos
//   ?comprado=1                  ático comprado (vacío)
//   ?lujos=sofa,tele,...         lujos concretos del ático
//   ?nivel=0..3                  nivel de la oficina
//   ?hora=18.8                   hora del día     ?fiesta=1  modo fiesta del ático     ?debug=1
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../core/game';
import { installDebug } from '../core/debug';
import { buildPlaceholderWorld } from '../world/placeholder';
import { Player } from '../actors/player';
import { CameraRig } from '../actors/cameraRig';
import { makeCharacter, defaultPlayerLook } from '../actors/character';
import { installDayNight } from '../world/daynight';
import { installHud } from '../ui/hud';
import { Interaction } from '../gameplay/interact';
import { Economy } from '../gameplay/economy';
import { ShopUI } from '../ui/shop';
import { AudioEngine } from '../audio/audio';
import { Particles } from '../fx/particles';
import { Bubbles } from '../ui/bubbles';
import { Company, LUXURIES } from '../gameplay/company';
import { Interiors } from '../world/interiors';
import { installAttic, ATTIC_ITEMS } from '../world/interiors/attic';
import { installOfficeInterior } from '../world/interiors/office';
import type { Poi } from '../core/contracts';

async function boot() {
  await RAPIER.init();
  const params = new URLSearchParams(location.search);
  const sitio = params.get('sitio') ?? 'fuera';
  const todo = params.get('todo') === '1';
  const game = new Game(document.getElementById('app')!, document.getElementById('ui')!);
  const world = buildPlaceholderWorld(game);
  const poi = (id: string, kind: Poi['kind'], name: string, x: number, z: number, facing: number): Poi => ({
    id, kind, name, district: kind === 'attic' ? 'colina' : 'puerto', door: new THREE.Vector3(x, 0, z), facing,
  });
  world.pois.push(
    poi('attic', 'attic', 'Ático Vistas al Mar', 12, -3, Math.PI),
    poi('office', 'office', 'Oficina de Reparto Contra Reembolso', -12, -3, Math.PI),
  );
  game.world = world;
  installDebug(game);

  const cam = new CameraRig(game);
  const player = new Player(game, makeCharacter, defaultPlayerLook());
  game.addSystem(player);
  installDayNight(game);
  game.addSystem(cam);
  installHud(game);
  const interaction = new Interaction(game);
  game.addSystem(interaction);
  const eco = new Economy(game);
  game.addSystem(eco);
  eco.cash = Number(params.get('efectivo') ?? 4000);
  eco.bank = Number(params.get('banco') ?? 80000);
  new ShopUI(game);
  game.addSystem(new AudioEngine(game));
  game.addSystem(new Particles(game));
  game.addSystem(new Bubbles(game));
  const company = new Company(game);
  game.addSystem(company);
  const interiors = new Interiors(game);
  game.addSystem(interiors);
  const attic = installAttic(game);
  installOfficeInterior(game);

  // estados forzados
  if (todo) {
    attic.debugAll();
    for (const l of LUXURIES) company.luxuries.add(l.id);
  }
  if (params.get('comprado') === '1') attic.owned = true;
  const lujos = params.get('lujos');
  if (lujos) {
    attic.owned = true;
    for (const id of lujos.split(',')) if (ATTIC_ITEMS.some((i) => i.id === id)) attic.items.add(id);
  }
  company.level = Math.max(0, Math.min(3, Number(params.get('nivel') ?? (todo ? 3 : 0))));

  player.teleport(new THREE.Vector3(12, 0, 1.5), Math.PI);
  game.clock.hour = Number(params.get('hora') ?? 18.8);
  game.clock.frozen = params.get('parar') === '1';
  game.start();

  if (sitio === 'atico') {
    attic.owned = true;
    setTimeout(() => interiors.enter('attic'), 100);
  } else if (sitio === 'oficina') {
    setTimeout(() => interiors.enter('office'), 100);
  }
  if (params.get('fiesta') === '1') setTimeout(() => attic.scene?.partyOn(), 1500);

  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const test = {
    game, attic, company, interiors, eco,
    /** Cámara fija (coordenadas locales del interior en el que estés). */
    look(fx: number, fy: number, fz: number, ax: number, ay: number, az: number) {
      const cur = interiors.current;
      const o = cur ? cur.origin : V(0, 0, 0);
      cam.playCinematic(V(fx, fy, fz).add(o), V(fx, fy, fz).add(o), V(ax, ay, az).add(o), 0.01);
    },
    free() {
      cam.stopCinematic();
    },
    /** Teletransporte (local al interior actual). */
    tp(x: number, z: number, heading = 0) {
      const cur = interiors.current;
      const o = cur ? cur.origin : V(0, 0, 0);
      player.teleport(V(x, 0, z).add(o), heading);
    },
    /** Pulsar E (lo que haya cerca). */
    e() {
      const o = interaction.current;
      o?.run();
      return o?.text ?? null;
    },
    hint() {
      return game.hud.hint;
    },
    local() {
      const cur = interiors.current;
      return cur ? player.position.clone().sub(cur.origin) : player.position.clone();
    },
    info() {
      const r = game.renderer.info.render;
      return { fps: Math.round(game.fps), calls: r.calls, tris: r.triangles, day: game.clock.day, hour: +game.clock.hour.toFixed(2), cash: eco.cash, bank: eco.bank, fame: eco.fame, health: player.health };
    },
  };
  (window as any).__atico = test;
  (window as any).__ready = true;
}

boot().catch((e) => console.error(e));
