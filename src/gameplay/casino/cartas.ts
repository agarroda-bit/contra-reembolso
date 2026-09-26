// Naipes franceses dibujados con CSS (sin imágenes): índices, pips colocados como en una baraja
// de verdad, figuras con su personaje y dorso con el logo del casino.
import { el } from './comun';

export interface Carta {
  /** 1 = As, 11 = J, 12 = Q, 13 = K */
  r: number;
  /** 0 ♠, 1 ♥, 2 ♦, 3 ♣ */
  p: number;
}

const VS15 = String.fromCharCode(0xfe0e); // forzar el símbolo como texto (no emoji)
export const PALOS = ['♠', '♥', '♦', '♣'];
export const NOMBRE_PALO = ['picas', 'corazones', 'diamantes', 'tréboles'];
const RANGOS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const FIGURAS: Record<number, [string, string]> = { 11: ['💂', 'JOTA'], 12: ['👸', 'REINA'], 13: ['🤴', 'REY'] };

// posiciones de los pips (x en %, y de 0 a 1 dentro de la zona central)
const L = 36, C = 50, R = 64;
const PIPS: Record<number, [number, number][]> = {
  2: [[C, 0], [C, 1]],
  3: [[C, 0], [C, 0.5], [C, 1]],
  4: [[L, 0], [R, 0], [L, 1], [R, 1]],
  5: [[L, 0], [R, 0], [C, 0.5], [L, 1], [R, 1]],
  6: [[L, 0], [R, 0], [L, 0.5], [R, 0.5], [L, 1], [R, 1]],
  7: [[L, 0], [R, 0], [C, 0.25], [L, 0.5], [R, 0.5], [L, 1], [R, 1]],
  8: [[L, 0], [R, 0], [C, 0.25], [L, 0.5], [R, 0.5], [C, 0.75], [L, 1], [R, 1]],
  9: [[L, 0], [R, 0], [L, 1 / 3], [R, 1 / 3], [C, 0.5], [L, 2 / 3], [R, 2 / 3], [L, 1], [R, 1]],
  10: [[L, 0], [R, 0], [C, 1 / 6], [L, 1 / 3], [R, 1 / 3], [L, 2 / 3], [R, 2 / 3], [C, 5 / 6], [L, 1], [R, 1]],
};

export function valorCarta(c: Carta): number {
  return c.r === 1 ? 11 : Math.min(10, c.r);
}

export function nombreCarta(c: Carta): string {
  return RANGOS[c.r] + PALOS[c.p];
}

/** Crea el elemento de una carta (boca abajo si `oculta`). */
export function crearCartaEl(c: Carta, oculta = false): HTMLDivElement {
  const roja = c.p === 1 || c.p === 2;
  const d = el('div', 'cc-carta' + (roja ? ' roja' : '') + (oculta ? ' oculta' : ''));
  const palo = PALOS[c.p] + VS15;
  const rango = RANGOS[c.r];
  let centro = '';
  if (c.r === 1) centro = `<div class="as">${palo}</div>`;
  else if (c.r >= 11) {
    const [emo, nom] = FIGURAS[c.r];
    centro = `<div class="figura"><span>${emo}</span><b>${nom} ${palo}</b></div>`;
  } else {
    for (const [x, f] of PIPS[c.r]) {
      const y = 21 + f * 58; // % de la altura
      centro += `<div class="pip${f > 0.5 ? ' inv' : ''}" style="left:${x}%;top:${y}%">${palo}</div>`;
    }
  }
  d.innerHTML = `<div class="gira"><div class="cara">
      <div class="esq a"><span>${rango}</span><i>${palo}</i></div>${centro}
      <div class="esq b"><span>${rango}</span><i>${palo}</i></div></div>
    <div class="dorso"><i>📦</i></div></div>`;
  d.title = `${rango} de ${NOMBRE_PALO[c.p]}`;
  return d;
}
