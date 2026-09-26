// Blackjack «El 21 del Puerto»: zapato de 6 mazos, pedir / plantarse / doblar,
// la banca pide hasta 16 y se planta con 17 (también con 17 blando), blackjack paga 3 a 2,
// empate devuelve la apuesta. Sin seguro ni separar (decisión: más sencillo y más rápido).
import { ajustes, boton, crearFicha, crearMonton, Crupier, el, elegir, esperar, FICHAS, fmt, frase } from './comun';
import { crearCartaEl, nombreCarta, valorCarta, type Carta } from './cartas';
import type { CtxCasino, PantallaCasino } from './tipos';

// ─────────────────────────────── Reglas ───────────────────────────────

export const MAZOS = 6;
export const MAX_MANO = 5000;

export function totalMano(m: Carta[]): { t: number; blanda: boolean } {
  let t = 0, ases = 0;
  for (const c of m) {
    t += valorCarta(c);
    if (c.r === 1) ases++;
  }
  while (t > 21 && ases > 0) {
    t -= 10;
    ases--;
  }
  return { t, blanda: ases > 0 };
}

export function esBlackjack(m: Carta[]): boolean {
  return m.length === 2 && totalMano(m).t === 21;
}

/** La banca pide con 16 o menos y se planta con 17 o más. */
export function bancaPide(m: Carta[]): boolean {
  return totalMano(m).t < 17;
}

export type ResultadoBJ = 'blackjack' | 'gana' | 'bancaPasa' | 'empate' | 'pierde' | 'tePasas' | 'bancaBJ';

/** Liquida la mano: lo que devuelve la mesa (apuesta incluida). */
export function liquidar(j: Carta[], b: Carta[], apostado: number): { res: ResultadoBJ; pago: number } {
  const pBJ = esBlackjack(j), bBJ = esBlackjack(b);
  if (pBJ && bBJ) return { res: 'empate', pago: apostado };
  if (pBJ) return { res: 'blackjack', pago: apostado * 2.5 };
  if (bBJ) return { res: 'bancaBJ', pago: 0 };
  const pt = totalMano(j).t;
  if (pt > 21) return { res: 'tePasas', pago: 0 };
  const bt = totalMano(b).t;
  if (bt > 21) return { res: 'bancaPasa', pago: apostado * 2 };
  if (pt > bt) return { res: 'gana', pago: apostado * 2 };
  if (pt === bt) return { res: 'empate', pago: apostado };
  return { res: 'pierde', pago: 0 };
}

/** Zapato de varios mazos. Se baraja cuando queda menos de un cuarto. */
export class Zapato {
  cartas: Carta[] = [];
  /** Cartas que saldrán primero (solo pruebas). */
  forzadas: Carta[] = [];
  constructor(readonly mazos = MAZOS) {
    this.barajar();
  }
  barajar() {
    this.cartas = [];
    for (let m = 0; m < this.mazos; m++) for (let p = 0; p < 4; p++) for (let r = 1; r <= 13; r++) this.cartas.push({ r, p });
    for (let i = this.cartas.length - 1; i > 0; i--) {
      const k = Math.floor(Math.random() * (i + 1));
      [this.cartas[i], this.cartas[k]] = [this.cartas[k], this.cartas[i]];
    }
  }
  get quedan() {
    return this.cartas.length;
  }
  necesitaBarajar() {
    return this.cartas.length < this.mazos * 52 * 0.25;
  }
  sacar(): Carta {
    const f = this.forzadas.shift();
    if (f) return f;
    if (!this.cartas.length) this.barajar();
    return this.cartas.pop()!;
  }
}

// ─────────────────────────────── Mesa ───────────────────────────────

const ANCHO = 100, PASO = 62; // carta de 100×140
const Y_BANCA = 112, Y_JUGADOR = 338, CX = 600;
const ORIGEN = { x: 990, y: 50 }; // el zapato
const DESCARTE = { x: 110, y: 50 };

