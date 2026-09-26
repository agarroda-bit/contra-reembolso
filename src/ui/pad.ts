// Mando en los menús (pausa, opciones, tiendas, móvil): cruceta o stick para moverse entre
// botones, A para pulsar, B para volver. El juego en sí lo lleva core/input.ts.

/** Botones del mando estándar (máscara de bits). */
export const PAD = {
  A: 1 << 0, B: 1 << 1, X: 1 << 2, Y: 1 << 3,
  START: 1 << 9,
  UP: 1 << 12, DOWN: 1 << 13, LEFT: 1 << 14, RIGHT: 1 << 15,
} as const;

let connected = false;
if (typeof window !== 'undefined') window.addEventListener('gamepadconnected', () => (connected = true));

/** Detecta los botones que se acaban de pulsar (flanco) en el primer mando conectado. */
export class PadEdges {
  private prev = 0;

  /** Botones recién pulsados este frame (máscara PAD.*). 0 si no hay mando: no cuesta nada. */
  poll(): number {
    if (!connected) return 0;
    const pads = navigator.getGamepads?.();
    if (!pads) return 0;
    let now = 0;
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      for (let i = 0; i < 16; i++) if (gp.buttons[i]?.pressed) now |= 1 << i;
      // el stick izquierdo también vale como cruceta
      const ax = gp.axes[0] ?? 0, ay = gp.axes[1] ?? 0;
      if (ay < -0.6) now |= PAD.UP;
      else if (ay > 0.6) now |= PAD.DOWN;
      if (ax < -0.6) now |= PAD.LEFT;
      else if (ax > 0.6) now |= PAD.RIGHT;
      break;
    }
    const edges = now & ~this.prev;
    this.prev = now;
    return edges;
  }

  /** Olvida lo pulsado (al abrir un menú, para que el botón que lo abrió no cuente). */
  reset() {
    this.prev = 0xffff;
  }
}

const FOCUS = 'cr-foco';

/**
 * Cruceta: mueve el foco entre los botones (y deslizadores) de `root`; izquierda/derecha
 * cambian el deslizador enfocado; A pulsa el botón enfocado. Devuelve true si ha hecho algo.
 */
export function padNavigate(root: HTMLElement, edges: number): boolean {
  if (!(edges & (PAD.UP | PAD.DOWN | PAD.LEFT | PAD.RIGHT | PAD.A))) return false;
  const items = [...root.querySelectorAll<HTMLElement>('button:not(:disabled), input[type=range]')].filter(
    (el) => el.offsetParent !== null,
  );
  if (!items.length) return false;
  const cur = document.activeElement as HTMLElement | null;
  let i = cur ? items.indexOf(cur) : -1;
  if (i >= 0 && cur instanceof HTMLInputElement && cur.type === 'range' && edges & (PAD.LEFT | PAD.RIGHT)) {
    const step = Number(cur.step) || 1;
    const v = Number(cur.value) + (edges & PAD.RIGHT ? step : -step);
    cur.value = String(Math.min(Number(cur.max), Math.max(Number(cur.min), v)));
    cur.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }
  if (edges & PAD.A) {
    if (i >= 0 && cur instanceof HTMLButtonElement) {
      cur.click();
      // si el botón se ha redibujado, el foco (y su marco) pasa al nuevo
      const now = document.activeElement;
      if (now instanceof HTMLElement && now !== document.body && root.contains(now)) now.classList.add(FOCUS);
      return true;
    }
    return false;
  }
  if (edges & (PAD.DOWN | PAD.RIGHT)) i = (i + 1) % items.length;
  else i = i <= 0 ? items.length - 1 : i - 1;
  for (const el of root.querySelectorAll('.' + FOCUS)) el.classList.remove(FOCUS);
  const el = items[i];
  el.classList.add(FOCUS);
  el.focus({ preventScroll: true });
  el.scrollIntoView?.({ block: 'nearest' });
  return true;
}

/** Estilo del foco del mando (se inyecta una vez). */
export function padFocusCss(): string {
  return `.${FOCUS}{outline:4px solid #ff4f81 !important;outline-offset:3px}`;
}
