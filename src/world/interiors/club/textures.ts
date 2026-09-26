// Texturas del club dibujadas por código en un canvas: neones, puntos de luz, humo, baldosas y letreros.
import * as THREE from 'three';

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** Punto de luz redondo y suave (fondo negro: se usa con mezcla aditiva). */
export function dotTexture(): THREE.CanvasTexture {
  const [c, g] = makeCanvas(64, 64);
  g.fillStyle = '#000';
  g.fillRect(0, 0, 64, 64);
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  r.addColorStop(0.6, 'rgba(255,255,255,0.18)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return tex(c);
}

/** Mancha de luz de un foco en el suelo: centro fuerte y borde con anillo. */
export function spotTexture(): THREE.CanvasTexture {
  const [c, g] = makeCanvas(128, 128);
  g.fillStyle = '#000';
  g.fillRect(0, 0, 128, 128);
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,0.95)');
  r.addColorStop(0.55, 'rgba(255,255,255,0.55)');
  r.addColorStop(0.8, 'rgba(255,255,255,0.75)');
  r.addColorStop(0.9, 'rgba(255,255,255,0.25)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  return tex(c);
}

/** Baldosa de la pista: caja de luz (más clara en el centro, borde fino oscuro). */
export function tileTexture(): THREE.CanvasTexture {
  const [c, g] = makeCanvas(64, 64);
  g.fillStyle = '#222';
  g.fillRect(0, 0, 64, 64);
  const r = g.createRadialGradient(32, 32, 4, 32, 32, 44);
  r.addColorStop(0, '#ffffff');
  r.addColorStop(0.7, '#c9c9c9');
  r.addColorStop(1, '#8a8a8a');
  g.fillStyle = r;
  g.fillRect(3, 3, 58, 58);
  // brillo en diagonal (cristal)
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.beginPath();
  g.moveTo(6, 6);
  g.lineTo(26, 6);
  g.lineTo(6, 26);
  g.closePath();
  g.fill();
  return tex(c);
}

/** Ruido suave que se repite sin costuras (para el humo). Canal rojo = densidad. */
export function noiseTexture(size = 128): THREE.CanvasTexture {
  const [c, g] = makeCanvas(size, size);
  const img = g.createImageData(size, size);
  const octaves: { n: number; amp: number; grid: Float32Array }[] = [];
  let seed = 1234567;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (const [n, amp] of [[4, 0.55], [8, 0.28], [16, 0.17]] as const) {
    const grid = new Float32Array(n * n);
    for (let i = 0; i < grid.length; i++) grid[i] = rnd();
    octaves.push({ n, amp, grid });
  }
  const sm = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      for (const o of octaves) {
        const fx = (x / size) * o.n, fy = (y / size) * o.n;
        const x0 = Math.floor(fx), y0 = Math.floor(fy);
        const tx = sm(fx - x0), ty = sm(fy - y0);
        const at = (i: number, j: number) => o.grid[((j + o.n) % o.n) * o.n + ((i + o.n) % o.n)];
        const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
        const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
        v += (a + (b - a) * ty) * o.amp;
      }
      const k = Math.max(0, Math.min(255, Math.round(v * 255)));
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = k;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = tex(c, false);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ───────────── Neones ─────────────

export const NEON_FONT = '"Avenir Next", "Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif';
export const SCRIPT_FONT = '"Brush Script MT", "Snell Roundhand", "Segoe Script", cursive';

function lighten(hex: string, k: number): string {
  const c = new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), k);
  return '#' + c.getHexString();
}

/** Texto en tubo de neón: halo de color, tubo y alma casi blanca. */
export function neonText(
  g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string,
  font = `italic 800 ${size}px ${NEON_FONT}`, align: CanvasTextAlign = 'center',
) {
  g.save();
  g.font = font;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.strokeStyle = color;
  g.shadowColor = color;
  g.globalAlpha = 0.55;
  g.shadowBlur = size * 0.55;
  g.lineWidth = size * 0.16;
  g.strokeText(text, x, y);
  g.globalAlpha = 1;
  g.shadowBlur = size * 0.22;
  g.lineWidth = size * 0.085;
  g.strokeText(text, x, y);
  g.shadowBlur = size * 0.08;
  g.strokeStyle = lighten(color, 0.7);
  g.lineWidth = size * 0.03;
  g.strokeText(text, x, y);
  g.restore();
}

/** Trazo de neón para dibujos (corona, caja, flechas...). Llama a `path` para trazar la forma. */
export function neonPath(g: CanvasRenderingContext2D, color: string, width: number, path: (g: CanvasRenderingContext2D) => void) {
  g.save();
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.strokeStyle = color;
  g.shadowColor = color;
  g.globalAlpha = 0.55;
  g.shadowBlur = width * 4;
  g.lineWidth = width * 1.9;
  g.beginPath();
  path(g);
  g.stroke();
  g.globalAlpha = 1;
  g.shadowBlur = width * 1.6;
  g.lineWidth = width;
  g.beginPath();
  path(g);
  g.stroke();
  g.shadowBlur = width * 0.5;
  g.strokeStyle = lighten(color, 0.7);
  g.lineWidth = width * 0.35;
  g.beginPath();
  path(g);
  g.stroke();
  g.restore();
}

/** Lienzo para un letrero de neón (fondo negro, se pinta con mezcla aditiva). */
export function neonCanvas(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
  const [c, g] = makeCanvas(w, h);
  const redraw = (d: typeof draw = draw) => {
    g.globalAlpha = 1;
    g.shadowBlur = 0;
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    d(g, w, h);
    t.needsUpdate = true;
  };
  const t = tex(c);
  redraw();
  return { texture: t, canvas: c, redraw };
}

/** Texto para la pantalla LED (blanco sobre negro, se usa como máscara). */
export function ledTextTexture(text: string): THREE.CanvasTexture {
  const [c, g] = makeCanvas(2048, 128);
  drawLedText(g, text);
  const t = tex(c, false);
  t.wrapS = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}

export function drawLedText(g: CanvasRenderingContext2D, text: string) {
  const w = g.canvas.width, h = g.canvas.height;
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#fff';
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  let size = 92;
  g.font = `900 ${size}px ${NEON_FONT}`;
  // que quepa entero (el texto da la vuelta a la pantalla)
  while (g.measureText(text).width > w - 40 && size > 40) {
    size -= 4;
    g.font = `900 ${size}px ${NEON_FONT}`;
  }
  const tw = g.measureText(text).width;
  // repartido para que el bucle sea continuo
  g.fillText(text, (w - tw) / 2, h / 2 + 4);
}
