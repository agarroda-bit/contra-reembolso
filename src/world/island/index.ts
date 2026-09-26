// Puerto Paquete: genera la isla completa (terreno, calles, edificios, mobiliario, datos del contrato).
//
// Uso: const world = buildIsland(game); game.world = world;
// Añade a game.scene todo lo visual y a game.physics todos los colisores. Al final da un paso de física
// para que los rayos (raycast) funcionen desde el primer momento.
import * as THREE from 'three';
import type { Game } from '../../core/game';
import type { WorldData, DistrictId } from '../../core/contracts';
import { G } from '../../core/physics';
import { Rng } from '../../core/rng';
import { IslandShape, SIZE, HALF } from './shape';
import { RoadNet } from './network';
import { DISTRICTS, defineRoads, districtRaw } from './plan';
import { Terrain, Pad } from './terrain';
import { ChunkSet, lin } from './geo';
import { createUniforms, makeLitMaterial, makeGroundMaterial } from './materials';
import { RoadMeshes } from './roadmesh';
import { buildSea } from './sea';
import { smoothstep } from './noise';
import { Occupancy, OCC } from './occ';
import { Layout } from './layout';
import { maskWater, fillGeneric } from './city';
import { Signs } from './signs';
import { Props } from './props';
import { Ctx, makeColliderHelpers } from './ctx';
import { urban, house, chalet, nave, companySign, NAVE_COMPANIES, CHALET_NAMES } from './buildings';
import { PlanCtx, Special, Out } from './special';
import { planPort } from './port';
import { planCentro } from './centro';
import { streetFurniture } from './street';

