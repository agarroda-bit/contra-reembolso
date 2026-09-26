// Minimapa circular tipo GTA: el jugador en el centro mirando arriba y el mapa girando con la cámara.
import type { Game } from '../../core/game';
import type { PoiKind, WorldData } from '../../core/contracts';
import { POI_STYLE, badgeSprite, pinSprite, drawPlayerArrow, drawEdgeArrow } from './icons';
import { formatDistance, esc } from './format';

const MIN_RADIUS_M = 85; // metros visibles (radio) parado
const MAX_RADIUS_M = 175; // a toda velocidad
const DEFAULT_MARKER = '#ff4f81';
const DEFAULT_WAYPOINT = '#ffd23f';

/**
 * Copia del mapa del mundo lista para la GPU (ImageBitmap). Dibujar desde un canvas obliga a
 * algunos navegadores a copiarlo entero en cada frame; desde un ImageBitmap no.
 */
const bitmaps = new WeakMap<HTMLCanvasElement, ImageBitmap | 'pending'>();
export function mapSource(canvas: HTMLCanvasElement): CanvasImageSource {
  const b = bitmaps.get(canvas);
  if (b && b !== 'pending') return b;
  if (!b && typeof createImageBitmap === 'function') {
    bitmaps.set(canvas, 'pending');
    createImageBitmap(canvas).then(
      (bmp) => bitmaps.set(canvas, bmp),
      () => bitmaps.delete(canvas),
    );
  }
  return canvas;
}
/** Olvida la copia (si el mundo repinta su mapCanvas). */
export function invalidateMapSource(canvas: HTMLCanvasElement) {
  const b = bitmaps.get(canvas);
  if (b && b !== 'pending') b.close();
  bitmaps.delete(canvas);
}

/** Color del mar (esquina del mapa) para rellenar fuera de la imagen. */
export function sampleSeaColor(canvas: HTMLCanvasElement): string {
  try {
    const g = canvas.getContext('2d', { willReadFrequently: false });
    if (!g) return '#2f8fd0';
    const d = g.getImageData(1, 1, 1, 1).data;
    if (d[3] < 10) return '#2f8fd0';
    return `rgb(${d[0]},${d[1]},${d[2]})`;
  } catch {
    return '#2f8fd0';
  }
}

