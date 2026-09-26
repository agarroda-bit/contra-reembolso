// Iconos del mapa: estilo por tipo de sitio y "pegatinas" pre-dibujadas en canvas (se dibujan una vez y se reutilizan).
import type { PoiKind } from '../../core/contracts';

export interface PoiStyle {
  icon: string;
  label: string; // nombre en la leyenda
  color: string; // fondo de la pegatina
}

export const POI_STYLE: Record<PoiKind, PoiStyle> = {
  office: { icon: '📦', label: 'Oficina de reparto', color: '#2ec4b6' },
  atm: { icon: '🏧', label: 'Cajero', color: '#3ddc84' },
  casino: { icon: '🎰', label: 'Casino', color: '#ffd23f' },
  club: { icon: '🍾', label: 'Club VIP', color: '#ff4f81' },
  clothes: { icon: '👕', label: 'Tienda de ropa', color: '#c77dff' },
  gunshop: { icon: '🔫', label: 'Armería', color: '#ff7b54' },
  garage: { icon: '🔧', label: 'Taller y concesionario', color: '#ff9f1c' },
  paint: { icon: '🎨', label: 'Taller de pintura', color: '#ff4f81' },
  attic: { icon: '🏠', label: 'El ático', color: '#ffd23f' },
  hideout: { icon: '💀', label: 'Guarida de Los Devueltos', color: '#6c3bd1' },
  weed: { icon: '🌿', label: 'Vendedor de hierbas', color: '#3ddc84' },
  health: { icon: '➕', label: 'Centro de salud', color: '#ffffff' },
  bar: { icon: '🍺', label: 'Bar', color: '#ff7b54' },
  fountain: { icon: '⛲', label: 'Fuente', color: '#7fd8ff' },
  shop: { icon: '🛍️', label: 'Tienda', color: '#ffb3c6' },
  junkyard: { icon: '🚗', label: 'Desguace', color: '#b08968' },
};

/** Orden de la leyenda del mapa grande. */
export const LEGEND_ORDER: PoiKind[] = [
  'office', 'atm', 'health', 'casino', 'club', 'clothes', 'shop', 'bar', 'fountain',
  'attic', 'garage', 'paint', 'gunshop', 'junkyard', 'hideout', 'weed',
];

export const EMOJI_FONT = `'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif`;
export const UI_FONT = `system-ui,-apple-system,'Segoe UI',Roboto,sans-serif`;
export const NOCHE = '#1b1030';

const cache = new Map<string, HTMLCanvasElement>();

/**
 * Pegatina redonda con emoji. `size` = diámetro en px CSS; `dpr` = densidad de píxeles.
 * El canvas devuelto incluye un margen para la sombra; dibújalo centrado.
 */
export function badgeSprite(icon: string, color: string, size: number, dpr: number): HTMLCanvasElement {
  const key = `b|${icon}|${color}|${size}|${dpr}`;
  let c = cache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  const pad = 3;
  const full = size + pad * 2;
  c.width = c.height = Math.ceil(full * dpr);
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  const cx = full / 2, cy = full / 2, r = size / 2 - 1;
  // sombra dura
  g.fillStyle = 'rgba(0,0,0,0.4)';
  g.beginPath();
  g.arc(cx + 1.5, cy + 2, r, 0, Math.PI * 2);
  g.fill();
  // cuerpo
  g.fillStyle = color;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = Math.max(2, size * 0.1);
  g.strokeStyle = NOCHE;
  g.stroke();
  // brillo
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.beginPath();
  g.arc(cx, cy - r * 0.25, r * 0.72, Math.PI * 1.1, Math.PI * 1.9);
  g.fill();
  // emoji (la cruz de salud se dibuja a mano: el emoji es gris)
  if (icon === '➕') {
    g.fillStyle = '#ff3b4f';
    const a = r * 0.95, b = r * 0.34;
    g.fillRect(cx - a / 2, cy - b / 2, a, b);
    g.fillRect(cx - b / 2, cy - a / 2, b, a);
  } else {
    g.fillStyle = '#000'; // opaco: los emojis de color heredan la transparencia del relleno
    g.font = `${Math.round(size * 0.6)}px ${EMOJI_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(icon, cx, cy + size * 0.04);
  }
  cache.set(key, c);
  return c;
}

/** Chincheta del destino (GPS). La punta queda en el centro-abajo del canvas. */
export function pinSprite(color: string, size: number, dpr: number): HTMLCanvasElement {
  const key = `p|${color}|${size}|${dpr}`;
  let c = cache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  const w = size + 6, h = size * 1.45 + 6;
  c.width = Math.ceil(w * dpr);
  c.height = Math.ceil(h * dpr);
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  const cx = w / 2, r = size / 2 - 1, cy = r + 3, tipY = h - 3;
  const path = () => {
    g.beginPath();
    g.moveTo(cx, tipY);
    g.bezierCurveTo(cx - r * 0.35, tipY - r * 0.9, cx - r, cy + r * 0.55, cx - r, cy);
    g.arc(cx, cy, r, Math.PI, 0);
    g.bezierCurveTo(cx + r, cy + r * 0.55, cx + r * 0.35, tipY - r * 0.9, cx, tipY);
    g.closePath();
  };
  g.save();
  g.translate(1.5, 1.5);
  path();
  g.fillStyle = 'rgba(0,0,0,0.4)';
  g.fill();
  g.restore();
  path();
  g.fillStyle = color;
  g.fill();
  g.lineWidth = 2.5;
  g.strokeStyle = NOCHE;
  g.stroke();
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(cx, cy, r * 0.38, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 2;
  g.stroke();
  cache.set(key, c);
  return c;
}

/** Flecha del jugador apuntando hacia arriba, centrada en (0,0). */
export function drawPlayerArrow(g: CanvasRenderingContext2D, size: number, fill = '#ffffff') {
  const s = size;
  g.beginPath();
  g.moveTo(0, -s * 0.62);
  g.lineTo(s * 0.46, s * 0.46);
  g.lineTo(0, s * 0.22);
  g.lineTo(-s * 0.46, s * 0.46);
  g.closePath();
  g.lineJoin = 'round';
  g.lineWidth = Math.max(3, s * 0.16);
  g.strokeStyle = NOCHE;
  g.stroke();
  g.fillStyle = fill;
  g.fill();
}

/** Flecha en el borde (dirección a un objetivo fuera del minimapa), apuntando hacia arriba. */
export function drawEdgeArrow(g: CanvasRenderingContext2D, size: number, color: string) {
  const s = size;
  g.beginPath();
  g.moveTo(0, -s * 0.6);
  g.lineTo(s * 0.52, s * 0.4);
  g.lineTo(-s * 0.52, s * 0.4);
  g.closePath();
  g.lineJoin = 'round';
  g.lineWidth = 3;
  g.strokeStyle = NOCHE;
  g.stroke();
  g.fillStyle = color;
  g.fill();
}
