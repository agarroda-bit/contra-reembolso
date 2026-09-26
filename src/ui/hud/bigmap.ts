// Mapa grande (tecla M): isla entera, iconos con nombre al pasar el ratón, leyenda, zoom, arrastre y destino.
import type { Game } from '../../core/game';
import type { Poi, PoiKind, WorldData } from '../../core/contracts';
import { POI_STYLE, LEGEND_ORDER, badgeSprite, pinSprite, drawPlayerArrow, NOCHE, UI_FONT } from './icons';
import { sampleSeaColor, mapSource } from './minimap';
import { esc, formatDistance } from './format';

const DEFAULT_MARKER = '#ff4f81';
// posiciones candidatas del nombre del barrio (en altos de letra y anchos del texto)
const LABEL_DY = [0, -0.9, 0.9, -1.7, 1.7, -2.5, 2.5];
const LABEL_DX = [0, -0.35, 0.35, -0.7, 0.7];
const DEFAULT_WAYPOINT = '#ffd23f';
const DISTRICT_COLORS: Record<string, string> = {
  puerto: '#2ec4b6', centro: '#ff4f81', colina: '#ffd23f', poligono: '#ff7b54', viejo: '#6c3bd1',
};
// Cómo pinta el mapa de la isla los nombres de barrio (src/world/island/map.ts): esta letra, 15 m de
// alto y un borde blanco de 3,5 m (1,75 m por fuera de la letra).
const MAP_LABEL_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const MAP_LABEL_SIZE_M = 15;
/** Grosor del borde oscuro de nuestro nombre encima del pintado: 2,5 m por fuera, lo tapa con margen. */
const COVER_LINE_M = 5;

type Hover =
  | { type: 'poi'; poi: Poi; x: number; y: number }
  | { type: 'marker'; label: string; icon: string; x: number; y: number }
  | { type: 'waypoint'; label: string; x: number; y: number }
  | { type: 'player'; x: number; y: number }
  | null;

export class BigMap {
  readonly el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private area: HTMLElement;
  private tip: HTMLElement;
  private legend: HTMLElement;
  private title: HTMLElement;
  private titleHidden = false;
  private dpr = 1;
  private W = 800;
  private H = 600;
  private open = false;
  private world: WorldData | null = null;
  /** Vista: centro (metros) y escala (px CSS por metro). */
  private cx = 0;
  private cz = 0;
  private scale = 1;
  private fitScale = 1;
  private drag: { id: number; x: number; y: number; cx: number; cz: number; moved: boolean } | null = null;
  private mouse = { x: -1, y: -1, inside: false };
  private hover: Hover = null;
  private highlightKind: PoiKind | null = null;
  private legendFor: WorldData | null = null;
  private seaColor = '#2f8fd0';
  private seaFor: HTMLCanvasElement | null = null;
  /** Dónde trae pintados el mapa del mundo los nombres de barrio (este mapa los tapa con los suyos). */
  private baked: BakedLabels | null = null;
  private wavePattern: CanvasPattern | null = null;
  private waveMatrix: DOMMatrix | null = null;
  private t = 0;
  private player = { x: 0, z: 0, heading: 0 };
  // vectores temporales reutilizados (sin basura por frame)
  private o = { x: 0, y: 0 };
  private q = { x: 0, y: 0 };
  private pp = { x: 0, y: 0 };
  private wpS = { x: 0, y: 0 };
  private pk = { x: 0, y: 0 };
  private abort = new AbortController();

