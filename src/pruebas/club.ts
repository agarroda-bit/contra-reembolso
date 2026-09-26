// Página de prueba del Club Reembolso VIP.
// Parámetros:
//   ?dentro=1              entra directamente al club
//   &mesa=1 &botellas=3    estado inicial (mesa VIP comprada, botellas en la mesa) sin efectos
//   &fiesta=mesa|botella   lanza la fiesta (sin pagar) al entrar
//   &comprar=mesa|botella|ambas   compra de verdad (con el dinero de prueba) al entrar
//   &baila=1  &sienta=1    el jugador baila en la pista / se sienta en su reservado
//   &tienda=barra|portero|mesa  abre el menú de compras
//   &vista=general|pista|vip|barra|dj|entrada   cámara fija para capturas
//   &pos=x,z               coloca al jugador (coordenadas locales del club)
//   &hora=23 &calidad=baja|media|alta &dinero=20000 &debug=1
// En consola: __club (API del club), __cr (el juego).
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../core/game';
import { installDebug } from '../core/debug';
import { buildPlaceholderWorld } from '../world/placeholder';
import { Player } from '../actors/player';
import { CameraRig } from '../actors/cameraRig';
import { makeCharacter, defaultPlayerLook } from '../actors/character';
import { installDayNight } from '../world/daynight';
import { Interaction } from '../gameplay/interact';
import { Economy } from '../gameplay/economy';
import { ShopUI } from '../ui/shop';
import { AudioEngine } from '../audio/audio';
import { Particles } from '../fx/particles';
import { Bubbles } from '../ui/bubbles';
import { installHud } from '../ui/hud';
import { Interiors } from '../world/interiors';
import { installClub } from '../world/interiors/club';
import type { Quality } from '../core/settings';

const VIEWS: Record<string, [number, number, number, number, number, number]> = {
  general: [-12.8, 6.4, 9.6, 2.5, 0.6, -3.2],
  pista: [0.6, 2.4, 4.6, 0, 1.0, -3.6],
  vip: [6.2, 3.3, 7.2, 13.2, 1.0, -1.8],
  barra: [-6.4, 2.1, 2.6, -12.6, 1.4, -1.2],
  dj: [0, 2.6, -1.5, 0, 2.9, -10],
  entrada: [0, 2.6, 0.5, 0, 2.6, 11],
};

async function boot() {
  await RAPIER.init();
  const game = new Game(document.getElementById('app')!, document.getElementById('ui')!);
  const P = game.params;
  const q = P.get('calidad') as Quality | null;
  if (q === 'baja' || q === 'media' || q === 'alta') game.applySettings({ quality: q });

  // mundo provisional con la puerta del club delante del jugador
  const world = buildPlaceholderWorld(game);
  world.pois.push({
    id: 'club', kind: 'club', name: 'Club Reembolso VIP', district: 'centro',
    door: new THREE.Vector3(0, 0, 4), facing: 0, parking: new THREE.Vector3(6, 0, 6),
  });
  game.world = world;
  // un portal de neón para ver dónde está la puerta
  {
    const door = new THREE.Mesh(new THREE.BoxGeometry(3, 3.4, 0.4), new THREE.MeshBasicMaterial({ color: '#ff2e88' }));
    door.position.set(0, 1.7, 3.6);
    game.scene.add(door);
  }
  installDebug(game);

  const cam = new CameraRig(game);
  const player = new Player(game, makeCharacter, defaultPlayerLook());
  game.addSystem(player);
  installDayNight(game);
  game.addSystem(cam);
  const interaction = new Interaction(game);
  game.addSystem(interaction);
  const eco = new Economy(game);
  eco.cash = Number(P.get('dinero') ?? 20000);
  game.addSystem(eco);
  new ShopUI(game);
  const audio = new AudioEngine(game);
  game.addSystem(audio);
  game.addSystem(new Particles(game));
  game.addSystem(new Bubbles(game));
  installHud(game);
  const interiors = new Interiors(game);
  game.addSystem(interiors);
  installClub(game);
  const club = game.mod.club;
  (window as any).__club = club;

  player.teleport(world.playerSpawn.pos, world.playerSpawn.heading);
  game.clock.hour = Number(P.get('hora') ?? 23.5);
  game.clock.frozen = P.has('hora');

  // medidor de fps y llamadas de dibujo
  const perf = document.getElementById('perf')!;
  let acc = 0;
  game.addSystem({
    name: 'prueba-club-perf',
    postUpdate: (dt) => {
      acc += dt;
      if (acc < 0.5) return;
      acc = 0;
      const i = game.renderer.info;
      perf.textContent = `${game.fps.toFixed(0)} fps · ${i.render.calls} draw calls · ${(i.render.triangles / 1000).toFixed(0)}k tri`;
    },
  });

  game.start();

  if (P.get('dentro') === '1') {
    // audio listo aunque no haya gesto (Chromium de pruebas lo permite)
    audio.ensure();
    await new Promise((r) => setTimeout(r, 200));
    interiors.enter('club');
    await new Promise((r) => setTimeout(r, 900));
    const inst = club.instance;
    const origin: THREE.Vector3 = interiors.current?.origin ?? new THREE.Vector3();
    const local = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).add(origin);
    if (P.get('mesa') === '1' || P.has('botellas')) club.debugSet({ table: true, bottles: Number(P.get('botellas') ?? 0) });
    const pos = P.get('pos');
    if (pos) {
      const [x, z] = pos.split(',').map(Number);
      player.teleport(local(x, x > 9 && z < 7 ? 0.6 : 0, z), Math.PI);
    }
    if (P.get('baila') === '1') {
      if (!pos) player.teleport(local(0.2, 0, 0.6), Math.PI);
      await new Promise((r) => setTimeout(r, 200));
      club.dance();
    }
    if (P.get('sienta') === '1') club.sit();
    const fiesta = P.get('fiesta');
    if (fiesta === 'mesa' || fiesta === 'botella') club.party(fiesta);
    const comprar = P.get('comprar');
    if (comprar === 'mesa' || comprar === 'ambas') club.buyTable();
    if (comprar === 'botella' || comprar === 'ambas') {
      if (comprar === 'ambas') await new Promise((r) => setTimeout(r, 4200));
      club.buyBottle();
    }
    const tienda = P.get('tienda');
    if (tienda === 'barra' || tienda === 'portero' || tienda === 'mesa') club.openShop(tienda);
    const vista = P.get('vista');
    if (vista && VIEWS[vista]) {
      const [cx, cy, cz, lx, ly, lz] = VIEWS[vista];
      cam.mode = 'free';
      game.camera.position.copy(local(cx, cy, cz));
      game.camera.lookAt(local(lx, ly, lz));
    }
    void inst;
  }
  (window as any).__ready = true;
}

boot().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#fff;position:fixed;top:0;left:0;z-index:99">${String(e?.stack ?? e)}</pre>`);
});