export class Minimap {
  readonly el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private north: HTMLElement;
  private wpEl: HTMLElement;
  private dpr = 1;
  private cssSize = 200;
  private radiusM = MIN_RADIUS_M;
  private seaColor = '#2f8fd0';
  private seaFor: HTMLCanvasElement | null = null;
  private lastWpKey = '';
  private blink = 0;
  private lastWpDist = -2;
  private nightStep = -1;
  private nightFill = '';
  private sprites = new Map<PoiKind, HTMLCanvasElement>();
  private spriteSize = 0;
  private spriteDpr = 0;
  /** Calidad del suavizado al girar el mapa ('low' es lo más barato). */
  smoothing: ImageSmoothingQuality = 'low';

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'hud-minimapa';
    this.el.innerHTML = `
      <div class="hud-minimapa__marco">
        <canvas class="hud-minimapa__canvas"></canvas>
        <div class="hud-minimapa__brillo"></div>
      </div>
      <div class="hud-minimapa__norte">N</div>
      <div class="hud-minimapa__destino" hidden></div>`;
    this.canvas = this.el.querySelector('canvas')!;
    this.g = this.canvas.getContext('2d')!;
    this.north = this.el.querySelector('.hud-minimapa__norte')!;
    this.wpEl = this.el.querySelector('.hud-minimapa__destino')!;
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.resize()).observe(this.canvas);
    else window.addEventListener('resize', () => this.resize());
  }

  /** Olvida lo cacheado del mapa (llamar si el mundo repinta su mapCanvas). */
  invalidate() {
    this.seaFor = null;
  }

  /** Ajusta el canvas al tamaño en pantalla (se llama al instalar y al cambiar de tamaño). */
  resize() {
    const css = this.canvas.clientWidth;
    if (!css) return; // oculto: se ajustará al volver a verse
    this.setSize(css, Math.min(2, window.devicePixelRatio || 1));
  }

  setSize(css: number, dpr: number) {
    this.cssSize = css;
    this.dpr = dpr;
    const px = Math.round(css * dpr);
    if (this.canvas.width !== px) {
      this.canvas.width = px;
      this.canvas.height = px;
    }
  }

  /** Pegatina de un tipo de sitio (cacheada por tipo: sin crear textos por frame). */
  private poiSprite(kind: PoiKind, size: number, dpr: number): HTMLCanvasElement | null {
    if (this.spriteSize !== size || this.spriteDpr !== dpr) {
      this.spriteSize = size;
      this.spriteDpr = dpr;
      this.sprites.clear();
    }
    let spr = this.sprites.get(kind);
    if (!spr) {
      const st = POI_STYLE[kind];
      if (!st) return null;
      spr = badgeSprite(st.icon, st.color, size, dpr);
      this.sprites.set(kind, spr);
    }
    return spr;
  }

  /**
   * Dibuja el minimapa. (px, pz) = posición del jugador; heading = rumbo de la cámara
   * (0 = norte/-Z, PI/2 = este/+X). realDt en segundos.
   */
  draw(game: Game, world: WorldData, px: number, pz: number, heading: number, realDt: number) {
    if (this.cssSize <= 0 || this.canvas.width === 0) this.resize();
    const g = this.g;
    const S = this.cssSize;
    const R = S / 2;
    const dpr = this.dpr;
    this.blink += realDt;

    // zoom: se aleja con la velocidad
    const speed = game.hud.vehicle?.speedKmh ?? 0;
    const t = Math.min(1, Math.max(0, speed / 130));
    const target = MIN_RADIUS_M + (MAX_RADIUS_M - MIN_RADIUS_M) * t;
    this.radiusM += (target - this.radiusM) * (1 - Math.exp(-realDt * 1.8));
    const rM = this.radiusM;
    const k = R / rM; // px por metro

    const map = world.mapCanvas;
    if (this.seaFor !== map) {
      this.seaColor = sampleSeaColor(map);
      this.seaFor = map;
    }

    // (el recorte circular lo hace el CSS del marco: más barato que clip() en el canvas)
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = this.seaColor;
    g.fillRect(0, 0, S, S);

    // mapa girado: en este marco las unidades son metros relativos al jugador
    g.translate(R, R);
    g.rotate(-heading);
    g.scale(k, k);
    const mps = world.mapPixelSize;
    const half = world.size / 2;
    const rv = rM * 1.05;
    let sx0 = (px - rv + half) / mps, sx1 = (px + rv + half) / mps;
    let sy0 = (pz - rv + half) / mps, sy1 = (pz + rv + half) / mps;
    sx0 = Math.max(0, sx0); sy0 = Math.max(0, sy0);
    sx1 = Math.min(map.width, sx1); sy1 = Math.min(map.height, sy1);
    if (sx1 - sx0 > 0.5 && sy1 - sy0 > 0.5) {
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = this.smoothing;
      g.drawImage(
        mapSource(map), sx0, sy0, sx1 - sx0, sy1 - sy0,
        sx0 * mps - half - px, sy0 * mps - half - pz, (sx1 - sx0) * mps, (sy1 - sy0) * mps,
      );
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    // de noche, el mapa un pelín más oscuro (sigue legible)
    const night = Math.round((game.night || 0) * 20);
    if (night > 0) {
      if (night !== this.nightStep) {
        this.nightStep = night;
        this.nightFill = `rgba(20,10,60,${((night / 20) * 0.22).toFixed(3)})`;
      }
      g.fillStyle = this.nightFill;
      g.fillRect(0, 0, S, S);
    }

    // rotación mundo → pantalla (sin escala)
    const ca = Math.cos(-heading), sa = Math.sin(-heading);
    const inner = R - 11;

    // sitios (POIs) dentro del círculo
    const badge = S >= 190 ? 20 : 18;
    for (const poi of world.pois) {
      const dx = poi.door.x - px, dz = poi.door.z - pz;
      const d2 = dx * dx + dz * dz;
      if (d2 > (rM + 12) * (rM + 12)) continue;
      const x = (dx * ca - dz * sa) * k, y = (dx * sa + dz * ca) * k;
      if (x * x + y * y > inner * inner) continue;
      const spr = this.poiSprite(poi.kind, badge, dpr);
      if (!spr) continue;
      const w = spr.width / dpr;
      g.drawImage(spr, R + x - w / 2, R + y - w / 2, w, w);
    }

    // marcadores (encargos, enemigos...): fuera del círculo, pegados al borde en pequeño
    for (const m of game.hud.markers) {
      const dx = m.x - px, dz = m.z - pz;
      let x = (dx * ca - dz * sa) * k, y = (dx * sa + dz * ca) * k;
      const d = Math.hypot(x, y);
      let size = badge + 2;
      if (d > inner) {
        x *= inner / d;
        y *= inner / d;
        size = badge - 4;
      }
      const spr = badgeSprite(m.icon, m.color ?? DEFAULT_MARKER, size, dpr);
      const w = spr.width / dpr;
      g.drawImage(spr, R + x - w / 2, R + y - w / 2, w, w);
    }

    // destino (GPS)
    const wp = game.hud.waypoint;
    let wpLabel = '';
    let wpDist = -1;
    if (wp) {
      const dx = wp.x - px, dz = wp.z - pz;
      const x = (dx * ca - dz * sa) * k, y = (dx * sa + dz * ca) * k;
      const d = Math.hypot(x, y);
      const color = wp.color ?? DEFAULT_WAYPOINT;
      if (d <= inner - 4) {
        const spr = pinSprite(color, 18, dpr);
        const w = spr.width / dpr, h = spr.height / dpr;
        g.drawImage(spr, R + x - w / 2, R + y - h + 3, w, h);
      } else {
        const ex = (x / d) * (R - 12), ey = (y / d) * (R - 12);
        const pulse = 1 + Math.sin(this.blink * 6) * 0.08;
        g.save();
        g.translate(R + ex, R + ey);
        g.rotate(Math.atan2(x, -y));
        g.scale(pulse, pulse);
        drawEdgeArrow(g, 17, color);
        g.restore();
      }
      wpLabel = wp.label ?? 'Destino';
      const m = Math.hypot(dx, dz);
      wpDist = m < 1000 ? Math.round(m / 10) : 1000 + Math.round(m / 100);
    }

    // jugador: flecha en el centro mirando arriba
    g.save();
    g.translate(R, R);
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.beginPath();
    g.arc(0, 0, 13 + Math.sin(this.blink * 3) * 1.5, 0, Math.PI * 2);
    g.fill();
    drawPlayerArrow(g, 17, '#ffffff');
    g.restore();

    // borde fino interior
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(27,16,48,0.55)';
    g.beginPath();
    g.arc(R, R, R - 1, 0, Math.PI * 2);
    g.stroke();

    // la N en el borde (norte = -Z)
    const nx = -Math.sin(heading) * (R + 1), ny = -Math.cos(heading) * (R + 1);
    this.north.style.transform = `translate(${(R + nx).toFixed(1)}px, ${(R + ny).toFixed(1)}px) translate(-50%, -50%)`;

    // cartel de distancia al destino (solo se reescribe si cambia)
    if (wpDist !== this.lastWpDist || wpLabel !== this.lastWpKey) {
      this.lastWpDist = wpDist;
      this.lastWpKey = wpLabel;
      if (wp) {
        this.wpEl.hidden = false;
        this.wpEl.innerHTML = `<span class="cr-emoji">🏁</span> ${esc(wpLabel)} · ${formatDistance(Math.hypot(wp.x - px, wp.z - pz))}`;
      } else this.wpEl.hidden = true;
    }
  }
}