  constructor(private game: Game) {
    this.el = document.createElement('div');
    this.el.className = 'hud-mapa';
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="hud-mapa__marco">
        <div class="hud-mapa__zona">
          <canvas class="hud-mapa__canvas"></canvas>
          <div class="hud-mapa__titulo">
            <span class="hud-mapa__titulo-peq">Mapa de</span>
            <span class="hud-mapa__titulo-gr">Puerto Paquete</span>
          </div>
          <div class="hud-mapa__botones">
            <button class="cr-btn cr-btn--chico" data-accion="mas" title="Acercar">＋</button>
            <button class="cr-btn cr-btn--chico" data-accion="menos" title="Alejar">－</button>
            <button class="cr-btn cr-btn--chico cr-btn--turquesa" data-accion="centrar" title="Centrar en mí">📍 Yo</button>
            <button class="cr-btn cr-btn--chico cr-btn--oscuro" data-accion="isla" title="Ver toda la isla">🏝️ Isla</button>
          </div>
          <div class="hud-mapa__tip" hidden></div>
        </div>
        <aside class="hud-mapa__leyenda">
          <div class="hud-mapa__leyenda-titulo">Leyenda</div>
          <div class="hud-mapa__leyenda-ayuda">Clic en un tipo: destino al más cercano</div>
          <ul class="hud-mapa__lista"></ul>
        </aside>
        <div class="hud-mapa__pie">
          <span><b>Rueda</b> zoom</span>
          <span><b>Arrastra</b> mover</span>
          <span><b>Clic</b> poner destino</span>
          <span><b>Clic derecho</b> quitar destino</span>
          <span><span class="cr-tecla">M</span> o <span class="cr-tecla">Esc</span> cerrar</span>
        </div>
      </div>`;
    this.area = this.el.querySelector('.hud-mapa__zona')!;
    this.canvas = this.el.querySelector('canvas')!;
    this.g = this.canvas.getContext('2d')!;
    this.tip = this.el.querySelector('.hud-mapa__tip')!;
    this.legend = this.el.querySelector('.hud-mapa__lista')!;
    this.title = this.el.querySelector('.hud-mapa__titulo')!;

    const c = this.canvas;
    c.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e));
    c.addEventListener('pointercancel', () => (this.drag = null));
    c.addEventListener('pointerleave', () => {
      this.mouse.inside = false;
      this.setHover(null);
    });
    c.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.game.hud.waypoint = null;
    });
    this.el.querySelector('.hud-mapa__botones')!.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      const a = b.dataset.accion;
      if (a === 'mas') this.zoomAt(this.W / 2, this.H / 2, 1.5);
      else if (a === 'menos') this.zoomAt(this.W / 2, this.H / 2, 1 / 1.5);
      else if (a === 'centrar') this.centerOn(this.player.x, this.player.z, Math.max(this.scale, this.fitScale * 2.2));
      else if (a === 'isla') this.fit();
      b.blur();
    });
    this.legend.addEventListener('pointerover', (e) => {
      const li = (e.target as HTMLElement).closest('li');
      this.highlightKind = (li?.dataset.tipo as PoiKind) || null;
    });
    this.legend.addEventListener('pointerleave', () => (this.highlightKind = null));
    this.legend.addEventListener('click', (e) => {
      const li = (e.target as HTMLElement).closest('li');
      const kind = li?.dataset.tipo as PoiKind | undefined;
      if (kind) this.waypointToNearest(kind);
    });
    const signal = this.abort.signal;
    window.addEventListener(
      'keydown',
      (e) => {
        if (!this.open) return;
        if (e.key === '+' || e.key === '=') this.zoomAt(this.W / 2, this.H / 2, 1.4);
        else if (e.key === '-' || e.key === '_') this.zoomAt(this.W / 2, this.H / 2, 1 / 1.4);
      },
      { signal },
    );
    window.addEventListener(
      'resize',
      () => {
        if (this.open) this.resize();
      },
      { signal },
    );
  }

  /** Quita los oyentes de la ventana. */
  dispose() {
    this.abort.abort();
  }

  isOpen() {
    return this.open;
  }

  /** Olvida lo cacheado del mapa (llamar si el mundo repinta su mapCanvas o cambian los sitios). */
  invalidate() {
    this.seaFor = null;
    this.legendFor = null;
    this.baked = null;
  }

  /**
   * Busca en los ratos libres del navegador dónde están pintados los nombres de barrio en el mapa
   * (unas decenas de ms en total, a trocitos): así abrir el mapa la primera vez no da un tirón.
   * Lo que falte se hace al abrirlo.
   */
  prepareSoon(world: WorldData) {
    const map = world.mapCanvas;
    if (!map || this.baked?.map === map) return;
    const ric = (window as any).requestIdleCallback as ((cb: (d: { timeRemaining(): number }) => void) => number) | undefined;
    const b = (this.baked = new BakedLabels(map, world));
    if (!ric) return;
    const tick = (dl: { timeRemaining(): number }) => {
      if (this.baked !== b || b.done) return;
      if (!b.step(Math.max(1, dl.timeRemaining() - 2))) ric(tick);
    };
    ric(tick);
  }

  show(world: WorldData, px: number, pz: number, heading: number) {
    this.world = world;
    this.player.x = px;
    this.player.z = pz;
    this.player.heading = heading;
    this.open = true;
    this.el.hidden = false;
    this.el.classList.remove('hud-mapa--sale');
    this.el.classList.add('hud-mapa--entra');
    this.resize();
    this.fit();
    this.buildLegend(world);
  }

  hide() {
    if (!this.open) return;
    this.open = false;
    this.drag = null;
    this.setHover(null);
    this.el.classList.remove('hud-mapa--entra');
    this.el.hidden = true;
  }

  private resize() {
    // tamaño de maquetación (sin la animación de entrada)
    this.W = Math.max(100, this.canvas.clientWidth || this.area.clientWidth);
    this.H = Math.max(100, this.canvas.clientHeight || this.area.clientHeight);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    const size = this.world?.size ?? 600;
    this.fitScale = Math.min(this.W, this.H) / (size * 0.94);
  }

  private fit() {
    this.cx = 0;
    this.cz = 0;
    this.scale = this.fitScale;
  }

  private centerOn(x: number, z: number, scale?: number) {
    this.cx = x;
    this.cz = z;
    if (scale) this.scale = this.clampScale(scale);
    this.clampView();
  }

  private clampScale(s: number) {
    return Math.min(this.fitScale * 9, Math.max(this.fitScale * 0.75, s));
  }

  private clampView() {
    const half = (this.world?.size ?? 600) / 2;
    this.cx = Math.max(-half, Math.min(half, this.cx));
    this.cz = Math.max(-half, Math.min(half, this.cz));
  }

  private toScreen(x: number, z: number, out: { x: number; y: number }) {
    out.x = this.W / 2 + (x - this.cx) * this.scale;
    out.y = this.H / 2 + (z - this.cz) * this.scale;
    return out;
  }

  private toWorld(sx: number, sy: number) {
    return { x: this.cx + (sx - this.W / 2) / this.scale, z: this.cz + (sy - this.H / 2) / this.scale };
  }

  private zoomAt(sx: number, sy: number, factor: number) {
    const before = this.toWorld(sx, sy);
    this.scale = this.clampScale(this.scale * factor);
    const after = this.toWorld(sx, sy);
    this.cx += before.x - after.x;
    this.cz += before.z - after.z;
    this.clampView();
  }

  private local(e: PointerEvent | WheelEvent | MouseEvent) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault();
    const p = this.local(e);
    const dy = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
    this.zoomAt(p.x, p.y, Math.exp(-Math.max(-300, Math.min(300, dy)) * 0.0022));
  }

  private onDown(e: PointerEvent) {
    if (e.button !== 0) return;
    const p = this.local(e);
    this.drag = { id: e.pointerId, x: p.x, y: p.y, cx: this.cx, cz: this.cz, moved: false };
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* sin captura */
    }
  }

  private onMove(e: PointerEvent) {
    const p = this.local(e);
    this.mouse.x = p.x;
    this.mouse.y = p.y;
    this.mouse.inside = true;
    if (this.drag && this.drag.id === e.pointerId) {
      const dx = p.x - this.drag.x, dy = p.y - this.drag.y;
      if (!this.drag.moved && dx * dx + dy * dy > 25) this.drag.moved = true;
      if (this.drag.moved) {
        this.cx = this.drag.cx - dx / this.scale;
        this.cz = this.drag.cz - dy / this.scale;
        this.clampView();
      }
    }
  }

  private onUp(e: PointerEvent) {
    if (!this.drag || this.drag.id !== e.pointerId) return;
    const moved = this.drag.moved;
    this.drag = null;
    if (moved || e.button !== 0) return;
    const p = this.local(e);
    const h = this.pick(p.x, p.y);
    if (h?.type === 'poi') {
      this.game.hud.waypoint = { x: h.poi.door.x, z: h.poi.door.z, label: h.poi.name };
    } else {
      const w = this.toWorld(p.x, p.y);
      this.game.hud.waypoint = { x: w.x, z: w.z, label: 'Destino' };
    }
  }

  private waypointToNearest(kind: PoiKind) {
    const w = this.world;
    if (!w) return;
    let best: Poi | null = null;
    let bd = Infinity;
    for (const p of w.pois) {
      if (p.kind !== kind) continue;
      const d = (p.door.x - this.player.x) ** 2 + (p.door.z - this.player.z) ** 2;
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    if (best) this.game.hud.waypoint = { x: best.door.x, z: best.door.z, label: best.name };
  }

  private buildLegend(world: WorldData) {
    if (this.legendFor === world && this.legend.childElementCount) return;
    this.legendFor = world;
    const counts = new Map<PoiKind, number>();
    for (const p of world.pois) counts.set(p.kind, (counts.get(p.kind) ?? 0) + 1);
    let html = '';
    for (const kind of LEGEND_ORDER) {
      const n = counts.get(kind);
      if (!n) continue;
      const st = POI_STYLE[kind];
      const ico = kind === 'health' ? '<b class="hud-mapa__cruz">+</b>' : `<span class="cr-emoji">${st.icon}</span>`;
      html += `<li data-tipo="${kind}"><span class="hud-mapa__ico" style="background:${st.color}">${ico}</span>
        <span class="hud-mapa__nombre">${esc(st.label)}</span>${n > 1 ? `<span class="hud-mapa__n">×${n}</span>` : ''}</li>`;
    }
    html += `<li class="hud-mapa__sep"></li>
      <li class="hud-mapa__fijos">
        <span><span class="hud-mapa__ico hud-mapa__ico--tu">➤</span>Tú</span>
        <span><span class="hud-mapa__ico" style="background:${DEFAULT_WAYPOINT}"><span class="cr-emoji">🏁</span></span>Destino</span>
        <span><span class="hud-mapa__ico" style="background:${DEFAULT_MARKER}"><span class="cr-emoji">❗</span></span>Avisos</span>
      </li>`;
    this.legend.innerHTML = html;
  }

  /** Lo que hay bajo el ratón (px CSS dentro del canvas). Sin crear funciones por frame. */
  private pick(sx: number, sy: number): Hover {
    const w = this.world;
    if (!w) return null;
    const p = this.pk;
    const R2 = 15 * 15;
    let bd = R2;
    let kind = 0; // 0 nada, 1 destino, 2 marcador, 3 sitio, 4 jugador
    let bi = -1;
    let bx = 0, by = 0;
    const wp = this.game.hud.waypoint;
    if (wp) {
      this.toScreen(wp.x, wp.z, p);
      const d = (p.x - sx) ** 2 + (p.y - sy) ** 2;
      if (d < bd) { bd = d; kind = 1; bx = p.x; by = p.y; }
    }
    const markers = this.game.hud.markers;
    for (let i = 0; i < markers.length; i++) {
      this.toScreen(markers[i].x, markers[i].z, p);
      const d = (p.x - sx) ** 2 + (p.y - sy) ** 2;
      if (d < bd) { bd = d; kind = 2; bi = i; bx = p.x; by = p.y; }
    }
    for (let i = 0; i < w.pois.length; i++) {
      this.toScreen(w.pois[i].door.x, w.pois[i].door.z, p);
      const d = (p.x - sx) ** 2 + (p.y - sy) ** 2;
      if (d < bd) { bd = d; kind = 3; bi = i; bx = p.x; by = p.y; }
    }
    this.toScreen(this.player.x, this.player.z, p);
    {
      const d = (p.x - sx) ** 2 + (p.y - sy) ** 2;
      if (d < bd) { bd = d; kind = 4; bx = p.x; by = p.y; }
    }
    // solo se crea el objeto si cambia lo señalado (o su posición en pantalla)
    const h = this.hover;
    if (kind === 1 && wp) {
      const label = wp.label ?? 'Destino';
      if (h?.type === 'waypoint' && h.label === label) return this.movedHover(h, bx, by - 22);
      return { type: 'waypoint', label, x: bx, y: by - 22 };
    }
    if (kind === 2) {
      const m = markers[bi];
      const label = m.label ?? 'Aviso';
      if (h?.type === 'marker' && h.label === label && h.icon === m.icon) return this.movedHover(h, bx, by);
      return { type: 'marker', label, icon: m.icon, x: bx, y: by };
    }
    if (kind === 3) {
      const poi = w.pois[bi];
      if (h?.type === 'poi' && h.poi === poi) return this.movedHover(h, bx, by);
      return { type: 'poi', poi, x: bx, y: by };
    }
    if (kind === 4) {
      if (h?.type === 'player') return this.movedHover(h, bx, by);
      return { type: 'player', x: bx, y: by };
    }
    return null;
  }

  private movedHover(h: NonNullable<Hover>, x: number, y: number): Hover {
    h.x = x;
    h.y = y;
    return h;
  }

  private setHover(h: Hover) {
    const prevKey = hoverKey(this.hover);
    this.hover = h;
    const key = hoverKey(h);
    if (key === prevKey) {
      if (h) this.placeTip(h);
      return;
    }
    if (!h) {
      this.tip.hidden = true;
      this.canvas.style.cursor = '';
      return;
    }
    let html = '';
    if (h.type === 'poi') {
      const st = POI_STYLE[h.poi.kind];
      const d = Math.hypot(h.poi.door.x - this.player.x, h.poi.door.z - this.player.z);
      html = `<b>${esc(h.poi.name)}</b><small>${esc(st?.label ?? '')} · ${formatDistance(d)}</small>`;
    } else if (h.type === 'marker') html = `<b><span class="cr-emoji">${esc(h.icon)}</span> ${esc(h.label)}</b>`;
    else if (h.type === 'waypoint') html = `<b>🏁 ${esc(h.label)}</b><small>Clic derecho para quitarlo</small>`;
    else html = `<b>Estás aquí</b>`;
    this.tip.innerHTML = html;
    this.tip.hidden = false;
    this.canvas.style.cursor = 'pointer';
    this.placeTip(h);
  }

  private placeTip(h: NonNullable<Hover>) {
    this.tip.style.transform = `translate(${h.x.toFixed(0)}px, ${(h.y - 18).toFixed(0)}px) translate(-50%, -100%)`;
  }

  /** Redibuja (cada frame mientras está abierto; el juego está en pausa). */
  draw(world: WorldData, px: number, pz: number, heading: number, realDt: number) {
    if (!this.open) return;
    this.world = world;
    this.player.x = px;
    this.player.z = pz;
    this.player.heading = heading;
    this.t += realDt;
    const g = this.g;
    const { W, H, dpr, scale } = this;
    const map = world.mapCanvas;
    if (this.seaFor !== map) {
      this.seaColor = sampleSeaColor(map);
      this.seaFor = map;
      this.wavePattern = null;
    }
    if (this.baked?.map !== map) this.baked = new BakedLabels(map, world);
    if (!this.baked.done) this.baked.step(Infinity);

    // hover (si no se arrastra)
    if (this.mouse.inside && !this.drag?.moved) this.setHover(this.pick(this.mouse.x, this.mouse.y));
    else if (this.drag?.moved) this.setHover(null);

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = this.seaColor;
    g.fillRect(0, 0, W, H);
    this.drawWaves(g);

    // la isla
    const half = world.size / 2;
    const o = this.o;
    this.toScreen(-half, -half, o);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    // 1 px del mapa = mapPixelSize m (igual que el minimapa), empezando en la esquina (-size/2, -size/2)
    const mps = world.mapPixelSize;
    g.drawImage(mapSource(map), 0, 0, map.width, map.height, o.x, o.y, map.width * mps * scale, map.height * mps * scale);

    this.drawGrid(g, world);

    // tamaño de los iconos según el zoom
    const base = Math.round(Math.min(34, 22 + Math.max(0, scale / this.fitScale - 1) * 3));

    // nombres de barrio: debajo de los iconos (que siempre se vean y se puedan señalar)
    this.drawDistricts(g, world, base);

    // línea al destino
    const wp = this.game.hud.waypoint;
    const pp = this.toScreen(px, pz, this.pp);
    if (wp) {
      const wpS = this.toScreen(wp.x, wp.z, this.wpS);
      g.save();
      g.setLineDash([10, 8]);
      g.lineDashOffset = -this.t * 30;
      g.lineCap = 'round';
      g.lineWidth = 6;
      g.strokeStyle = 'rgba(27,16,48,0.7)';
      g.beginPath();
      g.moveTo(pp.x, pp.y);
      g.lineTo(wpS.x, wpS.y);
      g.stroke();
      g.lineWidth = 3;
      g.strokeStyle = wp.color ?? DEFAULT_WAYPOINT;
      g.stroke();
      g.restore();
      // distancia en el centro de la línea
      const dist = formatDistance(Math.hypot(wp.x - px, wp.z - pz));
      const mx = (pp.x + wpS.x) / 2, my = (pp.y + wpS.y) / 2;
      if (Math.hypot(wpS.x - pp.x, wpS.y - pp.y) > 90) this.label(g, dist, mx, my, 13, '#fff6e0');
    }

    // sitios
    for (const poi of world.pois) {
      const st = POI_STYLE[poi.kind];
      if (!st) continue;
      this.toScreen(poi.door.x, poi.door.z, o);
      if (o.x < -30 || o.y < -30 || o.x > W + 30 || o.y > H + 30) continue;
      const hovered = this.hover?.type === 'poi' && this.hover.poi === poi;
      const dim = this.highlightKind && this.highlightKind !== poi.kind;
      const lit = this.highlightKind === poi.kind;
      const size = hovered || lit ? Math.round(base * 1.3) : base;
      if (lit) {
        g.fillStyle = 'rgba(255,246,224,0.45)';
        g.beginPath();
        g.arc(o.x, o.y, size * 0.75 + Math.sin(this.t * 6) * 2, 0, Math.PI * 2);
        g.fill();
      }
      const spr = badgeSprite(st.icon, st.color, size, dpr);
      const w = spr.width / dpr;
      g.globalAlpha = dim ? 0.35 : 1;
      g.drawImage(spr, o.x - w / 2, o.y - w / 2, w, w);
      g.globalAlpha = 1;
    }

    // marcadores
    for (const m of this.game.hud.markers) {
      this.toScreen(m.x, m.z, o);
      const size = base + 4;
      g.fillStyle = 'rgba(255,79,129,0.28)';
      g.beginPath();
      g.arc(o.x, o.y, size * 0.7 + (Math.sin(this.t * 5) + 1) * 3, 0, Math.PI * 2);
      g.fill();
      const spr = badgeSprite(m.icon, m.color ?? DEFAULT_MARKER, size, dpr);
      const w = spr.width / dpr;
      g.drawImage(spr, o.x - w / 2, o.y - w / 2, w, w);
    }

    // destino
    if (wp) {
      this.toScreen(wp.x, wp.z, o);
      const color = wp.color ?? DEFAULT_WAYPOINT;
      const r = 10 + ((this.t * 1.3) % 1) * 16;
      g.strokeStyle = color;
      g.globalAlpha = 1 - ((this.t * 1.3) % 1);
      g.lineWidth = 3;
      g.beginPath();
      g.ellipse(o.x, o.y, r, r * 0.55, 0, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
      const spr = pinSprite(color, 26, dpr);
      const w = spr.width / dpr, h = spr.height / dpr;
      g.drawImage(spr, o.x - w / 2, o.y - h + 3, w, h);
      this.label(g, wp.label ?? 'Destino', o.x, o.y + 14, 12, color);
    }

    // jugador
    g.save();
    g.translate(pp.x, pp.y);
    const pr = 16 + Math.sin(this.t * 4) * 3;
    g.fillStyle = 'rgba(255,255,255,0.3)';
    g.beginPath();
    g.arc(0, 0, pr, 0, Math.PI * 2);
    g.fill();
    g.rotate(heading);
    drawPlayerArrow(g, 24, '#ffffff');
    g.restore();

    this.drawScaleBar(g);
    this.drawCompass(g);

    const zoomed = scale > this.fitScale * 1.15;
    if (zoomed !== this.titleHidden) {
      this.titleHidden = zoomed;
      this.title.classList.toggle('hud-mapa__titulo--fuera', zoomed);
    }
  }

  private drawWaves(g: CanvasRenderingContext2D) {
    if (!this.wavePattern) {
      const c = document.createElement('canvas');
      c.width = c.height = 48;
      const w = c.getContext('2d')!;
      w.strokeStyle = 'rgba(255,255,255,0.13)';
      w.lineWidth = 2;
      w.lineCap = 'round';
      w.beginPath();
      w.moveTo(6, 14);
      w.quadraticCurveTo(11, 9, 16, 14);
      w.moveTo(30, 38);
      w.quadraticCurveTo(35, 33, 40, 38);
      w.stroke();
      this.wavePattern = g.createPattern(c, 'repeat');
    }
    if (!this.wavePattern) return;
    const o = this.toScreen(0, 0, this.pk);
    try {
      // las olas se mueven con el mapa al arrastrar (matriz reutilizada)
      const m = (this.waveMatrix ??= new DOMMatrix());
      m.e = o.x;
      m.f = o.y;
      this.wavePattern.setTransform(m);
    } catch {
      /* navegadores antiguos */
    }
    g.fillStyle = this.wavePattern;
    g.fillRect(0, 0, this.W, this.H);
  }

  private drawGrid(g: CanvasRenderingContext2D, world: WorldData) {
    const half = world.size / 2;
    const step = 100;
    const a = this.q, b = this.pk;
    g.strokeStyle = 'rgba(255,255,255,0.10)';
    g.lineWidth = 1;
    g.beginPath();
    for (let v = -half; v <= half + 0.1; v += step) {
      this.toScreen(v, -half, a);
      this.toScreen(v, half, b);
      g.moveTo(Math.round(a.x) + 0.5, a.y);
      g.lineTo(Math.round(b.x) + 0.5, b.y);
      this.toScreen(-half, v, a);
      this.toScreen(half, v, b);
      g.moveTo(a.x, Math.round(a.y) + 0.5);
      g.lineTo(b.x, Math.round(b.y) + 0.5);
    }
    g.stroke();
  }

  /** Cuántos iconos quedarían tapados por un cartel centrado en (cx, cy) de medio tamaño hw × hh. */
  private labelHits(world: WorldData, cx: number, cy: number, hw: number, hh: number): number {
    const q = this.pk;
    let n = 0;
    for (const p of world.pois) {
      this.toScreen(p.door.x, p.door.z, q);
      if (Math.abs(q.x - cx) < hw && Math.abs(q.y - cy) < hh) n++;
    }
    for (const m of this.game.hud.markers) {
      this.toScreen(m.x, m.z, q);
      if (Math.abs(q.x - cx) < hw && Math.abs(q.y - cy) < hh) n += 2;
    }
    this.toScreen(this.player.x, this.player.z, q);
    if (Math.abs(q.x - cx) < hw && Math.abs(q.y - cy) < hh) n += 3;
    const wp = this.game.hud.waypoint;
    if (wp) {
      // chincheta (encima del punto) y su cartel (debajo, más ancho)
      this.toScreen(wp.x, wp.z, q);
      for (let dy = -24; dy <= 24; dy += 24) if (Math.abs(q.x - cx) < hw + 30 && Math.abs(q.y + dy - cy) < hh) n += 2;
    }
    return n;
  }

  /**
   * Nombres de barrio. Si el mapa del mundo ya trae el nombre pintado, se pinta encima el nuestro
   * con las mismas letras y en el mismo sitio (tapándolo entero: sale una sola vez). Si no lo trae,
   * va en el centro del barrio, con tamaño fijo en pantalla, y se aparta un poco si taparía un icono.
   */
  private drawDistricts(g: CanvasRenderingContext2D, world: WorldData, iconSize: number) {
    const o = this.q;
    const zoom = this.scale / this.fitScale;
    const fs = Math.round(Math.min(40, Math.max(15, 17 * Math.sqrt(zoom))));
    const baked = this.baked?.map === world.mapCanvas ? this.baked.found : null;
    for (let i = 0; i < world.districts.length; i++) {
      const d = world.districts[i];
      const color = d.color || DISTRICT_COLORS[d.id] || '#ffd23f';
      const b = baked?.[i];
      if (b) {
        // si no encajaran nuestras letras, se deja el pintado tal cual (mejor eso que dos nombres)
        if (b.cover) this.drawMapLabel(g, d.name.toUpperCase(), color, b);
        continue;
      }
      g.font = `900 ${fs}px ${UI_FONT}`;
      this.toScreen(d.center.x, d.center.z, o);
      if (o.x < -200 || o.y < -60 || o.x > this.W + 200 || o.y > this.H + 60) continue;
      const text = d.name.toUpperCase();
      const w = g.measureText(text).width;
      // busca un hueco sin iconos cerca del centro del barrio (primero los sitios más cercanos)
      const hw = w / 2 + iconSize * 0.62, hh = fs * 0.6 + iconSize * 0.5;
      let bestX = o.x, bestY = o.y, bestN = Infinity;
      search: for (const ky of LABEL_DY) {
        for (const kx of LABEL_DX) {
          const cx = o.x + kx * w, cy = o.y + ky * fs * 1.3;
          const n = this.labelHits(world, cx, cy, hw, hh);
          if (n < bestN) {
            bestN = n;
            bestX = cx;
            bestY = cy;
            if (n === 0) break search;
          }
        }
      }
      g.save();
      g.translate(bestX, bestY);
      g.rotate(-0.035);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      // cinta de color debajo
      g.fillStyle = color;
      g.globalAlpha = 0.9;
      roundRect(g, -w / 2 - 8, fs * 0.28, w + 16, Math.max(4, fs * 0.2), 3);
      g.fill();
      g.globalAlpha = 1;
      g.lineJoin = 'round';
      g.lineWidth = Math.max(4, fs * 0.28);
      g.strokeStyle = NOCHE;
      g.strokeText(text, 0, 0);
      g.fillStyle = '#fff6e0';
      g.fillText(text, 0, 0);
      g.restore();
    }
  }

  /**
   * Nombre de barrio encima del que trae pintado el mapa: mismas letras, mismo sitio y mismo tamaño
   * (crece con el zoom, como el mapa). El borde oscuro es más ancho que el blanco del pintado, así
   * que lo tapa entero, y se ve nítido a cualquier zoom.
   */
  private drawMapLabel(g: CanvasRenderingContext2D, text: string, color: string, b: BakedLabel) {
    const o = this.toScreen(b.x, b.z, this.q);
    const k = this.scale;
    const fs = Math.round(b.size * k * 10) / 10;
    // fuera de la vista (el texto mide menos de 0,75 × alto de letra por carácter)
    const reach = text.length * fs * 0.4 + COVER_LINE_M * k;
    if (o.x < -reach || o.x > this.W + reach || o.y < -fs * 1.5 || o.y > this.H + fs * 1.5) return;
    g.save();
    g.font = `900 ${fs}px ${MAP_LABEL_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const w = g.measureText(text).width;
    // cinta de color debajo
    const rh = Math.max(3, fs * 0.2);
    g.fillStyle = color;
    g.globalAlpha = 0.9;
    roundRect(g, o.x - w / 2 - fs * 0.3, o.y + fs * 0.3, w + fs * 0.6, rh, rh / 2);
    g.fill();
    g.globalAlpha = 1;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.lineWidth = COVER_LINE_M * k;
    g.strokeStyle = NOCHE;
    g.strokeText(text, o.x, o.y);
    g.fillStyle = '#fff6e0';
    g.fillText(text, o.x, o.y);
    g.restore();
  }

  private label(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string) {
    g.save();
    g.font = `800 ${size}px ${UI_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'top';
    const w = g.measureText(text).width;
    g.fillStyle = 'rgba(27,16,48,0.85)';
    roundRect(g, x - w / 2 - 6, y - 2, w + 12, size + 7, 6);
    g.fill();
    g.fillStyle = color;
    g.fillText(text, x, y + 1.5);
    g.restore();
  }

  private drawScaleBar(g: CanvasRenderingContext2D) {
    // escala: 50/100/200 m según zoom
    const opts = [25, 50, 100, 200];
    let m = opts[opts.length - 1];
    for (const v of opts) {
      if (v * this.scale >= 70) {
        m = v;
        break;
      }
    }
    const len = m * this.scale;
    const x = 22, y = this.H - 26;
    g.save();
    g.fillStyle = 'rgba(27,16,48,0.8)';
    roundRect(g, x - 10, y - 24, len + 20, 38, 9);
    g.fill();
    g.fillStyle = '#fff6e0';
    g.fillRect(x, y, len, 5);
    g.fillStyle = '#ffd23f';
    g.fillRect(x, y, len / 2, 5);
    g.font = `800 12px ${UI_FONT}`;
    g.textBaseline = 'bottom';
    g.fillStyle = '#fff6e0';
    g.fillText(`${m} m`, x, y - 4);
    g.restore();
  }

  private drawCompass(g: CanvasRenderingContext2D) {
    const x = this.W - 44, y = this.H - 48, r = 24;
    g.save();
    g.translate(x, y);
    g.fillStyle = 'rgba(27,16,48,0.85)';
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = '#1b1030';
    g.stroke();
    g.beginPath();
    g.moveTo(0, -r + 5);
    g.lineTo(7, 2);
    g.lineTo(-7, 2);
    g.closePath();
    g.fillStyle = '#ff4f81';
    g.fill();
    g.beginPath();
    g.moveTo(0, r - 5);
    g.lineTo(7, 2);
    g.lineTo(-7, 2);
    g.closePath();
    g.fillStyle = '#fff6e0';
    g.fill();
    g.font = `900 13px ${UI_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 4;
    g.strokeStyle = NOCHE;
    g.strokeText('N', 0, -r - 10);
    g.fillStyle = '#ffd23f';
    g.fillText('N', 0, -r - 10);
    g.restore();
  }
}

function hoverKey(h: Hover): string {
  if (!h) return '';
  if (h.type === 'poi') return 'p:' + h.poi.id;
  if (h.type === 'marker') return 'm:' + h.label + h.icon;
  return h.type;
}

/** Nombre de barrio que trae pintado el mapa del mundo: dónde está y si se puede tapar. */
interface BakedLabel {
  /** Centro del texto (metros del mundo). */
  x: number;
  z: number;
  /** Alto de letra (metros). */
  size: number;
  /** true si se ha podido calcar letra a letra: entonces se tapa con el nuestro, idéntico de forma. */
  cover: boolean;
}

/**
 * Busca los nombres de barrio que trae pintados el mapa de la isla (para el minimapa). El mapa
 * grande no los borra (borrar deja manchas, porque lo que hay debajo de las letras no se sabe):
 * pinta encima los suyos con las mismas letras, en el mismo sitio y al mismo tamaño, con un
 * borde oscuro más ancho que tapa el pintado entero. Así cada nombre sale una sola vez y nítido.
 *
 * Cómo se encuentra: el relleno de cada nombre es exactamente el color del barrio. Se buscan esos
 * píxeles, se pintan las mismas letras en un lienzo pequeño y se mira dónde encajan. Se hace una
 * vez por mapa y a trozos (step), para repartirlo en los ratos libres del navegador sin tirones.
 */
class BakedLabels {
  done = false;
  /** Por barrio (mismo orden que world.districts); null si ese nombre no está pintado en el mapa. */
  readonly found: (BakedLabel | null)[];
  private copy: HTMLCanvasElement | null;
  private g: CanvasRenderingContext2D | null;
  private phase = 0;
  private row = 0;
  private di = 0;
  private readonly keys: number[];
  /** Rojos de los colores de barrio (para descartar rápido casi todos los píxeles). */
  private readonly redLut = new Uint8Array(256);
  private hitsX: number[][];
  private hitsY: number[][];

  constructor(readonly map: HTMLCanvasElement, private world: WorldData) {
    this.found = world.districts.map(() => null);
    this.copy = document.createElement('canvas');
    this.copy.width = map.width;
    this.copy.height = map.height;
    this.g = this.copy.getContext('2d', { willReadFrequently: true });
    const probe = new Uint32Array(1);
    const probe8 = new Uint8Array(probe.buffer);
    this.keys = world.districts.map((dd) => {
      const c = hexRgb(dd.color || DISTRICT_COLORS[dd.id] || '');
      if (!c) return -1;
      probe8[0] = c[0];
      probe8[1] = c[1];
      probe8[2] = c[2];
      probe8[3] = 255;
      this.redLut[c[0]] = 1;
      return probe[0];
    });
    this.hitsX = this.keys.map(() => []);
    this.hitsY = this.keys.map(() => []);
    if (!this.g || !map.width || !map.height) this.finish();
  }

  /** Trabaja unos milisegundos como mucho (budget). Devuelve true cuando ha terminado. */
  step(budget: number): boolean {
    const t0 = performance.now();
    const w = this.map.width, h = this.map.height;
    try {
      while (!this.done && this.g && performance.now() - t0 < budget) {
        const g = this.g;
        if (this.phase === 0) {
          g.drawImage(this.map, 0, 0);
          this.phase = 1;
        } else if (this.phase === 1) {
          // busca por franjas los píxeles del color exacto de algún barrio (el relleno de las letras es liso)
          const rows = Math.min(48, h - this.row);
          const img = g.getImageData(0, this.row, w, rows);
          const px = new Uint32Array(img.data.buffer, img.data.byteOffset, w * rows);
          const lut = this.redLut, keys = this.keys;
          for (let n = 0; n < px.length; n++) {
            const v = px[n];
            if (!lut[v & 255]) continue;
            for (let i = 0; i < keys.length; i++) {
              if (v === keys[i]) {
                this.hitsX[i].push(n % w);
                this.hitsY[i].push(this.row + ((n / w) | 0));
                break;
              }
            }
          }
          this.row += rows;
          if (this.row >= h) this.phase = 2;
        } else if (this.di < this.keys.length) this.locate(this.di++);
        else this.finish();
      }
    } catch {
      // sin permiso para leer el lienzo: los nombres se quedan como estén
      this.finish();
    }
    return this.done;
  }

  /** Suelta la copia del mapa y las listas (unos megas). */
  private finish() {
    this.done = true;
    this.g = null;
    if (this.copy) this.copy.width = this.copy.height = 0;
    this.copy = null;
    this.hitsX = [];
    this.hitsY = [];
  }

  /** Encuentra dónde está pintado el nombre del barrio i y comprueba que nuestras letras encajan. */
  private locate(i: number) {
    const g = this.g!;
    const xs = this.hitsX[i], ys = this.hitsY[i];
    if (xs.length < 40) return;
    const d = this.world.districts[i];
    const mps = this.world.mapPixelSize;
    const w = this.map.width, h = this.map.height;
    // mismas letras que el mapa de la isla (src/world/island/map.ts): 15 m de alto
    const fontPx = Math.round(MAP_LABEL_SIZE_M / mps);
    // el grupo del nombre: alrededor de la mediana (por si hubiera algún píxel suelto del mismo color)
    const mx = median(xs), my = median(ys);
    const halfW = d.name.length * fontPx * 0.5 + 20, halfH = fontPx * 1.4;
    let x0 = w, x1 = -1, y0 = h, y1 = -1;
    for (let n = 0; n < xs.length; n++) {
      if (Math.abs(xs[n] - mx) > halfW || Math.abs(ys[n] - my) > halfH) continue;
      if (xs[n] < x0) x0 = xs[n];
      if (xs[n] > x1) x1 = xs[n];
      if (ys[n] < y0) y0 = ys[n];
      if (ys[n] > y1) y1 = ys[n];
    }
    if (x1 < 0) return;
    const key = this.keys[i];
    const text = d.name.toUpperCase();
    const pad = Math.ceil(fontPx * 0.6);
    const cw = x1 - x0 + 1 + pad * 2, ch = y1 - y0 + 1 + pad * 2;
    const tmp = document.createElement('canvas');
    tmp.width = cw;
    tmp.height = ch;
    const q = tmp.getContext('2d', { willReadFrequently: true });
    if (!q) return;
    let best = -1, bestX = 0, bestY = 0;
    // el centro del texto puede caer en medio píxel: se prueban las cuatro posibilidades
    for (let k = 0; k < 4; k++) {
      const ax = Math.floor(cw / 2) + (k & 1) * 0.5, ay = Math.floor(ch / 2) + (k >> 1) * 0.5;
      q.clearRect(0, 0, cw, ch);
      q.font = `900 ${fontPx}px ${MAP_LABEL_FONT}`;
      q.textAlign = 'center';
      q.textBaseline = 'middle';
      q.fillStyle = '#000';
      q.fillText(text, ax, ay);
      const mine = q.getImageData(0, 0, cw, ch).data;
      // esquina de nuestras letras (píxeles llenos del todo), para ponerlas encima de las del mapa
      let a0 = cw, b0 = ch;
      for (let n = 3, p = 0; n < mine.length; n += 4, p++) {
        if (mine[n] !== 255) continue;
        const x = p % cw, y = (p / cw) | 0;
        if (x < a0) a0 = x;
        if (y < b0) b0 = y;
      }
      if (a0 === cw) continue;
      const ox = x0 - a0, oy = y0 - b0;
      const there = g.getImageData(ox, oy, cw, ch);
      const tp = new Uint32Array(there.data.buffer, there.data.byteOffset, cw * ch);
      // parecido: píxeles llenos en los dos / llenos en alguno
      let both = 0, any = 0;
      for (let p = 0; p < tp.length; p++) {
        const a = mine[p * 4 + 3] === 255, b = tp[p] === key;
        if (a && b) both++;
        if (a || b) any++;
      }
      const score = any ? both / any : 0;
      if (score > best) {
        best = score;
        bestX = ax + ox;
        bestY = ay + oy;
      }
    }
    // muy distinto: no es un nombre pintado (serían píxeles sueltos del mismo color)
    if (best < 0.5) return;
    const half = this.world.size / 2;
    this.found[i] = { x: bestX * mps - half, z: bestY * mps - half, size: fontPx * mps, cover: best > 0.9 };
  }
}

function hexRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function median(a: number[]): number {
  const s = a.slice().sort((p, q) => p - q);
  return s[s.length >> 1];
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
