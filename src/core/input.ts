// Entrada: teclado, ratón (pointer lock) y mando (Gamepad API).
// Todo el juego pregunta por ACCIONES, nunca por teclas sueltas.

export type Action =
  | 'forward' | 'back' | 'left' | 'right'
  | 'sprint' | 'jump' | 'fire' | 'aim'
  | 'vehicle' | 'interact' | 'reload'
  | 'weapon1' | 'weapon2' | 'weapon3' | 'weapon4' | 'weapon5'
  | 'phone' | 'map' | 'horn' | 'radioPrev' | 'radioNext'
  | 'pause' | 'photo' | 'crouch';

/** Con qué se ha jugado por última vez (para enseñar teclas o botones del mando en las pistas). */
export type InputDevice = 'keyboard' | 'gamepad';

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

/** Botones del mando estándar (W3C «standard gamepad»). */
export const BTN = {
  A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11,
  UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15,
} as const;

/**
 * Botones del mando → acciones, a pie y en vehículo (el botón A a pie se decide al pulsarlo:
 * interactuar si hay algo que hacer —«Ⓐ Entregar»— y si no, saltar).
 * Los gatillos van aparte (son analógicos): a pie apuntar/disparar; en vehículo frenar/acelerar.
 * LB/RB a pie cambian de arma; en vehículo apuntan y disparan por la ventanilla.
 */
const PAD_FOOT: (Action | null)[] = [
  null, 'radioPrev', 'reload', 'vehicle', null, null, null, null,
  'map', 'pause', null, null, 'phone', null, null, null,
];
const PAD_CAR: (Action | null)[] = [
  'jump', 'horn', 'sprint', 'vehicle', 'aim', 'fire', null, null,
  'map', 'pause', 'horn', null, 'phone', null, 'radioPrev', 'radioNext',
];

/** Letras de los botones (estilo del mando más común) para las pistas en pantalla. */
export const PAD_GLYPH = {
  A: 'Ⓐ', B: 'Ⓑ', X: 'Ⓧ', Y: 'Ⓨ', LB: 'LB', RB: 'RB', LT: 'LT', RT: 'RT',
  BACK: '⧉', START: '☰', L3: 'L3', R3: 'R3', UP: '▲', DOWN: '▼', LEFT: '◀', RIGHT: '▶', LS: 'Ⓛ', RS: 'Ⓡ',
} as const;

/** Zona muerta de los sticks y de los gatillos. */
const DEAD = 0.15;
const TRIGGER_ON = 0.3;

