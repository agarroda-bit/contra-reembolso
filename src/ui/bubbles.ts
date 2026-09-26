// Bocadillos de diálogo sobre la cabeza de la gente, y números que saltan ("+45 €").
import * as THREE from 'three';
import type { Game, System } from '../core/game';

interface Bubble {
  el: HTMLDivElement;
  target: { position: THREE.Vector3 } | THREE.Vector3;
  t: number;
  life: number;
  offsetY: number;
  float: boolean;
}

const tmpV = new THREE.Vector3();

export class Bubbles implements System {
  name = 'bubbles';
  private list: Bubble[] = [];
  private layer: HTMLDivElement;

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
      .cr-numero{position:absolute;left:0;top:0;transform:translate(-50%,-50%);font:900 30px system-ui,-apple-system,sans-serif;color:#7CFC7C;
        text-shadow:3px 3px 0 #1b1030,-1px -1px 0 #1b1030;white-space:nowrap}
    `;
    document.head.appendChild(st);
    game.events.on('npc:shout' as any, (e: any) => {
      const n = e.npc;
      this.say(n, e.text, 2.2, n.police ? 'poli' : n.hostile ? 'enemigo' : '');
    });
    game.events.on('money', (e) => {
      if (Math.abs(e.delta) < 1 || e.reason === 'banco') return;
      const p = game.mod.player;
      if (!p) return;
      const pos = p.position.clone();
      pos.y += 2.2;
      this.number(pos, (e.delta > 0 ? '+' : '−') + Math.round(Math.abs(e.delta)).toLocaleString('es-ES') + ' €', e.delta > 0 ? '#7CFC7C' : '#ff5a7a');
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
    this.list.push({ el, target, t: 0, life: seconds, offsetY: 2.25, float: false });
  }

  /** Número que salta y sube (cobros, daño). */
  number(pos: THREE.Vector3, text: string, color = '#7CFC7C') {
    const el = document.createElement('div');
    el.className = 'cr-numero';
    el.textContent = text;
    el.style.color = color;
    this.layer.appendChild(el);
    this.list.push({ el, target: pos.clone(), t: 0, life: 1.6, offsetY: 0, float: true });
  }

  clearFor(target: unknown) {
    for (const b of this.list) if (b.target === target) b.life = 0;
  }

  postUpdate(dt: number) {
    this.render(dt);
  }
  pausedUpdate() {
    this.render(0);
  }

  private render(dt: number) {
    const cam = this.game.camera;
    const w = window.innerWidth, h = window.innerHeight;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      b.t += dt;
      if (b.t >= b.life) {
        b.el.remove();
        this.list.splice(i, 1);
        continue;
      }
      const base = b.target instanceof THREE.Vector3 ? b.target : b.target.position;
      tmpV.copy(base);
      tmpV.y += b.offsetY + (b.float ? b.t * 1.2 : 0);
      tmpV.project(cam);
      const visible = tmpV.z < 1 && tmpV.z > -1 && base.distanceTo(cam.position) < 45;
      b.el.style.display = visible ? 'block' : 'none';
      if (!visible) continue;
      const x = (tmpV.x * 0.5 + 0.5) * w;
      const y = (-tmpV.y * 0.5 + 0.5) * h;
      const pop = b.float ? 1 + Math.max(0, 0.4 - b.t) : Math.min(1, b.t * 8);
      b.el.style.transform = `translate(${x}px, ${y}px) translate(-50%,-100%) scale(${pop.toFixed(2)})`;
      b.el.style.opacity = String(Math.min(1, (b.life - b.t) * 3));
    }
  }
}
