// Extras de combate en pantalla: rueda de armas, marca de impacto, aviso de arresto
// y puntos de enemigos en el minimapa.
import type { Game, System } from '../core/game';
import { WEAPONS, type WeaponId } from '../combat/weapons';

const CSS = `
.cr-rueda{position:fixed;left:50%;bottom:200px;transform:translateX(-50%);display:flex;gap:8px;z-index:20;pointer-events:none;transition:opacity .2s}
.cr-rueda div{min-width:64px;padding:8px 10px 6px;border-radius:14px;background:rgba(27,16,48,.82);border:3px solid rgba(255,255,255,.15);text-align:center;color:#fff;font:800 11px system-ui}
.cr-rueda div i{display:block;font-style:normal;font-size:26px;line-height:1.1}
.cr-rueda div.on{background:#ffd23f;color:#1b1030;border-color:#1b1030;transform:translateY(-6px) scale(1.08);box-shadow:4px 4px 0 #1b1030}
.cr-impacto{position:fixed;left:50%;top:50%;width:34px;height:34px;margin:-17px 0 0 -17px;z-index:21;pointer-events:none;opacity:0;transition:opacity .12s}
.cr-impacto::before,.cr-impacto::after{content:'';position:absolute;left:15px;top:0;width:4px;height:34px;background:#fff;border-radius:2px;box-shadow:0 0 0 2px #1b1030}
.cr-impacto::before{transform:rotate(45deg)}.cr-impacto::after{transform:rotate(-45deg)}
.cr-impacto.baja::before,.cr-impacto.baja::after{background:#ff4f81}
.cr-arresto{position:fixed;left:50%;top:26%;transform:translateX(-50%);z-index:21;pointer-events:none;background:rgba(29,53,87,.92);color:#fff;border:3px solid #fff;border-radius:16px;padding:10px 18px;font:900 20px system-ui;text-align:center;display:none}
.cr-arresto i{display:block;height:8px;background:#1b1030;border-radius:4px;margin-top:8px;overflow:hidden}
.cr-arresto i b{display:block;height:100%;background:#2ec4ff}
`;

export class CombatHud implements System {
  name = 'combatHud';
  private wheel: HTMLDivElement;
  private hit: HTMLDivElement;
  private arrest: HTMLDivElement;
  private shownList = '';
  private hitTimer = 0;

  constructor(private game: Game) {
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    this.wheel = document.createElement('div');
    this.wheel.className = 'cr-rueda';
    this.wheel.style.opacity = '0';
    this.hit = document.createElement('div');
    this.hit.className = 'cr-impacto';
    this.arrest = document.createElement('div');
    this.arrest.className = 'cr-arresto';
    this.arrest.innerHTML = '🚓 ¡TE ESTÁN DETENIENDO! Muévete<i><b></b></i>';
    game.ui.append(this.wheel, this.hit, this.arrest);
    game.events.on('hitmarker' as any, (e: any) => {
      this.hit.classList.toggle('baja', !!e.kill);
      this.hit.style.opacity = '1';
      this.hitTimer = e.kill ? 0.35 : 0.15;
      game.mod.audio?.play('hit', { volume: 0.25, pitch: e.kill ? 0.8 : 1.6 });
    });
    let wheelTimer = 0;
    game.events.on('weapon:switch' as any, () => (wheelTimer = 1.4));
    (this as any).tickWheel = (dt: number) => {
      wheelTimer -= dt;
      this.wheel.style.opacity = wheelTimer > 0 && game.hud.visible ? '1' : '0';
    };
  }

  postUpdate(dt: number) {
    const g = this.game;
    (this as any).tickWheel(dt);
    // rueda de armas
    const c = g.mod.combat;
    if (c) {
      const owned = [...c.owned] as WeaponId[];
      const key = owned.join(',') + '|' + c.current;
      if (key !== this.shownList) {
        this.shownList = key;
        this.wheel.innerHTML = '';
        for (const w of owned) {
          const d = document.createElement('div');
          if (w === c.current) d.className = 'on';
          d.innerHTML = `<i>${WEAPONS[w].icon}</i>${WEAPONS[w].slot} · ${WEAPONS[w].name.split(' ')[0]}`;
          this.wheel.appendChild(d);
        }
      }
    }
    // marca de impacto
    if (this.hitTimer > 0) {
      this.hitTimer -= dt;
      if (this.hitTimer <= 0) this.hit.style.opacity = '0';
    }
    // barra de arresto
    const a = (g.hud as any).arrest ?? 0;
    this.arrest.style.display = a > 0 && g.hud.visible ? 'block' : 'none';
    if (a > 0) (this.arrest.querySelector('b') as HTMLElement).style.width = `${Math.round(a * 100)}%`;
    // enemigos en el minimapa
    const hud = g.hud;
    hud.markers = hud.markers.filter((m) => !(m as any).threat);
    const p = g.mod.player?.position;
    if (p && g.mod.npcs) {
      let n = 0;
      for (const npc of g.mod.npcs.list) {
        if (n > 14) break;
        if (!npc.hostile || !npc.alive || npc.removed) continue;
        const pos = npc.vehicle ? npc.vehicle.getPosition(npc.position.clone()) : npc.position;
        if (pos.distanceTo(p) > 90) continue;
        hud.markers.push({ x: pos.x, z: pos.z, icon: '•', color: npc.police ? '#2ec4ff' : '#ff2d55', threat: true } as any);
        n++;
      }
    }
  }
}
