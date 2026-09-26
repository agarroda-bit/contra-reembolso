// La interfaz en pantalla: lee game.hud cada frame y solo toca el DOM cuando algo cambia.
import * as THREE from 'three';
import type { Game, System } from '../../core/game';
import type { HudState } from '../../core/contracts';
import { Minimap, invalidateMapSource } from './minimap';
import { BigMap } from './bigmap';
import { Notifications } from './notifications';
import { formatMoney, formatClock, formatTimer, healthColor, clamp01, esc } from './format';

const DISTRICT_COLORS: Record<string, string> = {
  puerto: '#2ec4b6', centro: '#ff4f81', colina: '#ffd23f', poligono: '#ff7b54', viejo: '#6c3bd1',
};

const SIREN_SVG = `<svg viewBox="0 0 36 32" aria-hidden="true">
  <g class="rayos"><path d="M3 9 L7 11"/><path d="M33 9 L29 11"/><path d="M18 1 V4"/><path d="M8 3 L10 6"/><path d="M28 3 L26 6"/></g>
  <path class="domo" d="M10 23 V16 a8 8 0 0 1 16 0 V23 Z"/>
  <path class="reflejo" d="M14 16 a4 4 0 0 1 4 -4"/>
  <rect class="base" x="6" y="23" width="24" height="6" rx="2"/>
</svg>`;

/** Umbral de fama por nivel por defecto (el sistema de progreso puede sustituirlo). */
export function defaultFameThreshold(level: number): number {
  return (100 * (level - 1) * level) / 2; // Nv2: 100, Nv3: 300, Nv4: 600, Nv5: 1000...
}

type JobView = {
  el: HTMLElement; title: HTMLElement; timer: HTMLElement; bar: HTMLElement; fill: HTMLElement; pct: HTMLElement;
  // últimos valores pintados (para tocar el DOM solo si cambian)
  lTitle: string | null; lColor: string | null; lSecs: number; lInteg: number;
};

export interface Hud {
  readonly root: HTMLElement;
  readonly system: System;
  readonly minimap: Minimap;
  readonly bigMap: BigMap;
  /** Abre o cierra el mapa grande por código. */
  openMap(): void;
  closeMap(): void;
  isMapOpen(): boolean;
  /** Umbral de puntos de fama para llegar a un nivel (sustituible). */
  fameThreshold: (level: number) => number;
  /** Nombre de la app de mensajería en las notificaciones. */
  phoneAppName: string;
  /** Posición y rumbo (0 = norte) que usa el HUD; útil para otros módulos. */
  readonly view: { x: number; z: number; heading: number };
  /**
   * Opcional: de dónde sacar la posición del jugador. Por defecto game.mod.player.position
   * (y si no hay jugador, la cámara). Útil si al conducir el jugador no sigue al coche:
   * hud.follow = () => cocheActual?.position ?? null
   */
  follow: (() => { x: number; z: number } | null | undefined) | null;
  /**
   * true si el HUD se ha quedado la tecla de pausa (Esc) este frame: el mapa está abierto
   * o se acaba de cerrar con ella. El menú de pausa debe ignorar 'pause' en ese caso.
   */
  ownsPauseKey(): boolean;
  /** Llamar si el mundo repinta world.mapCanvas o cambia la lista de sitios (pois). */
  refreshMap(): void;
  /** Coste medio por frame en ms (solo JS; para depurar rendimiento). */
  readonly stats: { hudMs: number; minimapMs: number };
  dispose(): void;
}

export class HudImpl implements Hud {
  readonly root: HTMLElement;
  readonly system: System;
  readonly minimap = new Minimap();
  readonly bigMap: BigMap;
  readonly notes = new Notifications();
  fameThreshold = defaultFameThreshold;
  phoneAppName = 'Paquetín';
  readonly view = { x: 0, z: 0, heading: 0 };
  follow: (() => { x: number; z: number } | null | undefined) | null = null;
  readonly stats = { hudMs: 0, minimapMs: 0 };

