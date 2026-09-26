// El Polígono con más vida: una obra de verdad (vallas y conos rompibles, retroexcavadora, montones de
// arena, tubos, caseta y retrete portátil), una cancha de baloncesto con grafitis de Los Devueltos y
// bidones y palés junto a las naves.
import type { Ctx } from './ctx';
import type { Out } from './special';
import type { Guard } from './detalles';
import { ground } from './special';
import { OCC } from './occ';
import { districtRaw } from './plan';
import { SKIP } from './geo';
import { Rng } from '../../core/rng';
import * as K from './kit';

/** Obra en el descampado detrás de Cartonajes La Caja Feliz (entre la Calle del Desguace y la nave). */
export const WORKS = { x: 136, z: 75.8, hw: 23, hd: 6.2 };
/** Cancha en el solar vacío junto a la Avenida de la Carretilla (sur del Polígono). */
export const COURT = { x: 194, z: 131, hw: 11.5, hd: 6.5 };

export function vidaPoligono(ctx: Ctx, out: Out, g: Guard, rng: Rng) {
  works(ctx, rng);
  court(ctx);
  junk(ctx, g, rng);
  void out;
}

function works(ctx: Ctx, rng: Rng) {
  const { x: cx, z: cz, hw, hd } = WORKS;
  const H = (x: number, z: number) => ctx.heightAt(x, z);
  ctx.paved.push({ x: cx, z: cz, hw, hd, rot: 0, color: '#d9b36a' });
  ctx.mapLabels.push({ x: cx, z: cz + 1, text: 'Obras', color: '#a86a10' });
  // suelo de tierra removida
  ctx.pave.rect(ctx.pave.paint, cx, cz + 0.5, hw - 1, hd - 1.2, 0, '#c9ae7a', 3);
  // vallado rompible con entrada en el centro de la cara norte
  const z0 = cz - hd + 0.5, z1 = cz + hd - 0.8;
  for (let x = cx - hw + 1.5; x <= cx + hw - 1.4; x += 2.25) {
    if (Math.abs(x - cx) < 3.4) continue;
    ctx.breakables.push({ kind: 'fence', pos: ground(ctx, x, z0), rotY: 0 });
  }
  for (const x of [cx - hw + 0.4, cx + hw - 0.4]) {
    for (let z = z0 + 1.3; z <= z1; z += 2.25) ctx.breakables.push({ kind: 'fence', pos: ground(ctx, x, z), rotY: Math.PI / 2 });
  }
  const b = ctx.solid.at(cx, cz);
  // retroexcavadora
  {
    const x = cx - 13.5, z = cz + 0.6, r = 0.6;
    K.digger(b, x, H(x, z), z, r);
    ctx.box(x, H(x, z) + 1.3, z, 1.2, 1.3, 1.7, r);
  }
  // montones de arena y grava
  K.pile(b, cx + 10.5, H(cx + 10.5, cz), cz, 2.4, 1.7, '#e2c98e', 3);
  K.pile(b, cx + 16, H(cx + 16, cz + 2.4), cz + 2.4, 1.8, 1.2, '#9a958c', 7);
  ctx.cyl(cx + 10.5, H(cx + 10.5, cz) + 0.6, cz, 0.7, 1.9);
  ctx.cyl(cx + 16, H(cx + 16, cz + 2.4) + 0.4, cz + 2.4, 0.5, 1.4);
  // tubos apilados
  {
    const x = cx - 19.5, z = cz + 3.3;
    K.pipes(b, x, H(x, z), z, Math.PI / 2);
    ctx.box(x, H(x, z) + 0.6, z, 2.0, 0.6, 0.8, Math.PI / 2);
  }
  // retrete portátil y caseta de obra
  {
    const x = cx + 20.3, z = cz + 4.2;
    K.toilet(b, x, H(x, z), z, Math.PI + 0.2);
    ctx.box(x, H(x, z) + 1.15, z, 0.55, 1.15, 0.55, Math.PI + 0.2);
  }
  {
    const x = cx + 4.5, z = cz + 4.1, y = H(x, z);
    b.frame(x, y, z, Math.PI);
    b.box(0, 1.35, 0, 6, 2.5, 2.4, '#f4f1ea', SKIP.NY);
    b.box(0, 2.65, 0, 6.2, 0.12, 2.6, '#8a9098');
    b.panelZ(-1.8, 1.05, 1.21, 0.9, 2.0, '#2f6fb0');
    b.panelZ(0.8, 1.6, 1.21, 1.6, 0.9, '#9fd3f0', [0.4, 0.35, 0.2, 0.1]);
    b.box(0, 0.12, 0, 6.1, 0.24, 2.5, '#5a5f66');
    ctx.box(x, y + 1.35, z, 3, 1.35, 1.2, Math.PI);
    ctx.foot.push({ x, z, hw: 3, hd: 1.2, rot: Math.PI, color: '#f4f1ea', height: 2.6 });
  }
  // cartel de la obra (dos postes), mirando a la calle
  {
    const x = cx - 7.5, z = z0 + 0.35, y = H(x, z);
    b.frame(x, y, z, Math.PI);
    for (const sx of [-1.4, 1.4]) b.box(sx, 1.5, 0.06, 0.12, 3.0, 0.12, '#5a5f66');
    b.box(0, 2.2, 0, 3.2, 1.6, 0.06, '#f4f1ea');
    ctx.signs.placeDouble(b, 'obra', 0, 2.2, 0, 3.0, 1.5, 0.05);
    ctx.cyl(x - 1.4, y + 1.5, z, 1.5, 0.08);
    ctx.cyl(x + 1.4, y + 1.5, z, 1.5, 0.08);
  }
  // barreras de hormigón a los lados de la entrada
  [[cx - 4.6, z0 + 1.6, Math.PI / 2], [cx + 4.6, z0 + 1.6, Math.PI / 2], [cx - 3.2, z1 - 0.6, 0.2]].forEach(([x, z, r], i) => {
    K.barrier(b, x, H(x, z), z, r, i);
    ctx.box(x, H(x, z) + 0.4, z, 1.0, 0.4, 0.3, r);
  });
  // conos rompibles
  for (const [dx, dz] of [[-16.5, -2.2], [-10.2, -2.6], [-9.4, 3.2], [-17.8, 4.4], [7.8, -1.9], [13.2, -3.1], [1.2, -2.2]]) {
    ctx.breakables.push({ kind: 'cone', pos: ground(ctx, cx + dx, cz + dz), rotY: rng.range(0, 6) });
  }
}