export interface ManoBJ {
  jugador: Carta[];
  banca: Carta[];
  apostado: number;
  res: ResultadoBJ;
  pago: number;
  neto: number;
  doblada: boolean;
}

type Estado = 'apuesta' | 'reparto' | 'jugador' | 'banca' | 'fin';

let ultimaRecordada = 0;

export class Blackjack implements PantallaCasino {
  readonly el: HTMLDivElement;
  readonly titulo = '🃏 Blackjack «El 21 del Puerto»';
  readonly zapato = new Zapato();
  estado: Estado = 'apuesta';
  apuesta = 0;
  apostado = 0;
  ultima = ultimaRecordada;
  jugador: Carta[] = [];
  banca: Carta[] = [];
  private cartasJ: HTMLDivElement[] = [];
  private cartasB: HTMLDivElement[] = [];
  private mano = 0;
  private doblada = false;
  private crupier: Crupier;
  private totJ: HTMLDivElement;
  private totB: HTMLDivElement;
  private circulo: HTMLDivElement;
  private acciones: HTMLDivElement;
  private cartel: HTMLDivElement;
  private zapatoTxt: HTMLElement;
  private fichasEl: HTMLDivElement[] = [];
  private botones = new Map<string, HTMLButtonElement>();
  private resolverMano: ((m: ManoBJ) => void) | null = null;
  /** Última mano terminada (pruebas). */
  ultimaMano: ManoBJ | null = null;

  constructor(private ctx: CtxCasino) {
    this.el = el('div', 'cc-bj');
    this.el.innerHTML = `<div class="cc-mesa"></div>
      <svg class="cc-bj-svg" viewBox="0 0 1200 640">
        <path id="cc-arco1" d="M250 262 Q600 342 950 262" fill="none"/>
        <path id="cc-arco2" d="M300 286 Q600 356 900 286" fill="none"/>
        <text font-family="system-ui" font-weight="900" font-size="22" fill="#ffd23f" letter-spacing="3" opacity=".9"><textPath href="#cc-arco1" startOffset="50%" text-anchor="middle">BLACKJACK PAGA 3 A 2</textPath></text>
        <text font-family="system-ui" font-weight="800" font-size="13" fill="#fff7e6" letter-spacing="2" opacity=".75"><textPath href="#cc-arco2" startOffset="50%" text-anchor="middle">LA BANCA PIDE HASTA 16 Y SE PLANTA CON 17</textPath></text>
      </svg>
      <div class="cc-descarte"></div>`;
    const zap = el('div', 'cc-zapato', '<div class="caja"></div><div class="mazo"></div>');
    this.zapatoTxt = el('small');
    zap.appendChild(this.zapatoTxt);
    this.el.appendChild(zap);
    this.crupier = new Crupier('Siéntate, repartidor. Pon tu apuesta en el círculo y te reparto.');
    const cru = el('div', 'cc-bj-crupier');
    cru.appendChild(this.crupier.el);
    this.el.appendChild(cru);
    this.totB = el('div', 'cc-bj-total');
    this.totJ = el('div', 'cc-bj-total');
    this.el.append(this.totB, this.totJ);
    this.circulo = el('div', 'cc-circulo');
    this.el.appendChild(this.circulo);
    // fichas
    const rack = el('div', 'cc-panel cc-bj-rack');
    rack.innerHTML = '<h3>Fichas</h3>';
    const fichas = el('div', 'cc-fichas');
    FICHAS.forEach((v, i) => {
      const f = crearFicha(v, String(i + 1));
      f.addEventListener('click', (e) => {
        e.stopPropagation();
        this.sumar(v);
      });
      this.fichasEl.push(f);
      fichas.appendChild(f);
    });
    rack.appendChild(fichas);
    this.el.appendChild(rack);
    this.acciones = el('div', 'cc-panel cc-bj-acciones');
    this.el.appendChild(this.acciones);
    this.cartel = el('div', 'cc-cartel-bj');
    this.el.appendChild(this.cartel);
    this.ctx.teclas('<span><kbd>1</kbd>–<kbd>4</kbd>Añadir ficha</span><span><kbd>Espacio</kbd>Repartir</span><span><kbd>P</kbd>Pedir</span><span><kbd>S</kbd>Plantarse</span><span><kbd>D</kbd>Doblar</span><span><kbd>X</kbd>Quitar apuesta</span><span><kbd>Esc</kbd>Vestíbulo</span>');
    if (this.ultima > 0 && this.ctx.cartera.puede(this.ultima)) this.apuesta = this.ultima;
    this.pintarCirculo();
    this.pintarTotales();
    this.pintarAcciones();
    this.pintarZapato();
  }