  private $: Record<string, HTMLElement> = {};
  private mapClosedFrame = -1;
  private jobViews = new Map<string, JobView>();
  private last: Record<string, unknown> = {};
  private offs: (() => void)[] = [];
  private tmpDir = new THREE.Vector3();
  private lastReal = performance.now();
  private radioTimer = 0;
  private mapPrev: { paused: boolean; input: boolean } | null = null;
  private sirens: HTMLElement[] = [];

  constructor(private game: Game) {
    const root = document.createElement('div');
    root.className = 'cr-hud';
    root.style.pointerEvents = 'none';
    this.root = root;
    root.innerHTML = TEMPLATE;
    const q = (sel: string) => root.querySelector(sel) as HTMLElement;
    const ids = [
      'efectivo', 'banco', 'dinero', 'famaNivel', 'famaBarra', 'reloj', 'relojIco', 'sirenas',
      'vida', 'vidaBarra', 'chaleco', 'chalecoBarra', 'aguante', 'aguanteBarra',
      'encargos', 'encargosLista', 'arma', 'armaIco', 'armaNombre', 'armaCargador', 'armaReserva',
      'vehiculo', 'vehNombre', 'vehVel', 'vehArco', 'vehSalud', 'vehSaludBarra', 'vehPaquetes', 'vehRadio',
      'radio', 'radioNombre', 'radioPrograma', 'reticula', 'pista', 'bl', 'tr', 'br', 'dano', 'critico',
    ];
    for (const id of ids) this.$[id] = q(`[data-id="${id}"]`);
    this.sirens = [...this.$.sirenas.querySelectorAll<HTMLElement>('.hud-sirena')];

    // minimapa y barras abajo a la izquierda
    this.$.bl.prepend(this.minimap.el);
    // mensajes
    root.append(this.notes.notifList, this.notes.toastBox, this.notes.districtBox);
    this.$.dinero.appendChild(this.notes.moneyBox);
    // mapa grande
    this.bigMap = new BigMap(game);
    root.appendChild(this.bigMap.el);
    // las notificaciones no deben tapar el arma ni el vehículo
    this.notes.bottomLimit = () => {
      const br = this.$.br;
      return br.offsetHeight > 0 ? br.getBoundingClientRect().top - 12 : window.innerHeight - 20;
    };

    game.ui.appendChild(root);
    game.ui.classList.add('cr-hud-on');
    this.minimap.resize();

    const ev = game.events;
    this.offs.push(
      ev.on('notify', (p) => {
        this.notes.appName = this.phoneAppName;
        this.notes.notify(p);
      }),
      ev.on('toast', (p) => this.notes.toast(p)),
      ev.on('district', (p) => {
        const d = game.world?.districts.find((x) => x.id === p.id);
        this.notes.district(p.name, d?.color || DISTRICT_COLORS[p.id] || '#ffd23f');
      }),
      ev.on('player:hurt', (p) => {
        // destello rojo en los bordes de la pantalla (más fuerte cuanto más daño)
        const el = this.$.dano;
        el.style.setProperty('--dano', String(Math.min(1, 0.35 + (p.amount || 0) / 40)));
        el.classList.remove('hud-dano--golpe');
        void el.offsetWidth;
        el.classList.add('hud-dano--golpe');
      }),
      ev.on('money', (p) => {
        // el evento trae los totales nuevos: los copiamos por si quien lo lanza aún no ha
        // tocado game.hud (si ya lo hizo, son los mismos valores)
        if (Number.isFinite(p.cash)) game.hud.cash = p.cash;
        if (Number.isFinite(p.bank)) game.hud.bank = p.bank;
        this.notes.money(p.delta, p.reason);
        const el = this.$.efectivo;
        el.classList.remove('hud-flash-mas', 'hud-flash-menos');
        void el.offsetWidth; // reinicia la animación
        el.classList.add(p.delta >= 0 ? 'hud-flash-mas' : 'hud-flash-menos');
      }),
    );

    this.system = {
      name: 'hud',
      postUpdate: () => this.frame(false),
      pausedUpdate: () => this.frame(true),
    };
    game.addSystem(this.system);
  }