function court(ctx: Ctx) {
  const { x: cx, z: cz } = COURT;
  const pave = ctx.pave;
  const cw = 11.2, cd = 6.2;
  pave.rect(pave.walk, cx, cz, cw, cd, 0, '#3f6fb8', 2);
  const line = '#f4f1ea';
  for (const s of [-1, 1]) {
    pave.rect(pave.paint, cx, cz + s * (cd - 0.3), cw - 0.3, 0.05, 0, line, 2);
    pave.rect(pave.paint, cx + s * (cw - 0.3), cz, 0.05, cd - 0.3, 0, line, 2);
    // zona de tiro libre
    pave.rect(pave.paint, cx + s * (cw - 2.8), cz, 2.45, 1.8, 0, '#e8703a', 2);
  }
  pave.rect(pave.paint, cx, cz, 0.05, cd - 0.3, 0, line, 2);
  pave.disc(pave.paint, cx, cz, 1.6, '#e8703a', 14);
  ctx.paved.push({ x: cx, z: cz, hw: cw, hd: cd, rot: 0, color: '#3f6fb8' });
  ctx.mapLabels.push({ x: cx, z: cz, text: 'Cancha', color: '#1f4e8c' });
  const H = (x: number, z: number) => ctx.heightAt(x, z);
  const b = ctx.solid.at(cx, cz);
  for (const s of [-1, 1]) {
    const x = cx + s * (cw - 0.4), z = cz;
    const rot = s < 0 ? Math.PI / 2 : -Math.PI / 2;
    K.hoop(b, x, H(x, z), z, rot);
    const px = x - Math.sin(rot) * 0.6;
    ctx.cyl(px, H(x, z) + 1.6, z, 1.6, 0.1);
  }
  // muro de los grafitis (delante de la nave del sur)
  const wz = cz + cd + 1.0, wy = H(cx, wz);
  b.frame(cx, wy, wz, Math.PI);
  b.box(0, 1.35, 0, cw * 2 + 0.6, 2.7, 0.3, '#d8d2c6', SKIP.NY);
  b.box(0, 2.75, 0, cw * 2 + 0.8, 0.1, 0.4, '#b8b2a6');
  ctx.signs.place(b, 'grafiti-cancha', -4.9, 1.35, 0.16, 12.5, 2.5, 0.05);
  ctx.signs.place(b, 'mural-tags', 6.9, 1.35, 0.16, 7.8, 2.5, 0.05);
  ctx.box(cx, wy + 1.35, wz, cw + 0.3, 1.35, 0.15);
  ctx.foot.push({ x: cx, z: wz, hw: cw + 0.3, hd: 0.15, rot: 0, color: '#d8d2c6', height: 2.7 });
  // banco, bidón con hoguera, otro bidón y el balón
  ctx.props.add('bench', cx, H(cx, wz - 1.0), wz - 1.0, Math.PI, 1);
  K.drum(b, cx - cw + 1.2, H(cx - cw + 1.2, wz - 0.8), wz - 0.8, '#6c4a3a', true);
  K.drum(b, cx + cw - 1.0, H(cx + cw - 1.0, wz - 0.8), wz - 0.8, '#2f6fb0');
  ctx.cyl(cx - cw + 1.2, H(cx, wz) + 0.45, wz - 0.8, 0.45, 0.3);
  ctx.cyl(cx + cw - 1.0, H(cx, wz) + 0.45, wz - 0.8, 0.45, 0.3);
  b.frame(cx + 3, H(cx + 3, cz - 2.5), cz - 2.5, 0);
  b.blob(0, 0.12, 0, 0.12, 0.12, 0.12, '#ff6a1a');
}