export function buildIsland(game: Game, seed = 'puerto-paquete'): WorldData {
  const t0 = performance.now();
  const rng = new Rng(seed);
  const shape = new IslandShape(seed);
  const net = new RoadNet();
  defineRoads(net);
  net.planarize();
  for (const e of net.edges) {
    const A = net.nodes[e.a], B = net.nodes[e.b];
    e.district = districtRaw((A.x + B.x) / 2, (A.z + B.z) / 2);
  }
  net.computeHeights((x, z) => shape.base(x, z));
  net.computeBays();
  net.buildHash(24);

  // ── plan: ocupación, sitios especiales y solares genéricos ──
  const occ = new Occupancy();
  occ.rasterRoads(net);
  maskWater(occ, shape);
  const near = { id: -1, d: 0, t: 0, h: 0 };
  const roadH = (x: number, z: number) => net.nearest(x, z, near).h;
  const layout = new Layout(net, occ, rng.fork('lotes'), roadH);
  const extraPads: Pad[] = [];
  const pc: PlanCtx = { layout, occ, net, rng: rng.fork('especiales'), shape, pads: extraPads, roadH };
  const specials: Special[] = [...planPort(pc), ...planCentro(pc)];
  fillGeneric(layout, net, rng);

  const pads: Pad[] = layout.lots.map((l) => ({ x: l.x, z: l.z, hw: l.hw + 0.5, hd: l.hd + 0.5, rot: l.rot, h: l.h, blend: l.kind === 'chalet' ? 10 : 3 }));
  pads.push(...extraPads);
  const terrain = new Terrain(shape, net, pads);
  const heightAt = (x: number, z: number) => terrain.heightAt(x, z);
  const u = createUniforms();
  const t1 = performance.now();

  // ── terreno ──
  const ground = new ChunkSet(HALF, 160);
  const C = {
    sand: lin('#ecd9a4').clone(),
    wet: lin('#d8c28c').clone(),
    grass: lin('#8fbf5a').clone(),
    grassColina: lin('#84bd55').clone(),
    garden: lin('#7cc35a').clone(),
    rock: lin('#a89a86').clone(),
    dirt: lin('#b89f74').clone(),
    centro: lin('#cdbd9c').clone(),
    viejo: lin('#d6c29c').clone(),
    concrete: lin('#c4bfb4').clone(),
    poligono: lin('#b7ae95').clone(),
  };
  const tmp = new THREE.Color();
  terrain.buildMesh(ground, (x, z, h, slope) => {
    if (h < 0.6) return tmp.copy(C.wet);
    if (h < 1.25) return tmp.copy(C.sand);
    if (slope > 1.25) return tmp.copy(C.rock);
    const v = occ.get(x, z);
    const d = districtRaw(x, z);
    let c: THREE.Color;
    if (v === OCC.YARD) c = C.garden;
    else if (x > -160 && x < 192 && z > 172.8 && z < 262.4) c = C.concrete;
    else if (v === OCC.WATER || v === OCC.FREE || v === OCC.PROP) c = d === 'colina' ? C.grassColina : d === 'poligono' ? C.poligono : C.grass;
    else c = d === 'centro' ? C.centro : d === 'viejo' ? C.viejo : d === 'poligono' ? C.poligono : d === 'puerto' ? C.concrete : C.grassColina;
    tmp.copy(c);
    if (slope > 0.55) tmp.lerp(C.dirt, smoothstep(0.55, 1.25, slope));
    if (shape.coastDist(x, z) < 26) tmp.lerp(C.sand, smoothstep(2.4, 1.25, h));
    return tmp;
  });
  const groundMat = makeGroundMaterial();
  for (const m of ground.toMeshes(groundMat, 'terreno', false, true)) game.scene.add(m);
  const col = terrain.colliderData();
  const terrainCollider = game.physics.addStaticTrimesh(col.vertices, col.indices, G.GROUND);

  const pave = new RoadMeshes(net, heightAt);
  pave.build();

  const solidMat = makeLitMaterial(u, 'solid');
  const winMat = makeLitMaterial(u, 'windows');
  const signs = new Signs();
  const props = new Props();
  const ctx: Ctx = {
    game,
    rng: rng.fork('edificios'),
    solid: new ChunkSet(HALF, 160),
    win: new ChunkSet(HALF, 160),
    signs,
    props,
    pave,
    mat: solidMat,
    u,
    terrain,
    occ,
    net,
    heightAt,
    foot: [],
    pools: [],
    paved: [],
    collectibles: [],
    ramps: [],
    breakables: [],
    specials: [],
    ...makeColliderHelpers(game),
  };
  const out: Out = { pois: [], parking: [], delivery: [], extra: {}, animated: [], nightMeshes: [] };

  // ── sitios especiales ──
  for (const s of specials) s.build(ctx, out);

  // ── edificios genéricos ──
  let chaletI = 0, naveI = 0;
  const companies = NAVE_COMPANIES.map((c) => companySign(ctx, c.name, c.sub, c.bg, c.fg));
  for (const lot of layout.lots) {
    if (lot.special) continue;
    const r = ctx.rng;
    switch (lot.kind) {
      case 'urban':
        if (lot.district === 'puerto') urban(ctx, lot, { floors: r.int(2, 4), shop: r.chance(0.7) });
        else urban(ctx, lot, { floors: r.int(3, 6), shop: r.chance(0.8) });
        break;
      case 'house':
        house(ctx, lot, { floors: r.chance(0.2) ? 3 : r.chance(0.2) ? 1 : 2 });
        break;
      case 'chalet':
        chalet(ctx, lot, CHALET_NAMES[chaletI++ % CHALET_NAMES.length]);
        break;
      case 'nave':
        nave(ctx, lot, { sign: companies[naveI++ % companies.length] });
        break;
    }
  }

  // ── mobiliario urbano y vegetación ──
  streetFurniture(ctx, out);

  // ── mallas ──
  for (const m of pave.meshes()) game.scene.add(m);
  for (const m of ctx.solid.toMeshes(solidMat, 'edificios', true, true)) game.scene.add(m);
  for (const m of ctx.win.toMeshes(winMat, 'ventanas', false, false)) game.scene.add(m);
  game.scene.add(signs.build(u, game.renderer.capabilities.getMaxAnisotropy()));
  props.build(game, solidMat);
  const sea = buildSea(game, u, heightAt, solidMat);

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;

  // que las consultas de física funcionen ya (Rapier actualiza su BVH al dar un paso)
  game.physics.world.step();
  console.log(`[isla] solares ${layout.lots.length}, plan ${(t1 - t0).toFixed(0)} ms, total ${(performance.now() - t0).toFixed(0)} ms`);

  const spawn = out.spawn ?? { pos: new THREE.Vector3(0, heightAt(0, 180), 180), heading: Math.PI };
  let night = -1;
  const world: WorldData & { terrainCollider: unknown; extra: Record<string, unknown> } = {
    size: SIZE,
    seaLevel: 0,
    districts: DISTRICTS,
    heightAt,
    districtAt: (x, z) => (shape.coastDist(x, z) > 0 ? districtRaw(x, z) : null),
    isRoad: (x, z) => net.isRoad(x, z),
    isLand: (x, z) => heightAt(x, z) > 0.2,
    pois: out.pois,
    roads: {
      nodes: net.nodes.map((n) => ({ id: n.id, pos: new THREE.Vector3(n.x, n.h, n.z) })),
      edges: net.edges.map((e) => ({ id: e.id, a: e.a, b: e.b, width: e.width, district: e.district as DistrictId, alley: e.alley || undefined })),
      adjacency: net.nodes.map((n) => [...n.edges]),
    },
    deliverySpots: out.delivery,
    parkingSpots: out.parking,
    collectibles: ctx.collectibles,
    lampPositions: props.bulbs(),
    playerSpawn: spawn,
    ramps: ctx.ramps,
    breakableSpots: ctx.breakables,
    specialVehicleSpots: ctx.specials,
    mapCanvas: canvas,
    mapPixelSize: 10,
    setNight(n: number) {
      u.uNight.value = n;
      if (Math.abs(n - night) < 0.002) return;
      night = n;
      for (const o of out.nightMeshes) {
        o.visible = n > 0.25;
        const m = (o as any).nightMat as THREE.Material & { opacity: number } | undefined;
        if (m) m.opacity = smoothstep(0.25, 0.8, n) * 0.35;
      }
    },
    update(dt: number, elapsed: number) {
      u.uTime.value = elapsed;
      sea.update(elapsed);
      for (const f of out.animated) f(dt, elapsed);
    },
    terrainCollider,
    extra: out.extra,
  };
  return world;
}