  isMapOpen() {
    return this.bigMap.isOpen();
  }

  ownsPauseKey() {
    return this.bigMap.isOpen() || this.mapClosedFrame === this.game.time.frame;
  }

  openMap() {
    const world = this.game.world;
    if (!world || this.bigMap.isOpen()) return;
    this.updateView();
    this.mapPrev = { paused: this.game.paused, input: this.game.input.enabled };
    this.game.paused = true;
    this.game.input.enabled = false;
    this.game.input.releaseAll();
    this.game.input.exitPointerLock();
    this.root.classList.add('cr-hud--mapa');
    this.bigMap.show(world, this.view.x, this.view.z, this.view.heading);
    this.game.events.emit('hud:map', { open: true });
  }

  closeMap() {
    if (!this.bigMap.isOpen()) return;
    this.bigMap.hide();
    this.root.classList.remove('cr-hud--mapa');
    const prev = this.mapPrev ?? { paused: false, input: true };
    this.game.paused = prev.paused;
    this.game.input.enabled = prev.input;
    this.mapPrev = null;
    this.mapClosedFrame = this.game.time.frame;
    this.game.events.emit('hud:map', { open: false });
  }

  refreshMap() {
    const map = this.game.world?.mapCanvas;
    if (map) invalidateMapSource(map);
    this.minimap.invalidate();
    this.bigMap.invalidate();
  }

  dispose() {
    this.closeMap();
    for (const off of this.offs) off();
    this.minimap.dispose();
    this.bigMap.dispose();
    this.notes.dispose();
    this.game.removeSystem(this.system);
    this.root.remove();
    this.game.ui.classList.remove('cr-hud-on');
    if (this.game.mod.hud === this) delete this.game.mod.hud;
  }

  /** Posición del jugador (o de la cámara) y rumbo de la cámara. */
  private updateView() {
    const game = this.game;
    const f = this.follow?.();
    const p = (f ?? game.mod.player?.position) as { x: number; z: number } | undefined;
    const src = p && Number.isFinite(p.x) && Number.isFinite(p.z) ? p : game.camera.position;
    this.view.x = src.x;
    this.view.z = src.z;
    const d = game.camera.getWorldDirection(this.tmpDir);
    if (d.x * d.x + d.z * d.z > 1e-6) this.view.heading = Math.atan2(d.x, -d.z);
  }

  private frame(paused: boolean) {
    const now = performance.now();
    const realDt = Math.min(0.1, (now - this.lastReal) / 1000);
    this.lastReal = now;
    const game = this.game;
    const hud = game.hud;

    // visibilidad
    if (hud.visible !== this.last.visible) {
      this.last.visible = hud.visible;
      this.root.classList.toggle('cr-hud--oculto', !hud.visible);
      if (!hud.visible) this.closeMap();
    }

    // mapa grande: M abre (jugando, sin menús); M o Esc cierran (en pausa).
    // Input deja pasar 'map' aunque esté desactivado (para poder cerrar): por eso solo se
    // abre con input.enabled, si no la M abriría el mapa encima del móvil o de una tienda.
    if (this.bigMap.isOpen()) {
      if (game.input.pressed('map') || game.input.pressed('pause')) this.closeMap();
    } else if (!paused && hud.visible && game.input.enabled && game.input.pressed('map')) {
      this.openMap();
    }

    if (!hud.visible) return;
    this.updateView();
    const world = game.world;
    if (this.bigMap.isOpen()) {
      if (world) this.bigMap.draw(world, this.view.x, this.view.z, this.view.heading, realDt);
      return; // con el mapa abierto no hace falta pintar lo de debajo
    }
    if (world) {
      const t0 = performance.now();
      this.minimap.draw(game, world, this.view.x, this.view.z, this.view.heading, realDt);
      this.stats.minimapMs += (performance.now() - t0 - this.stats.minimapMs) * 0.05;
    }
    this.updateTopRight(hud);
    this.updateBars(hud);
    this.updateJobs(hud);
    this.updateWeapon(hud);
    this.updateVehicle(hud, realDt);
    this.updateCenter(hud);
    this.stats.hudMs += (performance.now() - now - this.stats.hudMs) * 0.05;
  }

