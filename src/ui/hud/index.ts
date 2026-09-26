// Punto de entrada de la interfaz en pantalla (HUD, minimapa, mapa grande, notificaciones).
import './theme.css';
import './hud.css';
import type { Game } from '../../core/game';
import { HudImpl, type Hud } from './hud';

export type { Hud } from './hud';
export { defaultFameThreshold } from './hud';
export { formatMoney, formatClock, formatTimer, formatDistance } from './format';
export { POI_STYLE } from './icons';

/**
 * Crea el HUD dentro de game.ui, registra su System y lo guarda en game.mod.hud.
 * Lee game.hud cada frame y escucha los eventos 'notify', 'toast', 'district' y 'money'.
 */
export function installHud(game: Game): Hud {
  const existing = game.mod.hud as Hud | undefined;
  if (existing) return existing;
  const hud = new HudImpl(game);
  game.mod.hud = hud;
  return hud;
}