/** Zona muerta radial con reescalado (sin «escalón» al salir de la zona muerta). */
function stick(x: number, y: number, out: { x: number; y: number }) {
  const m = Math.hypot(x, y);
  if (m < DEAD) {
    out.x = out.y = 0;
    return 0;
  }
  const k = Math.min(1, (m - DEAD) / (1 - DEAD)) / m;
  out.x = x * k;
  out.y = y * k;
  return Math.min(1, m);
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
  /** Teclado/ratón o mando: lo último que se ha tocado. */
  lastDevice: InputDevice = 'keyboard';
  /** Se enciende al usar el mando por primera vez (el HUD enseña entonces la chuleta de botones). */
  gamepadSeen = false;
  private gamepadIndex: number | null = null;
  private padScan = 0;
  gamepadMove = { x: 0, y: 0 };
  /** Acelerador del mando en vehículo: gatillo derecho − gatillo izquierdo (−1..1). */
  gamepadThrottle = 0;
  /** ¿Se está usando el mando? (lo mismo que lastDevice === 'gamepad'). */
  get usingGamepad() {
    return this.lastDevice === 'gamepad';
  }
  /** ¿El jugador va en un vehículo? (lo pone combat.ts: cambia lo que hace cada botón del mando). */
  vehicleContext: () => boolean = () => false;
  /** ¿Hay algo con lo que interactuar ahora? (lo pone combat.ts: entonces Ⓐ interactúa en vez de saltar). */
  interactContext: () => boolean = () => false;
  /** Multiplicador del stick derecho (ayuda al apuntar: más lento con la mira sobre un enemigo). */
  lookScale = 1;
  /** Vibración del mando (se puede apagar). */
  vibration = true;
  private mouseFire = false;
  private mouseAim = false;
  /** Acciones que tiene pulsadas el mando (desde la última lectura). */
  private gpNow = new Set<Action>();
  /** (conjunto de trabajo de pollGamepad: se intercambia con gpNow) */
  private gpScratch = new Set<Action>();
  private gpButtonsPrev = 0;
  /** Botones del mando recién pulsados este frame (máscara de bits, ver BTN). */
  padEdge = 0;
  /** Lo que hace Ⓐ a pie mientras está pulsado (se decide al pulsarlo). */
  private aAction: Action | null = null;
  /** Correr con L3: se queda puesto mientras mueves el stick. */
  private sprintLatch = false;
  /** Tiempo con el stick derecho a tope (acelera el giro de cámara). */
  private lookHold = 0;
  private readonly lookOut = { x: 0, y: 0 };
  private rumbleUntil = 0;
  private rumbleLevel = 0;

  constructor(private canvas: HTMLElement) {
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.releaseAll());
    canvas.addEventListener('mousedown', (e) => {
      this.lastDevice = 'keyboard';
      if (!this.enabled) return;
      if (!this.pointerLocked) {
        // el clic de «haz clic en el juego para usar el ratón» solo engancha el ratón: no dispara ni da
        // puñetazos (salvo que el navegador no deje engancharlo: entonces el clic dispara como siempre)
        const lockWorks = this.lockFails === 0;
        this.requestPointerLock();
        if (lockWorks && e.button === 0) return;
      }
      if (e.button === 0) {
        this.mouseFire = true;
        this.set('fire', true);
      }
      if (e.button === 2) {
        this.mouseAim = true;
        this.set('aim', true);
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.mouseFire = false;
        if (!this.gpNow.has('fire')) this.set('fire', false);
      }
      if (e.button === 2) {
        this.mouseAim = false;
        if (!this.gpNow.has('aim')) this.set('aim', false);
      }
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled || !this.pointerLocked) return;
      this.lookDX += e.movementX;
      this.lookDY += e.movementY;
      if (Math.abs(e.movementX) + Math.abs(e.movementY) > 3) this.lastDevice = 'keyboard';
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
      this.gamepadIndex = (e as GamepadEvent).gamepad?.index ?? 0;
    });
    window.addEventListener('gamepaddisconnected', (e) => {
      if ((e as GamepadEvent).gamepad?.index === this.gamepadIndex) this.forgetPad();
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
    if (down) {
      this.lastKey = e.code;
      this.lastDevice = 'keyboard';
    }
    if (down) this.keysHeld.add(e.code);
    else this.keysHeld.delete(e.code);
    const actions = KEYMAP[e.code];
    if (!actions) return;
    // La pausa y el móvil funcionan aunque el juego esté "desactivado" (para poder cerrar menús).
    for (const a of actions) {
      if (!this.enabled && a !== 'pause' && a !== 'phone' && a !== 'map' && !(down === false)) continue;
      if (down && e.repeat) continue;
      // (al soltar la tecla no se suelta lo que el mando sigue pulsando)
      if (!down && this.gpNow.has(a)) continue;
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
   * (se lee al momento; no hay que guardarlo). Con el mando en un vehículo, y = gatillos.
   */
  moveAxis(): { x: number; y: number } {
    let x = (this.down('right') ? 1 : 0) - (this.down('left') ? 1 : 0);
    let y = (this.down('forward') ? 1 : 0) - (this.down('back') ? 1 : 0);
    const gx = this.gamepadMove.x, gy = this.gamepadMove.y, gt = this.gamepadThrottle;
    if (Math.abs(gx) > 0.01 || Math.abs(gy) > 0.01 || Math.abs(gt) > 0.01) {
      x = gx;
      // en vehículo aceleran los gatillos (y, si no los tocas, el stick hacia delante también vale)
      y = Math.abs(gt) > 0.01 ? gt : gy;
    }
    this.axis.x = x;
    this.axis.y = y;
    return this.axis;
  }
  private readonly axis = { x: 0, y: 0 };

  releaseAll() {
    for (const a of [...this.held]) this.set(a, false);
    this.keysHeld.clear();
    this.mouseFire = this.mouseAim = false;
    this.gpNow.clear();
    this.aAction = null;
    this.sprintLatch = false;
  }

  /** El mando conectado (o null). Si no ha llegado el aviso de conexión, lo busca de vez en cuando. */
  private pad(): Gamepad | null {
    const list = navigator.getGamepads?.();
    if (!list) return null;
    if (this.gamepadIndex !== null) {
      const gp = list[this.gamepadIndex];
      if (gp && gp.connected !== false) return gp;
      this.forgetPad();
    }
    // (sin aviso de conexión: se mira una vez por segundo, que getGamepads no es gratis del todo)
    if (--this.padScan > 0) return null;
    this.padScan = 60;
    for (const gp of list) {
      if (gp && gp.connected !== false) {
        this.gamepadIndex = gp.index;
        return gp;
      }
    }
    return null;
  }

  private forgetPad() {
    this.gamepadIndex = null;
    // lo que tuviera pulsado el mando se suelta
    const held = [...this.gpNow];
    this.gpNow.clear();
    for (const a of held) if (!this.otherHolds(a)) this.set(a, false);
    this.gamepadMove.x = this.gamepadMove.y = this.gamepadThrottle = 0;
    this.aAction = null;
    this.sprintLatch = false;
    if (this.lastDevice === 'gamepad') this.lastDevice = 'keyboard';
  }

  /** ¿Lo tiene pulsado el teclado o el ratón? (para no soltarlo al soltar el botón del mando) */
  private otherHolds(a: Action): boolean {
    if (a === 'fire' && this.mouseFire) return true;
    if (a === 'aim' && this.mouseAim) return true;
    for (const k of this.keysHeld) if (KEYMAP[k]?.includes(a)) return true;
    return false;
  }

  /** Lee el mando (se llama una vez por frame antes de la lógica). */
  pollGamepad(dt: number) {
    const gp = this.pad();
    if (!gp) return;
    const b = gp.buttons;
    const inCar = this.vehicleContext();
    const now = this.gpScratch;
    now.clear();

    // botones pulsados (máscara) para ver qué se acaba de pulsar
    let mask = 0;
    for (let i = 0; i < 16; i++) if (b[i]?.pressed) mask |= 1 << i;
    const lt = b[BTN.LT]?.value ?? (b[BTN.LT]?.pressed ? 1 : 0);
    const rt = b[BTN.RT]?.value ?? (b[BTN.RT]?.pressed ? 1 : 0);
    const edge = mask & ~this.gpButtonsPrev;
    this.gpButtonsPrev = mask;
    this.padEdge = edge;

    // sticks
    const lm = stick(gp.axes[0] ?? 0, gp.axes[1] ?? 0, this.gamepadMove);
    this.gamepadMove.y = -this.gamepadMove.y;
    const rm = stick(gp.axes[2] ?? 0, gp.axes[3] ?? 0, this.lookOut);
    if (mask || lm > 0 || rm > 0 || lt > TRIGGER_ON || rt > TRIGGER_ON) {
      this.lastDevice = 'gamepad';
      this.gamepadSeen = true;
    }

    // cámara (stick derecho): curva suave para afinar y acelerón al mantenerlo a tope
    if (this.enabled && rm > 0) {
      this.lookHold = rm > 0.92 ? this.lookHold + dt : 0;
      const accel = 1 + Math.min(0.7, Math.max(0, this.lookHold - 0.2) * 1.4);
      const k = (rm * rm * 1150 * accel * this.lookScale * dt) / rm;
      this.lookDX += this.lookOut.x * k;
      this.lookDY += this.lookOut.y * k * 0.75;
    } else this.lookHold = 0;

    if (inCar) {
      // gatillos: acelerar y frenar (analógicos)
      const r = rt > 0.06 ? rt : 0, l = lt > 0.06 ? lt : 0;
      this.gamepadThrottle = r - l;
      this.aAction = null;
      this.sprintLatch = false;
      for (let i = 0; i < PAD_CAR.length; i++) {
        const a = PAD_CAR[i];
        if (a && mask & (1 << i)) now.add(a);
      }
      // cruceta abajo: siguiente arma de ventanilla
      if (edge & (1 << BTN.DOWN)) this.wheel += 1;
    } else {
      this.gamepadThrottle = 0;
      for (let i = 0; i < PAD_FOOT.length; i++) {
        const a = PAD_FOOT[i];
        if (a && mask & (1 << i)) now.add(a);
      }
      if (lt > TRIGGER_ON) now.add('aim');
      if (rt > TRIGGER_ON) now.add('fire');
      // Ⓐ: interactuar si hay algo delante («Ⓐ Entregar»); si no, saltar
      if (edge & (1 << BTN.A)) this.aAction = this.interactContext() ? 'interact' : 'jump';
      if (!(mask & (1 << BTN.A))) this.aAction = null;
      if (this.aAction) now.add(this.aAction);
      // correr: L3 lo deja puesto mientras muevas el stick
      if (edge & (1 << BTN.L3)) this.sprintLatch = !this.sprintLatch;
      if (lm < 0.25) this.sprintLatch = false;
      if (this.sprintLatch) now.add('sprint');
      // cambiar de arma: LB/RB y la cruceta a los lados
      if (edge & ((1 << BTN.RB) | (1 << BTN.RIGHT))) this.wheel += 1;
      if (edge & ((1 << BTN.LB) | (1 << BTN.LEFT))) this.wheel -= 1;
    }

    // lo que se pulsa y se suelta este frame (sin pisar lo que tenga pulsado el teclado)
    const before = this.gpNow;
    this.gpNow = now;
    this.gpScratch = before;
    for (const a of now) if (!before.has(a)) this.set(a, true);
    for (const a of before) if (!now.has(a) && !this.otherHolds(a)) this.set(a, false);
  }

  /**
   * Vibración del mando (si se está usando y el navegador sabe). strong/weak: 0..1 (motor grave y
   * agudo), ms: duración. Un efecto flojo no corta uno más fuerte que aún está sonando.
   */
  rumble(strong: number, weak: number, ms: number) {
    if (!this.vibration || this.lastDevice !== 'gamepad' || this.gamepadIndex === null) return;
    const gp = navigator.getGamepads?.()[this.gamepadIndex];
    const act = (gp as any)?.vibrationActuator;
    if (!act || typeof act.playEffect !== 'function') return;
    const t = performance.now();
    const level = strong + weak;
    if (t < this.rumbleUntil && level <= this.rumbleLevel) return;
    this.rumbleUntil = t + ms;
    this.rumbleLevel = level;
    try {
      const p = act.playEffect('dual-rumble', {
        startDelay: 0,
        duration: Math.round(Math.min(2000, ms)),
        strongMagnitude: Math.max(0, Math.min(1, strong)),
        weakMagnitude: Math.max(0, Math.min(1, weak)),
      });
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      /* mandos sin vibración */
    }
  }

  /**
   * Cómo se enseña una tecla de las pistas con el mando (ver PISTA_MANDO en combatHud.ts). Devuelve
   * null si esa tecla no tiene equivalente directo.
   */
  padLabel(key: string, inCar = this.vehicleContext()): string | null {
    switch (key) {
      case 'E': return inCar ? PAD_GLYPH.LEFT + PAD_GLYPH.RIGHT : PAD_GLYPH.A;
      case 'F': return PAD_GLYPH.Y;
      case 'Q': return inCar ? PAD_GLYPH.LEFT : PAD_GLYPH.B;
      case 'R': return PAD_GLYPH.X;
      case 'H': return inCar ? PAD_GLYPH.B : null;
      case 'Espacio': return inCar ? PAD_GLYPH.A : PAD_GLYPH.A;
      case 'Shift': return inCar ? PAD_GLYPH.X : PAD_GLYPH.L3;
      case 'Tab': return PAD_GLYPH.UP;
      case 'M': return PAD_GLYPH.BACK;
      case 'Esc': return PAD_GLYPH.START;
      case 'Clic': return inCar ? PAD_GLYPH.RB : PAD_GLYPH.RT;
      case 'Clic derecho': return inCar ? PAD_GLYPH.LB : PAD_GLYPH.LT;
      case 'WASD': return PAD_GLYPH.LS;
      case 'E o WASD': return `${PAD_GLYPH.A} o ${PAD_GLYPH.LS}`;
      case 'Q/E': return PAD_GLYPH.LEFT + PAD_GLYPH.RIGHT;
      default: return null;
    }
  }

  endFrame() {
    this.padEdge = 0;
    this.justDown.clear();
    this.justUp.clear();
    this.lookDX = 0;
    this.lookDY = 0;
    this.wheel = 0;
  }
}