  private changed(key: string, v: unknown): boolean {
    if (this.last[key] === v) return false;
    this.last[key] = v;
    return true;
  }

  private updateTopRight(hud: HudState) {
    const $ = this.$;
    if (this.changed('cash', Math.round(hud.cash))) $.efectivo.textContent = formatMoney(hud.cash);
    if (this.changed('bank', Math.round(hud.bank))) $.banco.textContent = formatMoney(hud.bank);
    if (this.changed('fameLevel', hud.fameLevel)) $.famaNivel.textContent = String(hud.fameLevel);
    const lo = this.fameThreshold(hud.fameLevel), hi = this.fameThreshold(hud.fameLevel + 1);
    const f = hi > lo ? clamp01((hud.fame - lo) / (hi - lo)) : 1;
    if (this.changed('fameF', Math.round(f * 200))) $.famaBarra.style.transform = `scaleX(${f.toFixed(3)})`;
    const clock = this.game.clock;
    // solo se formatea cuando cambia el minuto (sin crear textos cada frame)
    if (this.changed('clockMin', clock.day * 1440 + Math.floor(clock.hour * 60))) {
      $.reloj.textContent = formatClock(clock.day, clock.hour);
      const h = clock.hour;
      $.relojIco.textContent = h >= 7.5 && h < 20 ? '☀️' : (h >= 20 && h < 21.5) || (h >= 6 && h < 7.5) ? '🌅' : '🌙';
    }
    const wanted = Math.max(0, Math.min(5, Math.round(hud.wanted)));
    const prevW = this.last.wanted as number | undefined;
    if (this.changed('wanted', wanted)) {
      this.sirens.forEach((s, i) => s.classList.toggle('hud-sirena--on', i < wanted));
      $.sirenas.classList.toggle('hud-sirenas--activa', wanted > 0);
      if (prevW !== undefined && wanted > prevW) {
        $.sirenas.classList.remove('hud-sirenas--sube');
        void $.sirenas.offsetWidth;
        $.sirenas.classList.add('hud-sirenas--sube');
      }
    }
  }

  private updateBars(hud: HudState) {
    const $ = this.$;
    const hf = hud.maxHealth > 0 ? clamp01(hud.health / hud.maxHealth) : 0;
    if (this.changed('hp', Math.round(hf * 300))) {
      $.vidaBarra.style.transform = `scaleX(${hf.toFixed(3)})`;
      $.vidaBarra.style.backgroundColor = healthColor(hf);
      $.vida.classList.toggle('hud-barra--critica', hf < 0.25);
      $.critico.classList.toggle('hud-dano--latido', hf > 0 && hf < 0.25);
    }
    const af = clamp01(hud.armor / 100);
    if (this.changed('armor', Math.round(af * 300))) {
      $.chalecoBarra.style.transform = `scaleX(${af.toFixed(3)})`;
      $.chaleco.classList.toggle('hud-barra--vacia', af <= 0);
    }
    const sf = clamp01(hud.stamina / 100);
    if (this.changed('stamina', Math.round(sf * 300))) {
      $.aguanteBarra.style.transform = `scaleX(${sf.toFixed(3)})`;
      $.aguante.classList.toggle('hud-oculto', sf >= 0.999);
    }
  }