/** Bidones, palés y ruedas pegados a las paredes de las naves. */
function junk(ctx: Ctx, g: Guard, rng: Rng) {
  let n = 0;
  for (let t = 0; t < 3000 && n < 12; t++) {
    const x = rng.range(105, 240), z = rng.range(-90, 160);
    if (districtRaw(x, z) !== 'poligono' || ctx.occ.get(x, z) !== OCC.FREE) continue;
    // pegado a una pared
    let wall = false;
    for (const [dx, dz] of [[1.4, 0], [-1.4, 0], [0, 1.4], [0, -1.4]]) if (ctx.occ.get(x + dx, z + dz) === OCC.BUILDING) wall = true;
    if (!wall || !g.free(x, z, 1.2, [OCC.FREE, OCC.BUILDING])) continue;
    const y = ctx.heightAt(x, z);
    const kind = n % 3;
    if (kind === 0) {
      const b = ctx.solid.at(x, z);
      const cols = ['#2f6fb0', '#e8394d', '#3f8f5a', '#e8a01b'];
      K.drum(b, x, y, z, rng.pick(cols));
      K.drum(b, x + 0.65, y, z + 0.2, rng.pick(cols));
      ctx.cyl(x + 0.3, y + 0.45, z + 0.1, 0.45, 0.7);
    } else if (kind === 1) ctx.props.add('crateStack', x, y, z, rng.range(0, 6), 1.1);
    else ctx.props.add('tyres', x, y, z, rng.range(0, 6), 1);
    g.protect(x, z, 2);
    n++;
  }
}
