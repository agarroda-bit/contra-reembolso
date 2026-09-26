// Tragaperras «La Paquetera»: 3 rodillos de 23 posiciones, una línea de premio.
// Devolución al jugador ≈ 93,9 % (la casa gana a la larga). Ver rtpTragaperras().
import { ajustes, boton, crearFicha, Crupier, el, elegir, FICHAS, fmt, frase, rnd } from './comun';
import type { CtxCasino, PantallaCasino } from './tipos';

export type Sim = 'C' | 'P' | 'B' | 'S' | 'M' | '7' | 'D';
export const EMOJI: Record<Sim, string> = { C: '🍒', P: '📦', B: '🔔', S: '⭐', M: '💰', '7': '7', D: '↩️' };

/** HTML de un símbolo (el 7 es un siete de casino de los de toda la vida, no un emoji). */
export function htmlSim(s: Sim): string {
  return s === '7' ? '<span class="cc-siete">7</span>' : EMOJI[s];
}

// Tiras de los rodillos (mismas cantidades, distinto orden): 7×1 💰×2 ⭐×3 🔔×4 📦×6 🍒×4 ↩️×3
const TIRAS_TXT = ['PCBPSDCPMBP7CDBPSCBMPDS', 'CPDBPSCMPB7PCSDPBCMPSBD', 'BPCSPDMPCB7PDCBSPMCPBDS'];
export const TIRAS: Sim[][] = TIRAS_TXT.map((s) => s.split('') as Sim[]);
export const N = 23;

/** Multiplicador por trío de cada símbolo. */
export const TRIO: Record<Exclude<Sim, 'D'>, number> = { '7': 300, M: 100, S: 40, B: 15, P: 10, C: 10 };
export const LUJO = 5;
export const DOS_CEREZAS = 2;
export const UNA_CEREZA = 1;

export type TipoLinea = 'jackpot' | 'trio' | 'lujo' | 'cerezas2' | 'cereza1' | 'anulado' | 'emboscada' | 'nada';

export interface ResultadoLinea {
  tipo: TipoLinea;
  /** Veces la apuesta que se cobra (−1 = emboscada: te quitan otra apuesta). */
  mult: number;
  /** Fila de la tabla de premios. */
  fila: string;
  /** Qué rodillos forman el premio. */
  gana: boolean[];
}

/** Evalúa la línea de premio. */
export function evaluar(l: Sim[]): ResultadoLinea {
  const [a, b, c] = l;
  const dev = l.filter((x) => x === 'D').length;
  const cer = l.map((x) => x === 'C');
  const nCer = cer.filter(Boolean).length;
  if (a === b && b === c) {
    if (a === 'D') return { tipo: 'emboscada', mult: -1, fila: 'emboscada', gana: [true, true, true] };
    return { tipo: a === '7' ? 'jackpot' : 'trio', mult: TRIO[a], fila: a, gana: [true, true, true] };
  }
  if (l.every((x) => x === 'M' || x === 'S' || x === '7')) return { tipo: 'lujo', mult: LUJO, fila: 'lujo', gana: [true, true, true] };
  if (nCer > 0 && dev > 0) return { tipo: 'anulado', mult: 0, fila: 'anulado', gana: l.map((x) => x === 'D') };
  if (nCer === 2) return { tipo: 'cerezas2', mult: DOS_CEREZAS, fila: 'c2', gana: cer };
  if (nCer === 1) return { tipo: 'cereza1', mult: UNA_CEREZA, fila: 'c1', gana: cer };
  return { tipo: 'nada', mult: 0, fila: '', gana: [false, false, false] };
}

/** Devolución teórica (todas las combinaciones) y frecuencia de premio. */
export function rtpTragaperras(): { rtp: number; aciertos: number; jackpot: number } {
  let suma = 0, aciertos = 0;
  for (const a of TIRAS[0]) for (const b of TIRAS[1]) for (const c of TIRAS[2]) {
    const r = evaluar([a, b, c]);
    suma += r.mult;
    if (r.mult > 0) aciertos++;
  }
  const total = N * N * N;
  return { rtp: suma / total, aciertos: aciertos / total, jackpot: total };
}

