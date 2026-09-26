// Piezas compartidas del casino: cartera (dinero del jugador), fichas, frases del crupier,
// esperas con modo turbo (pruebas) y el confeti.
import type { Game } from '../../core/game';
import type { Economy } from '../economy';
import { fmt } from '../economy';

export { fmt };

export type Juego = 'slots' | 'roulette' | 'blackjack';

/** Valores de las fichas. */
export const FICHAS = [10, 50, 100, 500] as const;
export const COLOR_FICHA: Record<number, string> = { 10: '#2ec4b6', 50: '#ff7b54', 100: '#6c3bd1', 500: '#ff4f81' };

/** Ajustes globales del casino (el modo turbo lo usan las pruebas automáticas). */
export const ajustes = { turbo: false };

/** Espera `ms` milisegundos (o nada en modo turbo). */
export function esperar(ms: number): Promise<void> {
  if (ajustes.turbo || ms <= 0) return Promise.resolve();
  return new Promise((r) => setTimeout(r, ms));
}

export function rnd(n: number): number {
  return Math.floor(Math.random() * n);
}

export function elegir<T>(arr: readonly T[]): T {
  return arr[rnd(arr.length)];
}

/** Crea un elemento con clase y contenido opcional. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

/** Botón que no se queda con el foco (así Espacio/Enter no lo vuelven a pulsar). */
export function boton(texto: string, cls: string, fn: () => void): HTMLButtonElement {
  const b = el('button', 'cc-boton ' + cls, texto);
  b.tabIndex = -1;
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    fn();
  });
  return b;
}

// ─────────────────────────────── Cartera ───────────────────────────────

/**
 * El dinero del jugador (game.mod.economy). Se apuesta con spend() (efectivo y luego banco)
 * y se cobra con addCash(). Nunca deja apostar más de lo que hay.
 */
export class Cartera {
  /** Balance de la visita al casino (cobrado − apostado). */
  neto = 0;
  apostado = 0;
  cobrado = 0;
  constructor(private game: Game) {}

  get eco(): Economy | undefined {
    return this.game.mod.economy as Economy | undefined;
  }
  get efectivo(): number {
    return this.eco?.cash ?? 0;
  }
  get banco(): number {
    return this.eco?.bank ?? 0;
  }
  disponible(): number {
    const e = this.eco;
    if (!e) return 0;
    const v = e.cash + e.bank;
    return Number.isFinite(v) ? Math.max(0, v) : 0;
  }
  puede(n: number): boolean {
    return n > 0 && this.disponible() + 1e-6 >= n;
  }
  /** Cobra la apuesta al jugador. false si no le llega (y no toca nada). */
  apostar(n: number): boolean {
    n = Math.round(n);
    const e = this.eco;
    if (!e || !(n > 0) || !this.puede(n)) return false;
    const ok = e.spend(n, 'casino');
    if (ok) {
      this.neto -= n;
      this.apostado += n;
    }
    return ok;
  }
  /** Paga un premio en efectivo. */
  cobrar(n: number) {
    n = Math.round(n * 100) / 100;
    const e = this.eco;
    if (!e || !(n > 0)) return;
    e.addCash(n, 'casino');
    this.neto += n;
    this.cobrado += n;
  }
  /** Si la ganancia neta de una jugada es gorda (≥ 1.000 €), sube la fama. */
  fama(netoJugada: number): boolean {
    if (netoJugada >= 1000 && this.eco) {
      this.eco.addFame(10, 'casino');
      return true;
    }
    return false;
  }
}

// ─────────────────────────────── Fichas ───────────────────────────────