  // ─────────── apuesta ───────────

  /** Añade una ficha a la apuesta. */
  sumar(v: number): boolean {
    if (this.estado === 'fin') this.nuevaMano(false);
    if (this.estado !== 'apuesta') return false;
    const c = this.ctx;
    if (this.apuesta + v > MAX_MANO) {
      c.decir(`El máximo de esta mesa es ${fmt(MAX_MANO)} por mano. Para más, habla con mi jefe (no).`, 'aviso');
      c.sonido.play('error');
      return false;
    }
    if (!c.cartera.puede(this.apuesta + v)) {
      c.decir(c.cartera.disponible() < FICHAS[0] ? frase('pobre') : 'No te llega para esa ficha. Prueba con una más pequeña.', 'aviso');
      c.sonido.play('error');
      return false;
    }
    this.apuesta += v;
    c.sonido.play('chip');
    this.pintarCirculo(true);
    this.pintarAcciones();
    return true;
  }

  quitarApuesta() {
    if (this.estado === 'fin') this.nuevaMano(false);
    if (this.estado !== 'apuesta' || !this.apuesta) return;
    this.apuesta = 0;
    this.ctx.sonido.play('chip', { volume: 0.5, pitch: 0.8 });
    this.pintarCirculo();
    this.pintarAcciones();
  }

  /** Recoge la mesa para otra mano. `repetir`: vuelve a poner la última apuesta. */
  private nuevaMano(repetir: boolean) {
    this.recoger();
    this.estado = 'apuesta';
    this.apuesta = repetir && this.ultima > 0 && this.ctx.cartera.puede(this.ultima) ? this.ultima : 0;
    this.cartel.innerHTML = '';
    this.pintarCirculo();
    this.pintarTotales();
    this.pintarAcciones();
  }

  /** Las cartas se van al descarte. */
  private recoger() {
    const todas = [...this.cartasJ, ...this.cartasB];
    this.cartasJ = [];
    this.cartasB = [];
    this.jugador = [];
    this.banca = [];
    for (const d of todas) {
      if (ajustes.turbo) {
        d.remove();
        continue;
      }
      const x = parseFloat(d.style.left), y = parseFloat(d.style.top);
      const a = d.animate(
        [{ transform: 'none', opacity: 1 }, { transform: `translate(${DESCARTE.x - x}px,${DESCARTE.y - y}px) rotate(-30deg) scale(.8)`, opacity: 0 }],
        { duration: 320, easing: 'ease-in', fill: 'forwards' },
      );
      a.onfinish = () => d.remove();
    }
  }

  // ─────────── jugada ───────────