const FILAS: { id: string; s: Sim[]; t?: string; m: number; malo?: boolean }[] = [
  { id: '7', s: ['7', '7', '7'], t: '¡JACKPOT!', m: TRIO['7'] },
  { id: 'M', s: ['M', 'M', 'M'], m: TRIO.M },
  { id: 'S', s: ['S', 'S', 'S'], m: TRIO.S },
  { id: 'B', s: ['B', 'B', 'B'], m: TRIO.B },
  { id: 'P', s: ['P', 'P', 'P'], m: TRIO.P },
  { id: 'C', s: ['C', 'C', 'C'], m: TRIO.C },
  { id: 'lujo', s: ['M', 'S', '7'], t: 'Mezcla de lujo', m: LUJO },
  { id: 'c2', s: ['C', 'C'], t: 'Dos cerezas', m: DOS_CEREZAS },
  { id: 'c1', s: ['C'], t: 'Una cereza: recuperas', m: UNA_CEREZA },
  { id: 'anulado', s: ['D', 'C'], t: 'Un Devuelto se lleva las cerezas', m: 0, malo: true },
  { id: 'emboscada', s: ['D', 'D', 'D'], t: '¡Emboscada! Te quitan otra apuesta', m: -1, malo: true },
];

const CELDA = 96;
const VEL = 24; // celdas por segundo a toda máquina
const REBOTE = 0.32;
const T_REBOTE = 0.3;
const D_FRENO = 6; // casillas de frenada

interface Rodillo {
  caja: HTMLDivElement;
  tira: HTMLDivElement;
  pos: number;
  fase: 'quieto' | 'arranque' | 'gira' | 'frena' | 'rebote';
  t: number;
  desde: number;
  hasta: number;
  dur: number;
  tParar: number;
  parada: number;
  celda: number;
  borroso: boolean;
}

export interface JugadaTragaperras {
  simbolos: Sim[];
  tipo: TipoLinea;
  mult: number;
  apuesta: number;
  pago: number;
  /** Lo que te quitan de más en una emboscada. */
  extra: number;
  neto: number;
}

let apuestaRecordada = 10;

const mod = (a: number, n: number) => ((a % n) + n) % n;
const easeOutBack = (u: number) => {
  const c1 = 1.9, c3 = c1 + 1;
  return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
};

export class Tragaperras implements PantallaCasino {
  readonly el: HTMLDivElement;
  readonly titulo = '🎰 Tragaperras «La Paquetera»';
  apuesta = apuestaRecordada;
  girando = false;
  private rodillos: Rodillo[] = [];
  private tiempo = 0;
  private paradas = [0, 0, 0];
  private suspenseHecho = false;
  private resolver: ((j: JugadaTragaperras) => void) | null = null;
  private crupier: Crupier;
  private lcd!: HTMLDivElement;
  private fichasEl: HTMLDivElement[] = [];
  private filasEl = new Map<string, HTMLTableRowElement>();
  private eurosEl = new Map<string, HTMLTableCellElement>();
  private marco: HTMLElement[] = [];
  private linea!: HTMLDivElement;
  private maquina!: HTMLDivElement;
  private brazo!: HTMLDivElement;
  private valorApuesta!: HTMLDivElement;
  private apuMaquina!: HTMLElement;
  private botonGirar!: HTMLButtonElement;
  private ultimosEl!: HTMLDivElement;
  private ultimos: { t: string; g: boolean }[] = [];

  constructor(private ctx: CtxCasino) {
    this.el = el('div', 'cc-tp');
    this.crupier = new Crupier('Tres iguales en la línea roja y cobras. Si sale un ↩️, reza.');
    this.montar();
    this.ponerApuesta(this.apuesta);
    this.ctx.teclas('<span><kbd>Espacio</kbd>Girar</span><span><kbd>1</kbd>–<kbd>4</kbd>Ficha</span><span><kbd>↑</kbd><kbd>↓</kbd>Subir / bajar apuesta</span><span><kbd>Esc</kbd>Vestíbulo</span>');
  }

  // ─────────── construcción ───────────

