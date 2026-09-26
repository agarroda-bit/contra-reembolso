// Carteles: todos los textos del mundo se dibujan en un único atlas (CanvasTexture) y se colocan como
// cuadriláteros en una sola malla. Los de neón brillan de noche.
import * as THREE from 'three';
import { GeoBuilder } from './geo';
import type { WorldUniforms } from './materials';

export type DrawFn = (g: CanvasRenderingContext2D, W: number, H: number) => void;

interface Spec {
  key: string;
  w: number;
  h: number;
  draw: DrawFn;
  px?: number;
  py?: number;
  pw?: number;
  ph?: number;
}

interface Quad {
  key: string;
  p: number[][];
  glow: number;
  /** Recorte de UV (u0, v0, u1, v1) dentro de la región (0..1). */
  crop?: number[];
}

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
export const FONT_FUN = '"Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif';
export const FONT_SERIF = 'Georgia, "Times New Roman", serif';
export const FONT_IMPACT = 'Impact, "Arial Black", "Helvetica Neue", sans-serif';
export const FONT_SCRIPT = '"Brush Script MT", "Snell Roundhand", "Segoe Script", cursive';

export class Signs {
  /** Píxeles por metro con los que se ha dibujado el atlas. */
  density = 0;
  private specs = new Map<string, Spec>();
  private quads: Quad[] = [];

  has(key: string) {
    return this.specs.has(key);
  }

  /** Define un dibujo (una vez por clave). w y h en metros (fijan la proporción y la resolución). */
  define(key: string, w: number, h: number, draw: DrawFn) {
    if (!this.specs.has(key)) this.specs.set(key, { key, w, h, draw });
    return key;
  }

  /** Coloca el cartel en el plano z = zf del marco local de `b`, centrado en (x, y), mirando a +Z local. */
  place(b: GeoBuilder, key: string, x: number, y: number, zf: number, w: number, h: number, glow = 0, crop?: number[]) {
    const x0 = x - w / 2, x1 = x + w / 2, y0 = y - h / 2, y1 = y + h / 2;
    const P = (lx: number, ly: number) => [b.wx(lx, zf), b.wy(ly), b.wz(lx, zf)];
    this.quads.push({ key, p: [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)], glow, crop });
  }

  /** Cartel a dos caras (colgado o en poste). */
  placeDouble(b: GeoBuilder, key: string, x: number, y: number, zf: number, w: number, h: number, glow = 0) {
    this.place(b, key, x, y, zf + 0.03, w, h, glow);
    const x0 = x + w / 2, x1 = x - w / 2, y0 = y - h / 2, y1 = y + h / 2, z = zf - 0.03;
    const P = (lx: number, ly: number) => [b.wx(lx, z), b.wy(ly), b.wz(lx, z)];
    this.quads.push({ key, p: [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)], glow });
  }

  /** Cartel horizontal tumbado (en el suelo o en una azotea), mirando hacia arriba. */
  placeFlat(b: GeoBuilder, key: string, x: number, y: number, z: number, w: number, h: number, glow = 0) {
    const P = (lx: number, lz: number) => [b.wx(lx, lz), b.wy(y), b.wz(lx, lz)];
    this.quads.push({ key, p: [P(x - w / 2, z + h / 2), P(x + w / 2, z + h / 2), P(x + w / 2, z - h / 2), P(x - w / 2, z - h / 2)], glow });
  }

  get count() {
    return this.quads.length;
  }

  build(u: WorldUniforms, maxAniso = 4): THREE.Mesh {
    const S = 2048;
    const specs = [...this.specs.values()];
    // empaquetado por estantes, bajando la resolución hasta que quepa
    let density = 72;
    for (let attempt = 0; attempt < 12; attempt++) {
      for (const s of specs) {
        let pw = s.w * density, ph = s.h * density;
        const k = Math.min(1, 900 / pw, 360 / ph);
        pw *= k;
        ph *= k;
        s.pw = Math.max(8, Math.round(pw));
        s.ph = Math.max(8, Math.round(ph));
      }
      specs.sort((a, b) => b.ph! - a.ph!);
      let x = 0, y = 0, rowH = 0, ok = true;
      const pad = 3;
      for (const s of specs) {
        if (x + s.pw! + pad * 2 > S) {
          x = 0;
          y += rowH;
          rowH = 0;
        }
        s.px = x + pad;
        s.py = y + pad;
        x += s.pw! + pad * 2;
        rowH = Math.max(rowH, s.ph! + pad * 2);
        if (y + rowH > S) {
          ok = false;
          break;
        }
      }
      if (ok) break;
      density *= 0.88;
    }
    this.density = density;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = S;
    const g = canvas.getContext('2d')!;
    for (const s of specs) {
      g.save();
      g.beginPath();
      g.rect(s.px!, s.py!, s.pw!, s.ph!);
      g.clip();
      g.translate(s.px!, s.py!);
      try {
        s.draw(g, s.pw!, s.ph!);
      } catch (e) {
        console.warn('cartel', s.key, e);
      }
      g.restore();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAniso;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;

    const gb = new GeoBuilder();
    gb.withUv = true;
    for (const q of this.quads) {
      const s = this.specs.get(q.key);
      if (!s) continue;
      let u0 = s.px! / S, u1 = (s.px! + s.pw!) / S;
      let vT = 1 - s.py! / S, vB = 1 - (s.py! + s.ph!) / S;
      if (q.crop) {
        const [c0, c1, c2, c3] = q.crop;
        const du = u1 - u0, dv = vT - vB;
        [u0, u1] = [u0 + du * c0, u0 + du * c2];
        [vB, vT] = [vB + dv * c1, vB + dv * c3];
      }
      gb.quadUvW(q.p, [[u0, vB], [u1, vB], [u1, vT], [u0, vT]], '#ffffff', [1, 1, 1, q.glow]);
    }
    const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.4, side: THREE.FrontSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uNight = u.uNight;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aEmit;\nvarying vec4 vEmit;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEmit = aEmit;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uNight;\nvarying vec4 vEmit;')
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vEmit.w * mix(0.1, 1.15, uNight);',
        );
    };
    mat.customProgramCacheKey = () => 'cr-signs';
    const mesh = new THREE.Mesh(gb.toGeometry(), mat);
    mesh.name = 'carteles';
    mesh.matrixAutoUpdate = false;
    mesh.receiveShadow = true;
    (mesh as any).atlas = canvas;
    return mesh;
  }
}

