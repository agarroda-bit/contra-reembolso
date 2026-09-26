// Extras de combate en pantalla: rueda de armas, marca de impacto, aviso de arresto,
// de dónde vienen los disparos que te dan y puntos de enemigos en el minimapa.
import * as THREE from 'three';
import type { Game, System } from '../core/game';
import { WEAPONS, type WeaponId } from '../combat/weapons';

const tmpF = new THREE.Vector3();
const tmpR = new THREE.Vector3();
const tmpP = new THREE.Vector3();

const CSS = `
.cr-rueda,.cr-impacto,.cr-arresto{pointer-events:none !important}
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
.cr-dano-dir{position:fixed;left:50%;top:50%;width:0;height:0;z-index:21;pointer-events:none;opacity:0}
.cr-dano-dir i{position:absolute;left:-70px;top:calc(-1 * min(30vh, 210px));width:140px;height:40px;box-sizing:border-box;border-top:9px solid #ff2d55;border-radius:50%/100% 100% 0 0;filter:drop-shadow(0 -2px 0 #1b1030) drop-shadow(0 0 6px rgba(255,45,85,.8))}
`;

export class CombatHud implements System {
  name = 'combatHud';
  private wheel: HTMLDivElement;
  private hit: HTMLDivElement;
  private arrest: HTMLDivElement;
  private shownList = '';
  private shownCurrent = '';
  private shownCount = -1;
  private hitTimer = 0;
  /** Flechas de «te disparan desde aquí» (se reutilizan). */
  private dirs: { el: HTMLDivElement; from: THREE.Vector3; t: number }[] = [];
  /** Marcas de enemigos del minimapa (se reutilizan cada frame). */
  private threatPool: { x: number; z: number; icon: string; color: string; threat: true }[] = [];

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
    for (let i = 0; i < 4; i++) {
      const el = document.createElement('div');
      el.className = 'cr-dano-dir';
      el.appendChild(document.createElement('i'));
      game.ui.appendChild(el);
      this.dirs.push({ el, from: new THREE.Vector3(), t: 0 });
    }
    game.events.on('player:hurt', (e) => {
      const src = e.source as any;
      const from: THREE.Vector3 | undefined = src?.from ?? src?.shooter?.npc?.position;
      if (!from || (e.amount || 0) < 1) return;
      const p = game.mod.player?.position;
      if (!p || Math.hypot(from.x - p.x, from.z - p.z) < 0.8) return;
      // la más vieja (o una libre)
      let slot = this.dirs[0];
      for (const d of this.dirs) if (d.t < slot.t) slot = d;
      slot.from.copy(from);
      slot.t = 1.3;
    });
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
    // de dónde vienen los golpes: un arco rojo alrededor de la mira que apunta al tirador
    const cam = g.mod.cameraRig;
    const pp = g.mod.player?.position;
    for (const d of this.dirs) {
      if (d.t <= 0) continue;
      d.t -= dt;
      if (d.t <= 0 || !cam || !pp || !g.hud.visible) {
        d.el.style.opacity = '0';
        continue;
      }
      const f = cam.forwardXZ(tmpF);
      const r = cam.rightXZ(tmpR);
      const tx = d.from.x - pp.x, tz = d.from.z - pp.z;
      const ang = Math.atan2(tx * r.x + tz * r.z, tx * f.x + tz * f.z);
      d.el.style.transform = `rotate(${ang.toFixed(3)}rad)`;
      d.el.style.opacity = String(Math.min(1, d.t / 0.5));
    }
    // rueda de armas
    const c = g.mod.combat;
    // (solo se rehace si cambia el arma o cuántas tienes: nada de listas ni textos nuevos en cada frame)
    if (c && (c.current !== this.shownCurrent || c.owned.size !== this.shownCount || this.shownList === '')) {
      const owned = [...c.owned] as WeaponId[];
      const key = owned.join(',') + '|' + c.current;
      this.shownCurrent = c.current;
      this.shownCount = c.owned.size;
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
    // (se quitan las del frame anterior sin crear listas nuevas)
    const hud = g.hud;
    const mk = hud.markers;
    let w = 0;
    for (let i = 0; i < mk.length; i++) if (!(mk[i] as any).threat) mk[w++] = mk[i];
    mk.length = w;
    const p = g.mod.player?.position;
    if (p && g.mod.npcs) {
      let n = 0;
      for (const npc of g.mod.npcs.list) {
        if (n > 14) break;
        if (!npc.hostile || !npc.alive || npc.removed) continue;
        const pos = npc.vehicle ? npc.vehicle.getPosition(tmpP) : npc.position;
        if (pos.distanceTo(p) > 90) continue;
        let m = this.threatPool[n];
        if (!m) m = this.threatPool[n] = { x: 0, z: 0, icon: '•', color: '', threat: true };
        m.x = pos.x;
        m.z = pos.z;
        m.color = npc.police ? '#2ec4ff' : '#ff2d55';
        mk.push(m as any);
        n++;
      }
    }
  }
}