  private montar() {
    const izq = el('div', 'cc-tp-izq');
    izq.appendChild(this.crupier.el);
    const pan = el('div', 'cc-panel cc-tp-apuesta');
    pan.innerHTML = '<h3>Tu apuesta por tirada</h3>';
    this.valorApuesta = el('div', 'valor');
    pan.appendChild(this.valorApuesta);
    const fichas = el('div', 'cc-fichas compactas');
    FICHAS.forEach((v, i) => {
      const f = crearFicha(v, String(i + 1));
      f.addEventListener('click', (e) => {
        e.stopPropagation();
        this.elegirFicha(v);
      });
      this.fichasEl.push(f);
      fichas.appendChild(f);
    });
    pan.appendChild(fichas);
    izq.appendChild(pan);
    const ult = el('div', 'cc-panel');
    ult.style.padding = '12px 16px';
    ult.innerHTML = '<h3>Últimas tiradas</h3>';
    this.ultimosEl = el('div', 'cc-tp-ultimos');
    this.ultimosEl.innerHTML = '<span>Aún nada</span>';
    ult.appendChild(this.ultimosEl);
    izq.appendChild(ult);
    this.el.appendChild(izq);

    // la máquina
    const maq = el('div', 'cc-maquina');
    this.maquina = maq;
    const corona = el('div', 'cc-corona');
    const luces = el('div', 'luces');
    const w = 370, h = 92;
    for (let x = 44; x <= w - 44; x += 26) luces.appendChild(this.bombilla(x, 12));
    for (let y = 44; y <= h - 8; y += 22) {
      luces.appendChild(this.bombilla(12, y));
      luces.appendChild(this.bombilla(w - 12, y));
    }
    corona.appendChild(luces);
    corona.insertAdjacentHTML('beforeend', `<h2>LA PAQUETERA</h2><small>★ 777 = JACKPOT ×${TRIO['7']} ★</small>`);
    maq.appendChild(corona);
    const cuerpo = el('div', 'cc-cuerpo');
    const ventana = el('div', 'cc-ventana');
    for (let i = 0; i < 3; i++) {
      const caja = el('div', 'cc-rodillo');
      const tira = el('div', 'cc-tira');
      for (let k = 0; k < N + 3; k++) {
        const s = el('div', 'cc-simbolo');
        s.innerHTML = htmlSim(TIRAS[i][k % N]);
        tira.appendChild(s);
      }
      caja.appendChild(tira);
      ventana.appendChild(caja);
      const parada = rnd(N);
      const r: Rodillo = { caja, tira, pos: mod(parada - 1, N), fase: 'quieto', t: 0, desde: 0, hasta: 0, dur: 0, tParar: 0, parada, celda: 0, borroso: false };
      this.rodillos.push(r);
      this.pintar(r);
    }
    const marco = el('div', 'cc-marco-gana');
    for (let i = 0; i < 3; i++) {
      const m = el('i');
      this.marco.push(m);
      marco.appendChild(m);
    }
    ventana.appendChild(marco);
    this.linea = el('div', 'cc-linea');
    ventana.appendChild(this.linea);
    cuerpo.appendChild(ventana);
    this.lcd = el('div', 'cc-lcd');
    this.lcd.textContent = '¡PRUEBA SUERTE!';
    cuerpo.appendChild(this.lcd);
    const mandos = el('div', 'cc-tp-mandos');
    this.apuMaquina = el('div', 'apu');
    mandos.appendChild(this.apuMaquina);
    this.botonGirar = boton('GIRAR<small>Espacio</small>', 'cc-girar', () => this.girar());
    mandos.appendChild(this.botonGirar);
    const info = el('div', 'apu', 'Línea<b>ROJA</b>');
    info.style.textAlign = 'right';
    mandos.appendChild(info);
    cuerpo.appendChild(mandos);
    const palanca = el('div', 'cc-palanca');
    palanca.title = 'Tira de la palanca';
    palanca.innerHTML = '<div class="base"></div>';
    this.brazo = el('div', 'brazo');
    palanca.appendChild(this.brazo);
    palanca.addEventListener('mousedown', (e) => e.preventDefault());
    palanca.addEventListener('click', (e) => {
      e.stopPropagation();
      this.girar();
    });
    cuerpo.appendChild(palanca);
    maq.appendChild(cuerpo);
    this.el.appendChild(maq);

    // tabla de premios
    const tabla = el('div', 'cc-panel cc-tabla');
    tabla.innerHTML = '<h3>Tabla de premios <small>solo cuenta la línea roja</small></h3>';
    const t = el('table');
    for (const f of FILAS) {
      const tr = el('tr', f.malo ? 'malo' : '');
      const td1 = el('td', 's');
      td1.innerHTML = f.s.map(htmlSim).join('');
      const td2 = el('td', 't');
      td2.textContent = f.t ?? '';
      const td3 = el('td', 'm');
      td3.textContent = f.m > 0 ? '×' + f.m : f.m < 0 ? '−1 apuesta' : '×0';
      const td4 = el('td', 'e');
      tr.append(td1, td2, td3, td4);
      t.appendChild(tr);
      this.filasEl.set(f.id, tr);
      this.eurosEl.set(f.id, td4);
    }
    tabla.appendChild(t);
    const info2 = el('div', 'rtp');
    const r = rtpTragaperras();
    info2.textContent = `Devolución al jugador: ${(r.rtp * 100).toFixed(1).replace('.', ',')} %. El resto es para la gomina del jefe.`;
    tabla.appendChild(info2);
    this.el.appendChild(tabla);
  }