  /** Reparte una mano nueva. Devuelve la mano cuando termine (null si no se ha podido). */
  repartir(): Promise<ManoBJ | null> {
    const c = this.ctx;
    if (this.estado === 'fin') this.nuevaMano(true);
    if (this.estado !== 'apuesta') return Promise.resolve(null);
    if (this.apuesta <= 0) {
      if (this.ultima > 0 && c.cartera.puede(this.ultima)) this.apuesta = this.ultima;
      else {
        c.decir(c.cartera.disponible() < FICHAS[0] ? frase('pobre') : 'Pon alguna ficha en el círculo, que aquí no se fía.', 'aviso');
        c.sonido.play('error');
        return Promise.resolve(null);
      }
    }
    if (!c.cartera.apostar(this.apuesta)) {
      c.decir('No te llega para esa apuesta. Quita alguna ficha.', 'aviso');
      c.sonido.play('error');
      return Promise.resolve(null);
    }
    c.refrescar();
    this.apostado = this.apuesta;
    this.ultima = ultimaRecordada = this.apuesta;
    this.doblada = false;
    this.estado = 'reparto';
    this.cartel.innerHTML = '';
    this.pintarCirculo();
    this.pintarAcciones();
    const prom = new Promise<ManoBJ>((res) => (this.resolverMano = res));
    this.secuenciaReparto(++this.mano);
    return prom;
  }

  private async secuenciaReparto(id: number) {
    const c = this.ctx;
    if (this.zapato.necesitaBarajar()) {
      const aviso = el('div', 'cc-barajando', '🃏 Barajando el zapato… 🃏');
      this.el.appendChild(aviso);
      c.sonido.barajar();
      c.decir('Un momentito, que barajo. Seis mazos, nada de trampas.');
      this.zapato.barajar();
      await esperar(1100);
      aviso.remove();
      this.pintarZapato();
      if (id !== this.mano) return;
    }
    c.decir(elegir(['Allá van las cartas…', 'Cartas para el señor repartidor…', 'Reparto. Que la suerte te pille confesado.', 'A ver qué nos trae la baraja…']));
    const orden: ['j' | 'b', boolean][] = [['j', false], ['b', false], ['j', false], ['b', true]];
    for (const [q, oculta] of orden) {
      this.dar(q, oculta);
      await esperar(330);
      if (id !== this.mano) return;
    }
    const pBJ = esBlackjack(this.jugador);
    const vis = valorCarta(this.banca[0]);
    const mira = vis >= 10;
    const bBJ = esBlackjack(this.banca);
    if (pBJ || (mira && bBJ)) {
      if (!pBJ) c.decir('La banca mira su carta tapada… ¡Blackjack de la casa! Lo siento, de verdad. Bueno, no mucho.', 'pierde');
      this.estado = 'banca';
      this.pintarAcciones();
      await esperar(400);
      if (id !== this.mano) return;
      this.destapar();
      await esperar(600);
      if (id !== this.mano) return;
      this.terminar(id);
      return;
    }
    if (mira) c.decir('La banca echa un ojo a su carta tapada… Nada. Seguimos: ¿pides o te plantas?');
    else c.decir(elegir(['Tu turno: ¿pides, te plantas o doblas?', '¿Otra carta o te quedas así, valiente?', 'Tú decides. Yo solo reparto (y cobro).']));
    this.estado = 'jugador';
    this.pintarAcciones();
  }

  /** Da una carta a quien toque (con animación desde el zapato). */
  private dar(q: 'j' | 'b', oculta = false) {
    const carta = this.zapato.sacar();
    const mano = q === 'j' ? this.jugador : this.banca;
    const els = q === 'j' ? this.cartasJ : this.cartasB;
    mano.push(carta);
    const d = crearCartaEl(carta, oculta);
    els.push(d);
    this.el.appendChild(d);
    this.colocar(q);
    this.ctx.sonido.play('card');
    if (!ajustes.turbo) {
      const x = parseFloat(d.style.left), y = parseFloat(d.style.top);
      d.animate(
        [{ transform: `translate(${ORIGEN.x - x}px,${ORIGEN.y - y}px) rotate(24deg) scale(.7)` }, { transform: 'none' }],
        { duration: 360, easing: 'cubic-bezier(.2,.9,.3,1.1)' },
      );
    }
    this.pintarTotales();
    this.pintarZapato();
  }

