// Bocadillos de diálogo sobre la cabeza de la gente, y números que saltan ("+45 €").
import * as THREE from 'three';
import type { Game, System } from '../core/game';
import { fmt } from '../gameplay/economy';

interface Bubble {
  el: HTMLDivElement;
  target: { position: THREE.Vector3 } | THREE.Vector3;
  t: number;
  life: number;
  offsetY: number;
  /** Número que salta (sube en pantalla y se desvanece) en vez de bocadillo. */
  float: boolean;
  /** Desplazamiento en px (para que dos números seguidos no se pisen). */
  dx: number;
  dy: number;
}

const tmpV = new THREE.Vector3();
/** Huecos para los números que salen seguidos (cobro + propina): cada uno un poco más abajo. */
const FLOAT_DX = [0, -28, 28];
const FLOAT_DY = [0, 50, 100];
const FLOAT_LIFE = 1.9;
/** Cuánto sube (px) el número en pantalla. */
const FLOAT_RISE = 105;

export class Bubbles implements System {
  name = 'bubbles';
  private list: Bubble[] = [];
  private layer: HTMLDivElement;
  private floats = 0;
  private lastT = performance.now();

  constructor(private game: Game) {
    game.mod.bubbles = this;
    this.layer = document.createElement('div');
    this.layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:15;overflow:hidden';
    game.ui.appendChild(this.layer);
    const st = document.createElement('style');
    st.textContent = `
      .cr-bocadillo{position:absolute;left:0;top:0;transform:translate(-50%,-100%);max-width:260px;padding:8px 12px;border-radius:14px;
        background:#ffffff;color:#1b1030;font:700 15px/1.25 system-ui,-apple-system,sans-serif;border:3px solid #1b1030;
        box-shadow:4px 4px 0 rgba(27,16,48,.45);text-align:center;white-space:normal}
      .cr-bocadillo::after{content:'';position:absolute;left:50%;bottom:-11px;margin-left:-8px;border:8px solid transparent;border-top-color:#1b1030}
      .cr-bocadillo.enemigo{background:#6c3bd1;color:#ffd23f}
      .cr-bocadillo.poli{background:#1d3557;color:#ffffff}
      .cr-numero{position:absolute;left:0;top:0;font:italic 900 38px/1 system-ui,-apple-system,sans-serif;letter-spacing:-.02em;color:#5cff8a;
        white-space:nowrap;will-change:transform,opacity;
        -webkit-text-stroke:2px #1b1030;paint-order:stroke fill;
        text-shadow:4px 4px 0 #1b1030,-2px -2px 0 #1b1030,2px -2px 0 #1b1030,-2px 2px 0 #1b1030,0 0 16px rgba(92,255,138,.55)}
      .cr-numero.gordo{font-size:52px;color:#ffd23f;text-shadow:5px 5px 0 #1b1030,-2px -2px 0 #1b1030,2px -2px 0 #1b1030,-2px 2px 0 #1b1030,0 0 22px rgba(255,210,63,.7)}
      .cr-numero.menos{font-size:32px;color:#ff5a7a;text-shadow:3px 3px 0 #1b1030,-2px -2px 0 #1b1030,2px -2px 0 #1b1030,-2px 2px 0 #1b1030}
    `;
    document.head.appendChild(st);
    game.events.on('npc:shout' as any, (e: any) => {
      const n = e.npc;
      this.say(n, e.text, 2.2, n.police ? 'poli' : n.hostile ? 'enemigo' : '');
    });
    game.events.on('money', (e) => {
      // en las tiendas y menús (juego en pausa) ya lo cuenta el HUD junto al efectivo
      if (Math.abs(e.delta) < 1 || e.reason === 'banco' || game.paused) return;
      const p = game.mod.player;
      if (!p || !game.hud.visible) return;
      const cls = e.delta < 0 ? 'menos' : e.delta >= 300 ? 'gordo' : '';
      this.number(p, (e.delta > 0 ? '+' : '−') + fmt(Math.abs(e.delta)), undefined, cls, p.state === 'vehicle' ? 2.9 : 2.2);
    });
  }

