// Ruleta europea (0-36) «La Loca»: rueda dibujada en canvas, bola con física aparente
// (rueda por la pista, cae, rebota en rombos y trastes y se mete en su casilla) y tapete
// para apostar con fichas: pleno 35:1, rojo/negro, par/impar, 1-18/19-36 (1:1),
// docenas y columnas (2:1). Varias apuestas a la vez. Se cobra al girar.
import { ajustes, boton, crearFicha, crearFichaMesa, Crupier, el, elegir, FICHAS, fmt, frase, rnd } from './comun';
import type { CtxCasino, PantallaCasino } from './tipos';

// ─────────────────────────────── Reglas ───────────────────────────────

/** Orden de los números en la rueda europea (sentido horario). */
export const ORDEN = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
export const ROJOS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export type Color = 'rojo' | 'negro' | 'verde';
export function colorDe(n: number): Color {
  return n === 0 ? 'verde' : ROJOS.has(n) ? 'rojo' : 'negro';
}

/** ¿Es una apuesta a un número (pleno)? Ojo: 'negro' también empieza por n. */
export function esPleno(id: string): boolean {
  return /^n\d+$/.test(id);
}

/** ¿Gana la apuesta `id` si sale `n`? Ids: n0..n36, rojo, negro, par, impar, bajo, alto, doc1-3, col1-3. */
export function gana(id: string, n: number): boolean {
  if (esPleno(id)) return Number(id.slice(1)) === n;
  if (n === 0) return false; // el cero se lo lleva todo lo de fuera
  switch (id) {
    case 'rojo': return ROJOS.has(n);
    case 'negro': return !ROJOS.has(n);
    case 'par': return n % 2 === 0;
    case 'impar': return n % 2 === 1;
    case 'bajo': return n <= 18;
    case 'alto': return n >= 19;
    case 'doc1': return n <= 12;
    case 'doc2': return n >= 13 && n <= 24;
    case 'doc3': return n >= 25;
    case 'col1': return n % 3 === 1;
    case 'col2': return n % 3 === 2;
    case 'col3': return n % 3 === 0;
  }
  return false;
}

/** Cuánto paga cada apuesta (x a 1). */
export function pagaA(id: string): number {
  if (esPleno(id)) return 35;
  if (id.startsWith('doc') || id.startsWith('col')) return 2;
  return 1;
}

export function nombreApuesta(id: string): string {
  if (esPleno(id)) return 'pleno al ' + id.slice(1);
  const nombres: Record<string, string> = {
    rojo: 'rojo', negro: 'negro', par: 'par', impar: 'impar', bajo: '1-18', alto: '19-36',
    doc1: '1ª docena', doc2: '2ª docena', doc3: '3ª docena', col1: '1ª columna', col2: '2ª columna', col3: '3ª columna',
  };
  return nombres[id] ?? id;
}

/** Descripción del número: "17 · negro · impar · 1-18". */
export function describir(n: number): string {
  if (n === 0) return 'Cero verde: la banca se lo lleva todo (menos el pleno al 0)';
  return [colorDe(n), n % 2 ? 'impar' : 'par', n <= 18 ? '1-18' : '19-36', `${Math.ceil(n / 12)}ª docena`].join(' · ');
}

/** Lo que devuelve la mesa (apuesta + ganancia) para un conjunto de apuestas. */
export function pagoTotal(apuestas: Map<string, number>, n: number): number {
  let p = 0;
  for (const [id, v] of apuestas) if (gana(id, n)) p += v * (pagaA(id) + 1);
  return p;
}

export const MAX_MESA = 10000;

// ─────────────────────────────── Física de la bola ───────────────────────────────

const TAU = Math.PI * 2;
const SEG = TAU / 37;
const R_PISTA = 0.855;
const R_ROMBOS = 0.815;
const R_TRASTES = 0.585;
const R_BOLA = 0.518;
const W_REPOSO = 0.3; // la rueda siempre gira despacito
const A_RUEDA = 2.1;
const K_RUEDA = 0.35;

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Ángulo de la rueda t segundos después de lanzar (desde phi0). */
function anguloRueda(phi0: number, t: number): number {
  return phi0 + W_REPOSO * t + (A_RUEDA * (1 - Math.exp(-K_RUEDA * t))) / K_RUEDA;
}
function velRueda(t: number): number {
  return W_REPOSO + A_RUEDA * Math.exp(-K_RUEDA * t);
}

export interface Trayectoria {
  dt: number;
  ang: Float32Array;
  rad: Float32Array;
  golpes: { t: number; v: number }[];
  tCaida: number;
  tFijo: number;
  tFin: number;
  /** Ángulo final de la bola respecto a la rueda. */
  relFinal: number;
}

/**
 * Simula la tirada entera y luego la gira para que la bola acabe en `objetivoIdx`
 * (el punto de lanzamiento lo decide el crupier: nadie lo nota).
 */
