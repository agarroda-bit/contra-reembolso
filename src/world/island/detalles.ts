// Detalles de fase 9: vida y gracia en los cinco barrios (terrazas, mercadillos, gatos, gaviotas,
// farolillos, murales, obras, cancha, parque, playas) y tres secretos (pasadizo con azotea escondida y
// una rampa con vistas).
//
// Orden en buildIsland: planDetalles() justo después de fillGeneric (solo reserva ocupación en celdas
// LIBRES: no mueve ningún solar), y build() justo después del mobiliario urbano (los árboles sueltos ya
// no caen en las zonas reservadas). Usa su propio generador aleatorio: no cambia nada de lo que ya había.
// Todo va a la geometría fusionada de los trozos o a los tipos de mobiliario que ya existían: no añade
// materiales y solo una llamada de dibujo (las gaviotas que vuelan).
import type { Ctx } from './ctx';
import type { Out, PlanCtx } from './special';
import { doorPoint, curbParking } from './special';
import type { Lot } from './layout';
import { Occupancy, OCC } from './occ';
import { BAY } from './network';
import { Rng } from '../../core/rng';
import { defineMurales } from './murales';
import { vidaCentro } from './vida-centro';
import { vidaViejo } from './vida-viejo';
import { vidaPuerto } from './vida-puerto';
import { vidaPoligono, COURT, WORKS } from './vida-poligono';
import { vidaCosta, PARK } from './vida-costa';
import { secretos, BONUS_RAMP } from './secretos';
import { buildBirds } from './aves';

/**
 * Sitios protegidos (portales de entrega, puertas de tiendas, plazas de aparcamiento, rampas...) para no
 * tapar nada con los detalles. Rejilla de 8 m: los radios (el del punto + el de la consulta) no pasan de 8.
 */
export class Guard {
  private cells = new Map<number, number[]>();
  private pts: number[] = [];
  constructor(readonly occ: Occupancy) {}
  private key(i: number, j: number) {
    return (i + 500) * 1000 + (j + 500);
  }
  protect(x: number, z: number, r: number) {
    const idx = this.pts.length;
    this.pts.push(x, z, r);
    const k = this.key(Math.floor(x / 8), Math.floor(z / 8));
    let c = this.cells.get(k);
    if (!c) this.cells.set(k, (c = []));
    c.push(idx);
  }
  /** ¿Hay algo protegido a menos de r (más su propio radio)? Un r negativo encoge la consulta. */
  near(x: number, z: number, r: number): boolean {
    const i0 = Math.floor(x / 8), j0 = Math.floor(z / 8);
    for (let i = i0 - 1; i <= i0 + 1; i++)
      for (let j = j0 - 1; j <= j0 + 1; j++) {
        const c = this.cells.get(this.key(i, j));
        if (!c) continue;
        for (const idx of c) {
          const px = this.pts[idx], pz = this.pts[idx + 1], pr = this.pts[idx + 2];
          const d = r + pr;
          if (d > 0 && (px - x) ** 2 + (pz - z) ** 2 < d * d) return true;
        }
      }
    return false;
  }
  /** Sitio libre: ocupación permitida en el círculo y nada protegido cerca. */
  free(x: number, z: number, r: number, allowed: readonly number[] = [OCC.FREE]): boolean {
    return this.occ.circleFree(x, z, r, allowed) && !this.near(x, z, r);
  }
}

/** Reserva zonas de celdas LIBRES (para que no caigan árboles sueltos): en el plan, tras los solares. */
function reserveFree(occ: Occupancy, x: number, z: number, hw: number, hd: number, rot: number, v: number = OCC.RESERVED) {
  occ.forRect(x, z, hw, hd, rot, (k) => {
    if (occ.data[k] === OCC.FREE) occ.data[k] = v;
  });
}

