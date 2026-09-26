// Menús: principal (con la isla de fondo), pausa, opciones, controles y creación del personaje.
import * as THREE from 'three';
import type { Game, System } from '../core/game';
import type { CharacterLook, HairStyle } from '../core/contracts';
import type { Quality } from '../core/settings';
import { SaveSystem } from '../gameplay/save';
import { fmt } from '../gameplay/economy';

export const SKINS = ['#ffe0c4', '#f1c27d', '#e0ac69', '#c68642', '#a0673c', '#8d5524', '#5c3a21'];
export const HAIRS: { id: HairStyle; name: string }[] = [
  { id: 'corto', name: 'Corto' }, { id: 'rapado', name: 'Rapado' }, { id: 'largo', name: 'Largo' }, { id: 'coleta', name: 'Coleta' },
  { id: 'moño', name: 'Moño' }, { id: 'cresta', name: 'Cresta' }, { id: 'afro', name: 'Afro' }, { id: 'calvo', name: 'Calvo' },
];
export const HAIR_COLORS = ['#2b1b0f', '#5a3a1a', '#8b5a2b', '#d6b370', '#e8e1d0', '#b5332e', '#ff4f81', '#2ec4b6'];
export const UNIFORMS = ['#ffd23f', '#ff7b54', '#2ec4b6', '#ff4f81', '#6c9bd1', '#06d6a0', '#f1faee', '#1b1030'];

export interface Profile {
  name: string;
  look: CharacterLook;
}

export function defaultProfile(): Profile {
  return {
    name: 'Repartidor',
    look: {
      skin: '#e0ac69', hair: 'corto', hairColor: '#2b1b0f', shirt: '#ffd23f', pants: '#1d3557', shoes: '#222222',
      cap: true, capColor: '#ff4f81', emblem: 'reparto', build: 1, height: 1,
    },
  };
}

const CSS = `
.cr-menu{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;pointer-events:auto;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#fff}
.cr-menu.fondo{background:linear-gradient(90deg,rgba(27,16,48,.88) 0%,rgba(27,16,48,.55) 45%,rgba(27,16,48,0) 75%)}
.cr-menu.velo{background:rgba(27,16,48,.72)}
.cr-menu .col{position:absolute;left:clamp(16px,7vw,110px);top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:14px;max-width:min(560px,calc(100vw - 32px))}
.cr-logo{font-weight:900;font-size:clamp(46px,8vw,104px);line-height:.88;letter-spacing:-3px;color:#ffd23f;text-shadow:6px 6px 0 #c2185b,12px 12px 0 #1b1030;transform:rotate(-4deg);margin-bottom:26px}
.cr-logo small{display:block;font-size:.26em;letter-spacing:1px;color:#fff;text-shadow:3px 3px 0 #1b1030;margin-top:12px;transform:rotate(2deg)}
.cr-bt{font:900 26px system-ui;text-align:left;color:#1b1030;background:#ffd23f;border:4px solid #1b1030;border-radius:18px;padding:12px 26px;cursor:pointer;
  box-shadow:6px 6px 0 #1b1030;transition:transform .12s,box-shadow .12s,background .12s;min-width:300px}
.cr-bt:hover,.cr-bt:focus{transform:translate(-3px,-3px) rotate(-1deg);box-shadow:9px 9px 0 #1b1030;background:#ff7b54;outline:none}
.cr-bt:disabled{opacity:.45;cursor:default;transform:none}
.cr-bt small{display:block;font:700 13px system-ui;opacity:.75}
.cr-panel{background:#fff7e6;color:#1b1030;border:4px solid #1b1030;border-radius:26px;box-shadow:10px 10px 0 rgba(27,16,48,.7);padding:24px 28px;max-width:min(720px,calc(100vw - 32px));max-height:calc(100vh - 40px);overflow:auto;position:relative}
.cr-panel h2{margin:0 0 16px;font:900 34px system-ui;color:#1b1030;transform:rotate(-1deg)}
.cr-fila{display:flex;align-items:center;gap:14px;margin:12px 0;font:800 16px system-ui}
.cr-fila label{min-width:190px}
.cr-fila input[type=range]{flex:1;accent-color:#ff4f81}
.cr-seg{display:flex;gap:6px;flex-wrap:wrap}
.cr-seg button{font:800 15px system-ui;border:3px solid #1b1030;border-radius:12px;padding:6px 12px;background:#fff;color:#1b1030;cursor:pointer}
.cr-seg button.on{background:#ffd23f;box-shadow:3px 3px 0 #1b1030}
.cr-muestras{display:flex;gap:8px;flex-wrap:wrap}
.cr-muestras button{width:38px;height:38px;border-radius:50%;border:3px solid #1b1030;cursor:pointer}
.cr-muestras button.on{outline:4px solid #ff4f81;outline-offset:2px}
.cr-tabla{border-collapse:collapse;width:100%;font:700 15px system-ui}
.cr-tabla td{padding:7px 10px;border-bottom:2px dashed rgba(27,16,48,.2)}
.cr-tabla td:first-child{white-space:nowrap}
.cr-tecla-menu{display:inline-block;min-width:26px;text-align:center;background:#1b1030;color:#ffd23f;border-radius:8px;padding:3px 8px;font:900 14px system-ui;margin:1px}
.cr-cerrar{position:absolute;top:12px;right:14px;border:3px solid #1b1030;border-radius:12px;background:#ff4f81;color:#fff;font:900 18px system-ui;width:40px;height:40px;cursor:pointer}
.cr-creacion{position:absolute;right:clamp(16px,5vw,80px);top:50%;transform:translateY(-50%);width:min(430px,calc(100vw - 32px))}
.cr-nombre{font:800 20px system-ui;border:3px solid #1b1030;border-radius:12px;padding:8px 12px;width:100%;box-sizing:border-box}
.cr-version{position:absolute;right:16px;bottom:12px;font:600 12px system-ui;opacity:.6}
`;