  /** Coloca las cartas de una mano centradas (las que ya estaban se deslizan). */
  private colocar(q: 'j' | 'b') {
    const els = q === 'j' ? this.cartasJ : this.cartasB;
    const n = els.length;
    const ancho = ANCHO + (n - 1) * PASO;
    const x0 = CX - ancho / 2;
    const y = q === 'j' ? Y_JUGADOR : Y_BANCA;
    els.forEach((d, i) => {
      d.style.left = x0 + i * PASO + 'px';
      d.style.top = y + (q === 'j' ? (i % 2) * 3 : 0) + 'px';
      d.style.zIndex = String(10 + i);
    });
  }

  private destapar() {
    const d = this.cartasB[1];
    if (d?.classList.contains('oculta')) {
      d.classList.remove('oculta');
      this.ctx.sonido.play('card', { pitch: 1.2 });
    }
    this.pintarTotales();
  }

  private get oculta(): boolean {
    return !!this.cartasB[1]?.classList.contains('oculta');
  }

  pedir() {
    if (this.estado !== 'jugador') return;
    this.accionPedir(this.mano);
  }

  private async accionPedir(id: number) {
    this.estado = 'reparto'; // bloquea dobles pulsaciones mientras llega la carta
    this.pintarAcciones();
    this.dar('j');
    await esperar(300);
    if (id !== this.mano) return;
    const t = totalMano(this.jugador).t;
    if (t > 21) {
      this.ctx.decir(elegir([`${t}. Te has pasado. Ni que fueras un camión de mudanzas.`, `¡${t}! Eso es pasarse de frenada.`, `${t}… La banca ni se ha tenido que despeinar.`]), 'pierde');
      this.estado = 'banca';
      this.pintarAcciones();
      this.destapar();
      await esperar(700);
      if (id !== this.mano) return;
      this.terminar(id);
      return;
    }
    if (t === 21) {
      this.ctx.decir('¡21! Ahí te quedas, que más no se puede.', 'gana');
      this.estado = 'jugador';
      return this.turnoBanca(id);
    }
    this.estado = 'jugador';
    this.pintarAcciones();
  }

  plantarse() {
    if (this.estado !== 'jugador') return;
    this.turnoBanca(this.mano);
  }

  doblar() {
    if (this.estado !== 'jugador' || this.jugador.length !== 2) return;
    const c = this.ctx;
    if (!c.cartera.puede(this.apostado)) {
      c.decir(`Para doblar necesitas otros ${fmt(this.apostado)}. Y no los tienes.`, 'aviso');
      c.sonido.play('error');
      return;
    }
    if (!c.cartera.apostar(this.apostado)) return;
    this.apostado *= 2;
    this.doblada = true;
    c.refrescar();
    c.sonido.play('chip');
    c.decir(elegir(['¡Doblamos! Una carta y a rezar.', 'Doble o nada. Bueno, doble o menos.', '¡Con dos narices! Una carta más y se acabó.']), 'aviso');
    this.pintarCirculo(true);
    this.accionDoblar(this.mano);
  }

  private async accionDoblar(id: number) {
    this.estado = 'reparto';
    this.pintarAcciones();
    this.dar('j');
    await esperar(450);
    if (id !== this.mano) return;
    if (totalMano(this.jugador).t > 21) {
      this.ctx.decir('Doblaste y te pasaste. Valentía no te falta; suerte, sí.', 'pierde');
      this.estado = 'banca';
      this.destapar();
      await esperar(700);
      if (id !== this.mano) return;
      this.terminar(id);
      return;
    }
    this.estado = 'jugador';
    this.turnoBanca(id);
  }

  /** La banca destapa y pide hasta 17. */
  private async turnoBanca(id: number) {
    if (this.estado !== 'jugador') return;
    this.estado = 'banca';
    this.pintarAcciones();
    await esperar(250);
    if (id !== this.mano) return;
    this.destapar();
    await esperar(650);
    if (id !== this.mano) return;
    while (bancaPide(this.banca)) {
      this.ctx.decir(elegir(['La banca pide…', 'Carta para la casa…', 'La banca tiene ' + totalMano(this.banca).t + '. Pide.']));
      this.dar('b');
      await esperar(700);
      if (id !== this.mano) return;
    }
    this.terminar(id);
  }