  private updateJobs(hud: HudState) {
    const jobs = hud.jobs;
    const $ = this.$;
    if (this.changed('jobsN', jobs.length)) $.encargos.classList.toggle('hud-oculto', jobs.length === 0);
    // quitar los que ya no están
    for (const [id, v] of this.jobViews) {
      if (!jobs.some((j) => j.id === id)) {
        v.el.remove();
        this.jobViews.delete(id);
      }
    }
    for (let i = 0; i < jobs.length; i++) {
      const j = jobs[i];
      let v = this.jobViews.get(j.id);
      if (!v) {
        const el = document.createElement('div');
        el.className = 'hud-encargo';
        el.innerHTML = `<div class="hud-encargo__fila"><span class="hud-encargo__titulo"></span><span class="hud-encargo__tiempo cr-num"></span></div>
          <div class="hud-encargo__integridad"><span class="cr-emoji">📦</span><div class="hud-mini-barra"><i></i></div><span class="hud-encargo__pct cr-num"></span></div>`;
        v = {
          el,
          title: el.querySelector('.hud-encargo__titulo')!,
          timer: el.querySelector('.hud-encargo__tiempo')!,
          bar: el.querySelector('.hud-encargo__integridad')!,
          fill: el.querySelector('.hud-mini-barra i')!,
          pct: el.querySelector('.hud-encargo__pct')!,
          lTitle: null, lColor: null, lSecs: -2, lInteg: -2,
        };
        this.jobViews.set(j.id, v);
      }
      if ($.encargosLista.children[i] !== v.el) $.encargosLista.insertBefore(v.el, $.encargosLista.children[i] ?? null);
      if (v.lTitle !== j.title) {
        v.lTitle = j.title;
        v.title.textContent = j.title;
      }
      const color = j.color || '#ffd23f';
      if (v.lColor !== color) {
        v.lColor = color;
        v.el.style.setProperty('--encargo-color', color);
      }
      const secs = j.timeLeft == null ? -1 : Math.max(0, Math.ceil(j.timeLeft));
      if (v.lSecs !== secs) {
        v.lSecs = secs;
        v.timer.hidden = secs < 0;
        if (secs >= 0) v.timer.textContent = formatTimer(secs);
        v.timer.classList.toggle('hud-encargo__tiempo--urgente', secs >= 0 && secs < 30);
      }
      const integ = j.integrity == null ? -1 : Math.max(0, Math.min(100, Math.round(j.integrity)));
      if (v.lInteg !== integ) {
        const drop = v.lInteg >= 0 && integ >= 0 && integ < v.lInteg;
        v.lInteg = integ;
        v.bar.hidden = integ < 0;
        if (integ >= 0) {
          const f = integ / 100;
          v.fill.style.transform = `scaleX(${f.toFixed(3)})`;
          v.fill.style.backgroundColor = healthColor(f);
          v.pct.textContent = `${integ}%`;
        }
        // golpe al paquete: la tarjeta tiembla
        if (drop) {
          v.el.classList.remove('hud-encargo--golpe');
          void v.el.offsetWidth;
          v.el.classList.add('hud-encargo--golpe');
        }
      }
    }
  }

  private updateWeapon(hud: HudState) {
    const w = hud.weapon;
    const $ = this.$;
    if (this.changed('hasWeapon', !!w)) $.arma.classList.toggle('hud-oculto', !w);
    if (!w) return;
    if (this.changed('wIcon', w.icon)) $.armaIco.textContent = w.icon;
    if (this.changed('wName', w.name)) {
      $.armaNombre.textContent = w.name;
      $.arma.classList.remove('hud-arma--cambia');
      void $.arma.offsetWidth;
      $.arma.classList.add('hud-arma--cambia');
    }
    if (this.changed('wClip', w.infinite ? -1 : w.clip)) {
      $.armaCargador.textContent = w.infinite ? '∞' : String(w.clip);
      $.armaCargador.classList.toggle('hud-arma__cargador--vacio', !w.infinite && w.clip <= 0);
    }
    if (this.changed('wRes', w.infinite ? -1 : w.reserve)) $.armaReserva.textContent = w.infinite ? '' : `/ ${w.reserve}`;
  }