export function simular(phi0: number, objetivoIdx: number): Trayectoria {
  const dt = 1 / 120;
  const ang: number[] = [];
  const rad: number[] = [];
  const golpes: { t: number; v: number }[] = [];
  let th = 0, w = -(13 + Math.random() * 2.5), r = R_PISTA, vr = 0;
  let fase = 0; // 0 pista, 1 cae, 2 bolsillos, 3 encaja, 4 dentro
  let tCaida = 0, tFijo = 0, relDesde = 0, relHasta = 0, t = 0;
  let pasoRombos = false;
  let traste = 0;
  for (let i = 0; i < 14 * 120; i++) {
    t = i * dt;
    const phi = anguloRueda(phi0, t);
    const wW = velRueda(t);
    if (fase === 0) {
      w -= (0.25 * w + 1.2 * Math.sign(w)) * dt;
      th += w * dt;
      if (Math.abs(w) < 5.5) {
        fase = 1;
        tCaida = t;
        vr = -0.08;
      }
    } else if (fase === 1) {
      vr -= 2.6 * dt;
      r += vr * dt;
      w -= 0.25 * w * dt;
      th += w * dt;
      if (!pasoRombos && r <= R_ROMBOS) {
        pasoRombos = true;
        const a = mod(th, TAU / 8);
        if (Math.min(a, TAU / 8 - a) < 0.14 || Math.random() < 0.4) {
          // choca con un rombo: salta y pierde velocidad
          vr = Math.abs(vr) * 0.5;
          w *= 0.72 + Math.random() * 0.18;
          golpes.push({ t, v: 0.9 });
        }
      }
      if (r <= R_TRASTES) {
        fase = 2;
        traste = Math.floor((th - phi) / SEG + 0.5);
      }
    } else if (fase === 2) {
      let wr = w - wW;
      wr *= Math.exp((vr === 0 ? -3.5 : -1.5) * dt);
      if (vr !== 0 || r > R_BOLA) {
        vr -= 3.2 * dt;
        r += vr * dt;
      }
      if (r <= R_BOLA) {
        r = R_BOLA;
        if (Math.abs(vr) > 0.12) {
          golpes.push({ t, v: Math.min(1, Math.abs(vr)) });
          vr = Math.abs(vr) * 0.5;
          wr = wr * 0.6 + (Math.random() - 0.5) * 2.4;
        } else vr = 0;
      }
      if (r > R_TRASTES + 0.07) {
        r = R_TRASTES + 0.07;
        vr = -Math.abs(vr) * 0.5;
      }
      const k = Math.floor((th - phi) / SEG + 0.5);
      if (k !== traste && r < R_TRASTES) {
        traste = k;
        golpes.push({ t, v: 0.2 + Math.min(0.5, Math.abs(wr) / 8) });
        wr *= 0.85;
      }
      w = wW + wr;
      th += w * dt;
      if ((vr === 0 && Math.abs(wr) < 0.7) || t - tCaida > 4.5) {
        fase = 3;
        tFijo = t;
        relDesde = th - phi;
        relHasta = Math.round(relDesde / SEG) * SEG;
      }
    } else if (fase === 3) {
      const u = Math.min(1, (t - tFijo) / 0.35);
      th = phi + relDesde + (relHasta - relDesde) * (1 - Math.pow(1 - u, 3));
      r += (R_BOLA - r) * Math.min(1, dt * 14);
      if (u >= 1) fase = 4;
    } else {
      th = phi + relHasta;
      r = R_BOLA;
      if (t - tFijo > 1.1) break;
    }
    ang.push(th);
    rad.push(r);
  }
  const libre = mod(Math.round(relHasta / SEG), 37);
  const delta = (objetivoIdx - libre) * SEG;
  const a32 = new Float32Array(ang.length);
  for (let i = 0; i < ang.length; i++) a32[i] = ang[i] + delta;
  return { dt, ang: a32, rad: Float32Array.from(rad), golpes, tCaida, tFijo, tFin: t, relFinal: relHasta + delta };
}

// ─────────────────────────────── Dibujo de la rueda ───────────────────────────────

const COL: Record<Color, string> = { rojo: '#d7263d', negro: '#1b1030', verde: '#0aa36b' };
const COL_OSC: Record<Color, string> = { rojo: '#9e1528', negro: '#0d0718', verde: '#067a50' };

function lienzo(s: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = s;
  return [c, c.getContext('2d')!];
}

function anillo(g: CanvasRenderingContext2D, r0: number, r1: number, a0: number, a1: number) {
  g.beginPath();
  g.arc(0, 0, r1, a0, a1);
  g.arc(0, 0, r0, a1, a0, true);
  g.closePath();
}

