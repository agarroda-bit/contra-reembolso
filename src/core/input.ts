// Entrada: teclado, ratón (pointer lock) y, más adelante, mando.
// Todo el juego pregunta por ACCIONES, nunca por teclas sueltas.

export type Action =
  | 'forward' | 'back' | 'left' | 'right'
  | 'sprint' | 'jump' | 'fire' | 'aim'
  | 'vehicle' | 'interact' | 'reload'
  | 'weapon1' | 'weapon2' | 'weapon3' | 'weapon4' | 'weapon5'
  | 'phone' | 'map' | 'horn' | 'radioPrev' | 'radioNext'
  | 'pause' | 'photo' | 'crouch';

const KEYMAP: Record<string, Action[]> = {
  KeyW: ['forward'], ArrowUp: ['forward'],
  KeyS: ['back'], ArrowDown: ['back'],
  KeyA: ['left'], ArrowLeft: ['left'],
  KeyD: ['right'], ArrowRight: ['right'],
  ShiftLeft: ['sprint'], ShiftRight: ['sprint'],
  Space: ['jump'],
  KeyF: ['vehicle'],
  KeyE: ['interact', 'radioNext'],
  KeyQ: ['radioPrev'],
  KeyR: ['reload'],
  Digit1: ['weapon1'], Digit2: ['weapon2'], Digit3: ['weapon3'], Digit4: ['weapon4'], Digit5: ['weapon5'],
  Tab: ['phone'],
  KeyM: ['map'],
  KeyH: ['horn'],
  Escape: ['pause'], KeyP: ['pause'],
  KeyC: ['crouch'],
  KeyK: ['photo'],
};

const PREVENT = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

/** Botones del mando (posición = número de botón estándar). */
const GAMEPAD_MAP: Action[] = [
  'jump', 'vehicle', 'interact', 'reload',
  'radioPrev', 'radioNext', 'aim', 'fire',
  'map', 'pause', 'sprint', 'horn', 'phone',
];

/** Zona muerta de los sticks. */
function deadZone(v: number): number {
  return Math.abs(v) < 0.15 ? 0 : v;
}

export class Input {
  /** Si es false, el juego no recibe teclas (menús abiertos). Los menús leen el DOM directamente. */
  enabled = true;
  private held = new Set<Action>();
  private justDown = new Set<Action>();
  private justUp = new Set<Action>();
  private keysHeld = new Set<string>();
  lookDX = 0;
  lookDY = 0;
  wheel = 0;
  pointerLocked = false;
  /** Intentos seguidos de enganchar el ratón que han fallado (si el navegador no deja, el clic dispara igual). */
  private lockFails = 0;
  /** Última tecla pulsada (para menús de reasignar, pruebas, etc.). */
  lastKey = '';
  private gamepadIndex: number | null = null;
  gamepadMove = { x: 0, y: 0 };
  usingGamepad = false;