  private updateVehicle(hud: HudState, realDt: number) {
    const v = hud.vehicle;
    const $ = this.$;
    if (this.changed('hasVeh', !!v)) {
      $.vehiculo.classList.toggle('hud-oculto', !v);
      this.root.classList.toggle('cr-hud--vehiculo', !!v);
    }
    if (v) {
      if (this.changed('vName', v.name)) $.vehNombre.textContent = v.name;
      const kmh = Math.max(0, Math.round(Math.abs(v.speedKmh)));
      if (this.changed('vKmh', kmh)) {
        $.vehVel.textContent = String(kmh);
        const f = clamp01(kmh / 180);
        $.vehArco.style.strokeDashoffset = String((1 - f) * ARC_LEN);
        $.vehiculo.classList.toggle('hud-vehiculo--rapido', kmh > 110);
      }
      const hf = clamp01(v.health / 100);
      if (this.changed('vHp', Math.round(hf * 200))) {
        $.vehSaludBarra.style.transform = `scaleX(${hf.toFixed(3)})`;
        $.vehSaludBarra.style.backgroundColor = healthColor(hf);
        $.vehSalud.classList.toggle('hud-barra--critica', hf < 0.25);
      }
      const pk = v.capacity ? `${v.packages ?? 0}/${v.capacity}` : '';
      if (this.changed('vPk', pk)) {
        $.vehPaquetes.hidden = !pk;
        $.vehPaquetes.innerHTML = `<span class="cr-emoji">📦</span> ${pk}`;
      }
    }
    // radio: cartel al cambiar de emisora o de programa
    const r = hud.radio;
    const station = r?.station ?? '';
    const show = r?.show ?? '';
    const stationChanged = this.changed('rStation', station);
    const showChanged = this.changed('rShow', show);
    if (stationChanged || showChanged) {
      $.vehRadio.innerHTML = station ? `<span class="cr-emoji">📻</span> ${esc(station)}` : '';
      $.vehRadio.hidden = !station;
      if (station) {
        // el texto del cartel siempre al día (aunque el programa se quede vacío)
        $.radioNombre.textContent = station;
        $.radioPrograma.textContent = show;
        $.radioPrograma.hidden = !show;
      }
      if (station && (stationChanged || show)) {
        $.radio.classList.remove('hud-radio--ve');
        void $.radio.offsetWidth;
        $.radio.classList.add('hud-radio--ve');
        this.radioTimer = stationChanged ? 4.5 : 3.5;
      } else if (!station) {
        this.radioTimer = 0;
        $.radio.classList.remove('hud-radio--ve');
      }
    }
    if (this.radioTimer > 0) {
      this.radioTimer -= realDt;
      if (this.radioTimer <= 0) $.radio.classList.remove('hud-radio--ve');
    }
  }

  private updateCenter(hud: HudState) {
    const $ = this.$;
    if (this.changed('cross', hud.crosshair)) $.reticula.classList.toggle('hud-oculto', !hud.crosshair);
    if (this.changed('hint', hud.hint)) {
      if (!hud.hint) {
        $.pista.classList.add('hud-oculto');
      } else {
        const m = /^\s*([^\s—–-][^—–-]{0,9}?)\s+[—–-]\s+(.+)$/.exec(hud.hint);
        $.pista.innerHTML = m
          ? `<span class="cr-tecla">${esc(m[1].trim())}</span><span>${esc(m[2])}</span>`
          : `<span>${esc(hud.hint)}</span>`;
        $.pista.classList.remove('hud-oculto');
        $.pista.classList.remove('hud-pista--entra');
        void $.pista.offsetWidth;
        $.pista.classList.add('hud-pista--entra');
      }
    }
  }
}

const ARC_LEN = 245; // longitud del arco del velocímetro (ver TEMPLATE)

