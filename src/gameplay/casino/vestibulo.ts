// Vestíbulo del casino: cartel de neón con bombillas y las tres mesas para elegir.
import { Crupier, el, elegir, fmt, frase, type Juego } from './comun';
import { crearCartaEl } from './cartas';
import { TRIO } from './tragaperras';
import { MAX_MESA } from './ruleta';
import { MAX_MANO } from './blackjack';
import type { CtxCasino, PantallaCasino } from './tipos';

const SALUDOS = [
  '¡Bienvenido a La Suerte Loca! Aquí el que no juega no pierde… pero tampoco se divierte.',
  'Pasa, pasa. La moqueta es de 1987, pero las máquinas pagan. A veces.',
  '¿Vienes a gastarte lo del reparto? Estás en tu casa. Bueno, en la mía.',
  'Buenas noches, caballero repartidor. ¿Tragaperras, ruleta o cartas?',
];

const JUEGOS: { id: Juego; nombre: string; desc: string; pie: string; etiqueta: string }[] = [
  {
    id: 'slots',
    nombre: 'Tragaperras «La Paquetera»',
    desc: `Tres rodillos, una palanca y mucha fe. Jackpot de ×${TRIO['7']}… y Los Devueltos rondando la línea.`,
    pie: 'Tirada 10–500 €',
    etiqueta: '¡JACKPOT!',
  },
  {
    id: 'roulette',
    nombre: 'Ruleta «La Loca»',
    desc: 'Ruleta europea de las de verdad: pleno, rojo o negro, par o impar, docenas… Hagan juego.',
    pie: `Mesa hasta ${fmt(MAX_MESA)}`,
    etiqueta: 'Pleno 35 a 1',
  },
  {
    id: 'blackjack',
    nombre: 'Blackjack «El 21 del Puerto»',
    desc: 'Pide, plántate o dobla. La banca se planta con 17 y el blackjack paga 3 a 2.',
    pie: `Mano 10–${fmt(MAX_MANO)}`,
    etiqueta: 'Paga 3 a 2',
  },
];

export class Vestibulo implements PantallaCasino {
  readonly el: HTMLDivElement;
  readonly titulo = 'Vestíbulo';
  private tarjetas: HTMLDivElement[] = [];
  private foco = -1;
  private crupier: Crupier;

  constructor(private ctx: CtxCasino) {
    this.el = el('div', 'cc-vestibulo');
    // cartel de neón con bombillas alrededor
    const cartel = el('div', 'cc-cartel');
    const luces = el('div', 'luces');
    const W = 780, H = 170;
    for (let x = 22; x <= W - 22; x += 26) {
      luces.appendChild(this.bombilla(x, 11));
      luces.appendChild(this.bombilla(x, H - 11));
    }
    for (let y = 37; y <= H - 37; y += 26) {
      luces.appendChild(this.bombilla(11, y));
      luces.appendChild(this.bombilla(W - 11, y));
    }
    cartel.appendChild(luces);
    cartel.insertAdjacentHTML('beforeend', '<h1>La Suerte Loca</h1><p>CASINO · PUERTO PAQUETE · ABIERTO 25 HORAS</p>');
    this.el.appendChild(cartel);
    // las tres mesas
    const fila = el('div', 'cc-juegos');
    JUEGOS.forEach((j, i) => {
      const t = el('div', 'cc-juego');
      const arte = el('div', 'arte');
      this.arte(j.id, arte);
      t.appendChild(arte);
      const et = el('div', 'etiqueta');
      et.textContent = j.etiqueta;
      t.appendChild(et);
      const info = el('div', 'info');
      const h = el('h2');
      h.textContent = j.nombre;
      const p = el('p');
      p.textContent = j.desc;
      const pie = el('div', 'pie', `<span></span><kbd>${i + 1}</kbd>`);
      (pie.querySelector('span') as HTMLElement).textContent = j.pie;
      info.append(h, p, pie);
      t.appendChild(info);
      t.addEventListener('mouseenter', () => this.enfocar(i, false));
      t.addEventListener('click', (e) => {
        e.stopPropagation();
        this.entrar(i);
      });
      this.tarjetas.push(t);
      fila.appendChild(t);
    });
    this.el.appendChild(fila);
    this.crupier = new Crupier(ctx.cartera.disponible() < 10 ? frase('pobre') : elegir(SALUDOS));
    const cru = el('div', 'cc-vest-crupier');
    cru.appendChild(this.crupier.el);
    this.el.appendChild(cru);
    this.el.appendChild(el('div', 'cc-aviso-juego', 'Juega con cabeza: la casa siempre gana (casi siempre).'));
    this.ctx.teclas('<span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd>Elegir juego</span><span><kbd>←</kbd><kbd>→</kbd>Mover</span><span><kbd>Enter</kbd>Jugar</span><span><kbd>Esc</kbd> o <kbd>E</kbd> Salir a la calle</span>');
  }

  private bombilla(x: number, y: number): HTMLElement {
    const i = el('i');
    i.style.left = x + 'px';
    i.style.top = y + 'px';
    return i;
  }

  private arte(id: Juego, a: HTMLDivElement) {
    if (id === 'slots') {
      a.className = 'arte cc-arte-tragaperras';
      a.innerHTML = '<div class="mini"><b><span class="cc-siete">7</span></b><b>📦</b><b>🍒</b></div>';
    } else if (id === 'roulette') {
      a.className = 'arte cc-arte-ruleta';
      a.innerHTML = '<div class="rueda"></div>';
    } else {
      a.className = 'arte cc-arte-blackjack';
      const c1 = crearCartaEl({ r: 1, p: 0 });
      const c2 = crearCartaEl({ r: 13, p: 1 });
      c1.style.cssText = 'left:104px;top:22px;transform:rotate(-10deg)';
      c2.style.cssText = 'left:150px;top:18px;transform:rotate(8deg)';
      a.append(c1, c2);
    }
  }

  private enfocar(i: number, sonar = true) {
    this.foco = i;
    this.tarjetas.forEach((t, k) => t.classList.toggle('foco', k === i));
    if (sonar) this.ctx.sonido.play('click', { volume: 0.5 });
  }

  private entrar(i: number) {
    const j = JUEGOS[i];
    if (!j) return;
    this.ctx.sonido.play('chip');
    this.ctx.ir(j.id);
  }

  ocupado() {
    return false;
  }

  tecla(e: KeyboardEvent): boolean {
    switch (e.code) {
      case 'Digit1': case 'Digit2': case 'Digit3':
      case 'Numpad1': case 'Numpad2': case 'Numpad3':
        this.entrar(Number(e.code.slice(-1)) - 1);
        return true;
      case 'ArrowLeft':
        this.enfocar(this.foco <= 0 ? 2 : this.foco - 1);
        return true;
      case 'ArrowRight':
        this.enfocar(this.foco < 0 || this.foco >= 2 ? 0 : this.foco + 1);
        return true;
      case 'Enter':
      case 'NumpadEnter':
      case 'Space':
        if (this.foco >= 0) this.entrar(this.foco);
        else this.enfocar(0);
        return true;
    }
    return false;
  }

  tick() {}
  resolverYa() {}
  destruir() {}
}
