// Casino «La Suerte Loca»: vestíbulo y tres juegos (tragaperras, ruleta y blackjack)
// a pantalla completa. Mientras está abierto el juego queda en pausa y el casino se come
// todas las teclas. Uso:
//   openCasino(game, onClose?)                    → vestíbulo
//   openCasinoGame(game, 'slots' | 'roulette' | 'blackjack', onClose?)
//   closeCasino(game)                             → cierre forzado (paga la jugada en curso)
import type { Game } from '../../core/game';
import { ponerEstilos } from './estilo';
import { ajustes, Cartera, Confeti, el, fmt, type Humor, type Juego } from './comun';
import { SonidoCasino } from './sonido';
import type { CtxCasino, PantallaCasino } from './tipos';
import { Vestibulo } from './vestibulo';
import { Tragaperras } from './tragaperras';
import { Ruleta } from './ruleta';
import { Blackjack } from './blackjack';

export type { Juego };
export { ajustes as ajustesCasino };

const ANCHO = 1200, ALTO = 640;

interface Previo {
  paused: boolean;
  menuOpen: boolean;
  input: boolean;
  hud: boolean;
  renderPropio: boolean;
  render: () => void;
}

export class Casino {
  readonly cartera: Cartera;
  readonly sonido: SonidoCasino;
  pantalla: PantallaCasino | null = null;
  actual: 'vestibulo' | Juego = 'vestibulo';
  private root: HTMLDivElement | null = null;
  private main!: HTMLDivElement;
  private escena!: HTMLDivElement;
  private seccion!: HTMLDivElement;
  private pEfectivo!: HTMLDivElement;
  private pBanco!: HTMLDivElement;
  private pSesion!: HTMLDivElement;
  private teclasEl!: HTMLDivElement;
  private botVolver!: HTMLButtonElement;
  private botSalir!: HTMLButtonElement;
  private botMusica!: HTMLButtonElement;
  private confeti = new Confeti();
  private onClose?: () => void;
  private previo: Previo | null = null;
  private raf = 0;
  private ultimoT = 0;
  private escalaActual = 1;
  private timerFiesta = 0;
  private timerSusto = 0;
  private quitarMoney: (() => void) | null = null;
  private dineroPintado = '';
  private readonly ctx: CtxCasino;
  private readonly sinRender = () => {};

  constructor(readonly game: Game) {
    this.cartera = new Cartera(game);
    this.sonido = new SonidoCasino(game);
    this.ctx = {
      game,
      cartera: this.cartera,
      sonido: this.sonido,
      decir: (t, h) => this.decir(t, h),
      confeti: (n, x, y) => this.lanzarConfeti(n, x, y),
      fiesta: (ms) => this.fiesta(ms),
      susto: () => this.susto(),
      refrescar: () => this.refrescar(),
      teclas: (html) => {
        if (this.teclasEl) this.teclasEl.innerHTML = html;
      },
      ir: (p) => this.ir(p),
      escala: () => this.escalaActual,
    };
  }

  get abierto(): boolean {
    return !!this.root;
  }

  // ─────────── abrir y cerrar ───────────

  abrir(juego?: Juego, onClose?: () => void) {
    if (onClose) this.onClose = onClose;
    if (this.root) {
      this.ir(juego ?? 'vestibulo');
      return;
    }
    ponerEstilos();
    const g = this.game;
    const ga = g as any;
    this.previo = {
      paused: g.paused,
      menuOpen: !!ga.menuOpen,
      input: g.input.enabled,
      hud: g.hud.visible,
      renderPropio: Object.prototype.hasOwnProperty.call(g, 'render'),
      render: ga.render,
    };
    g.paused = true;
    ga.menuOpen = true;
    g.input.enabled = false;
    g.input.releaseAll();
    g.input.exitPointerLock();
    g.hud.visible = false;
    // el mundo 3D queda tapado: no hace falta pintarlo mientras jugamos (ahorra batería)
    ga.render = this.sinRender;
    this.cartera.neto = 0;
    this.construir();
    window.addEventListener('keydown', this.alPulsar, true);
    window.addEventListener('keyup', this.alSoltar, true);
    window.addEventListener('resize', this.alRedimensionar);
    this.quitarMoney = g.events.on('money', () => this.refrescar());
    this.sonido.despertar();
    this.sonido.play('door');
    this.ultimoT = performance.now();
    this.raf = requestAnimationFrame(this.bucle);
    this.ir(juego ?? 'vestibulo');
  }