/** Cuenco fijo: madera, pista de la bola y rombos. */
function dibujarFondo(S: number): HTMLCanvasElement {
  const [c, g] = lienzo(S);
  const R = S / 2 - 2;
  g.translate(S / 2, S / 2);
  // madera
  let gr = g.createRadialGradient(0, 0, R * 0.9, 0, 0, R);
  gr.addColorStop(0, '#8a4a1c');
  gr.addColorStop(0.5, '#6b3410');
  gr.addColorStop(1, '#3e1c06');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(0, 0, R, 0, TAU);
  g.fill();
  g.lineWidth = R * 0.02;
  g.strokeStyle = '#1b1030';
  g.stroke();
  // vetas
  g.strokeStyle = 'rgba(255,220,160,.12)';
  g.lineWidth = R * 0.006;
  for (let k = 0; k < 5; k++) {
    g.beginPath();
    g.arc(0, 0, R * (0.935 + k * 0.012), k, k + 2.2);
    g.stroke();
  }
  // filete dorado
  g.strokeStyle = '#ffd23f';
  g.lineWidth = R * 0.012;
  g.beginPath();
  g.arc(0, 0, R * 0.925, 0, TAU);
  g.stroke();
  // pista de la bola
  gr = g.createRadialGradient(0, 0, R * 0.76, 0, 0, R * 0.92);
  gr.addColorStop(0, '#b8925a');
  gr.addColorStop(0.35, '#f3dcae');
  gr.addColorStop(0.8, '#fff1d0');
  gr.addColorStop(1, '#d9b77e');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(0, 0, R * 0.918, 0, TAU);
  g.arc(0, 0, R * 0.765, 0, TAU, true);
  g.fill();
  // hueco oscuro bajo la rueda
  g.fillStyle = '#2b1606';
  g.beginPath();
  g.arc(0, 0, R * 0.768, 0, TAU);
  g.fill();
  // rombos (deflectores)
  for (let k = 0; k < 8; k++) {
    const a = (k * TAU) / 8;
    g.save();
    g.rotate(a);
    g.translate(R * 0.815, 0);
    const h = k % 2 ? R * 0.045 : R * 0.03;
    g.beginPath();
    g.moveTo(0, -h);
    g.lineTo(R * 0.018, 0);
    g.lineTo(0, h);
    g.lineTo(-R * 0.018, 0);
    g.closePath();
    const gg = g.createLinearGradient(-R * 0.02, 0, R * 0.02, 0);
    gg.addColorStop(0, '#fff3b0');
    gg.addColorStop(1, '#c9981a');
    g.fillStyle = gg;
    g.fill();
    g.lineWidth = R * 0.006;
    g.strokeStyle = '#1b1030';
    g.stroke();
    g.restore();
  }
  return c;
}

