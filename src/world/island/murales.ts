// Dibujos nuevos del atlas de carteles: murales y grafitis graciosos, pizarras de bar, rótulos del
// mercadillo, cartel de obra y carteles de los secretos. Todo inventado (ninguna marca ni persona real).
// Los tamaños de `define` son pequeños a propósito: fijan la resolución en el atlas (que es uno solo
// para toda la isla); luego se colocan más grandes.
import type { Signs } from './signs';
import { fitText, roundRect, FONT, FONT_FUN, FONT_IMPACT, FONT_SCRIPT, FONT_SERIF } from './signs';

type G = CanvasRenderingContext2D;

function star(g: G, x: number, y: number, r: number, c: string) {
  g.fillStyle = c;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

/** Caja de cartón dibujada (el icono de la isla). */
function box(g: G, x: number, y: number, s: number, rot = 0) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.fillStyle = '#c9955a';
  g.fillRect(-s, -s * 0.8, s * 2, s * 1.6);
  g.fillStyle = '#e8cf98';
  g.fillRect(-s * 0.18, -s * 0.8, s * 0.36, s * 1.6);
  g.strokeStyle = '#6b4a2a';
  g.lineWidth = s * 0.08;
  g.strokeRect(-s, -s * 0.8, s * 2, s * 1.6);
  g.restore();
}

/** Letras de grafiti: gordas, con contorno y sombra. */
function tag(g: G, text: string, x: number, y: number, w: number, h: number, fill: string, line: string, rot = -0.06) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  fitText(g, text, h * 0.06, h * 0.08, w, h, FONT_IMPACT, '400', 'rgba(0,0,0,0.35)');
  fitText(g, text, 0, 0, w, h, FONT_IMPACT, '400', fill, line, h * 0.14);
  g.restore();
}