  /** Bocadillo sobre un personaje (o un punto). */
  say(target: { position: THREE.Vector3 } | THREE.Vector3, text: string, seconds = 3, cls = '') {
    // uno por personaje
    for (const b of this.list) if (b.target === target && !b.float) b.life = 0;
    const el = document.createElement('div');
    el.className = 'cr-bocadillo ' + cls;
    el.textContent = text;
    this.layer.appendChild(el);
    this.list.push({ el, target, t: 0, life: seconds, offsetY: 2.25, float: false, dx: 0, dy: 0 });
  }

  /**
   * Número que salta y sube (cobros, daño). Si `pos` es un personaje, le sigue.
   * `cls`: '' (verde), 'gordo' (dorado y grande) o 'menos' (rojo).
   */
  number(pos: THREE.Vector3 | { position: THREE.Vector3 }, text: string, color?: string, cls = '', offsetY = 0) {
    const el = document.createElement('div');
    el.className = 'cr-numero' + (cls ? ' ' + cls : '');
    el.textContent = text;
    if (color) el.style.color = color;
    el.style.opacity = '0';
    this.layer.appendChild(el);
    // si ya hay números en el aire, este sale un poco más abajo y a un lado
    const dx = FLOAT_DX[this.floats % FLOAT_DX.length];
    const dy = FLOAT_DY[this.floats % FLOAT_DY.length];
    this.floats++;
    const target = pos instanceof THREE.Vector3 ? pos.clone() : pos;
    this.list.push({ el, target, t: 0, life: FLOAT_LIFE, offsetY, float: true, dx, dy });
  }

  clearFor(target: unknown) {
    for (const b of this.list) if (b.target === target) b.life = 0;
  }

  postUpdate(dt: number) {
    this.render(dt);
  }
  pausedUpdate() {
    // los números siguen su animación con el juego en pausa (casino...); los bocadillos, quietos
    this.render(0);
  }

  private render(dt: number) {
    const now = performance.now();
    const realDt = Math.min(0.1, Math.max(0, (now - this.lastT) / 1000));
    this.lastT = now;
    const cam = this.game.camera;
    const w = window.innerWidth, h = window.innerHeight;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      // los números van con tiempo real: la cámara lenta no los congela
      b.t += b.float ? realDt : dt;
      if (b.t >= b.life) {
        b.el.remove();
        this.list.splice(i, 1);
        if (b.float) this.floats = Math.max(0, this.floats - 1);
        continue;
      }
      const base = b.target instanceof THREE.Vector3 ? b.target : b.target.position;
      tmpV.copy(base);
      tmpV.y += b.offsetY;
      tmpV.project(cam);
      const visible = tmpV.z < 1 && tmpV.z > -1 && base.distanceTo(cam.position) < 45;
      b.el.style.display = visible ? 'block' : 'none';
      if (!visible) continue;
      const x = (tmpV.x * 0.5 + 0.5) * w;
      const y = (-tmpV.y * 0.5 + 0.5) * h;
      if (b.float) {
        // salta con rebote, sube frenando y se desvanece al final
        const t = b.t;
        const k = Math.min(1, t / 1.35);
        const rise = FLOAT_RISE * (1 - (1 - k) * (1 - k) * (1 - k));
        const s = t < 0.12 ? 0.35 + (t / 0.12) * 1.0 : t < 0.3 ? 1.35 - ((t - 0.12) / 0.18) * 0.35 : 1;
        const a = Math.min(1, t * 10, (b.life - t) / 0.45);
        b.el.style.transform = `translate(${(x + b.dx).toFixed(1)}px, ${(y + b.dy - rise).toFixed(1)}px) translate(-50%,-50%) rotate(-5deg) scale(${s.toFixed(2)})`;
        b.el.style.opacity = a.toFixed(2);
      } else {
        const pop = Math.min(1, b.t * 8);
        b.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%,-100%) scale(${pop.toFixed(2)})`;
        b.el.style.opacity = String(Math.min(1, (b.life - b.t) * 3));
      }
    }
  }
}
