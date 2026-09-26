// Formatos de texto de la interfaz (dinero, horas, tiempos) en castellano de España.

/** «1.234 €» (siempre con punto de millares, también con 4 cifras). */
export function formatMoney(n: number, withSign = false): string {
  const v = Number.isFinite(n) ? Math.round(n) : 0;
  const abs = Math.abs(v);
  const digits = String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const sign = v < 0 ? '−' : withSign ? '+' : '';
  return `${sign}${digits} €`;
}

/** «Día 3 · 21:45» */
export function formatClock(day: number, hour: number): string {
  const h = Math.floor(((hour % 24) + 24) % 24);
  const m = Math.floor((hour - Math.floor(hour)) * 60);
  return `Día ${day} · ${pad2(h)}:${pad2(m)}`;
}

/** «02:07» (minutos:segundos). */
export function formatTimer(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;
}

/** «240 m» o «1,2 km». */
export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

export function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n);
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Color de la barra de vida: verde (lleno) → amarillo → rojo (vacío). */
export function healthColor(f: number): string {
  const t = clamp01(f);
  const hue = t < 0.5 ? t * 2 * 48 : 48 + (t - 0.5) * 2 * 80; // 0 rojo, 48 amarillo, 128 verde
  return `hsl(${hue.toFixed(0)} 85% 52%)`;
}

/** Escapa texto para meterlo en innerHTML. */
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
