// Modo depuración (?debug=1): fps, teletransporte, trucos. También expone window.__cr para las pruebas.
import * as THREE from 'three';
import type { Game } from './game';

export function installDebug(game: Game) {
  (window as any).__cr = game;
  (window as any).THREE = THREE;
  if (!game.debug) return;
  const panel = document.createElement('div');
  panel.id = 'debug-panel';
  panel.style.cssText =
    'position:fixed;left:8px;bottom:8px;z-index:50;background:rgba(0,0,0,.72);color:#fff;font:12px/1.4 ui-monospace,monospace;padding:8px 10px;border-radius:8px;max-width:340px;pointer-events:auto';
  const info = document.createElement('div');
  panel.appendChild(info);
  const btns = document.createElement('div');
  btns.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-top:6px';
  panel.appendChild(btns);
  const addBtn = (label: string, fn: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'font:11px system-ui;padding:2px 6px;border-radius:4px;border:0;background:#ffd23f;cursor:pointer';
    b.onclick = (e) => {
      e.stopPropagation();
      fn();
      (document.activeElement as HTMLElement)?.blur?.();
    };
    btns.appendChild(b);
  };
  (game as any).debugAddButton = addBtn;
  game.ui.appendChild(panel);

  const tp = (x: number, z: number) => {
    const y = (game.world?.heightAt(x, z) ?? 0) + 1.5;
    game.mod.player?.teleport?.(new THREE.Vector3(x, y, z));
  };
  // Botones de zonas: los añade el mundo cuando existe
  setTimeout(() => {
    for (const d of game.world?.districts ?? []) addBtn('→ ' + d.name, () => tp(d.center.x, d.center.z));
    addBtn('☀ día', () => (game.clock.hour = 12));
    addBtn('🌅 tarde', () => (game.clock.hour = 19.2));
    addBtn('🌙 noche', () => (game.clock.hour = 23));
    addBtn('⏸ hora', () => (game.clock.frozen = !game.clock.frozen));
  }, 0);

  const pos = new THREE.Vector3();
  game.addSystem({
    name: 'debug',
    postUpdate: () => {
      if (game.time.frame % 10) return;
      const p = game.mod.player?.position ?? pos;
      const d = game.world?.districtAt(p.x, p.z) ?? '-';
      const calls = game.renderer.info.render.calls;
      const tris = game.renderer.info.render.triangles;
      info.textContent =
        `${game.fps.toFixed(0)} fps · ${calls} draws · ${(tris / 1000).toFixed(0)}k tris\n` +
        `pos ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)} · ${d} · ${game.clock.hour.toFixed(2)}h`;
      info.style.whiteSpace = 'pre';
    },
  });
}