export class Menus implements System {
  name = 'menus';
  private layer: HTMLDivElement;
  private current: HTMLDivElement | null = null;
  mode: 'main' | 'create' | 'play' | 'pause' = 'main';
  private orbit = 0;
  onNewGame: ((p: Profile) => void) | null = null;
  onContinue: (() => void) | null = null;
  private profile: Profile = defaultProfile();
  private previewRig: any = null;

  constructor(private game: Game) {
    game.mod.menus = this;
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    this.layer = document.createElement('div');
    game.ui.appendChild(this.layer);
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' && e.code !== 'KeyP') return;
      if (this.game.mod.phone?.open) return;
      if (this.game.mod.hud?.mapOpen) return;
      if (this.mode === 'play') this.pause();
      else if (this.mode === 'pause' && this.current?.dataset.sub !== '1') this.resume();
      else if (this.current?.dataset.sub === '1') this.back?.();
    });
  }

  private back: (() => void) | null = null;

  private set(el: HTMLDivElement | null) {
    this.current?.remove();
    this.current = el;
    if (el) this.layer.appendChild(el);
    (this.game as any).menuOpen = !!el;
  }

  private button(text: string, sub: string | null, fn: () => void, disabled = false): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'cr-bt';
    b.innerHTML = text + (sub ? `<small>${sub}</small>` : '');
    b.disabled = disabled;
    b.onclick = () => {
      this.game.mod.audio?.ensure();
      this.game.mod.audio?.play('click');
      fn();
    };
    return b;
  }

  // ─────────── Menú principal ───────────

  showMain() {
    const g = this.game;
    this.mode = 'main';
    g.hud.visible = false;
    g.input.enabled = false;
    g.input.exitPointerLock();
    const cam = g.mod.cameraRig;
    if (cam) cam.mode = 'free';
    const el = document.createElement('div');
    el.className = 'cr-menu fondo';
    const col = document.createElement('div');
    col.className = 'col';
    col.innerHTML = `<div class="cr-logo">CONTRA<br>REEMBOLSO<small>Pagas al recibir. O no.</small></div>`;
    const save = SaveSystem.peek();
    col.appendChild(this.button('▶ Continuar', save ? `Día ${save.day} · ${fmt(save.cash + save.bank)} · fama ${Math.round(save.fame)}` : 'No hay partida guardada', () => this.onContinue?.(), !save));
    col.appendChild(this.button('✚ Nueva partida', save ? 'Empieza de cero (borra la partida guardada)' : 'Crea a tu repartidor', () => this.showCreate()));
    col.appendChild(this.button('⚙ Opciones', null, () => this.showOptions(() => this.showMain())));
    col.appendChild(this.button('⌨ Controles', null, () => this.showControls(() => this.showMain())));
    el.appendChild(col);
    const v = document.createElement('div');
    v.className = 'cr-version';
    v.textContent = 'Puerto Paquete · versión nocturna';
    el.appendChild(v);
    this.set(el);
  }

  // ─────────── Creación del personaje ───────────

  showCreate() {
    const g = this.game;
    this.mode = 'create';
    this.profile = defaultProfile();
    const p = g.mod.player;
    // vista previa: el propio muñeco del jugador delante de la oficina
    const sp = g.world.playerSpawn;
    p.teleport(sp.pos, sp.heading);
    this.applyPreview();
    const el = document.createElement('div');
    el.className = 'cr-menu';
    el.style.background = 'linear-gradient(270deg,rgba(27,16,48,.85) 0%,rgba(27,16,48,.4) 40%,rgba(27,16,48,0) 65%)';
    const panel = document.createElement('div');
    panel.className = 'cr-panel cr-creacion';
    panel.innerHTML = `<h2>Tu repartidor</h2>`;
    panel.style.padding = '16px 22px';
    (panel.querySelector('h2') as HTMLElement).style.margin = '0 0 6px';
    const row = (label: string, content: HTMLElement) => {
      const r = document.createElement('div');
      r.className = 'cr-fila';
      r.style.flexDirection = 'column';
      r.style.alignItems = 'stretch';
      r.style.margin = '5px 0';
      r.style.gap = '5px';
      const l = document.createElement('div');
      l.textContent = label;
      r.append(l, content);
      panel.appendChild(r);
    };
    const name = document.createElement('input');
    name.className = 'cr-nombre';
    name.maxLength = 18;
    name.value = this.profile.name;
    name.oninput = () => (this.profile.name = name.value.trim() || 'Repartidor');
    name.onkeydown = (e) => e.stopPropagation();
    row('Nombre', name);
    const swatches = (list: string[], get: () => string, setv: (c: string) => void) => {
      const d = document.createElement('div');
      d.className = 'cr-muestras';
      const draw = () => {
        d.innerHTML = '';
        for (const c of list) {
          const b = document.createElement('button');
          b.style.background = c;
          if (get() === c) b.className = 'on';
          b.onclick = () => {
            setv(c);
            this.applyPreview();
            draw();
          };
          d.appendChild(b);
        }
      };
      draw();
      return d;
    };
    const look = this.profile.look;
    row('Tono de piel', swatches(SKINS, () => look.skin, (c) => (look.skin = c)));
    const hairSeg = document.createElement('div');
    hairSeg.className = 'cr-seg';
    const drawHair = () => {
      hairSeg.innerHTML = '';
      for (const h of HAIRS) {
        const b = document.createElement('button');
        b.textContent = h.name;
        if (look.hair === h.id) b.className = 'on';
        b.onclick = () => {
          look.hair = h.id;
          this.applyPreview();
          drawHair();
        };
        hairSeg.appendChild(b);
      }
    };
    drawHair();
    row('Peinado', hairSeg);
    row('Color de pelo', swatches(HAIR_COLORS, () => look.hairColor, (c) => (look.hairColor = c)));
    row('Color del uniforme', swatches(UNIFORMS, () => look.shirt, (c) => (look.shirt = c)));
    const capSeg = document.createElement('div');
    capSeg.className = 'cr-seg';
    const drawCap = () => {
      capSeg.innerHTML = '';
      for (const [v, t] of [[true, 'Con gorra'], [false, 'Sin gorra']] as const) {
        const b = document.createElement('button');
        b.textContent = t;
        if (look.cap === v) b.className = 'on';
        b.onclick = () => {
          look.cap = v;
          this.applyPreview();
          drawCap();
        };
        capSeg.appendChild(b);
      }
    };
    drawCap();
    row('Gorra', capSeg);
    row('Color de la gorra', swatches(['#ff4f81', '#1b1030', '#ffd23f', '#2ec4b6', '#ffffff', '#e63946'], () => look.capColor, (c) => (look.capColor = c)));
    const go = this.button('¡A repartir! →', null, () => {
      this.profile.name = name.value.trim() || 'Repartidor';
      this.set(null);
      this.onNewGame?.(this.profile);
    });
    go.style.marginTop = '16px';
    go.style.width = '100%';
    panel.appendChild(go);
    const back = this.button('← Volver', null, () => this.showMain());
    back.style.background = '#fff';
    back.style.fontSize = '18px';
    back.style.marginTop = '10px';
    back.style.width = '100%';
    panel.appendChild(back);
    el.appendChild(panel);
    this.set(el);
  }

  private applyPreview() {
    const p = this.game.mod.player;
    if (p?.rig) p.rig.setLook({ ...this.profile.look });
  }

  // ─────────── Pausa ───────────

  pause() {
    const g = this.game;
    if (this.mode !== 'play') return;
    this.mode = 'pause';
    g.paused = true;
    g.input.enabled = false;
    g.input.releaseAll();
    g.input.exitPointerLock();
    this.showPauseMenu();
  }

  private showPauseMenu() {
    const el = document.createElement('div');
    el.className = 'cr-menu velo';
    const col = document.createElement('div');
    col.className = 'col';
    col.innerHTML = `<div class="cr-logo" style="font-size:clamp(40px,6vw,72px)">PAUSA<small>El cliente puede esperar. Un poco.</small></div>`;
    col.appendChild(this.button('▶ Seguir repartiendo', null, () => this.resume()));
    col.appendChild(this.button('💾 Guardar partida', null, () => this.game.mod.save?.save(false)));
    col.appendChild(this.button('⚙ Opciones', null, () => this.showOptions(() => this.showPauseMenu())));
    col.appendChild(this.button('⌨ Controles', null, () => this.showControls(() => this.showPauseMenu())));
    col.appendChild(this.button('⏏ Salir al menú', 'Se guarda antes de salir', () => {
      this.game.mod.save?.save();
      location.reload();
    }));
    el.appendChild(col);
    this.set(el);
  }

  resume() {
    const g = this.game;
    this.set(null);
    this.mode = 'play';
    g.paused = false;
    g.input.enabled = true;
    g.hud.visible = true;
  }

  /** Empieza a jugar (tras crear personaje o continuar). */
  play() {
    const g = this.game;
    this.set(null);
    this.mode = 'play';
    g.paused = false;
    g.input.enabled = true;
    g.hud.visible = true;
    const cam = g.mod.cameraRig;
    if (cam) {
      cam.mode = 'foot';
      cam.snapBehind(g.mod.player.heading);
    }
  }

  // ─────────── Opciones ───────────

  showOptions(onBack: () => void) {
    const g = this.game;
    const el = document.createElement('div');
    el.className = 'cr-menu velo';
    el.dataset.sub = '1';
    this.back = onBack;
    const panel = document.createElement('div');
    panel.className = 'cr-panel';
    panel.innerHTML = '<h2>Opciones</h2>';
    const close = document.createElement('button');
    close.className = 'cr-cerrar';
    close.textContent = '✕';
    close.onclick = () => onBack();
    panel.appendChild(close);
    const s = g.settings;
    const slider = (label: string, min: number, max: number, step: number, value: number, fmtv: (v: number) => string, onChange: (v: number) => void) => {
      const r = document.createElement('div');
      r.className = 'cr-fila';
      const l = document.createElement('label');
      const out = document.createElement('span');
      out.style.minWidth = '60px';
      const inp = document.createElement('input');
      inp.type = 'range';
      inp.min = String(min);
      inp.max = String(max);
      inp.step = String(step);
      inp.value = String(value);
      l.textContent = label;
      out.textContent = fmtv(value);
      inp.oninput = () => {
        const v = Number(inp.value);
        out.textContent = fmtv(v);
        onChange(v);
      };
      r.append(l, inp, out);
      panel.appendChild(r);
    };
    const pct = (v: number) => `${Math.round(v * 100)} %`;
    slider('Sensibilidad del ratón', 0.2, 3, 0.05, s.sensitivity, (v) => v.toFixed(2), (v) => g.applySettings({ sensitivity: v }));
    slider('Campo de visión', 55, 90, 1, s.fov, (v) => `${v}°`, (v) => g.applySettings({ fov: v }));
    slider('Volumen general', 0, 1, 0.05, s.volMaster, pct, (v) => g.applySettings({ volMaster: v }));
    slider('Música y radio', 0, 1, 0.05, s.volMusic, pct, (v) => g.applySettings({ volMusic: v }));
    slider('Efectos', 0, 1, 0.05, s.volSfx, pct, (v) => g.applySettings({ volSfx: v }));
    const seg = (label: string, opts: [string, string][], cur: string, onPick: (v: string) => void) => {
      const r = document.createElement('div');
      r.className = 'cr-fila';
      const l = document.createElement('label');
      l.textContent = label;
      const d = document.createElement('div');
      d.className = 'cr-seg';
      const draw = (c: string) => {
        d.innerHTML = '';
        for (const [v, t] of opts) {
          const b = document.createElement('button');
          b.textContent = t;
          if (v === c) b.className = 'on';
          b.onclick = () => {
            onPick(v);
            draw(v);
          };
          d.appendChild(b);
        }
      };
      draw(cur);
      r.append(l, d);
      panel.appendChild(r);
    };
    seg('Invertir eje vertical', [['no', 'No'], ['si', 'Sí']], s.invertY ? 'si' : 'no', (v) => g.applySettings({ invertY: v === 'si' }));
    seg('Calidad gráfica', [['baja', 'Baja'], ['media', 'Media'], ['alta', 'Alta']], s.quality, (v) => g.applySettings({ quality: v as Quality }));
    const note = document.createElement('p');
    note.style.cssText = 'font:600 13px system-ui;opacity:.7;margin:10px 0 0';
    note.textContent = 'Si va a trompicones, baja la calidad. Algunos cambios de calidad (suavizado) se notan del todo al recargar.';
    panel.appendChild(note);
    el.appendChild(panel);
    this.set(el);
  }

  // ─────────── Controles ───────────

  showControls(onBack: () => void) {
    const el = document.createElement('div');
    el.className = 'cr-menu velo';
    el.dataset.sub = '1';
    this.back = onBack;
    const panel = document.createElement('div');
    panel.className = 'cr-panel';
    const k = (t: string) => t.split(' ').map((x) => `<span class="cr-tecla-menu">${x}</span>`).join(' ');
    const rows: [string, string][] = [
      ['W A S D', 'Moverse / conducir'], ['Ratón', 'Cámara (haz clic para capturarlo)'], ['Shift', 'Correr / turbo del vehículo'],
      ['Espacio', 'Saltar / freno de mano (derrape)'], ['Clic izq.', 'Disparar'], ['Clic der.', 'Apuntar (cámara al hombro)'],
      ['F', 'Subir y bajar de vehículos · junto a un coche con conductor: robarlo'], ['E', 'Interactuar: entregar, cobrar, tiendas, puertas'],
      ['R', 'Recargar'], ['1 2 3 4 5', 'Cambiar de arma (o la rueda del ratón)'], ['Tab', 'Abrir el móvil (Enter acepta encargos)'],
      ['M', 'Mapa grande (clic: poner destino)'], ['H', 'Claxon'], ['Q E', 'En vehículo: cambiar de emisora'], ['Esc', 'Pausa'],
    ];
    panel.innerHTML = `<h2>Controles</h2><table class="cr-tabla">${rows.map(([a, b]) => `<tr><td>${k(a)}</td><td>${b}</td></tr>`).join('')}</table>
      <p style="font:600 13px system-ui;opacity:.7">Mando: stick izquierdo mover, derecho cámara, gatillos apuntar y disparar, A saltar, B vehículo, X interactuar, Y recargar.</p>`;
    const close = document.createElement('button');
    close.className = 'cr-cerrar';
    close.textContent = '✕';
    close.onclick = () => onBack();
    panel.appendChild(close);
    el.appendChild(panel);
    this.set(el);
  }

  // ─────────── Cámara del menú ───────────

  update(dt: number) {
    this.animateCamera(dt);
  }
  pausedUpdate(dt: number) {
    void dt;
  }

  private animateCamera(dt: number) {
    const g = this.game;
    if (this.mode === 'main') {
      // vuelo lento alrededor de la isla al atardecer
      this.orbit += dt * 0.04;
      const r = 250;
      const cam = g.camera;
      cam.position.set(Math.sin(this.orbit) * r, 95 + Math.sin(this.orbit * 2) * 12, Math.cos(this.orbit) * r);
      cam.lookAt(0, 8, 0);
    } else if (this.mode === 'create') {
      const p = g.mod.player;
      const cam = g.camera;
      this.orbit += dt * 0.5;
      const target = p.position.clone().setY(p.position.y + 1.1);
      p.heading = this.orbit;
      cam.position.set(target.x + Math.sin(g.world.playerSpawn.heading) * 3.2, target.y + 0.4, target.z + Math.cos(g.world.playerSpawn.heading) * 3.2);
      // desplazar a la izquierda de la pantalla para dejar sitio al panel
      const right = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(target, cam.position).normalize(), new THREE.Vector3(0, 1, 0)).normalize();
      cam.position.addScaledVector(right, 1.0);
      cam.lookAt(target.clone().addScaledVector(right, 1.0));
    }
  }
}
