// Anuncios inventados: vallas (8 x 3 m) y mupis de marquesina, dibujados en el atlas de carteles.
import type { Ctx } from './ctx';
import { ADS } from './names';
import { fitText, FONT_IMPACT, FONT } from './signs';

export function adSign(ctx: Ctx, i: number): string {
  const ad = ADS[i % ADS.length];
  const key = 'ad:' + ad.title;
  ctx.signs.define(key, 8, 3, (g, W, H) => {
    g.fillStyle = ad.bg;
    g.fillRect(0, 0, W, H);
    g.fillStyle = ad.accent;
    g.beginPath();
    g.arc(W * 0.14, H * 0.5, H * 0.34, 0, Math.PI * 2);
    g.fill();
    drawIcon(g, ad.icon, W * 0.14, H * 0.5, H * 0.28, ad.bg, ad.fg);
    fitText(g, ad.title, W * 0.6, H * 0.36, W * 0.72, H * 0.34, FONT_IMPACT, '400', ad.fg);
    fitText(g, ad.sub, W * 0.6, H * 0.72, W * 0.72, H * 0.16, FONT, '800', ad.fg);
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = H * 0.04;
    g.strokeRect(0, 0, W, H);
  });
  return key;
}

export function drawIcon(g: CanvasRenderingContext2D, icon: string, x: number, y: number, r: number, bg: string, fg: string) {
  g.save();
  g.translate(x, y);
  g.fillStyle = bg;
  g.strokeStyle = bg;
  g.lineWidth = r * 0.18;
  switch (icon) {
    case 'coche':
      g.fillRect(-r, -r * 0.1, r * 2, r * 0.6);
      g.fillRect(-r * 0.55, -r * 0.55, r * 1.1, r * 0.5);
      g.fillStyle = fg;
      g.beginPath();
      g.arc(-r * 0.55, r * 0.55, r * 0.25, 0, 7);
      g.arc(r * 0.55, r * 0.55, r * 0.25, 0, 7);
      g.fill();
      break;
    case 'pizza':
      g.beginPath();
      g.moveTo(0, -r);
      g.lineTo(r * 0.9, r * 0.7);
      g.lineTo(-r * 0.9, r * 0.7);
      g.closePath();
      g.fill();
      g.fillStyle = fg;
      for (const [a, b] of [[0, 0], [-0.3, 0.4], [0.35, 0.35]]) {
        g.beginPath();
        g.arc(a * r, b * r, r * 0.14, 0, 7);
        g.fill();
      }
      break;
    case 'pesa':
      g.fillRect(-r, -r * 0.1, r * 2, r * 0.2);
      g.fillRect(-r, -r * 0.5, r * 0.3, r);
      g.fillRect(r * 0.7, -r * 0.5, r * 0.3, r);
      break;
    case 'caja':
      g.fillStyle = '#c9955a';
      g.fillRect(-r * 0.8, -r * 0.7, r * 1.6, r * 1.4);
      g.fillStyle = '#ecdcae';
      g.fillRect(-r * 0.15, -r * 0.7, r * 0.3, r * 1.4);
      break;
    case 'sol':
      g.beginPath();
      g.arc(0, 0, r * 0.5, 0, 7);
      g.fill();
      for (let i = 0; i < 8; i++) {
        g.beginPath();
        g.moveTo(Math.cos((i * Math.PI) / 4) * r * 0.65, Math.sin((i * Math.PI) / 4) * r * 0.65);
        g.lineTo(Math.cos((i * Math.PI) / 4) * r, Math.sin((i * Math.PI) / 4) * r);
        g.stroke();
      }
      break;
    case 'luna':
      g.beginPath();
      g.arc(0, 0, r * 0.8, 0, 7);
      g.fill();
      g.fillStyle = fg;
      g.beginPath();
      g.arc(r * 0.35, -r * 0.2, r * 0.7, 0, 7);
      g.fill();
      break;
    default:
      g.beginPath();
      g.arc(0, 0, r * 0.7, 0, 7);
      g.fill();
      g.fillStyle = fg;
      fitText(g, '!', 0, 0, r, r * 1.2, FONT_IMPACT, '400', fg);
  }
  g.restore();
}

/** Anuncio vertical (mupi) de marquesina. */
export function mupiSign(ctx: Ctx, i: number): string {
  const ad = ADS[i % ADS.length];
  const key = 'mupi:' + ad.title;
  ctx.signs.define(key, 1.2, 1.8, (g, W, H) => {
    g.fillStyle = ad.bg;
    g.fillRect(0, 0, W, H);
    g.fillStyle = ad.accent;
    g.beginPath();
    g.arc(W / 2, H * 0.3, W * 0.3, 0, Math.PI * 2);
    g.fill();
    drawIcon(g, ad.icon, W / 2, H * 0.3, W * 0.24, ad.bg, ad.fg);
    const words = ad.title.split(' ');
    const mid = Math.ceil(words.length / 2);
    fitText(g, words.slice(0, mid).join(' '), W / 2, H * 0.6, W * 0.9, H * 0.1, FONT_IMPACT, '400', ad.fg);
    fitText(g, words.slice(mid).join(' '), W / 2, H * 0.7, W * 0.9, H * 0.1, FONT_IMPACT, '400', ad.fg);
    fitText(g, ad.sub, W / 2, H * 0.85, W * 0.92, H * 0.06, FONT, '800', ad.fg);
  });
  return key;
}

