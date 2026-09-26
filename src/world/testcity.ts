// Ciudad de pruebas: suelo plano con una cuadrícula de calles, POIs y puntos de entrega.
// Sirve para probar tráfico, peatones, armas, policía y encargos sin la isla.
import * as THREE from 'three';
import type { Game } from '../core/game';
import type { WorldData, RoadGraph, Poi, DeliverySpot, ParkingSpot, DistrictId, PoiKind } from '../core/contracts';
import { G } from '../core/physics';

export function buildTestCity(game: Game): WorldData {
  const N = 6; // nodos por lado
  const S = 45; // separación
  const half = ((N - 1) * S) / 2;
  const size = (N - 1) * S + 80;
  const scene = game.scene;
  const ground = new THREE.Mesh(new THREE.BoxGeometry(size, 1, size), new THREE.MeshLambertMaterial({ color: '#8fbf6a' }));
  ground.position.y = -0.5;
  ground.receiveShadow = true;
  scene.add(ground);
  game.physics.addStaticBox(0, -0.5, 0, size / 2, 0.5, size / 2, 0, G.GROUND);

  const roads: RoadGraph = { nodes: [], edges: [], adjacency: [] };
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      roads.nodes.push({ id: roads.nodes.length, pos: new THREE.Vector3(-half + i * S, 0, -half + j * S) });
      roads.adjacency.push([]);
    }
  const id = (i: number, j: number) => i * N + j;
  const roadMat = new THREE.MeshLambertMaterial({ color: '#3d3d46' });
  const districts: DistrictId[] = ['puerto', 'centro', 'colina', 'poligono', 'viejo'];
  const districtAt = (x: number, z: number): DistrictId => (z > half * 0.4 ? 'puerto' : x < -half * 0.3 ? 'viejo' : x > half * 0.3 ? 'poligono' : z < -half * 0.4 ? 'colina' : 'centro');
  const addEdge = (a: number, b: number) => {
    const e = { id: roads.edges.length, a, b, width: 10, district: districtAt(roads.nodes[a].pos.x, roads.nodes[a].pos.z) };
    roads.edges.push(e);
    roads.adjacency[a].push(e.id);
    roads.adjacency[b].push(e.id);
    const pa = roads.nodes[a].pos, pb = roads.nodes[b].pos;
    const len = pa.distanceTo(pb);
    const m = new THREE.Mesh(new THREE.BoxGeometry(pa.x === pb.x ? 10 : len + 10, 0.05, pa.x === pb.x ? len + 10 : 10), roadMat);
    m.position.set((pa.x + pb.x) / 2, 0.02, (pa.z + pb.z) / 2);
    m.receiveShadow = true;
    scene.add(m);
  };
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      if (i < N - 1) addEdge(id(i, j), id(i + 1, j));
      if (j < N - 1) addEdge(id(i, j), id(i, j + 1));
    }
  // manzanas con edificios
  const colors = ['#f4a259', '#e76f51', '#f1faee', '#8ecae6', '#ffb4a2', '#e9c46a'];
  const pois: Poi[] = [];
  const spots: DeliverySpot[] = [];
  const kinds: PoiKind[] = ['office', 'atm', 'atm', 'health', 'garage', 'paint', 'gunshop', 'clothes', 'casino', 'club', 'weed', 'attic', 'hideout', 'junkyard', 'bar', 'shop', 'shop', 'shop', 'atm', 'fountain'];
  let k = 0;
  for (let i = 0; i < N - 1; i++)
    for (let j = 0; j < N - 1; j++) {
      const cx = -half + (i + 0.5) * S, cz = -half + (j + 0.5) * S;
      const w = 18 + ((i * 7 + j * 3) % 3) * 4, d = 18, h = 6 + ((i + j) % 4) * 5;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: colors[(i + j) % colors.length] }));
      b.position.set(cx, h / 2, cz);
      b.castShadow = b.receiveShadow = true;
      scene.add(b);
      game.physics.addStaticBox(cx, h / 2, cz, w / 2, h / 2, d / 2);
      // puerta en la cara sur (hacia +z)
      const door = new THREE.Vector3(cx, 0, cz + d / 2 + 2.2);
      const kind = kinds[k % kinds.length];
      if (k < kinds.length) {
        pois.push({ id: kind + '-' + k, kind, name: nameFor(kind), district: districtAt(cx, cz), door, facing: 0, parking: new THREE.Vector3(cx + 6, 0, cz + d / 2 + 8) });
      }
      spots.push({ id: 's' + k, district: districtAt(cx, cz), door: new THREE.Vector3(cx - 6, 0, cz - d / 2 - 2.2), facing: Math.PI, label: `Calle de Prueba, ${k + 1}` });
      spots.push({ id: 't' + k, district: districtAt(cx, cz), door: new THREE.Vector3(cx + w / 2 + 2.2, 0, cz), facing: Math.PI / 2, label: `Avenida del Test, ${k + 1}` });
      k++;
    }
  const parking: ParkingSpot[] = roads.edges.slice(0, 30).map((e) => {
    const a = roads.nodes[e.a].pos, b = roads.nodes[e.b].pos;
    const p = a.clone().lerp(b, 0.5);
    const horiz = a.z === b.z;
    if (horiz) p.z += 3.8;
    else p.x += 3.8;
    return { pos: p, heading: horiz ? Math.PI / 2 : 0, district: e.district };
  });
  const office = pois.find((p) => p.kind === 'office')!;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.ceil(size / 0.5);
  const cg = canvas.getContext('2d')!;
  cg.fillStyle = '#8fbf6a';
  cg.fillRect(0, 0, canvas.width, canvas.height);
  cg.strokeStyle = '#e8e2d0';
  cg.lineWidth = 20;
  for (const e of roads.edges) {
    const a = roads.nodes[e.a].pos, b = roads.nodes[e.b].pos;
    cg.beginPath();
    cg.moveTo((a.x + size / 2) / 0.5, (a.z + size / 2) / 0.5);
    cg.lineTo((b.x + size / 2) / 0.5, (b.z + size / 2) / 0.5);
    cg.stroke();
  }
  return {
    size,
    seaLevel: -5,
    districts: [
      { id: 'puerto', name: 'El Puerto', color: '#2ec4b6', center: { x: 0, z: half * 0.7 } },
      { id: 'centro', name: 'El Centro', color: '#ffd23f', center: { x: 0, z: 0 } },
      { id: 'colina', name: 'La Colina', color: '#06d6a0', center: { x: 0, z: -half * 0.7 } },
      { id: 'poligono', name: 'El Polígono', color: '#8d99ae', center: { x: half * 0.7, z: 0 } },
      { id: 'viejo', name: 'El Barrio Viejo', color: '#ff7b54', center: { x: -half * 0.7, z: 0 } },
    ],
    heightAt: () => 0,
    districtAt: (x, z) => (Math.abs(x) < size / 2 && Math.abs(z) < size / 2 ? districtAt(x, z) : null),
    isRoad: () => false,
    isLand: (x, z) => Math.abs(x) < size / 2 && Math.abs(z) < size / 2,
    pois,
    roads,
    deliverySpots: spots,
    parkingSpots: parking,
    collectibles: [new THREE.Vector3(10, 0, 10), new THREE.Vector3(-30, 0, 40)],
    lampPositions: roads.nodes.map((n) => n.pos.clone().setY(5)),
    playerSpawn: { pos: office.door.clone().add(new THREE.Vector3(0, 0, 1)), heading: 0 },
    ramps: [],
    breakableSpots: roads.edges.slice(0, 20).map((e, i) => ({ kind: (['fence', 'crate', 'fruit', 'bin', 'bench', 'cone'] as const)[i % 6], pos: roads.nodes[e.a].pos.clone().add(new THREE.Vector3(7, 0, 7)), rotY: 0 })),
    specialVehicleSpots: [{ kind: 'cart', pos: office.door.clone().add(new THREE.Vector3(-8, 0, 8)), heading: 0 }],
    mapCanvas: canvas,
    mapPixelSize: 0.5,
    setNight: () => {},
    update: () => {},
  };
}

function nameFor(k: PoiKind): string {
  const n: Partial<Record<PoiKind, string>> = {
    office: 'Oficina de Reparto', atm: 'Cajero', health: 'Centro de Salud Tiritas', garage: 'Talleres Manolo', paint: 'Pintamóvil Exprés',
    gunshop: 'Armería El Gatillo Alegre', clothes: 'Moda Paquetona', casino: 'Casino La Suerte Loca', club: 'Club Reembolso VIP',
    weed: 'El de las hierbas', attic: 'El Ático', hideout: 'Guarida de Los Devueltos', junkyard: 'Desguace', bar: 'Bar Casa Manolo', shop: 'Tienda', fountain: 'Fuente',
  };
  return n[k] ?? k;
}
