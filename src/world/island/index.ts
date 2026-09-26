// Puerto Paquete: genera la isla completa (terreno, calles, edificios, mobiliario, datos del contrato).
//
// Uso: const world = buildIsland(game); game.world = world;
// Añade a game.scene todo lo visual y a game.physics todos los colisores. Da dos pasos de física (uno a mitad,
// para descartar portales, plazas y rompibles tapados por colisores, y otro al final para que los rayos funcionen
// desde el primer momento): hay que llamarla antes de crear cuerpos dinámicos. No añade luces (día/noche).
//
// Además del contrato, (world as any).extra trae datos útiles para otros módulos:
//   officeVanBays: Vector3[]  plazas de furgoneta delante de la oficina (mirando a la calle, rumbo PI)
//   garageBays: Vector3[]     plazas de exposición del concesionario Manolo
//   paintBooth: {x,z,hw,hd,rot}   interior del túnel de Pintamóvil (dentro = pintar el coche)
//   hideoutYard: {x,z,hw,hd,rot}  patio vallado de la guarida; hideoutDoor: Vector3 (portón del almacén)
//   ambulance: {pos, heading}     plaza de ambulancia del centro de salud
//   atticTerrace, mirador, plazuela, parkingRoof, lonjaRoof, lighthouse: Vector3 (sitios con encanto)
//   climbs: [{name, a, b, c}]     recorridos para subir a azoteas/cubiertas (abajo, arriba, azotea)
//   overhangs: Collider[]         voladizos bajos que se apagan en vehículo (se pueden añadir más)
// y (world as any).terrainCollider es el colisor del terreno (trimesh).
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
import { createUniforms, makeLitMaterial, makeGroundMaterial, AWNING_CUT } from './materials';
import { RoadMeshes } from './roadmesh';
import { buildSea } from './sea';
import { smoothstep } from './noise';
import { Occupancy, OCC } from './occ';
import { Layout } from './layout';
import { maskWater, fillGeneric } from './city';
import { Signs } from './signs';
import { Props } from './props';
import { Ctx, makeColliderHelpers, setOverhangs } from './ctx';
import { urban, house, chalet, nave, companySign, NAVE_COMPANIES, CHALET_NAMES } from './buildings';
import { PlanCtx, Special, Out } from './special';
import { planPort } from './port';
import { planCentro } from './centro';
import { streetFurniture } from './street';
import { planPoligono } from './poligono';
import { planColina } from './colina';
import { planViejo } from './viejo';
import { deliverySpots, bayParking, shopPois } from './data';
import { planDetalles } from './detalles';
import { drawMap, MAP_PX } from './map';
import { makeGlowTexture } from './materials';

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
  const layout = new Layout(net, occ, rng.fork('lotes'), roadH, (x, z) => shape.base(x, z));
  const extraPads: Pad[] = [];
  const pc: PlanCtx = { layout, occ, net, rng: rng.fork('especiales'), shape, pads: extraPads, roadH };
  const specials: Special[] = [...planPort(pc), ...planCentro(pc), ...planPoligono(pc), ...planColina(pc), ...planViejo(pc)];
  fillGeneric(layout, net, rng);
  // (fase 9) zonas para los detalles nuevos: solo celdas libres, después de los solares
  const detalles = planDetalles(pc);

  if ((globalThis as any).__debugLots) {
    const d = layout.lots.map((l) => ({ id: l.special ?? l.kind, x: Math.round(l.x), z: Math.round(l.z), diff: +(shape.base(l.x, l.z) - l.h).toFixed(1) }));
    d.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    console.log('[isla] solares con más desnivel', JSON.stringify(d.slice(0, 8)));
  }
  const pads: Pad[] = layout.lots.map((l) => ({ x: l.x, z: l.z, hw: l.hw + 0.5, hd: l.hd + 0.5, rot: l.rot, h: l.h, blend: l.kind === 'chalet' ? 10 : 3 }));
  pads.push(...extraPads);
  const terrain = new Terrain(shape, net, pads);
  const heightAt = (x: number, z: number) => terrain.heightAt(x, z);
  const u = createUniforms();
  const t1 = performance.now();

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
    solid: new ChunkSet(HALF, 128),
    win: new ChunkSet(HALF, 128),
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
    mapDots: [],
    mapLabels: [],
    collectibles: [],
    ramps: [],
    breakables: [],
    specials: [],
    climbs: [],
    overhangs: [],
    ...makeColliderHelpers(game),
  };
  const out: Out = { pois: [], parking: [], delivery: [], extra: {}, animated: [], nightMeshes: [] };
  // (solo en la página de prueba de la isla: deja a mano el contexto para inspeccionar la ocupación)
  if ((globalThis as any).__debugLots) (globalThis as any).__islandCtx = ctx;

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
        else {
          const floors = r.int(3, 6);
          urban(ctx, lot, { floors, shop: r.chance(0.8), roofAd: floors >= 5 && r.chance(0.3) ? r.int(0, 20) : undefined });
        }
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

  out.extra.climbs = ctx.climbs;
  // voladizos bajos que se apagan en vehículo: otros módulos pueden añadir los suyos (toldos de los puestos de fruta)
  out.extra.overhangs = ctx.overhangs;

  // ── mobiliario urbano y vegetación ──
  streetFurniture(ctx, out);
  // ── detalles de fase 9: vida en los barrios, parque, obra, cancha y secretos ──
  detalles.build(ctx, out, layout.lots);

  // ── terreno (al final: se omiten los triángulos que quedan tapados bajo edificios macizos) ──
  const N = HALF * 2;
  const covered = new Uint8Array(N * N);
  for (const f of ctx.foot) {
    if (f.open || f.height < 2.5) continue;
    const c = Math.cos(f.rot), sn = Math.sin(f.rot);
    const hw = f.hw - 0.4, hd = f.hd - 0.4;
    if (hw <= 0 || hd <= 0) continue;
    const r = Math.hypot(hw, hd);
    for (let j = Math.max(0, Math.floor(f.z - r + HALF)); j <= Math.min(N - 1, Math.ceil(f.z + r + HALF)); j++) {
      for (let i = Math.max(0, Math.floor(f.x - r + HALF)); i <= Math.min(N - 1, Math.ceil(f.x + r + HALF)); i++) {
        const wx = i - HALF + 0.5 - f.x, wz = j - HALF + 0.5 - f.z;
        const lx = wx * c - wz * sn, lz = wx * sn + wz * c;
        if (Math.abs(lx) <= hw && Math.abs(lz) <= hd) covered[j * N + i] = 1;
      }
    }
  }
  const ground = new ChunkSet(HALF, 128);
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
    if (slope > 1.6) return tmp.copy(C.rock);
    const v = occ.get(x, z);
    const d = districtRaw(x, z);
    // casco urbano: dentro del anillo de calles (y lejos de la costa) el suelo libre va pavimentado
    const urbanCore = Math.abs(x) < 250 && z > -100 && z < 172;
    let c: THREE.Color;
    let natural = false;
    if (v === OCC.YARD) c = C.garden;
    else if (x > -160 && x < 192 && z > 172.8 && z < 262.4) c = C.concrete;
    else if (urbanCore && (d === 'centro' || d === 'viejo' || d === 'puerto')) c = d === 'centro' ? C.centro : d === 'viejo' ? C.viejo : C.concrete;
    else if (v === OCC.WATER || v === OCC.FREE || v === OCC.PROP || (d === 'viejo' && !urbanCore && (v === OCC.BUILDING || v === OCC.RESERVED)) || (d === 'puerto' && v === OCC.RESERVED)) {
      // (fuera del casco, el borde junto a las casas del poniente y los rincones reservados siguen siendo hierba;
      // la franja reservada del puerto que queda fuera del rectángulo de hormigón también: así el borde del
      // hormigón sigue las líneas de la rejilla y no sale en dientes de sierra)
      c = d === 'colina' ? C.grassColina : d === 'poligono' && urbanCore ? C.poligono : C.grass;
      natural = true;
    } else c = d === 'centro' ? C.centro : d === 'viejo' ? C.viejo : d === 'poligono' ? C.poligono : d === 'puerto' ? C.concrete : C.grassColina;
    tmp.copy(c);
    if (natural && slope > 0.8) tmp.lerp(C.dirt, smoothstep(0.8, 1.6, slope) * 0.8);
    if (shape.coastDist(x, z) < 26) tmp.lerp(C.sand, smoothstep(2.4, 1.25, h));
    return tmp;
  }, (x, z) => covered[Math.floor(z + HALF) * N + Math.floor(x + HALF)] === 1);
  const groundMat = makeGroundMaterial();
  for (const m of ground.toMeshes(groundMat, 'terreno', false, true)) game.scene.add(m);

  // ── mallas ──
  for (const m of pave.meshes()) game.scene.add(m);
  for (const m of ctx.solid.toMeshes(solidMat, 'edificios', true, true)) game.scene.add(m);
  for (const m of ctx.win.toMeshes(winMat, 'ventanas', false, false)) game.scene.add(m);
  // toldos: capa aparte con un material que se abre en vehículo (ver stripedAwning)
  const awningMat = makeLitMaterial(u, 'awning');
  for (const m of ctx.solid.toMeshes(awningMat, 'toldos', true, true, true)) game.scene.add(m);
  game.scene.add(signs.build(u, game.renderer.capabilities.getMaxAnisotropy()));
  props.build(game, solidMat);
  const sea = buildSea(game, u, heightAt, solidMat);

  // ── datos: portales de entrega, aparcamientos y tiendas (con todos los colisores ya creados, se descartan
  // los sitios tapados por una farola, un árbol o una marquesina) ──
  game.physics.world.step(); // actualiza el índice de consultas de Rapier (aún no hay cuerpos dinámicos)
  const probe = new THREE.Vector3();
  const free = (x: number, y: number, z: number, r: number) => game.physics.overlapSphere(probe.set(x, y, z), r, G.STATIC).length === 0;
  deliverySpots(ctx, layout.lots, out, free);
  bayParking(ctx, out, free);
  shopPois(ctx, layout.lots, out, free);
  // rompibles: fuera los que han caído encima de un bolardo, una farola o dentro de algo
  ctx.breakables = ctx.breakables.filter((b) => free(b.pos.x, b.pos.y + 0.5, b.pos.z, 0.3));

  // ── charcos de luz falsos bajo las farolas (se ven de noche) ──
  const bulbs = props.bulbs();
  const glowMat = new THREE.MeshBasicMaterial({
    map: makeGlowTexture(),
    color: '#ffc46b',
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -8,
  });
  // con niebla, un material aditivo sumaría el color de la niebla (manchas claras sobre la ciudad lejana):
  // aquí la niebla apaga el charco en vez de teñirlo
  glowMat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <fog_fragment>',
      `#ifdef USE_FOG
        #ifdef FOG_EXP2
          float fogK = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
        #else
          float fogK = smoothstep( fogNear, fogFar, vFogDepth );
        #endif
        gl_FragColor.rgb *= 1.0 - fogK;
      #endif`,
    );
  };
  glowMat.customProgramCacheKey = () => 'cr-glow';
  const glowGeo = new THREE.PlaneGeometry(1, 1);
  glowGeo.rotateX(-Math.PI / 2);
  const glow = new THREE.InstancedMesh(glowGeo, glowMat, bulbs.length);
  glow.name = 'charcos-de-luz';
  {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), n = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(), p = new THREE.Vector3();
    bulbs.forEach((bb, i) => {
      const gy = heightAt(bb.x, bb.z);
      const r = Math.min(22, Math.max(5, (bb.y - gy) * 1.7));
      terrain.normalAt(bb.x, bb.z, n);
      q.setFromUnitVectors(up, n);
      glow.setMatrixAt(i, m.compose(p.set(bb.x, gy + 0.07, bb.z), q, sc.set(r, 1, r)));
    });
  }
  glow.visible = false;
  glow.frustumCulled = false;
  game.scene.add(glow);

  // ── mapa ──
  const trees: { x: number; z: number; type: string }[] = [];
  for (const [type, arr] of props.list) {
    if (!['palm', 'pine', 'olive', 'cypress', 'orange', 'bush'].includes(type)) continue;
    for (const it of arr) trees.push({ x: it.x, z: it.z, type });
  }
  const canvas = drawMap(ctx, DISTRICTS, trees);

  // que las consultas de física funcionen ya (Rapier actualiza su BVH al dar un paso)
  game.physics.world.step();
  console.log(`[isla] solares ${layout.lots.length}, carteles ${signs.count} (${signs.density.toFixed(0)} px/m), plan ${(t1 - t0).toFixed(0)} ms, total ${(performance.now() - t0).toFixed(0)} ms`);

  const spawn = out.spawn ?? { pos: new THREE.Vector3(0, heightAt(0, 180), 180), heading: Math.PI };
  let night = -1;

  // ── voladizos bajos y toldos según vayas a pie o en vehículo ──
  // A pie, toldos, balcones y marquesinas tienen colisor (la cámara no se mete en ellos). En vehículo
  // (y al subir o bajar de uno) se apagan: el punto que sigue la cámara del vehículo cae dentro de la
  // caja de un toldo o pegado a ella y la cámara se quedaría clavada encima del conductor. En su lugar,
  // la lona de los toldos se abre alrededor de la línea cámara → vehículo (material 'awning').
  let overhangsOn = true;
  const syncOverhangs = () => {
    const rig = game.mod.cameraRig as { mode: string; target: THREE.Vector3 } | undefined;
    const st = (game.mod.player as { state?: string } | undefined)?.state;
    // hueco en los toldos: en vehículo o si la cámara de este frame se ha calculado con los voladizos
    // apagados (el frame en que te bajas)
    const cut = rig?.mode === 'vehicle' || !overhangsOn;
    u.uCut.value = cut ? 1 : 0;
    if (cut && rig) {
      u.uFocus.value.copy(rig.target);
      u.uFocus.value.y += AWNING_CUT.lift;
    }
    const riding = rig?.mode === 'vehicle' || st === 'vehicle' || st === 'busy';
    if (overhangsOn === riding) {
      overhangsOn = !riding;
      setOverhangs(ctx.overhangs, overhangsOn);
    }
  };
  // también al principio de cada frame (antes que la cámara): así un cambio hecho entre frames (subir
  // de golpe a un vehículo) ya cuenta en el primer frame
  game.addSystem({ name: 'voladizos', update: syncOverhangs });
  const world: WorldData & { terrainCollider: unknown; extra: Record<string, unknown> } = {
    size: SIZE,
    seaLevel: 0,
    districts: DISTRICTS,
    heightAt,
    // el muelle de pescadores, el carguero y el espigón del faro están sobre el agua pero son del Puerto
    districtAt: (x, z) => (shape.coastDist(x, z) > 0 ? districtRaw(x, z) : x > -135 && x < 205 && z > 255 && z < 318 ? 'puerto' : null),
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
    lampPositions: bulbs,
    playerSpawn: spawn,
    ramps: ctx.ramps,
    breakableSpots: ctx.breakables,
    specialVehicleSpots: ctx.specials,
    mapCanvas: canvas,
    mapPixelSize: MAP_PX,
    setNight(n: number) {
      u.uNight.value = n;
      if (Math.abs(n - night) < 0.002) return;
      night = n;
      glow.visible = n > 0.04;
      glowMat.opacity = Math.min(1, n * 1.2) * 0.6;
      for (const o of out.nightMeshes) {
        o.visible = n > 0.25;
        const m = (o as any).nightMat as THREE.Material & { opacity: number } | undefined;
        if (m) m.opacity = smoothstep(0.25, 0.8, n) * 0.35;
      }
    },
    update(dt: number, elapsed: number) {
      u.uTime.value = elapsed;
      syncOverhangs();
      sea.update(elapsed);
      for (const f of out.animated) f(dt, elapsed);
    },
    terrainCollider,
    extra: out.extra,
  };
  return world;
}
