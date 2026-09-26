// Banco de pruebas del casino: mundo provisional, 5.000 € en efectivo y el casino abierto.
// ?juego=slots|roulette|blackjack abre directamente un juego.
// En window.__casino hay funciones para jugar desde las pruebas (captura.mjs con eval/log).
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../core/game';
import { installDebug } from '../core/debug';
import { buildPlaceholderWorld } from '../world/placeholder';
import { Economy } from '../gameplay/economy';
import { AudioEngine } from '../audio/audio';
import { openCasino, openCasinoGame, closeCasino, isCasinoOpen, type Casino, type Juego } from '../gameplay/casino';
import { FICHAS } from '../gameplay/casino/comun';
import { rtpTragaperras, evaluar, TIRAS, N, type Sim, type Tragaperras } from '../gameplay/casino/tragaperras';
import { ORDEN, simular as simularBola, type Ruleta } from '../gameplay/casino/ruleta';
import { totalMano, type Blackjack } from '../gameplay/casino/blackjack';
import type { Carta } from '../gameplay/casino/cartas';

// Contador de fuentes de audio (para ver que se liberan)
const audioCont = { creadas: 0, vivas: 0 };
{
  const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
  if (AC) {
    for (const m of ['createOscillator', 'createBufferSource'] as const) {
      const orig = (AC.prototype as any)[m];
      (AC.prototype as any)[m] = function (this: AudioContext, ...a: unknown[]) {
        const n = orig.apply(this, a);
        audioCont.creadas++;
        audioCont.vivas++;
        n.addEventListener('ended', () => audioCont.vivas--);
        return n;
      };
    }
  }
}