export function textoFicha(v: number): string {
  return v >= 1000 ? (v / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + 'k' : String(v);
}

/** Ficha vista desde arriba para el tapete (con la cantidad dentro y montoncito si son varias). */
export function crearFichaMesa(cant: number): HTMLDivElement {
  const fichas = descomponer(cant, 6);
  const f = el('div', 'cc-fmesa' + (fichas.length >= 3 ? ' tres' : fichas.length === 2 ? ' dos' : ''));
  f.style.setProperty('--c', COLOR_FICHA[fichas[0]] ?? '#ffd23f');
  f.textContent = textoFicha(cant);
  return f;
}

/** Ficha de casino grande (selector). */
export function crearFicha(valor: number, tecla?: string): HTMLDivElement {
  const f = el('div', 'cc-ficha');
  f.style.setProperty('--c', COLOR_FICHA[valor] ?? '#ffd23f');
  f.innerHTML = `<span>${textoFicha(valor)}</span>${tecla ? `<kbd>${tecla}</kbd>` : ''}`;
  f.dataset.valor = String(valor);
  return f;
}

/** Descompone una cantidad en fichas (de mayor a menor). */
export function descomponer(cant: number, max = 14): number[] {
  const out: number[] = [];
  let r = Math.round(cant);
  for (const v of [500, 100, 50, 10]) {
    while (r >= v && out.length < max) {
      out.push(v);
      r -= v;
    }
  }
  return out;
}

/** Montoncito de fichas apiladas con el total. */
export function crearMonton(cant: number, pequeno = false): HTMLDivElement {
  const m = el('div', 'cc-monton' + (pequeno ? ' peq' : ''));
  const fichas = descomponer(cant, pequeno ? 6 : 12).reverse();
  fichas.forEach((v, i) => {
    const f = el('i');
    f.style.setProperty('--c', COLOR_FICHA[v]);
    f.style.bottom = i * (pequeno ? 3 : 5) + 'px';
    m.appendChild(f);
  });
  const b = el('b');
  b.textContent = fmt(cant);
  m.appendChild(b);
  return m;
}

// ─────────────────────────────── Crupier ───────────────────────────────

export type Humor = 'neutro' | 'gana' | 'pierde' | 'jackpot' | 'aviso';

export const FRASES = {
  gana: [
    'La casa siempre gana. Hoy no, pero en general sí.',
    '¡Olé tú! Que no se entere Hacienda.',
    'Esto no lo cobras ni contra reembolso.',
    'Me vas a dejar sin propina, criatura.',
    '¡Qué suerte más loca! Por algo se llama así el casino.',
    'Cuidado, que así empezó mi cuñado.',
    'Enhorabuena. El jefe me lo va a descontar del sueldo.',
    '¡Premio! Invita a una ronda, que hay confianza.',
    'Tienes más suerte que un paquete que llega a su hora.',
    'Bien jugado. O bien suertudo. Da igual, cobra.',
  ],
  pierde: [
    'La casa siempre gana. Es lo único que funciona en esta isla.',
    'Tranquilo, el dinero va y viene. Sobre todo va.',
    'Muchas gracias por su donación al casino.',
    'Casi. Bueno, casi no. Nada.',
    'Mañana será otro día. Y otra apuesta.',
    'No es mala suerte, es estadística con mala leche.',
    'Si te sirve de consuelo, a mí me pagan igual.',
    'Eso cuéntaselo a tu gestor y lloráis juntos.',
    'Uy. Eso ha sonado a alquiler.',
    'Tu dinero está en buenas manos: las mías.',
  ],
  empate: [
    'Ni pa ti ni pa mí. Como en las bodas.',
    'Empate. Te devuelvo lo tuyo y aquí no ha pasado nada.',
    'Tablas. Qué emoción tan contenida.',
  ],
  jackpot: [
    '¡¡JACKPOT!! Que alguien llame a mi madre, esto no lo había visto nunca.',
    '¡¡PREMIO GORDO!! Me voy a tener que sentar.',
  ],
  pobre: [
    'Sin blanca no se juega, cariño. Vuelve cuando repartas algo.',
    'Aquí se fía lo mismo que en el mercado: nada.',
    'Con eso no te llega ni para una ficha. Ánimo, repartidor.',
  ],
  fama: ['¡Ya te conocen en todo el casino! (+10 de FAMA)'],
};

let ultimaFrase = '';
export function frase(tipo: keyof typeof FRASES): string {
  const lista = FRASES[tipo];
  let f = elegir(lista);
  if (f === ultimaFrase && lista.length > 1) f = lista[(lista.indexOf(f) + 1) % lista.length];
  ultimaFrase = f;
  return f;
}

/** El crupier Fortunato: cara + bocadillo. */
export class Crupier {
  readonly el: HTMLDivElement;
  private bocadillo: HTMLDivElement;
  private texto: HTMLSpanElement;
  constructor(saludo: string, lado: 'derecha' | 'izquierda' = 'derecha') {
    this.el = el('div', 'cc-crupier ' + lado);
    this.el.innerHTML = `<div class="cc-cara"><span>🤵</span></div>`;
    this.bocadillo = el('div', 'cc-bocadillo');
    this.bocadillo.innerHTML = `<b class="nombre">Fortunato, el crupier</b>`;
    this.texto = el('span');
    this.bocadillo.appendChild(this.texto);
    this.el.appendChild(this.bocadillo);
    this.decir(saludo);
  }
  decir(t: string, humor: Humor = 'neutro') {
    this.texto.textContent = t;
    this.bocadillo.className = 'cc-bocadillo ' + humor;
    // reinicia la animación de "pop"
    void this.bocadillo.offsetWidth;
    this.bocadillo.classList.add('pop');
  }
}

// ─────────────────────────────── Confeti ───────────────────────────────

const COLORES_CONFETI = ['#ffd23f', '#ff4f81', '#2ec4b6', '#6c3bd1', '#ff7b54', '#ffffff', '#7dff9a'];

/** Confeti en un canvas a pantalla completa, con partículas reutilizadas. */
export class Confeti {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private n = 0;
  private readonly MAX = 260;
  private px = new Float32Array(this.MAX);
  private py = new Float32Array(this.MAX);
  private vx = new Float32Array(this.MAX);
  private vy = new Float32Array(this.MAX);
  private rot = new Float32Array(this.MAX);
  private vr = new Float32Array(this.MAX);
  private vida = new Float32Array(this.MAX);
  private tam = new Float32Array(this.MAX);
  private col = new Uint8Array(this.MAX);
  private activo = false;
  private w = 0;
  private h = 0;

  constructor() {
    this.canvas = el('canvas', 'cc-confeti');
    this.ctx = this.canvas.getContext('2d');
  }

  private ajustar() {
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const w = window.innerWidth, h = window.innerHeight;
    if (w !== this.w || h !== this.h) {
      this.w = w;
      this.h = h;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  /** Lanza `cuantos` papelitos desde la parte de arriba (o desde un punto). */
  lanzar(cuantos: number, x?: number, y?: number) {
    this.ajustar();
    for (let k = 0; k < cuantos; k++) {
      let i = this.n;
      if (i >= this.MAX) i = rnd(this.MAX); // reutiliza uno al azar
      else this.n++;
      const desdePunto = x !== undefined && y !== undefined;
      this.px[i] = desdePunto ? x! : Math.random() * this.w;
      this.py[i] = desdePunto ? y! : -20 - Math.random() * 120;
      const ang = Math.random() * Math.PI * 2;
      const vel = desdePunto ? 250 + Math.random() * 550 : 0;
      this.vx[i] = desdePunto ? Math.cos(ang) * vel : (Math.random() - 0.5) * 160;
      this.vy[i] = desdePunto ? Math.sin(ang) * vel - 350 : 60 + Math.random() * 200;
      this.rot[i] = Math.random() * 6.28;
      this.vr[i] = (Math.random() - 0.5) * 14;
      this.vida[i] = 2.6 + Math.random() * 1.6;
      this.tam[i] = 6 + Math.random() * 8;
      this.col[i] = rnd(COLORES_CONFETI.length);
    }
    this.activo = true;
  }

  tick(dt: number) {
    if (!this.activo || !this.ctx) return;
    const c = this.ctx;
    c.clearRect(0, 0, this.w, this.h);
    let vivos = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.vida[i] <= 0) continue;
      this.vida[i] -= dt;
      this.vy[i] += 520 * dt;
      this.vx[i] *= 1 - 1.4 * dt;
      this.vy[i] = Math.min(this.vy[i], 240 + (i % 5) * 20);
      this.px[i] += (this.vx[i] + Math.sin(this.rot[i] * 0.7) * 40) * dt;
      this.py[i] += this.vy[i] * dt;
      this.rot[i] += this.vr[i] * dt;
      if (this.py[i] > this.h + 30) this.vida[i] = 0;
      if (this.vida[i] <= 0) continue;
      vivos++;
      const s = this.tam[i];
      const sx = Math.cos(this.rot[i]);
      c.globalAlpha = Math.min(1, this.vida[i] * 2);
      c.fillStyle = COLORES_CONFETI[this.col[i]];
      c.save();
      c.translate(this.px[i], this.py[i]);
      c.rotate(this.rot[i] * 0.5);
      c.fillRect((-s / 2) * sx, -s * 0.3, s * sx, s * 0.6);
      c.restore();
    }
    c.globalAlpha = 1;
    if (!vivos) {
      this.activo = false;
      this.n = 0;
      c.clearRect(0, 0, this.w, this.h);
    }
  }

  parar() {
    this.activo = false;
    this.n = 0;
    this.ctx?.clearRect(0, 0, this.w, this.h);
  }
}
