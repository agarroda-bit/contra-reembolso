// Página de prueba de la isla: construye Puerto Paquete, pone luces sencillas y una cámara
// controlable por URL (?cam=x,y,z&mira=x,y,z) o con window.__cam(x,y,z,mx,my,mz).
// Parámetros: ?niebla=0 (sin niebla), ?noche=1, ?mapa=1 (muestra el mapa), ?sombra=radio.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../core/game';
import { G, SOLID } from '../core/physics';
import { buildIsland } from '../world/island';

async function boot() {
  await RAPIER.init();
  const params = new URLSearchParams(location.search);
  const game = new Game(document.getElementById('app')!, document.getElementById('ui')!);
  const t0 = performance.now();
  const world = buildIsland(game);
  const tBuild = performance.now() - t0;
  game.world = world;
  (window as any).__world = world;
  (window as any).__game = game;

  // luces sencillas
  const night = Number(params.get('noche') ?? 0);
  const hemi = new THREE.HemisphereLight('#e4f3ff', '#8a7358', night ? 0.25 : 1.15);
  game.scene.add(hemi);
  const sun = new THREE.DirectionalLight(night ? '#8fa8ff' : '#fff0d2', night ? 0.25 : 2.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  game.scene.add(sun);
  game.scene.add(sun.target);
  const sky = new THREE.Color(night ? '#141a3a' : '#8ec9f0');
  game.scene.background = sky;
  const fog = game.scene.fog as THREE.Fog;
  fog.color.copy(night ? new THREE.Color('#1c2448') : new THREE.Color('#bcd7f0'));
  if (params.get('niebla') === '0') {
    game.scene.fog = null;
    game.camera.far = 3000;
    game.camera.updateProjectionMatrix();
  }
  world.setNight(night);

  // cámara
  const cam = game.camera;
  const look = new THREE.Vector3();
  const setCam = (x: number, y: number, z: number, mx: number, my: number, mz: number) => {
    cam.position.set(x, y, z);
    look.set(mx, my, mz);
    cam.lookAt(look);
    // sombras alrededor de lo que se mira
    const R = Number(params.get('sombra') ?? Math.min(340, Math.max(60, cam.position.distanceTo(look) * 0.9)));
    const sc = sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 1; sc.far = 900;
    sc.updateProjectionMatrix();
    sun.target.position.copy(look);
    sun.position.copy(look).add(new THREE.Vector3(-160, 260, 110));
  };
  (window as any).__cam = setCam;
  // igual, pero las alturas son sobre el suelo (heightAt)
  (window as any).__camG = (x: number, dy: number, z: number, mx: number, mdy: number, mz: number) =>
    setCam(x, world.heightAt(x, z) + dy, z, mx, world.heightAt(mx, mz) + mdy, mz);
  (window as any).__night = (n: number) => {
    world.setNight(n);
    hemi.intensity = 1.15 - n * 0.95;
    sun.intensity = 2.3 - n * 2.1;
    sun.color.set(n > 0.5 ? '#8fa8ff' : '#fff0d2');
    const c = new THREE.Color('#8ec9f0').lerp(new THREE.Color('#141a3a'), n);
    game.scene.background = c;
    if (game.scene.fog) (game.scene.fog as THREE.Fog).color.copy(new THREE.Color('#bcd7f0').lerp(new THREE.Color('#1c2448'), n));
  };
  const parse = (s: string | null, d: number[]) => (s ? s.split(',').map(Number) : d);
  const cp = parse(params.get('cam'), [0, 420, 520]);
  const mp = parse(params.get('mira'), [0, 0, 20]);
  setCam(cp[0], cp[1], cp[2], mp[0], mp[1], mp[2]);

  // mapa
  if (params.get('mapa') === '1') {
    const box = document.getElementById('mapa')!;
    box.style.display = 'flex';
    box.appendChild(world.mapCanvas);
  }

  // comprobaciones
  const lines: string[] = [];
  const log = (s: string) => {
    lines.push(s);
    console.log('[mundo] ' + s);
  };
  log(`construida en ${tBuild.toFixed(0)} ms`);
  const terrainCol = (world as any).terrainCollider as RAPIER.Collider | undefined;
  let tested = 0, maxDiff = 0, skipped = 0;
  let seed = 12345;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const down = new THREE.Vector3(0, -1, 0);
  for (let tries = 0; tested < 50 && tries < 2000; tries++) {
    const x = (rnd() * 2 - 1) * 300, z = (rnd() * 2 - 1) * 300;
    if (!world.isLand(x, z)) continue;
    const hit = game.physics.raycast(new THREE.Vector3(x, 200, z), down, 400, G.GROUND);
    if (!hit) continue;
    if (terrainCol && hit.collider.handle !== terrainCol.handle) {
      skipped++;
      continue;
    }
    const d = Math.abs(hit.point.y - world.heightAt(x, z));
    maxDiff = Math.max(maxDiff, d);
    tested++;
  }
  log(`colisor vs heightAt: ${tested} puntos, diferencia máx ${maxDiff.toFixed(4)} m (${maxDiff < 0.3 ? 'OK' : 'MAL'})${skipped ? `, ${skipped} saltados (rampa/muelle)` : ''}`);
  const sp = world.playerSpawn.pos;
  const spHit = game.physics.raycast(new THREE.Vector3(sp.x, sp.y + 60, sp.z), down, 200, SOLID);
  const inside = game.physics.overlapSphere(new THREE.Vector3(sp.x, sp.y + 1, sp.z), 0.45, G.STATIC).length;
  log(
    `spawn (${sp.x.toFixed(1)}, ${sp.y.toFixed(2)}, ${sp.z.toFixed(1)}) tierra=${world.isLand(sp.x, sp.z)} ` +
      `suelo=${spHit ? spHit.point.y.toFixed(2) : '—'} heightAt=${world.heightAt(sp.x, sp.z).toFixed(2)} ` +
      `dentro de edificio=${inside > 0 ? 'SÍ (MAL)' : 'no (OK)'} barrio=${world.districtAt(sp.x, sp.z)}`,
  );
  // velocidad de consultas
  let acc = 0;
  const q0 = performance.now();
  for (let i = 0; i < 100000; i++) {
    const x = (rnd() * 2 - 1) * 320, z = (rnd() * 2 - 1) * 320;
    acc += world.heightAt(x, z) + (world.isRoad(x, z) ? 1 : 0) + (world.districtAt(x, z) ? 1 : 0) + (world.isLand(x, z) ? 1 : 0);
  }
  log(`100k consultas (heightAt+isRoad+districtAt+isLand): ${(performance.now() - q0).toFixed(1)} ms (${acc > 0 ? '' : ''})`);
  const count = (arr: { district?: string; kind?: string }[], key: 'district' | 'kind') => {
    const m: Record<string, number> = {};
    for (const a of arr) m[(a as any)[key]] = (m[(a as any)[key]] ?? 0) + 1;
    return JSON.stringify(m);
  };
  log(`POIs ${world.pois.length}: ${count(world.pois, 'kind')}`);
  log(`entregas ${world.deliverySpots.length}: ${count(world.deliverySpots, 'district')}`);
  log(`aparcamiento ${world.parkingSpots.length}, coleccionables ${world.collectibles.length}, rompibles ${world.breakableSpots.length}, farolas ${world.lampPositions.length}, rampas ${world.ramps.length}`);
  log(`calles: ${world.roads.nodes.length} nodos, ${world.roads.edges.length} tramos; especiales ${world.specialVehicleSpots.map((s) => s.kind).join(',')}`);
  // triángulos por grupo de mallas (geometría total de la escena, sin sombras)
  const triBy: Record<string, number> = {};
  let triTot = 0, meshes = 0;
  game.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    const g = m.geometry;
    let t = (g.index ? g.index.count : g.attributes.position.count) / 3;
    if ((m as any).isInstancedMesh) t *= (m as THREE.InstancedMesh).count;
    const k = m.name.replace(/-\d+$/, '') || '(sin nombre)';
    triBy[k] = (triBy[k] ?? 0) + t;
    triTot += t;
    meshes++;
  });
  log(`escena: ${meshes} mallas, ${(triTot / 1000).toFixed(0)}k triángulos`);
  log(Object.entries(triBy).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}k`).join(' · '));

  const info = document.getElementById('info')!;
  game.addSystem({
    name: 'info',
    postUpdate: () => {
      if (game.time.frame % 15) return;
      const r = game.renderer.info.render;
      info.textContent = `${game.fps.toFixed(0)} fps · ${r.calls} draws · ${(r.triangles / 1000).toFixed(0)}k tris\n` + lines.join('\n');
      (window as any).__stats = { fps: game.fps, calls: r.calls, tris: r.triangles };
    },
  });
  game.start();
  (window as any).__ready = true;
}

boot().catch((e) => {
  console.error(e);
  document.getElementById('info')!.textContent = 'ERROR: ' + (e?.stack ?? e);
});