export function defineMurales(s: Signs) {
  // ── tapia del Pasaje del Paquete Perdido (Centro, cara que da a la Avenida del Reembolso) ──
  s.define('mural-atardecer', 5, 1.6, (g, W, H) => {
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#ff7eb3');
    gr.addColorStop(0.55, '#ffb35c');
    gr.addColorStop(1, '#ffe08a');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#fff3b0';
    g.beginPath();
    g.arc(W * 0.72, H * 0.62, H * 0.3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2f7fcf';
    g.fillRect(0, H * 0.72, W, H * 0.28);
    for (let i = 0; i < 6; i++) {
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.fillRect(W * (0.1 + i * 0.15), H * (0.8 + (i % 2) * 0.08), W * 0.08, H * 0.02);
    }
    // palmera y furgoneta de reparto volando
    g.fillStyle = '#6b4a2a';
    g.fillRect(W * 0.12, H * 0.35, W * 0.015, H * 0.4);
    g.fillStyle = '#2f8f4a';
    for (let i = 0; i < 5; i++) {
      g.save();
      g.translate(W * 0.127, H * 0.36);
      g.rotate(-2.6 + i * 0.55);
      g.fillRect(0, -H * 0.02, W * 0.07, H * 0.04);
      g.restore();
    }
    g.save();
    g.translate(W * 0.42, H * 0.3);
    g.rotate(-0.15);
    g.fillStyle = '#ffd23f';
    g.fillRect(-W * 0.08, -H * 0.08, W * 0.16, H * 0.16);
    g.fillStyle = '#1b1030';
    g.fillRect(W * 0.03, -H * 0.06, W * 0.04, H * 0.06);
    g.beginPath();
    g.arc(-W * 0.05, H * 0.09, H * 0.035, 0, 7);
    g.arc(W * 0.05, H * 0.09, H * 0.035, 0, 7);
    g.fill();
    g.fillStyle = '#ffffff';
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.ellipse(sx * W * 0.1, -H * 0.06, W * 0.05, H * 0.03, sx * 0.4, 0, 7);
      g.fill();
    }
    g.restore();
    fitText(g, 'PUERTO PAQUETE', W * 0.45, H * 0.12, W * 0.6, H * 0.16, FONT_IMPACT, '400', '#ffffff', '#c0306a', H * 0.03);
    fitText(g, 'donde tu paquete llega... a veces', W * 0.45, H * 0.9, W * 0.7, H * 0.09, FONT, '800', '#ffffff');
  });
  s.define('mural-tags', 5, 1.6, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    tag(g, 'LOS DEVUELTOS', W * 0.3, H * 0.3, W * 0.5, H * 0.3, '#9b5cff', '#1b1030');
    // la tachadura de otro repartidor
    g.strokeStyle = '#ffd23f';
    g.lineWidth = H * 0.07;
    g.beginPath();
    g.moveTo(W * 0.05, H * 0.45);
    g.lineTo(W * 0.56, H * 0.14);
    g.stroke();
    tag(g, 'CONTRA REEMBOLSO', W * 0.64, H * 0.68, W * 0.62, H * 0.28, '#ffd23f', '#1b1030', 0.04);
    fitText(g, '¡Paga al recibir!', W * 0.64, H * 0.92, W * 0.4, H * 0.1, FONT_SCRIPT, '700', '#ffffff');
    star(g, W * 0.9, H * 0.22, H * 0.12, '#ff4f9a');
    star(g, W * 0.06, H * 0.8, H * 0.09, '#3fc1ff');
  });
  s.define('mural-caja', 5, 1.6, (g, W, H) => {
    g.fillStyle = '#56c1e8';
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#7fd3f0' : '#4ab0da';
      g.beginPath();
      g.arc(W * (i / 7), H * 1.05, H * 0.35, 0, 7);
      g.fill();
    }
    // caja gigante con alas y gafas de sol
    box(g, W * 0.3, H * 0.5, H * 0.3, -0.08);
    g.fillStyle = '#ffffff';
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.ellipse(W * 0.3 + sx * H * 0.48, H * 0.36, H * 0.22, H * 0.09, sx * 0.5, 0, 7);
      g.fill();
    }
    g.fillStyle = '#1b1b1b';
    g.fillRect(W * 0.3 - H * 0.2, H * 0.44, H * 0.16, H * 0.07);
    g.fillRect(W * 0.3 + H * 0.04, H * 0.44, H * 0.16, H * 0.07);
    g.fillRect(W * 0.3 - H * 0.05, H * 0.46, H * 0.1, H * 0.02);
    g.strokeStyle = '#6b4a2a';
    g.lineWidth = H * 0.025;
    g.beginPath();
    g.arc(W * 0.3, H * 0.58, H * 0.07, 0.2, Math.PI - 0.2);
    g.stroke();
    fitText(g, 'Tu paquete está', W * 0.7, H * 0.32, W * 0.5, H * 0.16, FONT_FUN, '900', '#1b3a6b');
    fitText(g, '"EN REPARTO"', W * 0.7, H * 0.52, W * 0.5, H * 0.2, FONT_IMPACT, '400', '#ffffff', '#1b3a6b', H * 0.03);
    fitText(g, '(desde marzo)', W * 0.7, H * 0.72, W * 0.4, H * 0.12, FONT_SCRIPT, '700', '#1b3a6b');
  });
  s.define('mural-gato', 5, 1.6, (g, W, H) => {
    g.fillStyle = '#ffe08a';
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 14; i++) {
      g.fillStyle = ['#ff6fb5', '#3fc1ff', '#7cf06a', '#ff8c2a'][i % 4];
      g.beginPath();
      g.arc(W * ((i * 0.137) % 1), H * ((i * 0.31) % 1), H * 0.05, 0, 7);
      g.fill();
    }
    // gato naranja gigante durmiendo sobre un paquete
    box(g, W * 0.28, H * 0.66, H * 0.22);
    g.fillStyle = '#e8903a';
    g.beginPath();
    g.ellipse(W * 0.28, H * 0.38, H * 0.3, H * 0.14, 0, 0, 7);
    g.fill();
    g.beginPath();
    g.arc(W * 0.28 + H * 0.28, H * 0.34, H * 0.1, 0, 7);
    g.fill();
    for (const dx of [0.2, 0.34]) {
      g.beginPath();
      g.moveTo(W * 0.28 + H * dx, H * 0.26);
      g.lineTo(W * 0.28 + H * (dx + 0.05), H * 0.16);
      g.lineTo(W * 0.28 + H * (dx + 0.08), H * 0.27);
      g.fill();
    }
    g.fillStyle = '#1b1b1b';
    fitText(g, 'z z z', W * 0.28 + H * 0.45, H * 0.14, H * 0.3, H * 0.12, FONT_FUN, '900', '#6b4a2a');
    fitText(g, 'SE BUSCA GATO NARANJA', W * 0.7, H * 0.3, W * 0.52, H * 0.14, FONT_IMPACT, '400', '#c0306a');
    fitText(g, 'Responde a "Michi". No responde.', W * 0.7, H * 0.5, W * 0.52, H * 0.1, FONT, '800', '#1b1b1b');
    fitText(g, 'Recompensa: una caricia', W * 0.7, H * 0.68, W * 0.46, H * 0.1, FONT_SCRIPT, '700', '#1b1b1b');
  });
  s.define('pasaje', 2.4, 0.5, (g, W, H) => {
    g.fillStyle = '#f4efe2';
    roundRect(g, 0, 0, W, H, H * 0.15);
    g.fill();
    g.strokeStyle = '#2f5fa7';
    g.lineWidth = H * 0.07;
    roundRect(g, H * 0.07, H * 0.07, W - H * 0.14, H - H * 0.14, H * 0.1);
    g.stroke();
    fitText(g, 'Pasaje del Paquete Perdido', W / 2, H / 2, W * 0.88, H * 0.52, FONT_SERIF, '700', '#2f5fa7');
  });
  s.define('piscina-monedas', 2.6, 0.9, (g, W, H) => {
    g.fillStyle = '#1f3f6f';
    roundRect(g, 0, 0, W, H, H * 0.12);
    g.fill();
    g.strokeStyle = '#e8c25a';
    g.lineWidth = H * 0.05;
    roundRect(g, H * 0.06, H * 0.06, W - H * 0.12, H - H * 0.12, H * 0.1);
    g.stroke();
    fitText(g, 'PISCINA DE MONEDAS DEL DIRECTOR', W / 2, H * 0.34, W * 0.9, H * 0.26, FONT_SERIF, '700', '#f3e2b8');
    fitText(g, 'Prohibido bucear (duele). No se lo cuentes a los clientes.', W / 2, H * 0.68, W * 0.9, H * 0.14, FONT, '700', '#f3e2b8');
  });

  // ── Barrio Viejo: callejones sin salida ──
  s.define('mural-salida', 3.2, 1.8, (g, W, H) => {
    g.fillStyle = '#f2e3c2';
    g.fillRect(0, 0, W, H);
    // puerta pintada (de mentira)
    const dx = W * 0.5, dw = W * 0.2, dy = H * 0.3;
    g.fillStyle = '#6b3f22';
    g.fillRect(dx - dw / 2, dy, dw, H - dy);
    g.fillStyle = '#8a5a33';
    g.fillRect(dx - dw / 2 + W * 0.012, dy + H * 0.03, dw - W * 0.024, H - dy - H * 0.03);
    g.fillStyle = '#e8c25a';
    g.beginPath();
    g.arc(dx + dw * 0.33, dy + (H - dy) * 0.55, H * 0.02, 0, 7);
    g.fill();
    g.fillStyle = '#3fae4a';
    g.fillRect(dx - W * 0.1, H * 0.08, W * 0.2, H * 0.14);
    fitText(g, 'SALIDA', dx, H * 0.15, W * 0.18, H * 0.1, FONT, '900', '#ffffff');
    fitText(g, '(es broma)', dx, H * 0.26, W * 0.2, H * 0.06, FONT_SCRIPT, '700', '#6b3f22');
    // gato pintado mirando la puerta
    g.fillStyle = '#2a2a2e';
    g.beginPath();
    g.ellipse(W * 0.78, H * 0.86, W * 0.05, H * 0.08, 0, 0, 7);
    g.fill();
    g.beginPath();
    g.arc(W * 0.78, H * 0.72, W * 0.03, 0, 7);
    g.fill();
    fitText(g, '¿SIN SALIDA?', W * 0.17, H * 0.35, W * 0.3, H * 0.12, FONT_IMPACT, '400', '#c0306a');
    fitText(g, 'Pues no salgas.', W * 0.17, H * 0.5, W * 0.3, H * 0.09, FONT_SCRIPT, '700', '#1b1b1b');
    // enredadera
    for (let i = 0; i < 18; i++) {
      g.fillStyle = i % 3 ? '#3f8f3a' : '#5aae4a';
      g.beginPath();
      g.arc(W * (0.02 + (i % 6) * 0.018), H * (0.05 + Math.floor(i / 6) * 0.1 + (i % 2) * 0.03), H * 0.035, 0, 7);
      g.fill();
    }
  });
  s.define('mural-abuela', 3.2, 1.8, (g, W, H) => {
    g.fillStyle = '#bfe3f2';
    g.fillRect(0, 0, W, H);
    // abuela en moto (dibujo sencillo)
    g.fillStyle = '#e8394d';
    g.fillRect(W * 0.2, H * 0.55, W * 0.3, H * 0.14);
    g.fillStyle = '#1b1b1b';
    for (const x of [0.24, 0.46]) {
      g.beginPath();
      g.arc(W * x, H * 0.74, H * 0.08, 0, 7);
      g.fill();
    }
    g.fillStyle = '#7c4dbb';
    g.fillRect(W * 0.3, H * 0.34, W * 0.08, H * 0.22);
    g.fillStyle = '#f0c8a0';
    g.beginPath();
    g.arc(W * 0.34, H * 0.28, H * 0.07, 0, 7);
    g.fill();
    g.fillStyle = '#dddddd';
    g.beginPath();
    g.arc(W * 0.34, H * 0.22, H * 0.06, Math.PI, 0);
    g.fill();
    for (let i = 0; i < 3; i++) {
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.fillRect(W * (0.05 + i * 0.04), H * (0.5 + i * 0.07), W * 0.1, H * 0.02);
    }
    fitText(g, 'AQUÍ LAS ABUELAS', W * 0.72, H * 0.3, W * 0.5, H * 0.14, FONT_IMPACT, '400', '#1f4e8c');
    fitText(g, 'CORREN MÁS QUE TÚ', W * 0.72, H * 0.48, W * 0.5, H * 0.14, FONT_IMPACT, '400', '#e8394d');
    fitText(g, 'Velocidad máxima: la que diga la abuela', W * 0.72, H * 0.66, W * 0.5, H * 0.07, FONT, '800', '#1b1b1b');
  });

  // ── Polígono: cancha y obra ──
  s.define('grafiti-cancha', 6, 1.2, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    tag(g, 'LOS DEVUELTOS', W * 0.2, H * 0.45, W * 0.34, H * 0.5, '#9b5cff', '#ffffff');
    g.strokeStyle = '#9b5cff';
    g.lineWidth = H * 0.08;
    g.beginPath();
    g.arc(W * 0.42, H * 0.45, H * 0.22, -Math.PI * 0.2, Math.PI * 1.2);
    g.stroke();
    tag(g, 'PACO TE QUIERO', W * 0.63, H * 0.3, W * 0.26, H * 0.3, '#ff4f9a', '#1b1b1b', 0.05);
    fitText(g, 'Firmado: Paco', W * 0.63, H * 0.58, W * 0.2, H * 0.14, FONT_SCRIPT, '700', '#ffffff');
    tag(g, 'NO AL PORTE DEBIDO', W * 0.86, H * 0.7, W * 0.26, H * 0.24, '#3fc1ff', '#1b1b1b', -0.1);
    star(g, W * 0.52, H * 0.82, H * 0.12, '#ffd23f');
    star(g, W * 0.97, H * 0.2, H * 0.1, '#7cf06a');
  });
  s.define('obra', 3, 1.5, (g, W, H) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffd23f';
    g.fillRect(0, 0, W, H * 0.24);
    for (let i = 0; i < 12; i++) {
      g.fillStyle = '#1b1b1b';
      g.beginPath();
      g.moveTo(W * (i / 12), 0);
      g.lineTo(W * (i / 12) + W * 0.04, 0);
      g.lineTo(W * (i / 12) + W * 0.04 - H * 0.24 * 0.5, H * 0.24);
      g.lineTo(W * (i / 12) - H * 0.24 * 0.5, H * 0.24);
      g.fill();
    }
    fitText(g, 'AQUÍ SE CONSTRUIRÁ ALGO', W / 2, H * 0.38, W * 0.92, H * 0.14, FONT_IMPACT, '400', '#1f4e8c');
    fitText(g, 'Probablemente.', W / 2, H * 0.52, W * 0.6, H * 0.1, FONT_SCRIPT, '700', '#1b1b1b');
    fitText(g, 'Promotora: Construcciones Ya Veremos S. L.', W / 2, H * 0.68, W * 0.9, H * 0.08, FONT, '700', '#1b1b1b');
    fitText(g, 'Plazo de ejecución: pronto (o no)', W / 2, H * 0.8, W * 0.9, H * 0.08, FONT, '700', '#1b1b1b');
    fitText(g, 'Disculpen las molestias (no)', W / 2, H * 0.92, W * 0.9, H * 0.08, FONT, '900', '#e8394d');
  });
  s.define('se-alquila', 1.6, 1.0, (g, W, H) => {
    g.fillStyle = '#ffd23f';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#e8394d';
    g.lineWidth = H * 0.06;
    g.strokeRect(H * 0.05, H * 0.05, W - H * 0.1, H - H * 0.1);
    fitText(g, 'SE ALQUILA', W / 2, H * 0.24, W * 0.86, H * 0.22, FONT_IMPACT, '400', '#e8394d');
    fitText(g, 'Contenedor reformado · 29 m²', W / 2, H * 0.46, W * 0.86, H * 0.11, FONT, '800', '#1b1b1b');
    fitText(g, 'Muy luminoso (si abres la puerta)', W / 2, H * 0.6, W * 0.86, H * 0.1, FONT, '700', '#1b1b1b');
    fitText(g, '1.200 €/mes · gastos aparte', W / 2, H * 0.78, W * 0.86, H * 0.12, FONT, '900', '#1b1b1b');
  });

  // ── Parque y rampa ──
  s.define('parque', 2.6, 0.9, (g, W, H) => {
    g.fillStyle = '#2f6f3a';
    roundRect(g, 0, 0, W, H, H * 0.2);
    g.fill();
    fitText(g, 'Parque de la Siesta', W / 2, H * 0.38, W * 0.9, H * 0.4, FONT_SERIF, '700', '#fff4c9');
    fitText(g, 'Prohibido despertar a nadie · Horario: de 15 a 17 h', W / 2, H * 0.76, W * 0.9, H * 0.16, FONT, '700', '#ffffff');
  });
  s.define('salto', 2.4, 1.0, (g, W, H) => {
    g.fillStyle = '#e8394d';
    roundRect(g, 0, 0, W, H, H * 0.12);
    g.fill();
    g.fillStyle = '#ffd23f';
    g.fillRect(0, H * 0.84, W, H * 0.16);
    fitText(g, 'SALTO DEL MIRADOR', W / 2, H * 0.3, W * 0.9, H * 0.3, FONT_IMPACT, '400', '#ffffff');
    fitText(g, 'Vistas al mar (y al centro de salud)', W / 2, H * 0.6, W * 0.9, H * 0.14, FONT, '800', '#ffffff');
    fitText(g, '¡Sin frenos, que se disfruta más!', W / 2, H * 0.92, W * 0.9, H * 0.11, FONT, '900', '#1b1b1b');
  });
  s.define('estatua', 1.2, 0.35, (g, W, H) => {
    g.fillStyle = '#f4efe2';
    g.fillRect(0, 0, W, H);
    fitText(g, 'Echa 1 € y me muevo', W / 2, H / 2, W * 0.9, H * 0.6, FONT_SCRIPT, '700', '#6b4a2a');
  });
}

