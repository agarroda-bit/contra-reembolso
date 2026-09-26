// Fase 6 — La vida de lujo: casino, club VIP, hierbas, ático, interior de la oficina y radio.
import type { Game } from './core/game';
import type { Interaction } from './gameplay/interact';
import type { Economy } from './gameplay/economy';
import { installRadio } from './audio/radio';
import { installHigh } from './fx/high';
import { openCasino } from './gameplay/casino';
import { installClub } from './world/interiors/club';
import { installAttic } from './world/interiors/attic';
import { installOfficeInterior } from './world/interiors/office';

const WEED_LINES = [
  'El vendedor te guiña un ojo: «Esto es de huerto ecológico, hermano. Del huerto de mi primo.»',
  '«Invita la casa… no, es broma. Son 50 pavos.»',
  '«Con esto vas a ver los paquetes en 4D, tronco.»',
  '«Si te para la poli, esto es orégano. Orégano mágico.»',
];

export function setupLuxury(game: Game) {
  installRadio(game);
  installHigh(game);
  installClub(game);
  installAttic(game);
  installOfficeInterior(game);

  const it = game.mod.interaction as Interaction;
  // casino: se entra y se abre el vestíbulo con los tres juegos
  it.addPoi('casino', 'Entrar en el Casino La Suerte Loca', () => openCasino(game), 3.5, 6);
  // el de las hierbas del Barrio Viejo
  it.addPoi(
    'weed',
    () => (game.mod.high?.active ? 'Pedir más (todavía vas servido)' : 'Comprar hierbas (50 €)'),
    () => {
      const eco = game.mod.economy as Economy;
      if (!eco.spend(50, 'hierbas')) return;
      game.events.emit('toast', { text: WEED_LINES[Math.floor(Math.random() * WEED_LINES.length)], color: '#06d6a0', time: 3.5 });
      game.mod.audio?.play('cash', { volume: 0.5 });
      setTimeout(() => game.mod.high?.start(60), 1200);
    },
    3.5,
    6,
  );
}