  constructor(private canvas: HTMLElement) {
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.releaseAll());
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.pointerLocked) {
        // el clic de «haz clic en el juego para usar el ratón» solo engancha el ratón: no dispara ni da
        // puñetazos (salvo que el navegador no deje engancharlo: entonces el clic dispara como siempre)
        const lockWorks = this.lockFails === 0;
        this.requestPointerLock();
        if (lockWorks && e.button === 0) return;
      }
      if (e.button === 0) this.set('fire', true);
      if (e.button === 2) this.set('aim', true);
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.set('fire', false);
      if (e.button === 2) this.set('aim', false);
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled || !this.pointerLocked) return;
      this.lookDX += e.movementX;
      this.lookDY += e.movementY;
    });
    window.addEventListener(
      'wheel',
      (e) => {
        if (!this.enabled) return;
        this.wheel += Math.sign(e.deltaY);
      },
      { passive: true },
    );
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
      if (this.pointerLocked) this.lockFails = 0;
    });
    document.addEventListener('pointerlockerror', () => this.lockFails++);
    window.addEventListener('gamepadconnected', (e) => {
      this.gamepadIndex = (e as GamepadEvent).gamepad.index;
    });
  }

  requestPointerLock() {
    try {
      const req = (this.canvas as any).requestPointerLock;
      if (typeof req !== 'function') {
        this.lockFails++;
        return;
      }
      const p = req.call(this.canvas);
      // (el fallo puede llegar por aquí y también por 'pointerlockerror': da igual contarlo dos veces)
      if (p && typeof p.catch === 'function') p.catch(() => this.lockFails++);
    } catch {
      /* navegadores sin pointer lock (pruebas) */
      this.lockFails++;
    }
  }

  exitPointerLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private onKey(e: KeyboardEvent, down: boolean) {
    if (PREVENT.has(e.code)) e.preventDefault();
    if (down) this.lastKey = e.code;
    if (down) this.keysHeld.add(e.code);
    else this.keysHeld.delete(e.code);
    const actions = KEYMAP[e.code];
    if (!actions) return;
    // La pausa y el móvil funcionan aunque el juego esté "desactivado" (para poder cerrar menús).
    for (const a of actions) {
      if (!this.enabled && a !== 'pause' && a !== 'phone' && a !== 'map' && !(down === false)) continue;
      if (down && e.repeat) continue;
      this.set(a, down);
    }
  }

  private set(a: Action, down: boolean) {
    if (down) {
      if (!this.held.has(a)) this.justDown.add(a);
      this.held.add(a);
    } else {
      if (this.held.has(a)) this.justUp.add(a);
      this.held.delete(a);
    }
  }

  /** Simula una acción (pruebas, móvil táctil, mando). */
  simulate(a: Action, down: boolean) {
    this.set(a, down);
  }

  down(a: Action): boolean {
    return this.held.has(a);
  }
  pressed(a: Action): boolean {
    return this.justDown.has(a);
  }
  released(a: Action): boolean {
    return this.justUp.has(a);
  }
  keyHeld(code: string): boolean {
    return this.keysHeld.has(code);
  }

  /**
   * Eje de movimiento: x derecha, y adelante, en [-1, 1]. Devuelve siempre el mismo objeto
   * (se lee al momento; no hay que guardarlo).
   */
  moveAxis(): { x: number; y: number } {
    let x = (this.down('right') ? 1 : 0) - (this.down('left') ? 1 : 0);
    let y = (this.down('forward') ? 1 : 0) - (this.down('back') ? 1 : 0);
    if (Math.abs(this.gamepadMove.x) > 0.15 || Math.abs(this.gamepadMove.y) > 0.15) {
      x = this.gamepadMove.x;
      y = this.gamepadMove.y;
    }
    this.axis.x = x;
    this.axis.y = y;
    return this.axis;
  }
  private readonly axis = { x: 0, y: 0 };

  releaseAll() {
    for (const a of [...this.held]) this.set(a, false);
    this.keysHeld.clear();
  }

  /** Lee el mando (se llama una vez por frame antes de la lógica). */
  pollGamepad(dt: number) {
    if (this.gamepadIndex === null) return;
    const gp = navigator.getGamepads?.()[this.gamepadIndex];
    if (!gp) return;
    this.gamepadMove.x = deadZone(gp.axes[0] ?? 0);
    this.gamepadMove.y = -deadZone(gp.axes[1] ?? 0);
    const lx = deadZone(gp.axes[2] ?? 0);
    const ly = deadZone(gp.axes[3] ?? 0);
    if (lx || ly || this.gamepadMove.x || this.gamepadMove.y) this.usingGamepad = true;
    this.lookDX += lx * 900 * dt;
    this.lookDY += ly * 600 * dt;
    for (let i = 0; i < GAMEPAD_MAP.length; i++) {
      const a = GAMEPAD_MAP[i];
      const pressed = !!gp.buttons[i]?.pressed;
      if (pressed !== this.held.has(a) && this.gamepadOwns(a, pressed)) this.set(a, pressed);
    }
  }
  private gpHeld = new Set<Action>();
  private gamepadOwns(a: Action, pressed: boolean): boolean {
    // Solo soltamos con el mando lo que el mando pulsó (para no pisar al teclado).
    if (pressed) {
      this.gpHeld.add(a);
      return true;
    }
    if (this.gpHeld.has(a)) {
      this.gpHeld.delete(a);
      return true;
    }
    return false;
  }

  endFrame() {
    this.justDown.clear();
    this.justUp.clear();
    this.lookDX = 0;
    this.lookDY = 0;
    this.wheel = 0;
  }
}