// ───────────── utilidades de dibujo ─────────────

export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Escribe un texto centrado que quepa en maxW x maxH. */
export function fitText(
  g: CanvasRenderingContext2D, text: string, cx: number, cy: number, maxW: number, maxH: number,
  font = FONT, weight = '800', color = '#fff', stroke?: string, strokeW = 0,
) {
  let size = maxH;
  g.font = `${weight} ${size}px ${font}`;
  const w = g.measureText(text).width;
  if (w > maxW) size = Math.max(6, (size * maxW) / w);
  g.font = `${weight} ${size}px ${font}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (stroke && strokeW > 0) {
    g.lineJoin = 'round';
    g.lineWidth = strokeW * (size / maxH);
    g.strokeStyle = stroke;
    g.strokeText(text, cx, cy + size * 0.04);
  }
  g.fillStyle = color;
  g.fillText(text, cx, cy + size * 0.04);
  return size;
}

/** Cartel de tienda: fondo de color, texto grande y un subtítulo opcional. */
export function shopSign(bg: string, fg: string, text: string, sub?: string, font = FONT_FUN, border?: string): DrawFn {
  return (g, W, H) => {
    const b = Math.max(2, H * 0.08);
    g.fillStyle = border ?? shade(bg, -0.25);
    roundRect(g, 0, 0, W, H, H * 0.18);
    g.fill();
    g.fillStyle = bg;
    roundRect(g, b, b, W - 2 * b, H - 2 * b, H * 0.14);
    g.fill();
    if (sub) {
      fitText(g, text, W / 2, H * 0.4, W * 0.9, H * 0.52, font, '900', fg);
      fitText(g, sub, W / 2, H * 0.78, W * 0.86, H * 0.2, FONT, '700', fg);
    } else fitText(g, text, W / 2, H / 2, W * 0.9, H * 0.62, font, '900', fg);
  };
}

/** Letras de neón sobre fondo oscuro (o transparente). */
export function neonSign(text: string, color: string, sub?: string, subColor?: string, board = '#1a1026', font = FONT_SCRIPT): DrawFn {
  return (g, W, H) => {
    if (board) {
      g.fillStyle = board;
      roundRect(g, 0, 0, W, H, H * 0.15);
      g.fill();
      g.strokeStyle = color;
      g.lineWidth = Math.max(2, H * 0.05);
      g.shadowColor = color;
      g.shadowBlur = H * 0.12;
      roundRect(g, H * 0.07, H * 0.07, W - H * 0.14, H - H * 0.14, H * 0.1);
      g.stroke();
    }
    g.shadowColor = color;
    g.shadowBlur = H * 0.18;
    const main = sub ? H * 0.5 : H * 0.66;
    for (let i = 0; i < 2; i++) fitText(g, text, W / 2, sub ? H * 0.4 : H / 2, W * 0.86, main, font, '700', i ? '#fff8fb' : color);
    if (sub) {
      g.shadowColor = subColor ?? color;
      fitText(g, sub, W / 2, H * 0.78, W * 0.8, H * 0.2, FONT, '800', subColor ?? '#ffffff');
    }
    g.shadowBlur = 0;
  };
}

export function shade(hex: string, k: number): string {
  const c = new THREE.Color(hex);
  if (k < 0) c.multiplyScalar(1 + k);
  else c.lerp(new THREE.Color('#ffffff'), k);
  return '#' + c.getHexString();
}