  /** Liquida la mano y lo cuenta. */
  private terminar(id: number) {
    if (id !== this.mano || this.estado === 'fin' || this.estado === 'apuesta') return;
    const c = this.ctx;
    this.destapar();
    const { res, pago } = liquidar(this.jugador, this.banca, this.apostado);
    if (pago > 0) c.cartera.cobrar(pago);
    const neto = pago - this.apostado;
    const fama = c.cartera.fama(neto);
    c.refrescar();
    this.estado = 'fin';
    const pt = totalMano(this.jugador).t, bt = totalMano(this.banca).t;
    const turbo = ajustes.turbo;
    let cls = 'pierde', grande = '', peque = '';
    switch (res) {
      case 'blackjack':
        cls = 'bj';
        grande = `¡BLACKJACK! +${fmt(neto)}`;
        peque = 'Paga 3 a 2';
        c.decir(frase('gana') + (fama ? ' (+10 de FAMA)' : ''), 'jackpot');
        if (!turbo) {
          c.sonido.play('bell');
          c.sonido.play('cheer');
          c.sonido.monedas(10);
          c.confeti(140);
          c.fiesta(2000);
        }
        this.cartasJ.forEach((d) => d.classList.add('brilla'));
        break;
      case 'gana':
      case 'bancaPasa':
        cls = 'gana';
        grande = res === 'bancaPasa' ? `¡LA BANCA SE PASA! +${fmt(neto)}` : `¡GANAS! +${fmt(neto)}`;
        peque = res === 'bancaPasa' ? `La banca se va a ${bt}` : `Tú ${pt} · Banca ${bt}`;
        c.decir(frase('gana') + (fama ? ' (+10 de FAMA)' : ''), 'gana');
        if (!turbo) {
          c.sonido.play('success', { volume: 0.7 });
          c.sonido.monedas(Math.min(12, 3 + Math.round(neto / 50)));
          if (neto >= 1000) {
            c.confeti(120);
            c.fiesta(1800);
            c.sonido.play('cheer');
          }
        }
        this.cartasJ.forEach((d) => d.classList.add('brilla'));
        break;
      case 'empate':
        cls = 'empate';
        grande = 'EMPATE';
        peque = `Te devolvemos ${fmt(pago)}`;
        c.decir(frase('empate'));
        if (!turbo) c.sonido.play('coin');
        break;
      case 'tePasas':
        grande = 'TE HAS PASADO';
        peque = `${pt}. Pierdes ${fmt(this.apostado)}`;
        c.decir(frase('pierde'), 'pierde');
        if (!turbo) c.sonido.play('fail', { volume: 0.5 });
        break;
      case 'bancaBJ':
        grande = 'BLACKJACK DE LA BANCA';
        peque = `Pierdes ${fmt(this.apostado)}`;
        this.cartasB.forEach((d) => d.classList.add('brilla'));
        if (!turbo) c.sonido.play('boo', { volume: 0.6 });
        break;
      default:
        grande = 'PIERDES';
        peque = `Banca ${bt} · Tú ${pt}`;
        c.decir(frase('pierde'), 'pierde');
        if (!turbo) c.sonido.play('fail', { volume: 0.5 });
    }
    this.cartel.innerHTML = '';
    const d = el('div', cls);
    d.textContent = grande;
    const s = el('small');
    s.textContent = peque;
    d.appendChild(s);
    this.cartel.appendChild(d);
    // las fichas: se las lleva la banca o vienen hacia ti
    if (!turbo) {
      const m = this.circulo.querySelector('.cc-monton') as HTMLElement | null;
      if (m) {
        if (pago > 0) {
          this.circulo.innerHTML = '';
          const nuevo = crearMonton(pago);
          this.circulo.appendChild(nuevo);
          nuevo.animate([{ transform: 'scale(.6)', filter: 'brightness(2)' }, { transform: 'scale(1.15)' }, { transform: 'none' }], { duration: 450, easing: 'ease-out' });
        } else {
          m.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(-300px) scale(.6)', opacity: 0 }], { duration: 650, easing: 'ease-in', fill: 'forwards' });
        }
      }
    } else this.pintarCirculo();
    this.pintarTotales();
    this.pintarAcciones();
    this.refrescarFichas();
    const mano: ManoBJ = { jugador: [...this.jugador], banca: [...this.banca], apostado: this.apostado, res, pago, neto, doblada: this.doblada };
    this.ultimaMano = mano;
    const r = this.resolverMano;
    this.resolverMano = null;
    r?.(mano);
  }