/** Pizarras de bar y tienda: textos de la pizarra (dos o tres líneas). */
const PIZARRAS: string[][] = [
  ['MENÚ DEL DÍA', 'Lo de ayer', '9,50 €'],
  ['HAY CROQUETAS', '(mentira)', 'pero entra igual'],
  ['CAFÉ SOLO 1 €', 'Con leche 1,20 €', '"No me hables" 3 €'],
  ['WIFI GRATIS', 'Contraseña:', 'pagaprimero'],
  ['HOY: PAELLA', 'Mañana:', 'también'],
  ['SE BUSCA CAMARERO', 'Que no pregunte', 'por el sueldo'],
];

export function definePizarras(s: Signs): string[] {
  return PIZARRAS.map((lines, i) =>
    s.define('pizarra-' + i, 0.9, 1.2, (g, W, H) => {
      g.fillStyle = '#6b4a2a';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#23302a';
      g.fillRect(W * 0.07, W * 0.07, W - W * 0.14, H - W * 0.14);
      const cols = ['#ffffff', '#ffe08a', '#9ff0a8'];
      lines.forEach((t, k) => fitText(g, t, W / 2, H * (0.26 + k * 0.24), W * 0.78, H * (k === 0 ? 0.13 : 0.11), FONT_FUN, '800', cols[k]));
      g.strokeStyle = 'rgba(255,255,255,0.6)';
      g.lineWidth = H * 0.01;
      g.beginPath();
      g.moveTo(W * 0.2, H * 0.37);
      g.lineTo(W * 0.8, H * 0.37);
      g.stroke();
    }),
  );
}