  /** Cierra el casino. Si había una jugada en marcha, se resuelve al momento. */
  cerrar() {
    if (!this.root) return;
    const g = this.game;
    const ga = g as any;
    try {
      this.pantalla?.resolverYa();
      this.pantalla?.destruir();
    } catch (e) {
      console.error('[casino]', e);
    }
    this.pantalla = null;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.timerFiesta);
    clearTimeout(this.timerSusto);
    window.removeEventListener('keydown', this.alPulsar, true);
    window.removeEventListener('keyup', this.alSoltar, true);
    window.removeEventListener('resize', this.alRedimensionar);
    this.quitarMoney?.();
    this.quitarMoney = null;
    this.confeti.parar();
    this.sonido.pararMusica();
    this.root.remove();
    this.root = null;
    const p = this.previo;
    this.previo = null;
    if (p) {
      g.paused = p.paused;
      ga.menuOpen = p.menuOpen;
      g.input.enabled = p.input;
      g.hud.visible = p.hud;
      if (ga.render === this.sinRender) {
        if (p.renderPropio) ga.render = p.render;
        else delete ga.render;
      }
    }
    g.input.releaseAll();
    this.sonido.play('door', { volume: 0.7 });
    const cb = this.onClose;
    this.onClose = undefined;
    const neto = this.cartera.neto;
    if (Math.abs(neto) >= 1) {
      g.events.emit('toast', {
        text: neto > 0 ? `Sales del casino con ${fmt(neto)} de más 🎰` : `El casino te ha aligerado ${fmt(-neto)} 🎰`,
        color: neto > 0 ? '#2ec4b6' : '#ff4f81',
        time: 2.5,
      });
    }
    try {
      cb?.();
    } catch (e) {
      console.error('[casino] onClose', e);
    }
  }

  /** Esc o botón: del juego al vestíbulo; del vestíbulo, a la calle. */
  atras() {
    if (!this.root) return;
    if (this.pantalla?.ocupado()) {
      this.decir('¡Quieto parado! Espera a que termine la jugada.', 'aviso');
      this.sonido.play('error');
      return;
    }
    if (this.actual !== 'vestibulo') this.ir('vestibulo');
    else this.cerrar();
  }

  /** Cambia de pantalla. */
  ir(p: 'vestibulo' | Juego) {
    if (!this.root) return;
    if (this.pantalla) {
      if (this.pantalla.ocupado()) this.pantalla.resolverYa();
      this.pantalla.destruir();
      this.pantalla.el.remove();
    }
    this.actual = p;
    const pant: PantallaCasino =
      p === 'slots' ? new Tragaperras(this.ctx) : p === 'roulette' ? new Ruleta(this.ctx) : p === 'blackjack' ? new Blackjack(this.ctx) : new Vestibulo(this.ctx);
    this.pantalla = pant;
    this.escena.innerHTML = '';
    this.escena.appendChild(pant.el);
    this.seccion.textContent = p === 'vestibulo' ? 'Casino · Vestíbulo' : pant.titulo;
    this.botVolver.style.display = p === 'vestibulo' ? 'none' : '';
    this.botSalir.innerHTML = p === 'vestibulo' ? 'Salir a la calle <kbd>Esc</kbd>' : 'Salir ✕';
    this.refrescar();
    this.ajustarEscala();
  }

  // ─────────── construcción ───────────

  private construir() {
    const r = el('div', 'cr-casino' + (ajustes.turbo ? ' cc-turbo' : ''));
    r.addEventListener('mousedown', () => this.sonido.despertar());
    r.addEventListener('contextmenu', (e) => e.preventDefault());
    const barra = el('div', 'cc-barra');
    barra.appendChild(el('div', 'cc-neon', 'La Suerte Loca'));
    this.seccion = el('div', 'cc-seccion');
    barra.appendChild(this.seccion);
    const der = el('div', 'cc-derecha');
    this.pEfectivo = el('div', 'cc-pill');
    this.pBanco = el('div', 'cc-pill');
    this.pSesion = el('div', 'cc-pill sesion');
    der.append(this.pEfectivo, this.pBanco, this.pSesion);
    this.botMusica = el('button', 'cc-mini', '🎵');
    this.botMusica.title = 'Música sí / no';
    this.botVolver = el('button', 'cc-mini', '← Vestíbulo <kbd>Esc</kbd>');
    this.botSalir = el('button', 'cc-mini salir', 'Salir');
    for (const b of [this.botMusica, this.botVolver, this.botSalir]) {
      b.tabIndex = -1;
      b.addEventListener('mousedown', (e) => e.preventDefault());
    }
    this.botMusica.onclick = () => {
      const on = this.sonido.alternarMusica();
      this.botMusica.textContent = on ? '🎵' : '🔇';
    };
    this.botMusica.textContent = this.sonido.musicaActiva ? '🎵' : '🔇';
    this.botVolver.onclick = () => this.atras();
    this.botSalir.onclick = () => {
      if (this.pantalla?.ocupado()) return this.atras();
      this.cerrar();
    };
    der.append(this.botMusica, this.botVolver, this.botSalir);
    barra.appendChild(der);
    r.appendChild(barra);
    r.appendChild(el('div', 'cc-bombillas'));
    this.main = el('div', 'cc-main');
    this.escena = el('div', 'cc-escena');
    this.main.appendChild(this.escena);
    r.appendChild(this.main);
    this.teclasEl = el('div', 'cc-teclas');
    r.appendChild(this.teclasEl);
    r.appendChild(el('div', 'cc-destello'));
    r.appendChild(this.confeti.canvas);
    this.game.ui.appendChild(r);
    this.root = r;
    this.dineroPintado = '';
  }

  // ─────────── servicios para los juegos ───────────

  private decir(t: string, h: Humor = 'neutro') {
    const p = this.pantalla as unknown as { crupier?: { decir(t: string, h?: Humor): void } } | null;
    p?.crupier?.decir(t, h);
  }

  private lanzarConfeti(n: number, x?: number, y?: number) {
    this.confeti.lanzar(n, x, y);
    if (x === undefined) this.confeti.lanzar(Math.round(n / 3), window.innerWidth / 2, window.innerHeight * 0.45);
  }

  private fiesta(ms: number) {
    if (!this.root || ajustes.turbo) return;
    this.root.classList.add('fiesta');
    clearTimeout(this.timerFiesta);
    this.timerFiesta = window.setTimeout(() => this.root?.classList.remove('fiesta'), ms);
  }

  private susto() {
    if (!this.root || ajustes.turbo) return;
    this.root.classList.remove('susto');
    void this.root.offsetWidth;
    this.root.classList.add('susto');
    clearTimeout(this.timerSusto);
    this.timerSusto = window.setTimeout(() => this.root?.classList.remove('susto'), 1400);
  }

  /** Repinta el dinero de la barra de arriba. */
  refrescar() {
    if (!this.root) return;
    const c = this.cartera;
    const clave = `${c.efectivo}|${c.banco}|${c.neto}`;
    if (clave === this.dineroPintado) return;
    const primera = !this.dineroPintado;
    this.dineroPintado = clave;
    this.pEfectivo.innerHTML = `<small>💵 Efectivo</small>${fmt(c.efectivo)}`;
    this.pBanco.innerHTML = `<small>🏦 Banco</small>${fmt(c.banco)}`;
    const n = Math.round(c.neto);
    this.pSesion.innerHTML = `<small>Esta visita</small>${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n))}`;
    this.pSesion.className = 'cc-pill sesion' + (n > 0 ? ' pos' : n < 0 ? ' neg' : '');
    if (!primera && !ajustes.turbo) {
      for (const p of [this.pEfectivo, this.pSesion]) {
        p.classList.remove('cambia');
        void p.offsetWidth;
        p.classList.add('cambia');
      }
    }
  }

  setTurbo(on: boolean) {
    ajustes.turbo = on;
    this.root?.classList.toggle('cc-turbo', on);
  }

  // ─────────── bucle, teclado y tamaño ───────────

  private bucle = (t: number) => {
    if (!this.root) return;
    const dt = Math.min(0.05, Math.max(0, (t - this.ultimoT) / 1000));
    this.ultimoT = t;
    try {
      this.pantalla?.tick(dt);
    } catch (e) {
      console.error('[casino] tick', e);
    }
    this.confeti.tick(dt);
    this.sonido.tick();
    this.raf = requestAnimationFrame(this.bucle);
  };

  private alPulsar = (e: KeyboardEvent) => {
    if (!this.root) return;
    // el juego no ve ninguna tecla mientras estamos en el casino
    e.stopPropagation();
    this.sonido.despertar();
    if (e.metaKey || e.ctrlKey || e.altKey) return; // atajos del navegador
    if (e.code === 'Escape' || (e.code === 'KeyE' && this.actual === 'vestibulo')) {
      // Esc (o E en el vestíbulo, como en las tiendas): atrás / salir
      e.preventDefault();
      if (!e.repeat) this.atras();
      return;
    }
    if (e.code === 'Tab') {
      e.preventDefault();
      return;
    }
    const usada = this.pantalla?.tecla(e) ?? false;
    if (usada) e.preventDefault();
  };

  private alSoltar = (e: KeyboardEvent) => {
    if (this.root) e.stopPropagation();
  };

  private alRedimensionar = () => this.ajustarEscala();

  private ajustarEscala() {
    if (!this.root) return;
    const w = this.main.clientWidth || window.innerWidth;
    const h = this.main.clientHeight || window.innerHeight - 110;
    const s = Math.max(0.3, Math.min(w / ANCHO, h / ALTO, 1.6));
    this.escalaActual = s;
    const x = Math.round((w - ANCHO * s) / 2), y = Math.round((h - ALTO * s) / 2);
    this.escena.style.transform = `translate(${x}px,${y}px) scale(${s})`;
    this.pantalla?.redimensionar?.(s);
  }
}

function casinoDe(game: Game): Casino {
  let c = game.mod.casino as Casino | undefined;
  if (!c) {
    c = new Casino(game);
    game.mod.casino = c;
  }
  return c;
}

/** Abre el casino en el vestíbulo (elegir juego). */
export function openCasino(game: Game, onClose?: () => void): void {
  casinoDe(game).abrir(undefined, onClose);
}

/** Abre directamente un juego del casino (Esc vuelve al vestíbulo). */
export function openCasinoGame(game: Game, which: 'slots' | 'roulette' | 'blackjack', onClose?: () => void): void {
  casinoDe(game).abrir(which, onClose);
}

/** Cierra el casino si está abierto (resuelve y paga la jugada en curso). */
export function closeCasino(game: Game): void {
  (game.mod.casino as Casino | undefined)?.cerrar();
}

export function isCasinoOpen(game: Game): boolean {
  return !!(game.mod.casino as Casino | undefined)?.abierto;
}
