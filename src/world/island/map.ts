// Mapa de la isla visto desde arriba (para el minimapa y el mapa grande).
//
// Conversión (mapPixelSize = PX metros por píxel; SIZE = 640; el píxel (0,0) es la esquina (-320, -320)):
//   píxel -> mundo:  x = px * PX - SIZE/2,   z = py * PX - SIZE/2
//   mundo -> píxel:  px = (x + SIZE/2) / PX, py = (z + SIZE/2) / PX
// El norte (-Z) queda arriba del mapa.
import type { Ctx } from './ctx';
import type { District } from '../../core/contracts';
import { HALF } from './shape';
import { districtRaw } from './plan';
import { OCC } from './occ';
import { FONT } from './signs';

export const MAP_PX = 0.5;

const LAND: Record<string, [number, number, number]> = {
  centro: [226, 214, 184],
  viejo: [236, 218, 186],
  puerto: [214, 210, 200],
  poligono: [206, 202, 184],
  colina: [170, 210, 128],
};

export function drawMap(ctx: Ctx, districts: District[], props: { x: number; z: number; type: string }[]): HTMLCanvasElement {
  const N = Math.round((HALF * 2) / MAP_PX);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = N;
  const g = canvas.getContext('2d')!;
  const W = (x: number) => (x + HALF) / MAP_PX;

  // 1) relieve: raster de 2 m escalado con suavizado
  const R = 320;
  const small = document.createElement('canvas');
  small.width = small.height = R;
  const sg = small.getContext('2d')!;
  const img = sg.createImageData(R, R);
  const cell = (HALF * 2) / R;
  for (let j = 0; j < R; j++) {
    for (let i = 0; i < R; i++) {
      const x = -HALF + (i + 0.5) * cell, z = -HALF + (j + 0.5) * cell;
      const h = ctx.heightAt(x, z);
      let r: number, gg: number, b: number;
      if (h < 0.15) {
        const d = Math.min(1, -h / 9);
        r = 70 - 40 * d;
        gg = 190 - 90 * d;
        b = 214 - 40 * d;
      } else if (h < 1.3) {
        r = 240;
        gg = 222;
        b = 170;
      } else {
        const dname = districtRaw(x, z);
        const c = LAND[dname];
        const v = ctx.occ.get(x, z);
        const urbanCore = Math.abs(x) < 250 && z > -100 && z < 172 && (dname === 'centro' || dname === 'viejo');
        const green = !urbanCore && (v === OCC.FREE || v === OCC.WATER || v === OCC.PROP || v === OCC.YARD || (dname === 'puerto' && v === OCC.RESERVED));
        const shade = 1 + Math.min(0.12, (h - 3) * 0.005);
        if (green && dname !== 'puerto') {
          r = 150 * shade;
          gg = 196 * shade;
          b = 112 * shade;
          if (dname === 'poligono') [r, gg, b] = [196, 190, 150];
        } else [r, gg, b] = [c[0] * shade, c[1] * shade, c[2] * shade];
        if (x > -160 && x < 192 && z > 172.8 && z < 262.4) [r, gg, b] = [206, 202, 192];
      }
      const k = (j * R + i) * 4;
      img.data[k] = r;
      img.data[k + 1] = gg;
      img.data[k + 2] = b;
      img.data[k + 3] = 255;
    }
  }
  sg.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(small, 0, 0, N, N);

  // 2) zonas pavimentadas y jardines
  for (const p of ctx.paved) rect(g, W(p.x), W(p.z), p.hw / MAP_PX, p.hd / MAP_PX, p.rot, p.color, null);

  // 3) calles: contorno oscuro, acera y calzada clara
  const net = ctx.net;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const pass = (fn: (w: number, alley: boolean, main: boolean) => [number, string] | null) => {
    for (const e of net.edges) {
      const r = fn(e.width, e.alley, e.width >= 10 && !e.alley);
      if (!r) continue;
      const A = net.nodes[e.a], B = net.nodes[e.b];
      g.strokeStyle = r[1];
      g.lineWidth = r[0] / MAP_PX;
      g.beginPath();
      g.moveTo(W(A.x), W(A.z));
      g.lineTo(W(B.x), W(B.z));
      g.stroke();
    }
  };
  pass((w, alley) => [alley ? w + 1.5 : w + 7.5, 'rgba(80,68,60,0.55)']);
  pass((w, alley) => (alley ? null : [w + 5.6, '#efe6d4']));
  pass((w, alley, main) => [w, alley ? '#fffaf0' : main ? '#fff4c9' : '#fdfbf5']);
  // línea central discontinua en las avenidas
  g.setLineDash([3 / MAP_PX, 3 / MAP_PX]);
  pass((w, alley) => (alley ? null : [0.35, 'rgba(200,170,90,0.9)']));
  g.setLineDash([]);

  // 4) edificios con sombra
  const foot = ctx.foot.slice().sort((a, b) => a.height - b.height);
  for (const f of foot) {
    const off = Math.min(3.5, 0.6 + f.height * 0.12) / MAP_PX;
    rect(g, W(f.x) + off * 0.6, W(f.z) + off, f.hw / MAP_PX, f.hd / MAP_PX, f.rot, 'rgba(40,30,40,0.22)', null);
  }
  for (const f of foot) {
    const c = mix(f.color, '#b9ad9c', 0.35);
    rect(g, W(f.x), W(f.z), f.hw / MAP_PX, f.hd / MAP_PX, f.rot, c, 'rgba(60,45,40,0.75)');
  }
  // 5) piscinas
  for (const p of ctx.pools) rect(g, W(p.x), W(p.z), p.hw / MAP_PX, p.hd / MAP_PX, p.rot, '#46c6f2', '#ffffff');
  // 6) árboles
  for (const t of props) {
    const r = t.type === 'pine' ? 2.8 : t.type === 'palm' ? 2.2 : t.type === 'bush' ? 1.2 : 1.8;
    g.fillStyle = t.type === 'pine' ? '#3f7f45' : t.type === 'olive' ? '#7f9a5a' : '#4f9a45';
    g.beginPath();
    g.arc(W(t.x), W(t.z), r / MAP_PX, 0, Math.PI * 2);
    g.fill();
  }
  // 7) nombres de los barrios
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const d of districts) {
    const [x, z] = LABEL_AT[d.id] ?? [d.center.x, d.center.z];
    g.font = `900 ${Math.round(15 / MAP_PX)}px ${FONT}`;
    g.lineWidth = 3.5 / MAP_PX;
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.strokeText(d.name.toUpperCase(), W(x), W(z));
    g.fillStyle = d.color;
    g.fillText(d.name.toUpperCase(), W(x), W(z));
  }
  // marco
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 4;
  g.strokeRect(2, 2, N - 4, N - 4);
  return canvas;
}

