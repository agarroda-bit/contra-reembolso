// Extras de combate en pantalla: rueda de armas, marca de impacto, aviso de arresto,
// de dónde vienen los disparos que te dan y puntos de enemigos en el minimapa.
import * as THREE from 'three';
import type { Game, System } from '../core/game';
import { WEAPONS, type WeaponId } from '../combat/weapons';
import { BTN, PAD_GLYPH as P } from '../core/input';

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
.cr-mando .hud-pista .cr-tecla{font-size:21px;min-width:38px;padding:0 6px}
.cr-chuleta{position:fixed;right:16px;top:50%;transform:translateY(-50%) rotate(1deg);z-index:22;pointer-events:none;width:min(330px,calc(100vw - 32px));box-sizing:border-box;background:rgba(27,16,48,.9);color:#fff6e0;border:3px solid #fff6e0;border-radius:18px;box-shadow:6px 6px 0 #1b1030;padding:12px 14px 10px;font:700 13px/1.35 system-ui,-apple-system,sans-serif;opacity:0;transition:opacity .25s,transform .25s}
.cr-chuleta.ve{opacity:1;transform:translateY(-50%) rotate(-1deg)}
.cr-chuleta h4{margin:0 0 6px;font:900 18px system-ui;color:#ffd23f;letter-spacing:.5px}
.cr-chuleta h5{margin:8px 0 3px;font:900 11px system-ui;color:#2ec4b6;letter-spacing:1px;text-transform:uppercase}
.cr-chuleta ul{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:3px 10px}
.cr-chuleta li{display:flex;align-items:center;gap:6px;white-space:nowrap}
.cr-chuleta b{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:22px;padding:0 4px;box-sizing:border-box;border-radius:11px;background:#fff6e0;color:#1b1030;font:900 12px system-ui}
.cr-chuleta b.a{background:#3ecf5b;color:#fff}.cr-chuleta b.b{background:#ff4f5e;color:#fff}.cr-chuleta b.x{background:#3b8cff;color:#fff}.cr-chuleta b.y{background:#ffc93c}
.cr-chuleta small{display:block;margin-top:8px;color:#bfb3d9;font-weight:700}
`;

/** Una fila de la chuleta del mando: botón (con su color) y qué hace. */
const fila = (btn: string, txt: string, cls = '') => `<li><b class="${cls}">${btn}</b>${txt}</li>`;
const CHULETA = `<h4>🎮 Mando</h4>
<h5>A pie</h5><ul>
${fila(P.LS, 'moverte')}${fila(P.RS, 'cámara')}
${fila('L3', 'correr')}${fila('A', 'saltar / usar', 'a')}
${fila('LT', 'apuntar')}${fila('RT', 'disparar')}
${fila('X', 'recargar', 'x')}${fila('Y', 'subir al coche', 'y')}
${fila('LB RB', 'cambiar arma')}${fila('B', 'decir que no', 'b')}
${fila(P.UP, 'móvil')}${fila(P.BACK, 'mapa')}
</ul><h5>En coche</h5><ul>
${fila('RT', 'acelerar')}${fila('LT', 'frenar')}
${fila('A', 'derrapar', 'a')}${fila('X', 'turbo', 'x')}
${fila('B', 'claxon', 'b')}${fila('Y', 'bajar', 'y')}
${fila('LB', 'apuntar fuera')}${fila('RB', 'disparar')}
${fila(P.LEFT + P.RIGHT, 'emisora')}${fila(P.DOWN, 'otra arma')}
</ul><small>${P.START} pausa · R3: enseñar u ocultar esto</small>`;

/** Separador de dos pistas juntas (como las une interact.ts: «E — Entrar   ·   F — Subir»). */
const HINT_SPLIT = /(\s{2,}·\s{2,})/;
/** «E — texto»: la tecla (corta) y el resto. */
const HINT_KEY = /^(\s*)([^—–-]{1,12}?)\s+([—–-])\s+(.+)$/s;

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
  /** Chuleta de botones del mando (sale la primera vez que se usa; R3 la enseña u oculta). */
  private chuleta: HTMLDivElement;
  private chuletaT = 0;
  private chuletaShown = false;
  /** Pista traducida a botones del mando (se rehace solo cuando cambia el texto). */
  private hintSrc: string | null = null;
  private hintOut: string | null = null;
  private hintCar = false;
  private padMode = false;

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
    this.chuleta = document.createElement('div');
    this.chuleta.className = 'cr-chuleta';
    this.chuleta.innerHTML = CHULETA;
    game.ui.append(this.wheel, this.hit, this.arrest, this.chuleta);
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

  /**
   * Con el mando, las pistas de la pantalla enseñan sus botones («Ⓐ — Entregar» en vez de «E — Entregar»).
   * Va en update (después de que interact.ts escriba la pista y antes de que el HUD la pinte).
   */
  update(dt: number) {
    const g = this.game;
    const input = g.input;
    const pad = input.usingGamepad;
    if (pad !== this.padMode) {
      this.padMode = pad;
      g.ui.classList.toggle('cr-mando', pad);
    }
    // chuleta del mando: la primera vez que se usa, y con R3
    if (pad && !this.chuletaShown && input.gamepadSeen) {
      this.chuletaShown = true;
      this.chuletaT = 9;
      g.events.emit('toast', { text: '🎮 ¡Mando listo! R3 enseña los botones', color: '#2ec4b6', time: 3 });
    }
    if (input.padEdge & (1 << BTN.R3) && g.mod.player?.state !== 'vehicle') this.chuletaT = this.chuletaT > 0 ? 0 : 12;
    if (this.chuletaT > 0) this.chuletaT -= dt / Math.max(0.2, g.time.scale);
    this.chuleta.classList.toggle('ve', this.chuletaT > 0 && g.hud.visible && input.enabled);
    // pista con botones del mando
    const h = g.hud.hint;
    if (!pad || !h || h === this.hintOut) return;
    const car = g.mod.player?.state === 'vehicle';
    if (h !== this.hintSrc || car !== this.hintCar) {
      this.hintSrc = h;
      this.hintCar = car;
      this.hintOut = this.padHint(h, car);
    }
    g.hud.hint = this.hintOut;
  }

  /** «E — Entrar   ·   F — Subir» → «Ⓐ — Entrar   ·   Ⓨ — Subir» (lo que no tenga botón, igual). */
  private padHint(h: string, car: boolean): string {
    const input = this.game.input;
    let out = '';
    for (const part of h.split(HINT_SPLIT)) {
      const m = HINT_KEY.exec(part);
      const label = m ? input.padLabel(m[2].trim(), car) : null;
      out += m && label ? `${m[1]}${label} ${m[3]} ${m[4]}` : part;
    }
    return out;
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