  private bombilla(x: number, y: number): HTMLElement {
    const i = el('i');
    i.style.left = x + 'px';
    i.style.top = y + 'px';
    return i;
  }

  private pintar(r: Rodillo) {
    r.tira.style.transform = `translate3d(0,${(-mod(r.pos, N) * CELDA).toFixed(1)}px,0)`;
  }

  // ─────────── apuesta ───────────

  elegirFicha(v: number) {
    if (this.girando) return;
    this.ctx.sonido.play('chip');
    this.ponerApuesta(v);
  }

  private ponerApuesta(v: number) {
    this.apuesta = v;
    apuestaRecordada = v;
    this.valorApuesta.innerHTML = `${fmt(v)}<small>por tirada · premio máximo ${fmt(v * TRIO['7'])}</small>`;
    this.apuMaquina.innerHTML = `Apuesta<b>${fmt(v)}</b>`;
    this.fichasEl.forEach((f) => f.classList.toggle('sel', Number(f.dataset.valor) === v));
    for (const f of FILAS) {
      const td = this.eurosEl.get(f.id)!;
      td.textContent = f.m > 0 ? fmt(v * f.m) : f.m < 0 ? '−' + fmt(v) : '0 €';
    }
    this.refrescarFichas();
  }

  private refrescarFichas() {
    const d = this.ctx.cartera.disponible();
    this.fichasEl.forEach((f) => f.classList.toggle('no', Number(f.dataset.valor) > d));
  }

  private cambiarApuesta(dir: number) {
    const i = FICHAS.indexOf(this.apuesta as (typeof FICHAS)[number]);
    const j = Math.max(0, Math.min(FICHAS.length - 1, (i < 0 ? 0 : i) + dir));
    if (FICHAS[j] !== this.apuesta) this.elegirFicha(FICHAS[j]);
  }

  // ─────────── jugar ───────────