/** Parte que gira: números, casillas, trastes y el cono con la cruz. */
function dibujarRueda(S: number): HTMLCanvasElement {
  const [c, g] = lienzo(S);
  const R = S / 2 - 2;
  g.translate(S / 2, S / 2);
  // aro dorado exterior
  g.fillStyle = '#c9981a';
  g.beginPath();
  g.arc(0, 0, R * 0.755, 0, TAU);
  g.fill();
  for (let i = 0; i < 37; i++) {
    const n = ORDEN[i];
    const col = colorDe(n);
    const a0 = (i - 0.5) * SEG, a1 = (i + 0.5) * SEG;
    // anillo de números
    anillo(g, R * 0.605, R * 0.738, a0, a1);
    g.fillStyle = COL[col];
    g.fill();
    // casilla (más oscura, con sombra hacia dentro)
    anillo(g, R * 0.45, R * 0.588, a0, a1);
    const gr = g.createRadialGradient(0, 0, R * 0.45, 0, 0, R * 0.588);
    gr.addColorStop(0, COL_OSC[col]);
    gr.addColorStop(0.7, COL[col]);
    gr.addColorStop(1, COL_OSC[col]);
    g.fillStyle = gr;
    g.fill();
    // número
    g.save();
    g.rotate(i * SEG);
    g.translate(R * 0.672, 0);
    g.rotate(Math.PI / 2);
    g.fillStyle = '#fff';
    g.font = `900 ${Math.round(R * 0.068)}px system-ui, -apple-system, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(n), 0, 0);
    g.restore();
  }
  // separadores y trastes dorados
  g.strokeStyle = '#ffd23f';
  for (let i = 0; i < 37; i++) {
    const a = (i + 0.5) * SEG;
    const ca = Math.cos(a), sa = Math.sin(a);
    g.lineWidth = R * 0.008;
    g.beginPath();
    g.moveTo(ca * R * 0.605, sa * R * 0.605);
    g.lineTo(ca * R * 0.738, sa * R * 0.738);
    g.stroke();
    g.lineWidth = R * 0.016;
    g.beginPath();
    g.moveTo(ca * R * 0.45, sa * R * 0.45);
    g.lineTo(ca * R * 0.6, sa * R * 0.6);
    g.stroke();
  }
  // aros
  g.lineWidth = R * 0.016;
  for (const rr of [0.598, 0.745]) {
    g.beginPath();
    g.arc(0, 0, R * rr, 0, TAU);
    g.stroke();
  }
  // cono central
  const gc = g.createRadialGradient(-R * 0.1, -R * 0.12, R * 0.02, 0, 0, R * 0.45);
  gc.addColorStop(0, '#ffe9a8');
  gc.addColorStop(0.35, '#d9a441');
  gc.addColorStop(0.8, '#8a4a1c');
  gc.addColorStop(1, '#5a2a0a');
  g.fillStyle = gc;
  g.beginPath();
  g.arc(0, 0, R * 0.448, 0, TAU);
  g.fill();
  g.strokeStyle = '#ffd23f';
  g.lineWidth = R * 0.012;
  g.stroke();
  // radios decorativos
  g.strokeStyle = 'rgba(255,233,168,.55)';
  g.lineWidth = R * 0.01;
  for (let k = 0; k < 8; k++) {
    const a = (k * TAU) / 8 + 0.2;
    g.beginPath();
    g.moveTo(Math.cos(a) * R * 0.14, Math.sin(a) * R * 0.14);
    g.lineTo(Math.cos(a) * R * 0.43, Math.sin(a) * R * 0.43);
    g.stroke();
  }
  // cruz (torreta)
  for (let k = 0; k < 4; k++) {
    g.save();
    g.rotate((k * TAU) / 4);
    const gb = g.createLinearGradient(0, -R * 0.03, 0, R * 0.03);
    gb.addColorStop(0, '#ffffff');
    gb.addColorStop(0.5, '#c8ccd4');
    gb.addColorStop(1, '#7c828e');
    g.fillStyle = gb;
    g.strokeStyle = '#1b1030';
    g.lineWidth = R * 0.008;
    g.beginPath();
    g.roundRect(0, -R * 0.022, R * 0.3, R * 0.044, R * 0.02);
    g.fill();
    g.stroke();
    g.beginPath();
    g.arc(R * 0.3, 0, R * 0.04, 0, TAU);
    g.fill();
    g.stroke();
    g.restore();
  }
  const gt = g.createRadialGradient(-R * 0.03, -R * 0.03, 0, 0, 0, R * 0.09);
  gt.addColorStop(0, '#ffffff');
  gt.addColorStop(0.5, '#ffd23f');
  gt.addColorStop(1, '#a87a10');
  g.fillStyle = gt;
  g.beginPath();
  g.arc(0, 0, R * 0.09, 0, TAU);
  g.fill();
  g.strokeStyle = '#1b1030';
  g.lineWidth = R * 0.01;
  g.stroke();
  return c;
}

/** La bola (con su brillo), dibujada una vez: radio br píxeles. */
function dibujarBola(br: number): HTMLCanvasElement {
  const t = Math.ceil(br * 2 + 4);
  const [c, g] = lienzo(t);
  const m = t / 2;
  const gb = g.createRadialGradient(m - br * 0.35, m - br * 0.4, br * 0.1, m, m, br);
  gb.addColorStop(0, '#ffffff');
  gb.addColorStop(0.6, '#e8e8ee');
  gb.addColorStop(1, '#9a9aa8');
  g.fillStyle = gb;
  g.beginPath();
  g.arc(m, m, br, 0, TAU);
  g.fill();
  return c;
}

/** Brillo de cristal por encima de todo. */
function dibujarBrillo(S: number): HTMLCanvasElement {
  const [c, g] = lienzo(S);
  const R = S / 2 - 2;
  g.translate(S / 2, S / 2);
  const gr = g.createLinearGradient(-R, -R, R * 0.4, R * 0.4);
  gr.addColorStop(0, 'rgba(255,255,255,.22)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(0, 0, R * 0.92, 0, TAU);
  g.fill();
  return c;
}

// ─────────────────────────────── Tapete ───────────────────────────────

const W = 48, H = 66, X0 = 52;

/** Rejilla para moverse con las flechas: filas 0-4, columnas 0-13. */
function idEnRejilla(f: number, c: number): string {
  if (f <= 2) {
    if (c === 0) return 'n0';
    if (c === 13) return 'col' + (3 - f);
    return 'n' + (3 * (c - 1) + (3 - f));
  }
  if (f === 3) return c <= 4 ? 'doc1' : c <= 8 ? 'doc2' : 'doc3';
  const fuera = ['bajo', 'bajo', 'bajo', 'par', 'par', 'rojo', 'rojo', 'negro', 'negro', 'impar', 'impar', 'alto', 'alto', 'alto'];
  return fuera[c];
}

export interface JugadaRuleta {
  numero: number;
  apostado: number;
  pagado: number;
  neto: number;
  apuestas: [string, number][];
}

export class Ruleta implements PantallaCasino {
  readonly el: HTMLDivElement;
  readonly titulo = '🎡 Ruleta europea «La Loca»';
  private crupier: Crupier;
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private fondo: HTMLCanvasElement | null = null;
  private rueda: HTMLCanvasElement | null = null;
  private brillo: HTMLCanvasElement | null = null;
  private bola: HTMLCanvasElement | null = null;
  private tamLienzo = 0;
  // rueda y bola
  private phi0 = Math.random() * TAU;
  private ts = 0;
  private tray: Trayectoria | null = null;
  private relBola = rnd(37) * SEG;
  // apuestas
  ficha = 10;
  readonly apuestas = new Map<string, number>();
  private pila: { id: string; v: number }[] = [];
  private ultimas: [string, number][] = [];
  estado: 'apostando' | 'girando' | 'resultado' = 'apostando';
  private numero = -1;
  private historial: number[] = [];
  private resolver: ((j: JugadaRuleta) => void) | null = null;
  private pendiente: JugadaRuleta | null = null;
  private mostrado = false;
  // interfaz
  private casillas = new Map<string, HTMLDivElement>();
  private montones = new Map<string, HTMLDivElement>();
  private cursor = { f: 4, c: 5 };
  private fichasEl: HTMLDivElement[] = [];
  private totalEl!: HTMLElement;
  private numEl!: HTMLDivElement;
  private txtEl!: HTMLDivElement;
  private histEl!: HTMLDivElement;
  private botGirar!: HTMLButtonElement;
  private dolly: HTMLDivElement | null = null;

  constructor(private ctx: CtxCasino) {
    this.el = el('div', 'cc-ru');
    this.crupier = new Crupier('Hagan juego, señores. Pon fichas en el tapete y dale a GIRAR.');
    const cru = el('div', 'cc-ru-crupier');
    cru.appendChild(this.crupier.el);
    this.el.appendChild(cru);
    // resultado
    const res = el('div', 'cc-ru-resultado');
    this.numEl = el('div', 'cc-ru-num', '?');
    this.txtEl = el('div', 'cc-ru-txt', 'Aún no ha salido nada<small>La bola está calentando</small>');
    res.append(this.numEl, this.txtEl);
    this.el.appendChild(res);
    // rueda
    const cajaRueda = el('div', 'cc-ru-rueda');
    cajaRueda.innerHTML = '<div class="sombra"></div>';
    this.canvas = el('canvas');
    this.g = this.canvas.getContext('2d')!;
    cajaRueda.appendChild(this.canvas);
    this.el.appendChild(cajaRueda);
    // historial
    const hist = el('div', 'cc-ru-historial', '<h4>Últimos números</h4>');
    this.histEl = el('div');
    hist.appendChild(this.histEl);
    this.el.appendChild(hist);
    this.montarTapete();
    this.montarMandos();
    this.elegirFicha(10, false);
    this.moverCursor(0, 0);
    this.ctx.teclas('<span><kbd>←↑→↓</kbd>Mover</span><span><kbd>Enter</kbd>Poner ficha</span><span><kbd>1</kbd>–<kbd>4</kbd>Ficha</span><span><kbd>Espacio</kbd>Girar</span><span><kbd>⌫</kbd>Deshacer</span><span><kbd>X</kbd>Borrar</span><span><kbd>Clic dcho.</kbd>Quitar</span><span><kbd>R</kbd>Repetir</span><span><kbd>Esc</kbd>Vestíbulo</span>');
    this.redimensionar(this.ctx.escala());
  }

  // ─────────── construcción ───────────

  private montarTapete() {
    const tap = el('div', 'cc-tapete');
    const zona = el('div', 'zona');
    const casilla = (id: string, x: number, y: number, w: number, h: number, cls: string, html: string) => {
      const d = el('div', 'cc-casilla ' + cls, html);
      d.style.left = x + 'px';
      d.style.top = y + 'px';
      d.style.width = w + 'px';
      d.style.height = h + 'px';
      d.dataset.id = id;
      d.title = `${nombreApuesta(id)} · paga ${pagaA(id)} a 1`;
      d.addEventListener('mousedown', (e) => e.preventDefault());
      d.addEventListener('click', (e) => {
        e.stopPropagation();
        this.poner(id);
      });
      d.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.quitar(id);
      });
      zona.appendChild(d);
      this.casillas.set(id, d);
    };
    casilla('n0', 0, 0, X0, 3 * H, 'verde', '0');
    for (let c = 0; c < 12; c++)
      for (let f = 0; f < 3; f++) {
        const n = 3 * c + (3 - f);
        casilla('n' + n, X0 + c * W, f * H, W, H, colorDe(n), String(n));
      }
    for (let f = 0; f < 3; f++) casilla('col' + (3 - f), X0 + 12 * W, f * H, 56, H, 'fuera', '2:1');
    const yD = 3 * H;
    ['1ª 12', '2ª 12', '3ª 12'].forEach((t, i) => casilla('doc' + (i + 1), X0 + i * 4 * W, yD, 4 * W, 52, 'fuera', t));
    const yF = yD + 52;
    const fuera: [string, string][] = [
      ['bajo', '1-18'], ['par', 'PAR'], ['rojo', '<i class="rombo" style="background:#d7263d"></i>'],
      ['negro', '<i class="rombo" style="background:#1b1030"></i>'], ['impar', 'IMPAR'], ['alto', '19-36'],
    ];
    fuera.forEach(([id, t], i) => casilla(id, X0 + i * 2 * W, yF, 2 * W, 52, 'fuera', t));
    tap.appendChild(zona);
    this.el.appendChild(tap);
  }

  private montarMandos() {
    const m = el('div', 'cc-ru-mandos');
    const fichas = el('div', 'cc-fichas');
    FICHAS.forEach((v, i) => {
      const f = crearFicha(v, String(i + 1));
      f.addEventListener('click', (e) => {
        e.stopPropagation();
        this.elegirFicha(v);
      });
      this.fichasEl.push(f);
      fichas.appendChild(f);
    });
    m.appendChild(fichas);
    this.totalEl = el('div', 'tot');
    m.appendChild(this.totalEl);
    const col = el('div', 'col');
    col.append(
      boton('↶ Deshacer <kbd>⌫</kbd>', 'crema peque', () => this.deshacer()),
      boton('✕ Borrar <kbd>X</kbd>', 'crema peque', () => this.borrar()),
      boton('↻ Repetir <kbd>R</kbd>', 'turq peque', () => this.repetir()),
    );
    m.appendChild(col);
    this.botGirar = boton('GIRAR<small>Espacio</small>', 'gordo rosa', () => this.girar());
    m.appendChild(this.botGirar);
    this.el.appendChild(m);
    this.pintarTotal();
  }

  // ─────────── apuestas ───────────

  get total(): number {
    let t = 0;
    for (const v of this.apuestas.values()) t += v;
    return t;
  }

  elegirFicha(v: number, sonar = true) {
    this.ficha = v;
    if (sonar) this.ctx.sonido.play('chip', { volume: 0.6 });
    this.fichasEl.forEach((f) => f.classList.toggle('sel', Number(f.dataset.valor) === v));
  }

  /** Pone la ficha elegida en una casilla. */
  poner(id: string, cantidad = this.ficha): boolean {
    if (this.estado === 'girando') return false;
    if (this.estado === 'resultado') this.limpiarMesa();
    const c = this.ctx;
    if (this.total + cantidad > MAX_MESA) {
      c.decir(`Máximo de la mesa: ${fmt(MAX_MESA)} por tirada. Esto no es Montecarlo.`, 'aviso');
      c.sonido.play('error');
      return false;
    }
    if (!c.cartera.puede(this.total + cantidad)) {
      c.decir(c.cartera.disponible() < FICHAS[0] ? frase('pobre') : 'No te llega para esa ficha. Prueba con una más pequeña.', 'aviso');
      c.sonido.play('error');
      return false;
    }
    this.apuestas.set(id, (this.apuestas.get(id) ?? 0) + cantidad);
    this.pila.push({ id, v: cantidad });
    this.pintarMonton(id, true);
    this.pintarTotal();
    c.sonido.play('chip');
    return true;
  }

  quitar(id: string) {
    if (this.estado !== 'apostando') return;
    if (!this.apuestas.has(id)) return;
    this.apuestas.delete(id);
    this.pila = this.pila.filter((p) => p.id !== id);
    this.pintarMonton(id);
    this.pintarTotal();
    this.ctx.sonido.play('chip', { volume: 0.5, pitch: 0.8 });
  }

  deshacer() {
    if (this.estado !== 'apostando') return;
    const p = this.pila.pop();
    if (!p) return;
    const v = (this.apuestas.get(p.id) ?? 0) - p.v;
    if (v > 0) this.apuestas.set(p.id, v);
    else this.apuestas.delete(p.id);
    this.pintarMonton(p.id);
    this.pintarTotal();
    this.ctx.sonido.play('chip', { volume: 0.5, pitch: 0.8 });
  }

  borrar() {
    if (this.estado === 'girando') return;
    if (this.estado === 'resultado') return this.limpiarMesa();
    const ids = [...this.apuestas.keys()];
    this.apuestas.clear();
    this.pila = [];
    for (const id of ids) this.pintarMonton(id);
    this.pintarTotal();
    if (ids.length) this.ctx.sonido.play('chip', { volume: 0.5, pitch: 0.7 });
  }

  /** Vuelve a poner las apuestas de la última tirada. true si han cabido todas. */
  repetir(): boolean {
    if (this.estado === 'girando') return false;
    if (!this.ultimas.length) {
      this.ctx.decir('No hay nada que repetir. Apuesta primero, que yo no adivino.', 'aviso');
      return false;
    }
    if (this.estado === 'resultado') this.limpiarMesa();
    else this.borrar();
    for (const [id, v] of this.ultimas) if (!this.poner(id, v)) return false;
    return true;
  }

  private pintarMonton(id: string, nuevo = false) {
    const casilla = this.casillas.get(id);
    this.montones.get(id)?.remove();
    this.montones.delete(id);
    const v = this.apuestas.get(id);
    if (!casilla || !v) return;
    const m = crearFichaMesa(v);
    casilla.appendChild(m);
    this.montones.set(id, m);
    if (nuevo && !ajustes.turbo) m.animate([{ transform: 'translateY(-26px) scale(1.4)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 220, easing: 'cubic-bezier(.2,1.6,.4,1)' });
  }

  private pintarTotal() {
    const t = this.total;
    if (this.estado === 'resultado') this.totalEl.innerHTML = `Última tirada<b>${fmt(t)}</b>Espacio: repetir`;
    else this.totalEl.innerHTML = `En la mesa<b>${fmt(t)}</b>${this.apuestas.size} apuesta${this.apuestas.size === 1 ? '' : 's'}`;
    const d = this.ctx.cartera.disponible() - t;
    this.fichasEl.forEach((f) => f.classList.toggle('no', Number(f.dataset.valor) > d));
  }

  // ─────────── cursor (teclado) ───────────

  private moverCursor(df: number, dc: number) {
    const antes = idEnRejilla(this.cursor.f, this.cursor.c);
    let { f, c } = this.cursor;
    for (let i = 0; i < 14; i++) {
      const nf = f + df, nc = c + dc;
      if (nf < 0 || nf > 4 || nc < 0 || nc > 13) break;
      f = nf;
      c = nc;
      if (idEnRejilla(f, c) !== antes) break;
    }
    this.cursor = { f, c };
    const id = idEnRejilla(f, c);
    this.casillas.forEach((d, k) => d.classList.toggle('cursor', k === id));
  }

  // ─────────── tirada ───────────

  /** Gira la ruleta. `forzar`: número que saldrá (solo pruebas). */
  girar(forzar?: number): Promise<JugadaRuleta | null> {
    const c = this.ctx;
    if (this.estado === 'girando') return Promise.resolve(null);
    if (this.estado === 'resultado' || this.total <= 0) {
      if (this.estado === 'resultado' && this.ultimas.length) {
        // girar otra vez con lo mismo
        if (!this.repetir()) return Promise.resolve(null);
      } else {
        c.decir('Primero pon alguna ficha en el tapete, que la ruleta no gira gratis.', 'aviso');
        c.sonido.play('error');
        return Promise.resolve(null);
      }
    }
    const total = this.total;
    if (!c.cartera.apostar(total)) {
      c.decir(frase('pobre'), 'aviso');
      c.sonido.play('error');
      return Promise.resolve(null);
    }
    c.refrescar();
    this.ultimas = [...this.apuestas];
    this.estado = 'girando';
    this.botGirar.disabled = true;
    this.numero = forzar !== undefined && forzar >= 0 && forzar <= 36 ? Math.floor(forzar) : rnd(37);
    const idx = ORDEN.indexOf(this.numero);
    // rebasar el ángulo de la rueda para empezar la tirada desde donde está
    this.phi0 = mod(this.anguloActual(), TAU);
    this.ts = 0;
    this.mostrado = false;
    const prom = new Promise<JugadaRuleta>((res) => (this.resolver = res));
    if (ajustes.turbo) {
      this.tray = null;
      this.relBola = idx * SEG;
      this.mostrarResultado();
      return prom;
    }
    this.tray = simular(this.phi0, idx);
    c.decir(elegir(['¡No va más! Ahí va la bolita…', 'Hagan juego… ¡no va más!', 'Rueda, rueda, bolita loca…', '¡Allá que va! Cruzamos los dedos.']));
    c.sonido.bolaRuleta(this.tray.tCaida + 0.5, this.tray.golpes);
    c.sonido.play('whoosh', { volume: 0.5 });
    return prom;
  }

  private anguloActual(): number {
    return anguloRueda(this.phi0, this.ts);
  }

  private mostrarResultado() {
    if (this.mostrado) return;
    this.mostrado = true;
    const c = this.ctx;
    const n = this.numero;
    const apostado = this.ultimas.reduce((s, [, v]) => s + v, 0);
    const pagado = pagoTotal(new Map(this.ultimas), n);
    if (pagado > 0) c.cartera.cobrar(pagado);
    const neto = pagado - apostado;
    const fama = c.cartera.fama(neto);
    c.refrescar();
    this.estado = 'resultado';
    this.botGirar.disabled = false;
    this.pintarTotal();
    this.relBola = this.tray ? this.tray.relFinal : this.relBola;
    // número y texto
    const col = colorDe(n);
    this.numEl.className = 'cc-ru-num nuevo ' + col;
    this.numEl.textContent = String(n);
    this.txtEl.innerHTML = '';
    this.txtEl.append(document.createTextNode(`${n} ${col.toUpperCase()}`));
    const sm = el('small');
    sm.textContent = describir(n);
    this.txtEl.appendChild(sm);
    this.historial.unshift(n);
    this.historial.length = Math.min(this.historial.length, 12);
    this.histEl.innerHTML = '';
    for (const h of this.historial) {
      const s = el('span', colorDe(h));
      s.textContent = String(h);
      this.histEl.appendChild(s);
    }
    // tapete
    this.casillas.forEach((d, id) => d.classList.toggle('ganadora', gana(id, n)));
    for (const [id, m] of this.montones) m.classList.add(gana(id, n) ? 'gana' : 'pierde');
    this.dolly?.remove();
    this.dolly = el('div', 'cc-dolly', '📦');
    this.casillas.get('n' + n)?.appendChild(this.dolly);
    // crupier y sonido
    const turbo = ajustes.turbo;
    if (neto > 0) {
      const gordo = neto >= 1000 || this.ultimas.some(([id]) => esPleno(id) && gana(id, n));
      c.decir(`¡${n} ${col}! Cobras ${fmt(pagado)}. ${frase('gana')}${fama ? ' (+10 de FAMA)' : ''}`, gordo ? 'jackpot' : 'gana');
      if (!turbo) {
        c.sonido.monedas(Math.min(16, 3 + Math.round(neto / 50)));
        if (gordo) {
          c.sonido.play('cheer');
          c.sonido.play('bell');
          c.confeti(gordo && neto >= 1000 ? 200 : 110);
          c.fiesta(2500);
        } else c.sonido.play('success', { volume: 0.7 });
      }
    } else if (neto === 0) {
      c.decir(`${n} ${col}. Recuperas lo apostado. ${frase('empate')}`);
      if (!turbo) c.sonido.play('coin');
    } else {
      c.decir(pagado > 0 ? `${n} ${col}. Algo recuperas (${fmt(pagado)}), pero pierdes ${fmt(-neto)}. ${frase('pierde')}` : `${n} ${col}. ${frase('pierde')}`, 'pierde');
      if (!turbo && n === 0) c.sonido.play('boo', { volume: 0.6 });
    }
    const jugada: JugadaRuleta = { numero: n, apostado, pagado, neto, apuestas: this.ultimas.map(([a, b]) => [a, b]) };
    this.pendiente = jugada;
    const res = this.resolver;
    this.resolver = null;
    res?.(jugada);
  }

  /** Quita las fichas del tapete tras un resultado. */
  private limpiarMesa() {
    this.apuestas.clear();
    this.pila = [];
    for (const m of this.montones.values()) m.remove();
    this.montones.clear();
    this.casillas.forEach((d) => d.classList.remove('ganadora'));
    this.dolly?.remove();
    this.dolly = null;
    this.estado = 'apostando';
    this.pintarTotal();
  }

  // ─────────── dibujo ───────────

  redimensionar(escala: number) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const S = Math.max(200, Math.round(430 * escala * dpr));
    if (S === this.tamLienzo) return;
    this.tamLienzo = S;
    this.canvas.width = this.canvas.height = S;
    this.fondo = dibujarFondo(S);
    this.rueda = dibujarRueda(S);
    this.brillo = dibujarBrillo(S);
    this.bola = dibujarBola((S / 2 - 2) * 0.03);
    this.dibujar();
  }

  private dibujar() {
    const g = this.g;
    const S = this.tamLienzo;
    if (!S || !this.fondo || !this.rueda || !this.brillo || !this.bola) return;
    const R = S / 2 - 2;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, S, S);
    g.drawImage(this.fondo, 0, 0);
    const phi = this.anguloActual();
    g.setTransform(1, 0, 0, 1, S / 2, S / 2);
    g.rotate(phi);
    g.drawImage(this.rueda, -S / 2, -S / 2);
    g.setTransform(1, 0, 0, 1, S / 2, S / 2);
    // bola
    let th: number, r: number;
    const tr = this.tray;
    if (tr && this.estado === 'girando') {
      const fi = this.ts / tr.dt;
      const i = Math.min(tr.ang.length - 2, Math.floor(fi));
      const k = Math.min(1, fi - i);
      if (i >= tr.ang.length - 2) {
        th = phi + tr.relFinal;
        r = R_BOLA;
      } else {
        th = tr.ang[i] + (tr.ang[i + 1] - tr.ang[i]) * k;
        r = tr.rad[i] + (tr.rad[i + 1] - tr.rad[i]) * k;
      }
    } else {
      th = phi + this.relBola;
      r = R_BOLA;
    }
    const bx = Math.cos(th) * r * R, by = Math.sin(th) * r * R;
    const br = R * 0.03;
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.beginPath();
    g.arc(bx + br * 0.35, by + br * 0.45, br, 0, TAU);
    g.fill();
    const mb = this.bola.width / 2;
    g.drawImage(this.bola, bx - mb, by - mb);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.brillo, 0, 0);
  }

  tick(dt: number) {
    this.ts += dt;
    if (this.estado === 'girando' && this.tray && !this.mostrado && this.ts >= this.tray.tFijo + 0.4) this.mostrarResultado();
    this.dibujar();
  }

  // ─────────── pantalla ───────────

  ocupado() {
    return this.estado === 'girando';
  }

  tecla(e: KeyboardEvent): boolean {
    switch (e.code) {
      case 'ArrowUp': this.moverCursor(-1, 0); return true;
      case 'ArrowDown': this.moverCursor(1, 0); return true;
      case 'ArrowLeft': this.moverCursor(0, -1); return true;
      case 'ArrowRight': this.moverCursor(0, 1); return true;
      case 'Enter':
      case 'NumpadEnter':
        this.poner(idEnRejilla(this.cursor.f, this.cursor.c));
        return true;
      case 'Space':
        if (!e.repeat) this.girar();
        return true;
      case 'Backspace': this.deshacer(); return true;
      case 'KeyX': case 'Delete': this.borrar(); return true;
      case 'KeyR': this.repetir(); return true;
      case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4':
      case 'Numpad1': case 'Numpad2': case 'Numpad3': case 'Numpad4':
        this.elegirFicha(FICHAS[Number(e.code.slice(-1)) - 1]);
        return true;
    }
    return false;
  }

  resolverYa() {
    if (this.estado !== 'girando') return;
    this.tray = null;
    this.relBola = ORDEN.indexOf(this.numero) * SEG;
    this.mostrarResultado();
  }

  destruir() {
    this.resolverYa();
  }

  /** Para pruebas: la última jugada resuelta. */
  get ultimaJugada(): JugadaRuleta | null {
    return this.pendiente;
  }
}