const esperarMs = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await RAPIER.init();
  document.getElementById('carga')?.remove();
  const game = new Game(document.getElementById('app')!, document.getElementById('ui')!);
  game.world = buildPlaceholderWorld(game);
  installDebug(game);
  game.scene.background = new THREE.Color('#9fd3ff');
  game.scene.add(new THREE.HemisphereLight('#fff2d0', '#5a3a7a', 1.3));
  const sun = new THREE.DirectionalLight('#ffffff', 1.8);
  sun.position.set(30, 50, 20);
  game.scene.add(sun);
  game.camera.position.set(0, 12, 30);
  game.camera.lookAt(0, 0, 0);
  const eco = new Economy(game);
  eco.cash = 5000;
  eco.bank = 0;
  const audio = new AudioEngine(game);
  game.addSystem(eco);
  game.addSystem(audio);
  game.start();
  audio.ensure();

  const params = new URLSearchParams(location.search);
  const juego = params.get('juego') as Juego | null;
  const reabrir = document.getElementById('reabrir') as HTMLButtonElement;
  const alCerrar = () => {
    reabrir.style.display = 'block';
  };
  reabrir.onclick = () => {
    reabrir.style.display = 'none';
    openCasino(game, alCerrar);
  };
  if (juego === 'slots' || juego === 'roulette' || juego === 'blackjack') openCasinoGame(game, juego, alCerrar);
  else openCasino(game, alCerrar);

  const casino = () => game.mod.casino as Casino;
  const pant = <T>() => casino().pantalla as unknown as T;
  const dinero = () => eco.cash + eco.bank;
  const ir = (j: Juego) => {
    if (!isCasinoOpen(game)) openCasinoGame(game, j, alCerrar);
    else if (casino().actual !== j) casino().ir(j);
  };

  // ─────────── comprobaciones independientes ───────────

  const rojos = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  /** Pago esperado de la ruleta calculado a mano (sin usar el código del casino). */
  function pagoRuletaEsperado(apuestas: [string, number][], n: number): number {
    let p = 0;
    for (const [id, v] of apuestas) {
      let ok = false, x = 1;
      if (/^n\d+$/.test(id)) {
        ok = Number(id.slice(1)) === n;
        x = 35;
      } else if (n !== 0) {
        if (id === 'rojo') ok = rojos.includes(n);
        if (id === 'negro') ok = !rojos.includes(n);
        if (id === 'par') ok = n % 2 === 0;
        if (id === 'impar') ok = n % 2 === 1;
        if (id === 'bajo') ok = n >= 1 && n <= 18;
        if (id === 'alto') ok = n >= 19 && n <= 36;
        if (id.startsWith('doc')) {
          const d = Number(id.slice(3));
          ok = n > (d - 1) * 12 && n <= d * 12;
          x = 2;
        }
        if (id.startsWith('col')) {
          const c = Number(id.slice(3));
          ok = (n - c) % 3 === 0;
          x = 2;
        }
      }
      if (ok) p += v * (x + 1);
    }
    return p;
  }
  function valorBJ(m: Carta[]): number {
    let t = 0, a = 0;
    for (const c of m) {
      t += c.r === 1 ? 11 : c.r > 10 ? 10 : c.r;
      if (c.r === 1) a++;
    }
    while (t > 21 && a) {
      t -= 10;
      a--;
    }
    return t;
  }
  function pagoBJEsperado(j: Carta[], b: Carta[], apostado: number): number {
    const pbj = j.length === 2 && valorBJ(j) === 21, bbj = b.length === 2 && valorBJ(b) === 21;
    if (pbj && bbj) return apostado;
    if (pbj) return apostado * 1.5 + apostado;
    if (bbj) return 0;
    const pt = valorBJ(j);
    if (pt > 21) return 0;
    const bt = valorBJ(b);
    if (bt > 21 || pt > bt) return apostado * 2;
    if (pt === bt) return apostado;
    return 0;
  }

  /** Premio de la tragaperras según la tabla (sin usar el código del casino). */
  function multEsperado(l: string[]): number {
    const [a, b, c] = l;
    const trio: Record<string, number> = { '7': 300, M: 100, S: 40, B: 15, P: 10, C: 10, D: -1 };
    if (a === b && b === c) return trio[a];
    if (l.every((x) => x === 'M' || x === 'S' || x === '7')) return 5;
    if (l.includes('D')) return 0;
    const cer = l.filter((x) => x === 'C').length;
    return cer === 2 ? 2 : cer === 1 ? 1 : 0;
  }

  const IDS_RULETA = ['rojo', 'negro', 'par', 'impar', 'bajo', 'alto', 'doc1', 'doc2', 'doc3', 'col1', 'col2', 'col3', 'n0', 'n7', 'n17', 'n32'];
  const azar = <T>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];

  /** Juega n veces seguidas (modo turbo) y comprueba que el dinero cuadra siempre. */
  async function simular(j: Juego, n = 50) {
    ir(j);
    casino().setTurbo(true);
    const errores: string[] = [];
    const inicio = dinero();
    let apostado = 0, cobrado = 0, jugadas = 0, minimo = inicio;
    const comprobar = (antes: number, esperado: number, que: string) => {
      const d = dinero();
      if (!Number.isFinite(eco.cash) || !Number.isFinite(eco.bank)) errores.push(`${que}: NaN/Infinity`);
      if (eco.cash < 0 || eco.bank < 0) errores.push(`${que}: dinero negativo (${eco.cash}, ${eco.bank})`);
      if (Math.abs(d - esperado) > 0.001) errores.push(`${que}: no cuadra: antes ${antes}, esperado ${esperado}, hay ${d}`);
      minimo = Math.min(minimo, d);
    };
    try {
      for (let i = 0; i < n; i++) {
        const disp = dinero();
        const posibles = FICHAS.filter((v) => v <= disp);
        if (!posibles.length) break;
        const antes = dinero();
        if (j === 'slots') {
          const t = pant<Tragaperras>();
          t.elegirFicha(azar(posibles));
          const r = await t.girar();
          if (!r) {
            errores.push('tragaperras: no ha girado');
            continue;
          }
          const m = multEsperado(r.simbolos);
          if (evaluar(r.simbolos).mult !== m) errores.push(`tragaperras: ${r.simbolos.join('')} evalúa ${evaluar(r.simbolos).mult}, tabla ${m}`);
          if (r.pago !== r.apuesta * Math.max(0, m)) errores.push(`tragaperras: ${r.simbolos.join('')} paga ${r.pago}, debería ${r.apuesta * Math.max(0, m)}`);
          if (m === -1 && antes - r.apuesta >= r.apuesta && r.extra !== r.apuesta) errores.push('tragaperras: emboscada sin quitar la apuesta');
          if (m !== -1 && r.extra !== 0) errores.push('tragaperras: quita dinero sin emboscada');
          apostado += r.apuesta + r.extra;
          cobrado += r.pago;
          comprobar(antes, antes - r.apuesta - r.extra + r.pago, `tirada ${i}`);
        } else if (j === 'roulette') {
          const ru = pant<Ruleta>();
          ru.borrar();
          const k = 1 + Math.floor(Math.random() * 4);
          for (let q = 0; q < k; q++) ru.poner(azar(IDS_RULETA), azar(FICHAS.filter((v) => v <= 100)));
          if (ru.total <= 0) continue;
          const r = await ru.girar();
          if (!r) {
            errores.push('ruleta: no ha girado');
            continue;
          }
          const esperado = pagoRuletaEsperado(r.apuestas, r.numero);
          if (esperado !== r.pagado) errores.push(`ruleta: sale ${r.numero}, paga ${r.pagado}, debería ${esperado} (${JSON.stringify(r.apuestas)})`);
          if (r.numero < 0 || r.numero > 36) errores.push('ruleta: número imposible ' + r.numero);
          apostado += r.apostado;
          cobrado += r.pagado;
          comprobar(antes, antes - r.apostado + r.pagado, `tirada ${i}`);
        } else {
          const bj = pant<Blackjack>();
          if (bj.estado === 'fin') bj.quitarApuesta();
          bj.sumar(azar(posibles.filter((v) => v <= 100).length ? posibles.filter((v) => v <= 100) : posibles));
          const prom = bj.repartir();
          let vueltas = 0;
          let fin = false;
          prom.then(() => (fin = true));
          while (!fin && vueltas++ < 200) {
            await esperarMs(0);
            if (bj.estado === 'jugador') {
              const t = totalMano(bj.jugador).t;
              if (bj.jugador.length === 2 && (t === 10 || t === 11) && Math.random() < 0.6) bj.doblar();
              else if (t < 17) bj.pedir();
              else bj.plantarse();
            }
          }
          const r = await prom;
          if (!r) {
            errores.push('blackjack: no se ha repartido');
            continue;
          }
          const esperado = pagoBJEsperado(r.jugador, r.banca, r.apostado);
          if (Math.abs(esperado - r.pago) > 0.001) errores.push(`blackjack: paga ${r.pago}, debería ${esperado} (${bj.describir()})`);
          // la banca: pide con 16 o menos, se planta con 17
          const pbj = r.jugador.length === 2 && valorBJ(r.jugador) === 21;
          const bbj = r.banca.length === 2 && valorBJ(r.banca) === 21;
          if (!pbj && !bbj && valorBJ(r.jugador) <= 21) {
            if (valorBJ(r.banca) < 17) errores.push('blackjack: la banca se planta con menos de 17');
            for (let k = 3; k <= r.banca.length; k++) if (valorBJ(r.banca.slice(0, k - 1)) >= 17) errores.push('blackjack: la banca pide teniendo 17 o más');
          }
          apostado += r.apostado;
          cobrado += r.pago;
          comprobar(antes, antes - r.apostado + r.pago, `mano ${i}`);
        }
        jugadas++;
      }
    } catch (e: any) {
      errores.push('excepción: ' + (e?.stack || e));
    }
    casino().setTurbo(false);
    return {
      juego: j,
      jugadas,
      inicio,
      final: dinero(),
      efectivo: eco.cash,
      banco: eco.bank,
      minimo,
      apostado,
      cobrado,
      devolucion: apostado ? +(cobrado / apostado).toFixed(3) : null,
      errores: errores.slice(0, 10),
      nErrores: errores.length,
    };
  }

  (window as any).__casino = {
    game,
    eco,
    audio: () => ({ estado: audio.ctx?.state ?? 'sin contexto', ...audioCont, casinoVivas: casino()?.sonido.vivas }),
    estado: () => ({
      abierto: isCasinoOpen(game),
      pantalla: casino()?.actual,
      efectivo: eco.cash,
      banco: eco.bank,
      visita: casino()?.cartera.neto,
      ocupado: casino()?.pantalla?.ocupado() ?? false,
      paused: game.paused,
      menuOpen: (game as any).menuOpen,
      input: game.input.enabled,
      hud: game.hud.visible,
      renderRestaurado: !Object.prototype.hasOwnProperty.call(game, 'render'),
      fama: eco.fame,
    }),
    rtp: () => rtpTragaperras(),
    abrir: (j?: Juego) => (j ? openCasinoGame(game, j, alCerrar) : openCasino(game, alCerrar)),
    cerrar: () => closeCasino(game),
    ir,
    turbo: (on = true) => casino().setTurbo(on),
    simular,
    /** Tragaperras: apuesta y gira (forzar: p.ej. ['7','7','7']). */
    tragaperras: async (apuesta = 10, forzar?: Sim[]) => {
      ir('slots');
      const t = pant<Tragaperras>();
      t.elegirFicha(apuesta);
      return t.girar(forzar);
    },
    /** Ruleta: pone apuestas [[id, cantidad]...] y gira (numero opcional para forzar). */
    ruleta: async (apuestas: [string, number][], numero?: number) => {
      ir('roulette');
      const r = pant<Ruleta>();
      r.borrar();
      for (const [id, v] of apuestas) r.poner(id, v);
      return r.girar(numero);
    },
    ponerRuleta: (id: string, v: number) => {
      ir('roulette');
      return pant<Ruleta>().poner(id, v);
    },
    /** Blackjack: apuesta y reparte (cartas opcionales: ['10♠','6♥','A♣','K♦', ...] en orden j, b, j, b, ...). */
    blackjack: (apuesta = 50, cartas?: string[]) => {
      ir('blackjack');
      const b = pant<Blackjack>();
      if (b.estado === 'fin') b.quitarApuesta();
      if (cartas) b.forzarCartas(cartas);
      b.sumar(apuesta);
      b.repartir();
      return true;
    },
    pedir: () => pant<Blackjack>().pedir(),
    plantarse: () => pant<Blackjack>().plantarse(),
    doblar: () => pant<Blackjack>().doblar(),
    bj: () => {
      const b = pant<Blackjack>();
      return { estado: b.estado, mano: b.describir(), ultima: b.ultimaMano };
    },
    /** Simula muchas tiradas de la bola y comprueba que siempre acaba en el número pedido. */
    bola: (n = 300) => {
      const SEG = (Math.PI * 2) / 37;
      let mal = 0, tMin = 99, tMax = 0, tSum = 0, golpesSum = 0, rMin = 9, rMax = 0;
      for (let i = 0; i < n; i++) {
        const obj = Math.floor(Math.random() * 37);
        const tr = simularBola(Math.random() * 6.28, obj);
        const idx = (((Math.round(tr.relFinal / SEG) % 37) + 37) % 37);
        if (idx !== obj) mal++;
        tMin = Math.min(tMin, tr.tFijo);
        tMax = Math.max(tMax, tr.tFijo);
        tSum += tr.tFijo;
        golpesSum += tr.golpes.length;
        for (const r of tr.rad) {
          rMin = Math.min(rMin, r);
          rMax = Math.max(rMax, r);
        }
      }
      return { n, mal, tFijoMin: +tMin.toFixed(2), tFijoMax: +tMax.toFixed(2), tFijoMedio: +(tSum / n).toFixed(2), golpesMedios: +(golpesSum / n).toFixed(1), rMin: +rMin.toFixed(3), rMax: +rMax.toFixed(3) };
    },
    /** Comprueba que las tiras tienen lo que dicen. */
    tiras: () => TIRAS.map((t) => t.join('')).concat([String(N), String(ORDEN.length)]),
  };
  // atajos que pide el encargo
  (window as any).__apostar = (cant: number, id?: string) => {
    const c = casino();
    if (c.actual === 'roulette') return pant<Ruleta>().poner(id ?? 'rojo', cant);
    if (c.actual === 'blackjack') return pant<Blackjack>().sumar(cant);
    if (c.actual === 'slots') {
      pant<Tragaperras>().elegirFicha(cant);
      return true;
    }
    return false;
  };
  (window as any).__girar = () => {
    const c = casino();
    if (c.actual === 'roulette') return pant<Ruleta>().girar();
    if (c.actual === 'blackjack') return pant<Blackjack>().repartir();
    if (c.actual === 'slots') return pant<Tragaperras>().girar();
    return null;
  };
  (window as any).__ready = true;
}

main().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#fff;position:fixed;top:0;left:0;z-index:999">${String(e?.stack || e)}</pre>`);
});