export function planDetalles(p: PlanCtx) {
  const occ = p.occ;
  // parque del suroeste, cancha y obra del Polígono, carrerilla y aterrizaje de la rampa con vistas
  reserveFree(occ, PARK.x, PARK.z, PARK.hw, PARK.hd, 0);
  reserveFree(occ, COURT.x, COURT.z, COURT.hw + 0.5, COURT.hd + 0.5, 0);
  reserveFree(occ, WORKS.x, WORKS.z, WORKS.hw, WORKS.hd, 0);
  const R = BONUS_RAMP;
  const fx = Math.sin(R.heading), fz = Math.cos(R.heading);
  const mid = (R.landing - R.runIn) / 2;
  reserveFree(occ, R.x + fx * mid, R.z + fz * mid, 4, (R.landing + R.runIn) / 2, R.heading, OCC.PROP);
  return {
    build(ctx: Ctx, out: Out, lots: Lot[]) {
      buildDetalles(ctx, out, lots);
    },
  };
}

function protectAll(g: Guard, ctx: Ctx, out: Out, lots: Lot[]) {
  for (const l of lots) {
    if (l.special) continue;
    // mismos portales que prueba deliverySpots (data.ts) y las tiendas (shopPois)
    const d =
      l.kind === 'chalet' ? doorPoint(ctx, l, 0, 1.2)
      : l.kind === 'house' ? doorPoint(ctx, l, l.meta.doorX ?? 0, 0.9)
      : l.kind === 'nave' ? doorPoint(ctx, l, l.meta.doorX ?? 0, 1.3)
      : doorPoint(ctx, l, 0, 1.3);
    g.protect(d.x, d.z, 1.5);
    if (l.meta.shop) {
      const p = curbParking(ctx, l, 0).pos;
      g.protect(p.x, p.z, 3);
    }
  }
  for (const p of out.pois) {
    g.protect(p.door.x, p.door.z, 2);
    if (p.parking) g.protect(p.parking.x, p.parking.z, 3);
  }
  for (const d of out.delivery) g.protect(d.door.x, d.door.z, 1.8);
  // plazas de las bahías (las mismas que prueba bayParking)
  const net = ctx.net;
  for (const e of net.edges) {
    if (!e.bays) continue;
    const A = net.nodes[e.a];
    const rx = -e.dz, rz = e.dx;
    for (const side of [1, -1] as const) {
      if (!(e.bays & (side > 0 ? 1 : 2))) continue;
      for (let s = e.bayRange[0] + 3; s <= e.bayRange[1] - 3 + 0.01; s += 6) {
        const lat = side * (e.width / 2 + BAY / 2);
        g.protect(A.x + e.dx * s + rx * lat, A.z + e.dz * s + rz * lat, 3.2);
      }
    }
  }
  for (const s of ctx.specials) g.protect(s.pos.x, s.pos.z, 3.5);
  for (const b of ctx.breakables) g.protect(b.pos.x, b.pos.z, 1.3);
  for (const c of ctx.collectibles) g.protect(c.x, c.z, 1.2);
  for (const c of ctx.climbs) for (const p of [c.a, c.b]) g.protect(p.x, p.z, 1.8);
  // rampas: carrerilla y aterrizaje
  for (const r of ctx.ramps) {
    const fx = Math.sin(r.heading), fz = Math.cos(r.heading);
    for (let s = -26; s <= 44; s += 4) g.protect(r.pos.x + fx * s, r.pos.z + fz * s, 3.5);
  }
}

function buildDetalles(ctx: Ctx, out: Out, lots: Lot[]) {
  const rng = new Rng('detalles-fase-9');
  defineMurales(ctx.signs);
  // los secretos van primero: su rampa entra en la lista de rampas y queda protegida para lo demás
  secretos(ctx, out, lots, rng.fork('secretos'));
  const g = new Guard(ctx.occ);
  protectAll(g, ctx, out, lots);
  vidaCentro(ctx, out, g, lots, rng.fork('centro'));
  vidaViejo(ctx, out, g, lots, rng.fork('viejo'));
  vidaPuerto(ctx, out, g, rng.fork('puerto'));
  vidaPoligono(ctx, out, g, rng.fork('poligono'));
  vidaCosta(ctx, out, g, rng.fork('costa'));
  buildBirds(ctx, out);
}