const LABEL_AT: Record<string, [number, number]> = {
  puerto: [0, 245],
  centro: [0, -20],
  colina: [0, -150],
  poligono: [208, 140],
  viejo: [-172, -80],
};

function rect(g: CanvasRenderingContext2D, cx: number, cy: number, hw: number, hd: number, rot: number, fill: string, stroke: string | null) {
  g.save();
  g.translate(cx, cy);
  // rot: rumbo (0 = +Z = abajo en el mapa); el eje x local del solar es (cos, -sin) en (x, z)
  g.rotate(-rot);
  g.fillStyle = fill;
  g.fillRect(-hw, -hd, hw * 2, hd * 2);
  if (stroke) {
    g.strokeStyle = stroke;
    g.lineWidth = 1.2;
    g.strokeRect(-hw, -hd, hw * 2, hd * 2);
  }
  g.restore();
}

function mix(a: string, b: string, t: number): string {
  const pa = hex(a), pb = hex(b);
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * t), gg = Math.round(pa[1] + (pb[1] - pa[1]) * t), bb = Math.round(pa[2] + (pb[2] - pa[2]) * t);
  return `rgb(${r},${gg},${bb})`;
}

function hex(c: string): number[] {
  if (c.startsWith('#') && c.length === 7) return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  return [180, 170, 160];
}