  // ─────────── pintar ───────────

  private pintarCirculo(pop = false) {
    this.circulo.innerHTML = '';
    const v = this.estado === 'apuesta' ? this.apuesta : this.apostado;
    if (v > 0 && this.estado !== 'fin') {
      const m = crearMonton(v);
      this.circulo.appendChild(m);
      if (pop && !ajustes.turbo) m.animate([{ transform: 'translateY(-20px) scale(1.2)' }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,1.6,.4,1)' });
    } else if (this.estado === 'apuesta') {
      this.circulo.appendChild(el('div', 'vacio', 'TU<br>APUESTA'));
    }
    this.refrescarFichas();
  }

  private refrescarFichas() {
    const base = this.estado === 'apuesta' ? this.apuesta : 0;
    const d = this.ctx.cartera.disponible() - base;
    this.fichasEl.forEach((f) => f.classList.toggle('no', Number(f.dataset.valor) > d));
  }

  private pintarTotales() {
    const pinta = (tot: HTMLDivElement, mano: Carta[], y: number, banca: boolean) => {
      if (!mano.length) {
        tot.style.opacity = '0';
        return;
      }
      tot.style.opacity = '1';
      const n = mano.length;
      const x0 = CX - (ANCHO + (n - 1) * PASO) / 2;
      tot.style.left = x0 - 70 + 'px';
      tot.style.top = y + 50 + 'px';
      tot.className = 'cc-bj-total';
      if (banca && this.oculta) {
        tot.textContent = valorCarta(mano[0]) + ' + ?';
        return;
      }
      const { t, blanda } = totalMano(mano);
      if (esBlackjack(mano)) {
        tot.textContent = 'BJ';
        tot.classList.add('bj');
      } else if (t > 21) {
        tot.textContent = String(t);
        tot.classList.add('pasa');
      } else tot.textContent = blanda && t < 21 ? `${t - 10}/${t}` : String(t);
    };
    pinta(this.totB, this.banca, Y_BANCA, true);
    pinta(this.totJ, this.jugador, Y_JUGADOR, false);
  }

  private pintarZapato() {
    this.zapatoTxt.textContent = `Zapato: ${this.zapato.quedan} cartas`;
  }

  private pintarAcciones() {
    const a = this.acciones;
    a.innerHTML = '';
    this.botones.clear();
    const add = (k: string, html: string, cls: string, fn: () => void, ok = true) => {
      const b = boton(html, cls, fn);
      b.disabled = !ok;
      a.appendChild(b);
      this.botones.set(k, b);
    };
    switch (this.estado) {
      case 'apuesta':
        add('repartir', 'REPARTIR <kbd>Espacio</kbd>', 'rosa gordo', () => this.repartir(), this.apuesta > 0 || this.ultima > 0);
        add('quitar', 'Quitar apuesta <kbd>X</kbd>', 'crema', () => this.quitarApuesta(), this.apuesta > 0);
        break;
      case 'jugador': {
        const puedeDoblar = this.jugador.length === 2 && this.ctx.cartera.puede(this.apostado);
        add('pedir', 'PEDIR <kbd>P</kbd>', 'turq', () => this.pedir());
        add('plantarse', 'PLANTARSE <kbd>S</kbd>', 'rosa', () => this.plantarse());
        add('doblar', 'DOBLAR <kbd>D</kbd>', 'morado', () => this.doblar(), puedeDoblar);
        break;
      }
      case 'reparto':
      case 'banca':
        add('pedir', 'PEDIR <kbd>P</kbd>', 'turq', () => {}, false);
        add('plantarse', 'PLANTARSE <kbd>S</kbd>', 'rosa', () => {}, false);
        add('doblar', 'DOBLAR <kbd>D</kbd>', 'morado', () => {}, false);
        break;
      case 'fin':
        add('otra', `OTRA MANO <kbd>Espacio</kbd><small>Misma apuesta: ${fmt(this.ultima)}</small>`, 'rosa gordo', () => this.repartir(), this.ctx.cartera.puede(this.ultima));
        add('cambiar', 'Cambiar apuesta <kbd>X</kbd>', 'crema', () => this.quitarApuesta());
        break;
    }
  }

  // ─────────── pantalla ───────────

  ocupado() {
    return this.estado === 'reparto' || this.estado === 'jugador' || this.estado === 'banca';
  }

  tick() {}

  tecla(e: KeyboardEvent): boolean {
    if (e.repeat && e.code !== 'KeyP') return true;
    switch (e.code) {
      case 'Space':
      case 'Enter':
      case 'NumpadEnter':
        if (this.estado === 'apuesta' || this.estado === 'fin') this.repartir();
        else if (this.estado === 'jugador' && e.code !== 'Space') this.plantarse();
        return true;
      case 'KeyP':
      case 'ArrowUp':
        this.pedir();
        return true;
      case 'KeyS':
      case 'ArrowDown':
        this.plantarse();
        return true;
      case 'KeyD':
        this.doblar();
        return true;
      case 'KeyX':
      case 'Backspace':
      case 'Delete':
        this.quitarApuesta();
        return true;
      case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4':
      case 'Numpad1': case 'Numpad2': case 'Numpad3': case 'Numpad4':
        this.sumar(FICHAS[Number(e.code.slice(-1)) - 1]);
        return true;
    }
    return false;
  }

  /** Cierre forzado: termina la mano al instante (te plantas) y paga lo que toque. */
  resolverYa() {
    if (!this.ocupado()) return;
    const id = ++this.mano; // cancela lo que estuviera animándose
    const turbo = ajustes.turbo;
    ajustes.turbo = true;
    try {
      while (this.jugador.length < 2 || this.banca.length < 2) {
        if (this.jugador.length <= this.banca.length) this.dar('j');
        else this.dar('b', this.banca.length === 1);
      }
      const pBJ = esBlackjack(this.jugador);
      if (!pBJ && totalMano(this.jugador).t <= 21 && !esBlackjack(this.banca)) while (bancaPide(this.banca)) this.dar('b');
      this.estado = 'banca';
      this.terminar(id);
    } finally {
      ajustes.turbo = turbo;
    }
  }

  destruir() {
    this.resolverYa();
  }

  /** Para pruebas: cartas que saldrán del zapato. */
  forzarCartas(txt: string[]) {
    const palos: Record<string, number> = { '♠': 0, '♥': 1, '♦': 2, '♣': 3, p: 0, c: 1, d: 2, t: 3 };
    const rangos: Record<string, number> = { A: 1, J: 11, Q: 12, K: 13 };
    this.zapato.forzadas = txt.map((s) => {
      const p = palos[s.slice(-1)] ?? 0;
      const rr = s.slice(0, -1);
      return { r: rangos[rr] ?? Number(rr), p };
    });
  }

  describir(): string {
    return `Tú: ${this.jugador.map(nombreCarta).join(' ')} (${totalMano(this.jugador).t}) · Banca: ${this.banca.map(nombreCarta).join(' ')} (${totalMano(this.banca).t})`;
  }
}