  /**
   * Tira de la palanca. Devuelve la jugada al terminar (o null si no se ha podido).
   * `forzar`: símbolos de la línea (solo pruebas).
   */
  girar(forzar?: Sim[]): Promise<JugadaTragaperras | null> {
    if (this.girando) {
      this.meterPrisa();
      return Promise.resolve(null);
    }
    const c = this.ctx;
    if (!c.cartera.apostar(this.apuesta)) {
      c.decir(c.cartera.disponible() < FICHAS[0] ? frase('pobre') : `No te llega para ${fmt(this.apuesta)}. Baja la apuesta, valiente.`, 'aviso');
      c.sonido.play('error');
      this.lcd.className = 'cc-lcd rojo';
      this.lcd.textContent = 'SALDO INSUFICIENTE';
      return Promise.resolve(null);
    }
    c.refrescar();
    this.girando = true;
    this.botonGirar.disabled = true;
    this.limpiarPremio();
    this.lcd.className = 'cc-lcd';
    this.lcd.textContent = elegir(['GIRANDO…', 'SUERTE…', 'VAMOS, VAMOS…', 'A VER, A VER…']);
    // paradas decididas al tirar (cada posición de la tira igual de probable)
    for (let i = 0; i < 3; i++) {
      let p = rnd(N);
      if (forzar?.[i]) {
        const opciones = TIRAS[i].map((s, k) => (s === forzar[i] ? k : -1)).filter((k) => k >= 0);
        if (opciones.length) p = elegir(opciones);
      }
      this.paradas[i] = p;
    }
    const prom = new Promise<JugadaTragaperras>((res) => (this.resolver = res));
    if (ajustes.turbo) {
      this.rodillos.forEach((r, i) => this.fijar(r, this.paradas[i]));
      this.finalizar();
      return prom;
    }
    c.sonido.palanca();
    this.brazo.animate(
      [{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(-150deg)', offset: 0.45 }, { transform: 'rotateX(0deg)' }],
      { duration: 700, easing: 'ease-in-out' },
    );
    this.tiempo = 0;
    this.suspenseHecho = false;
    const s0 = TIRAS[0][this.paradas[0]], s1 = TIRAS[1][this.paradas[1]];
    const suspense = s0 === s1 && (s0 === '7' || s0 === 'M' || s0 === 'S' || s0 === 'B');
    this.rodillos.forEach((r, i) => {
      r.fase = 'arranque';
      r.t = 0;
      r.desde = r.pos;
      r.parada = this.paradas[i];
      r.tParar = 0.6 + i * 0.4 + (i === 2 && suspense ? 1.2 : 0);
      r.celda = Math.floor(r.pos);
    });
    return prom;
  }

  /** Pulsar otra vez mientras gira: los rodillos paran antes (sin cambiar el resultado). */
  private meterPrisa() {
    this.rodillos.forEach((r, i) => {
      if (r.fase === 'gira' || r.fase === 'arranque') r.tParar = Math.min(r.tParar, this.tiempo + 0.05 + i * 0.12);
    });
  }

  /** Coloca un rodillo en su parada al instante. */
  private fijar(r: Rodillo, parada: number) {
    r.parada = parada;
    r.pos = mod(parada - 1, N);
    r.fase = 'quieto';
    if (r.borroso) {
      r.borroso = false;
      r.tira.classList.remove('borrosa');
    }
    r.caja.classList.remove('suspense');
    this.pintar(r);
  }

  tick(dt: number) {
    if (!this.girando) return;
    this.tiempo += dt;
    const c = this.ctx;
    let parados = 0;
    this.rodillos.forEach((r, i) => {
      r.t += dt;
      switch (r.fase) {
        case 'arranque': {
          // pequeño tirón hacia atrás antes de arrancar
          const u = Math.min(1, r.t / 0.2);
          r.pos = r.desde + 0.3 * Math.sin(u * Math.PI);
          if (u >= 1) {
            r.fase = 'gira';
            r.t = 0;
          }
          break;
        }
        case 'gira': {
          const v = VEL * Math.min(1, r.t / 0.25 + 0.2);
          r.pos -= v * dt;
          // a partir de su hora, frena cuando su símbolo está a unas pocas casillas
          if (this.tiempo >= r.tParar && r.t > 0.25) {
            const d = mod(r.pos - mod(r.parada - 1, N), N);
            if (d <= D_FRENO && d >= 3.5) {
              r.desde = r.pos;
              r.hasta = r.pos - d - REBOTE;
              r.dur = (2 * (d + REBOTE)) / VEL;
              r.fase = 'frena';
              r.t = 0;
            }
          }
          break;
        }
        case 'frena': {
          const u = Math.min(1, r.t / r.dur);
          r.pos = r.desde + (r.hasta - r.desde) * (1 - (1 - u) * (1 - u));
          if (u >= 1) {
            r.fase = 'rebote';
            r.t = 0;
            c.sonido.golpeRodillo();
            r.caja.classList.remove('suspense');
            // tensión: los dos primeros iguales y buenos → el tercero se hace de rogar
            if (i === 1 && !this.suspenseHecho && this.rodillos[2].tParar > 2) {
              this.suspenseHecho = true;
              this.rodillos[2].caja.classList.add('suspense');
              c.sonido.suspense(1.2);
              c.decir(elegir(['¡Uy, uy, uy! ¡Que viene, que viene!', '¡Quieto todo el mundo! Esto huele a premio.', 'Ay, madre… ¡que no se me pare el corazón!']), 'aviso');
            }
          }
          break;
        }
        case 'rebote': {
          const u = Math.min(1, r.t / T_REBOTE);
          const fin = r.hasta + REBOTE;
          r.pos = fin - REBOTE * (1 - easeOutBack(u));
          if (u >= 1) {
            r.fase = 'quieto';
            r.pos = mod(fin, N);
          }
          break;
        }
        case 'quieto':
          parados++;
          break;
      }
      // desenfoque a toda velocidad
      const rapido = r.fase === 'gira' || (r.fase === 'frena' && r.t / r.dur < 0.3);
      if (rapido !== r.borroso) {
        r.borroso = rapido;
        r.tira.classList.toggle('borrosa', rapido);
      }
      // tic al pasar cada símbolo
      const celda = Math.floor(r.pos);
      if (celda !== r.celda) {
        r.celda = celda;
        if (r.fase !== 'quieto') c.sonido.tic(r.fase === 'frena' ? 0.6 : 0.35);
      }
      this.pintar(r);
    });
    if (parados === 3) this.finalizar();
  }

  private limpiarPremio() {
    this.marco.forEach((m) => m.classList.remove('si'));
    this.linea.classList.remove('gana');
    this.filasEl.forEach((tr) => tr.classList.remove('ilum'));
    this.maquina.classList.remove('fiesta');
  }

  private finalizar() {
    if (!this.girando) return;
    this.girando = false;
    this.botonGirar.disabled = false;
    const c = this.ctx;
    const simbolos = this.paradas.map((p, i) => TIRAS[i][p]);
    const r = evaluar(simbolos);
    const apuesta = this.apuesta;
    let pago = 0, extra = 0;
    if (r.tipo === 'emboscada') {
      if (c.cartera.puede(apuesta) && c.cartera.apostar(apuesta)) extra = apuesta;
    } else if (r.mult > 0) {
      pago = apuesta * r.mult;
      c.cartera.cobrar(pago);
    }
    const neto = pago - apuesta - extra;
    const fama = c.cartera.fama(neto);
    c.refrescar();
    this.refrescarFichas();

    // lo que se ve
    if (r.fila) this.filasEl.get(r.fila)?.classList.add('ilum');
    r.gana.forEach((g, i) => g && r.tipo !== 'anulado' && r.tipo !== 'emboscada' && this.marco[i].classList.add('si'));
    const turbo = ajustes.turbo;
    switch (r.tipo) {
      case 'jackpot':
        this.lcd.className = 'cc-lcd oro';
        this.lcd.textContent = `¡¡JACKPOT!! +${fmt(pago)}`;
        this.linea.classList.add('gana');
        this.maquina.classList.add('fiesta');
        c.decir(frase('jackpot') + (fama ? ' (+10 de FAMA)' : ''), 'jackpot');
        if (!turbo) {
          c.sonido.fanfarria();
          c.sonido.play('bell');
          c.sonido.play('cheer');
          c.sonido.monedas(18);
          c.confeti(240);
          c.fiesta(5500);
        }
        break;
      case 'trio':
      case 'lujo':
      case 'cerezas2': {
        this.lcd.className = 'cc-lcd' + (r.mult >= 40 ? ' oro' : '');
        this.lcd.textContent = `PREMIO: ${fmt(pago)}`;
        this.linea.classList.add('gana');
        c.decir(frase('gana') + (fama ? ' (+10 de FAMA)' : ''), 'gana');
        if (!turbo) {
          c.sonido.monedas(Math.min(14, 2 + r.mult));
          if (r.mult >= 40) {
            this.maquina.classList.add('fiesta');
            c.sonido.play('bell');
            c.sonido.play('cheer');
            c.confeti(110);
            c.fiesta(2200);
          } else c.sonido.play('success', { volume: 0.7 });
        }
        break;
      }
      case 'cereza1':
        this.lcd.className = 'cc-lcd';
        this.lcd.textContent = `RECUPERAS ${fmt(pago)}`;
        c.decir(elegir(['Una cereza: ni ganas ni pierdes. Como la vida misma.', 'Te devuelvo lo tuyo. Por la cereza, que es muy maja.', 'Empate técnico con la máquina. Otra.']));
        if (!turbo) c.sonido.play('coin');
        break;
      case 'anulado':
        this.lcd.className = 'cc-lcd rojo';
        this.lcd.textContent = '↩️ SE LLEVAN TUS CEREZAS';
        c.decir(elegir(['¡Ese ↩️ es de Los Devueltos! Se han llevado tus cerezas, los muy sinvergüenzas.', 'Tenías cereza… hasta que ha aparecido un Devuelto. Qué gentuza.']), 'pierde');
        if (!turbo) c.sonido.play('boo', { volume: 0.6 });
        break;
      case 'emboscada':
        this.lcd.className = 'cc-lcd rojo';
        this.lcd.textContent = extra ? `¡EMBOSCADA! −${fmt(extra)}` : '¡EMBOSCADA! (SIN BLANCA)';
        c.decir(
          extra
            ? '¡EMBOSCADA DE LOS DEVUELTOS! Te han quitado otra apuesta. Aquí nadie ha visto nada.'
            : '¡Emboscada! Pero como no te queda un euro, se van con las manos vacías.',
          'pierde',
        );
        if (!turbo) {
          c.sonido.play('boo');
          c.sonido.play('fail', { volume: 0.6 });
          c.susto();
        }
        break;
      default:
        this.lcd.className = 'cc-lcd rojo';
        this.lcd.textContent = elegir(['NADA. OTRA VEZ SERÁ', 'CERO PATATERO', 'NI UNA CEREZA', 'SIGUE PROBANDO', 'LA CASA AGRADECE']);
        if (Math.random() < 0.45) c.decir(frase('pierde'), 'pierde');
    }
    this.ultimos.unshift({ t: neto > 0 ? '+' + fmt(neto) : neto < 0 ? '−' + fmt(-neto) : '0 €', g: neto >= 0 });
    this.ultimos.length = Math.min(this.ultimos.length, 10);
    this.ultimosEl.innerHTML = '';
    for (const u of this.ultimos) {
      const s = el('span', u.g ? 'g' : '');
      s.textContent = u.t;
      this.ultimosEl.appendChild(s);
    }
    const jugada: JugadaTragaperras = { simbolos, tipo: r.tipo, mult: r.mult, apuesta, pago, extra, neto };
    const res = this.resolver;
    this.resolver = null;
    res?.(jugada);
  }

  // ─────────── pantalla ───────────

  ocupado() {
    return this.girando;
  }

  tecla(e: KeyboardEvent): boolean {
    switch (e.code) {
      case 'Space':
      case 'Enter':
      case 'NumpadEnter':
        if (!e.repeat) this.girar();
        return true;
      case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4':
      case 'Numpad1': case 'Numpad2': case 'Numpad3': case 'Numpad4':
        this.elegirFicha(FICHAS[Number(e.code.slice(-1)) - 1]);
        return true;
      case 'ArrowUp': case 'ArrowRight': case 'Equal': case 'NumpadAdd':
        this.cambiarApuesta(1);
        return true;
      case 'ArrowDown': case 'ArrowLeft': case 'Minus': case 'NumpadSubtract':
        this.cambiarApuesta(-1);
        return true;
    }
    return false;
  }

  resolverYa() {
    if (!this.girando) return;
    this.rodillos.forEach((r, i) => this.fijar(r, this.paradas[i]));
    this.finalizar();
  }

  destruir() {
    this.resolverYa();
  }
}