const TEMPLATE = `
<div class="hud-dano" data-id="dano"></div>
<div class="hud-dano hud-dano--critico" data-id="critico"></div>
<div class="hud-tr" data-id="tr">
  <div class="hud-dinero" data-id="dinero">
    <div class="hud-dinero__fila hud-dinero__fila--efectivo">
      <span class="hud-dinero__etq">Efectivo</span>
      <span class="hud-efectivo cr-num" data-id="efectivo">0 €</span>
    </div>
    <div class="hud-dinero__fila hud-dinero__fila--banco">
      <span class="hud-dinero__etq hud-dinero__etq--banco">Banco</span>
      <span class="hud-banco cr-num" data-id="banco">0 €</span>
    </div>
  </div>
  <div class="hud-estado">
    <div class="hud-fama" title="Fama">
      <span class="hud-fama__estrella"><span class="hud-fama__ico">★</span><b data-id="famaNivel">1</b></span>
      <span class="hud-fama__txt">Fama</span>
      <span class="hud-fama__barra"><i data-id="famaBarra"></i></span>
    </div>
    <div class="hud-reloj"><span class="cr-emoji" data-id="relojIco">☀️</span><span class="cr-num" data-id="reloj">Día 1 · 08:30</span></div>
  </div>
  <div class="hud-sirenas" data-id="sirenas">
    ${Array.from({ length: 5 }, (_, i) => `<span class="hud-sirena" style="--i:${i}">${SIREN_SVG}</span>`).join('')}
  </div>
</div>

<div class="hud-tl hud-oculto" data-id="encargos">
  <div class="hud-encargos__cab"><span class="cr-emoji">📦</span> Encargos</div>
  <div class="hud-encargos__lista" data-id="encargosLista"></div>
</div>

<div class="hud-bl" data-id="bl">
  <div class="hud-barras">
    <div class="hud-barra" data-id="vida"><span class="hud-barra__ico hud-barra__ico--vida">♥</span><div class="hud-barra__pista"><i data-id="vidaBarra"></i></div></div>
    <div class="hud-barra" data-id="chaleco"><span class="hud-barra__ico hud-barra__ico--chaleco">⛨</span><div class="hud-barra__pista"><i data-id="chalecoBarra" class="hud-barra--azul"></i></div></div>
    <div class="hud-barra hud-oculto" data-id="aguante"><span class="hud-barra__ico hud-barra__ico--aguante">⚡</span><div class="hud-barra__pista"><i data-id="aguanteBarra" class="hud-barra--amarilla"></i></div></div>
  </div>
</div>

<div class="hud-br" data-id="br">
  <div class="hud-vehiculo hud-oculto" data-id="vehiculo">
    <div class="hud-velocimetro">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <path class="hud-velocimetro__fondo" d="M 23.2 96.8 A 52 52 0 1 1 96.8 96.8" />
        <path class="hud-velocimetro__arco" data-id="vehArco" d="M 23.2 96.8 A 52 52 0 1 1 96.8 96.8" style="stroke-dasharray:${ARC_LEN};stroke-dashoffset:${ARC_LEN}" />
      </svg>
      <div class="hud-velocimetro__num cr-num" data-id="vehVel">0</div>
      <div class="hud-velocimetro__ud">km/h</div>
    </div>
    <div class="hud-vehiculo__info">
      <div class="hud-vehiculo__nombre" data-id="vehNombre"></div>
      <div class="hud-barra hud-barra--veh" data-id="vehSalud"><span class="hud-barra__ico hud-barra__ico--llave cr-emoji">🔧</span><div class="hud-barra__pista"><i data-id="vehSaludBarra"></i></div></div>
      <div class="hud-vehiculo__fila">
        <span class="hud-vehiculo__paquetes cr-num" data-id="vehPaquetes" hidden></span>
        <span class="hud-vehiculo__radio" data-id="vehRadio" hidden></span>
      </div>
    </div>
  </div>
  <div class="hud-arma hud-oculto" data-id="arma">
    <div class="hud-arma__ico cr-emoji" data-id="armaIco"></div>
    <div class="hud-arma__info">
      <div class="hud-arma__nombre" data-id="armaNombre"></div>
      <div class="hud-arma__muni cr-num"><b data-id="armaCargador">0</b><span data-id="armaReserva"></span></div>
    </div>
  </div>
</div>

<div class="hud-radio" data-id="radio">
  <div class="hud-radio__ico cr-emoji">📻</div>
  <div class="hud-radio__txt">
    <div class="hud-radio__nombre" data-id="radioNombre"></div>
    <div class="hud-radio__programa" data-id="radioPrograma"></div>
  </div>
</div>
<div class="hud-reticula hud-oculto" data-id="reticula"><i></i><i></i><i></i><i></i><b></b></div>
<div class="hud-pista hud-oculto" data-id="pista"></div>
`;