/** Rótulos de los puestos del mercadillo y de la lonja. */
export const PUESTOS: { name: string; bg: string; fg: string; goods: string[]; fish?: boolean }[] = [
  { name: 'TODO A 1 €', bg: '#e8394d', fg: '#ffffff', goods: ['#ff6fb5', '#3fc1ff', '#ffd23f', '#7cf06a'] },
  { name: 'CAMISETAS DE MARCA (DE OTRA MARCA)', bg: '#2f7fcf', fg: '#ffffff', goods: ['#e8394d', '#ffffff', '#1b1b1b', '#ffd23f'] },
  { name: 'MELONES COMO TU CABEZA', bg: '#3f9a5a', fg: '#ffffff', goods: ['#a8d35a', '#f2d13b', '#e8903a', '#3f8a3a'] },
  { name: 'CHURROS · PORRAS · COLESTEROL', bg: '#f2a93b', fg: '#6b1a0a', goods: ['#e8b04a', '#c98a3a', '#f4d27a', '#e8b04a'] },
  { name: 'PESCADOS LA SIRENA CALVA', bg: '#1f4e8c', fg: '#ffffff', goods: ['#b8c4cc', '#9aa8b4', '#c9d3da'], fish: true },
  { name: 'MARISCOS EL PERCEBE FELIZ', bg: '#c0392b', fg: '#fff1d6', goods: ['#ff8a6a', '#ff6a4a', '#e8583a'], fish: true },
  { name: 'PULPO A FEIRA (Y A VECES A FERROL)', bg: '#7c4dbb', fg: '#ffffff', goods: ['#c86a8a', '#b85a7a', '#d87a9a'], fish: true },
];

export function definePuestos(s: Signs): string[] {
  return PUESTOS.map((p, i) =>
    s.define('puesto-' + i, 2.6, 0.45, (g, W, H) => {
      g.fillStyle = p.bg;
      roundRect(g, 0, 0, W, H, H * 0.2);
      g.fill();
      fitText(g, p.name, W / 2, H / 2, W * 0.92, H * 0.66, FONT_FUN, '900', p.fg);
    }),
  );
}
