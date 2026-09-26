// Página de prueba del HUD: mundo provisional + mapa falso de la isla + valores de prueba.
// Parámetros: ?escena=pie|coche  &noche=1  &notis=1  &mapa=1  &debug=1
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../core/game';
import { installDebug } from '../core/debug';
import { buildPlaceholderWorld } from '../world/placeholder';
import { Rng } from '../core/rng';
import type { District, DistrictId, Poi, PoiKind } from '../core/contracts';
import { installHud } from '../ui/hud';

const SIZE = 600;
const MPP = 0.5; // metros por píxel del mapa

const DISTRICTS: District[] = [
  { id: 'centro', name: 'El Centro', color: '#ff4f81', center: { x: 0, z: 0 } },
  { id: 'puerto', name: 'El Puerto', color: '#2ec4b6', center: { x: -165, z: 150 } },
  { id: 'colina', name: 'La Colina', color: '#ffd23f', center: { x: 150, z: -150 } },
  { id: 'poligono', name: 'El Polígono', color: '#ff7b54', center: { x: 165, z: 150 } },
  { id: 'viejo', name: 'El Barrio Viejo', color: '#6c3bd1', center: { x: -150, z: -140 } },
];

const LAND: Record<DistrictId, [number, number, number]> = {
  centro: [242, 226, 190],
  puerto: [214, 214, 206],
  colina: [178, 218, 128],
  poligono: [206, 196, 180],
  viejo: [238, 202, 164],
};

/** Radio de la costa según el ángulo. */
function coast(a: number): number {
  return 262 + 16 * Math.sin(3 * a + 0.5) + 11 * Math.sin(5 * a + 1.3) + 6 * Math.sin(9 * a + 2.1) + 3 * Math.sin(17 * a);
}

function nearestDistrict(x: number, z: number): DistrictId {
  // bordes un poco ondulados
  const wx = x + Math.sin(z * 0.045) * 14, wz = z + Math.cos(x * 0.05) * 14;
  let best: DistrictId = 'centro';
  let bd = Infinity;
  for (const d of DISTRICTS) {
    const w = d.id === 'centro' ? 0.72 : 1; // el centro algo más pequeño
    const dd = ((wx - d.center.x) ** 2 + (wz - d.center.z) ** 2) / (w * w);
    if (dd < bd) {
      bd = dd;
      best = d.id;
    }
  }
  return best;
}

/** Mapa falso de la isla, bonito, dibujado por código. */
function drawFakeMap(): HTMLCanvasElement {
  const N = SIZE / MPP;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  const img = g.createImageData(N, N);
  const px = img.data;
  const sea: [number, number, number] = [47, 143, 208];
  const shallow: [number, number, number] = [92, 205, 222];
  const sand: [number, number, number] = [246, 222, 150];
  for (let j = 0; j < N; j++) {
    const z = j * MPP - SIZE / 2;
    for (let i = 0; i < N; i++) {
      const x = i * MPP - SIZE / 2;
      const r = Math.hypot(x, z);
      const R = coast(Math.atan2(z, x));
      let col: [number, number, number];
      if (r > R + 26) col = sea;
      else if (r > R) {
        const t = (r - R) / 26;
        col = [shallow[0] + (sea[0] - shallow[0]) * t, shallow[1] + (sea[1] - shallow[1]) * t, shallow[2] + (sea[2] - shallow[2]) * t];
      } else if (r > R - 9) col = sand;
      else {
        const base = LAND[nearestDistrict(x, z)];
        const n = Math.sin(x * 0.21 + z * 0.13) * Math.cos(z * 0.17 - x * 0.07) * 6;
        col = [base[0] + n, base[1] + n, base[2] + n];
      }
      const k = (j * N + i) * 4;
      px[k] = col[0];
      px[k + 1] = col[1];
      px[k + 2] = col[2];
      px[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);

  // a partir de aquí dibujamos en metros
  g.setTransform(1 / MPP, 0, 0, 1 / MPP, N / 2, N / 2);
  const rng = new Rng('mapa-falso');
  const inside = (x: number, z: number, m = 0) => Math.hypot(x, z) < coast(Math.atan2(z, x)) - 14 - m;

  // curvas de nivel en La Colina
  g.strokeStyle = 'rgba(80,140,60,0.35)';
  g.lineWidth = 1.6;
  for (let k = 1; k <= 5; k++) {
    g.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.1) {
      const rr = k * 17 + Math.sin(a * 3 + k) * 5;
      const x = 150 + Math.cos(a) * rr, z = -150 + Math.sin(a) * rr * 0.85;
      if (a === 0) g.moveTo(x, z);
      else g.lineTo(x, z);
    }
    g.stroke();
  }

  // muelles del puerto
  for (let k = 0; k < 4; k++) {
    const ang = 2.05 + k * 0.17;
    g.save();
    const r0 = coast(ang) - 12;
    g.translate(Math.cos(ang) * r0, Math.sin(ang) * r0);
    g.rotate(ang);
    g.fillStyle = '#b8b2a6';
    g.strokeStyle = '#6d6577';
    g.lineWidth = 1.2;
    g.fillRect(0, -7, 64, 14);
    g.strokeRect(0, -7, 64, 14);
    const cols = ['#ff7b54', '#2ec4b6', '#6c3bd1', '#ffd23f', '#ff4f81'];
    for (let s = 0; s < 5; s++) {
      g.fillStyle = cols[(s + k) % cols.length];
      g.fillRect(14 + s * 9, -4.5, 7, 4);
      if (rng.chance(0.6)) {
        g.fillStyle = cols[(s + k + 2) % cols.length];
        g.fillRect(14 + s * 9, 0.8, 7, 4);
      }
    }
    g.restore();
  }

  // edificios: bloques por distrito (las calles se pintan encima)
  for (let z = -250; z < 250; z += 11) {
    for (let x = -250; x < 250; x += 11) {
      const jx = x + rng.range(-1.5, 1.5), jz = z + rng.range(-1.5, 1.5);
      if (!inside(jx, jz, 4)) continue;
      const d = nearestDistrict(jx, jz);
      let p = 0.8, w = rng.range(6, 9), h = rng.range(6, 9);
      let fill = '#d9c7a4';
      if (d === 'centro') { fill = rng.pick(['#e9c9a0', '#f3b9a4', '#e4d3b0', '#f6d28a']); }
      else if (d === 'viejo') { fill = rng.pick(['#dca57c', '#e8b98f', '#d28f6c', '#f0c9a0']); w *= 0.85; h *= 0.85; p = 0.92; }
      else if (d === 'colina') { fill = rng.pick(['#fff6e0', '#fbe9d0', '#f7f1ea']); p = 0.38; w *= 1.15; }
      else if (d === 'poligono') { fill = rng.pick(['#aab0b8', '#b9b3a8', '#9aa3ad']); p = 0.7; w *= 1.3; h *= 1.3; }
      else if (d === 'puerto') { fill = rng.pick(['#c9d6df', '#b4c4cf', '#e0d8c8']); p = 0.55; }
      if (!rng.chance(p)) continue;
      g.fillStyle = 'rgba(40,20,60,0.18)';
      g.fillRect(jx - w / 2 + 1.2, jz - h / 2 + 1.2, w, h);
      g.fillStyle = fill;
      g.fillRect(jx - w / 2, jz - h / 2, w, h);
      if (d === 'colina' && rng.chance(0.5)) {
        g.fillStyle = '#5fd0f0';
        g.fillRect(jx + w / 2 + 0.6, jz - 2, 3.2, 4.2);
      }
    }
  }

  // parques
  const park = (x: number, z: number, r: number) => {
    g.fillStyle = '#8fd46a';
    g.beginPath();
    g.ellipse(x, z, r, r * 0.75, 0.3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#5fae4a';
    for (let t = 0; t < r * 0.7; t++) {
      const a = rng.range(0, Math.PI * 2), rr = rng.range(0, r * 0.8);
      g.beginPath();
      g.arc(x + Math.cos(a) * rr, z + Math.sin(a) * rr * 0.7, rng.range(1.5, 3), 0, Math.PI * 2);
      g.fill();
    }
  };
  park(-70, -70, 22);
  park(80, 60, 16);
  park(110, -210, 20);
  park(-120, 40, 14);

  // calles
  const roads: { pts: [number, number][]; w: number }[] = [];
  const ring: [number, number][] = [];
  for (let a = 0; a <= Math.PI * 2 + 0.001; a += 0.05) {
    const r = coast(a) - 34;
    ring.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  roads.push({ pts: ring, w: 9 });
  roads.push({ pts: [[-225, 0], [225, 0]], w: 10 });
  roads.push({ pts: [[0, -225], [0, 225]], w: 10 });
  for (const v of [-100, -50, 50, 100]) {
    roads.push({ pts: [[v, -110], [v, 110]], w: 7 });
    roads.push({ pts: [[-110, v], [110, v]], w: 7 });
  }
  // colina: serpentina
  const serp: [number, number][] = [];
  for (let t = 0; t <= 1; t += 0.02) serp.push([40 + t * 170, -40 - t * 160 + Math.sin(t * 14) * 18]);
  roads.push({ pts: serp, w: 6 });
  roads.push({ pts: [[110, -110], [150, -150], [200, -140]], w: 6 });
  // polígono: avenidas anchas
  roads.push({ pts: [[125, 40], [125, 225]], w: 11 });
  roads.push({ pts: [[205, 60], [205, 200]], w: 11 });
  roads.push({ pts: [[70, 105], [235, 105]], w: 11 });
  roads.push({ pts: [[80, 180], [215, 180]], w: 11 });
  // barrio viejo: callejones torcidos
  const vr = new Rng('callejones');
  for (let k = 0; k < 9; k++) {
    let x = -60 - vr.range(0, 40), z = -60 - vr.range(0, 40);
    const pts: [number, number][] = [[x, z]];
    let ang = Math.PI * 1.25 + vr.range(-0.6, 0.6);
    for (let s = 0; s < 14; s++) {
      ang += vr.range(-0.5, 0.5);
      x += Math.cos(ang) * 14;
      z += Math.sin(ang) * 14;
      if (!inside(x, z, 20)) break;
      pts.push([x, z]);
    }
    roads.push({ pts, w: 4.5 });
  }
  // puerto: paseo marítimo
  const paseo: [number, number][] = [];
  for (let a = 1.75; a <= 2.95; a += 0.05) {
    const r = coast(a) - 18;
    paseo.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  roads.push({ pts: paseo, w: 7 });

  const strokeRoads = (extra: number, color: string) => {
    g.strokeStyle = color;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const r of roads) {
      g.lineWidth = r.w + extra;
      g.beginPath();
      r.pts.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z)));
      g.stroke();
    }
  };
  strokeRoads(3, '#6f6388');
  strokeRoads(0, '#fdf7ea');
  // líneas centrales en las grandes
  g.setLineDash([4, 5]);
  g.strokeStyle = 'rgba(255,190,60,0.9)';
  g.lineWidth = 0.9;
  for (const r of roads) {
    if (r.w < 9) continue;
    g.beginPath();
    r.pts.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z)));
    g.stroke();
  }
  g.setLineDash([]);

  // plaza con fuente
  g.fillStyle = '#fff3d6';
  g.strokeStyle = '#6f6388';
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(0, 0, 20, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = '#5fd0f0';
  g.beginPath();
  g.arc(0, 0, 7, 0, Math.PI * 2);
  g.fill();
  g.stroke();

  g.setTransform(1, 0, 0, 1, 0, 0);
  return c;
}

const POIS: [string, PoiKind, string, number, number][] = [
  ['office', 'office', 'Oficina de Reparto Contra Reembolso', -168, 132],
  ['atm-oficina', 'atm', 'Cajero de la Oficina', -150, 128],
  ['atm-centro', 'atm', 'Cajero de la Plaza', 28, 22],
  ['atm-colina', 'atm', 'Cajero de La Colina', 128, -118],
  ['health', 'health', 'Centro de Salud San Tirita', -62, 78],
  ['casino', 'casino', 'Casino La Suerte Loca', 38, -32],
  ['club', 'club', 'Club VIP Burbujas', -36, -44],
  ['clothes', 'clothes', 'Trapitos de Lujo', 52, 44],
  ['fountain', 'fountain', 'Fuente de la Plaza Mayor', 0, 0],
  ['shop-ultramarinos', 'shop', 'Ultramarinos Paca', -44, 30],
  ['shop-chinos', 'shop', 'Bazar Todo Tiene', -96, -12],
  ['attic', 'attic', 'Ático Vistas al Mar', 176, -196],
  ['garage', 'garage', 'Taller y Concesionario El Pistón', 186, 118],
  ['paint', 'paint', 'Pintura Exprés Camaleón', 148, 196],
  ['gunshop', 'gunshop', 'Armería El Petardo', 222, 158],
  ['hideout', 'hideout', 'Almacén de Los Devueltos', 232, 214],
  ['junkyard', 'junkyard', 'Desguace Chatarra Feliz', 100, 222],
  ['weed', 'weed', 'El de las Hierbas', -196, -150],
  ['bar', 'bar', 'Bar El Chupito', -150, -96],
];

async function boot() {
  await RAPIER.init();
  const params = new URLSearchParams(location.search);
  const escena = params.get('escena') ?? 'pie';
  const noche = params.get('noche') === '1';
  const game = new Game(document.getElementById('app')!, document.getElementById('ui')!);
  const world = buildPlaceholderWorld(game);
  world.size = SIZE;
  world.mapPixelSize = MPP;
  world.mapCanvas = drawFakeMap();
  world.districts = DISTRICTS;
  world.districtAt = (x, z) => nearestDistrict(x, z);
  world.pois = POIS.map(([id, kind, name, x, z]): Poi => ({
    id, kind, name, district: nearestDistrict(x, z), door: new THREE.Vector3(x, 0, z), facing: 0,
  }));
  game.world = world;
  installDebug(game);

  // cielo y luces
  game.scene.background = new THREE.Color(noche ? '#241a4a' : '#9fd6ff');
  (game.scene.fog as THREE.Fog).color.set(noche ? '#241a4a' : '#bfe3ff');
  game.scene.add(new THREE.HemisphereLight(noche ? '#6c5ad0' : '#fff2d0', '#5a3a7a', noche ? 0.6 : 1.2));
  const sun = new THREE.DirectionalLight(noche ? '#8fa0ff' : '#ffffff', noche ? 0.5 : 1.6);
  sun.position.set(30, 50, 20);
  game.scene.add(sun);
  game.clock.hour = noche ? 22.75 : 17.5;
  game.clock.day = 3;
  game.night = noche ? 1 : 0;

  // jugador falso que pasea por el mapa (el 3D es solo fondo)
  const player = { position: new THREE.Vector3(-20, 0, 60) };
  game.mod.player = player;

  const hud = installHud(game);

  // valores de prueba
  const h = game.hud;
  h.cash = 1234;
  h.bank = 12500;
  h.fame = 380;
  h.fameLevel = 3;
  h.health = 72;
  h.armor = 40;
  h.stamina = escena === 'pie' ? 58 : 100;
  h.wanted = 3;
  h.jobs = [
    { id: 'j1', title: 'Vajilla FRÁGIL para la abuela Puri', timeLeft: 104, integrity: 86, color: '#ff4f81' },
    { id: 'j2', title: 'Paquete URGENTE al Casino', timeLeft: 27, integrity: 100, color: '#ffd23f' },
    { id: 'j3', title: 'Caja SOSPECHOSA al Polígono', timeLeft: null, integrity: 41, color: '#6c3bd1' },
  ];
  h.markers = [
    { x: 38, z: -58, icon: '📦', color: '#ff4f81', label: 'Entrega: abuela Puri' },
    { x: -210, z: -40, icon: '💰', color: '#3ddc84', label: 'Cobro pendiente' },
    { x: 20, z: 160, icon: '👊', color: '#6c3bd1', label: 'Los Devueltos' },
  ];
  h.waypoint = { x: 150, z: -160, label: 'Destino' };
  if (escena === 'coche') {
    h.vehicle = { name: 'Furgoneta de reparto', speedKmh: 87, health: 64, packages: 2, capacity: 6 };
    h.radio = { station: 'Radio Perreo Paquete', show: '«Seguros El Desastre: si te pasa algo, ya te lo decíamos»' };
    h.weapon = { name: 'Subfusil', icon: '🔫', clip: 24, reserve: 120 };
    h.crosshair = false;
  } else {
    h.weapon = { name: 'Pistola', icon: '🔫', clip: 12, reserve: 48 };
    h.crosshair = true;
    h.hint = 'E — Entrar al casino';
  }

  // bucle de prueba: jugador en círculo, cámara orbitando, cuentas atrás
  let t = 0;
  game.addSystem({
    name: 'prueba-hud',
    update: (dt) => {
      t += dt;
      const a = t * 0.12;
      player.position.set(Math.cos(a) * 70 - 20, 0, Math.sin(a) * 70 + 30);
      const ca = 0.6 + t * 0.08;
      game.camera.position.set(Math.cos(ca) * 38, 13, Math.sin(ca) * 38);
      game.camera.lookAt(0, 4, 0);
      for (const j of h.jobs) if (j.timeLeft != null) j.timeLeft = Math.max(0, j.timeLeft - dt);
      // de vez en cuando la vajilla frágil se lleva un golpe
      const j1 = h.jobs[0];
      if (j1?.integrity != null && Math.floor(t / 7) !== Math.floor((t - dt) / 7)) j1.integrity = Math.max(5, j1.integrity - 9);
      if (h.vehicle) h.vehicle.speedKmh = 87 + Math.sin(t * 0.7) * 3;
    },
  });

  const test = {
    notis() {
      game.events.emit('notify', { from: 'Abuela Puri', title: 'Nuevo encargo 📦', text: 'Hijo, tráeme el paquete antes de que empiece la novela. Te pago en céntimos, que tengo muchos.', icon: '👵' });
      setTimeout(() => game.events.emit('notify', { from: 'Jefe Ramón', title: 'Oye, novato', text: 'La furgoneta no es un coche de rally. Bueno, un poco sí.', icon: '🧔' }), 500);
      setTimeout(() => game.events.emit('notify', { from: 'Los Devueltos', title: 'Te estamos viendo', text: 'Bonito paquete. Sería una pena que se perdiera 😈', icon: '💀' }), 1000);
    },
    toast(text = '¡Entrega perfecta!', color = '#3ddc84') {
      game.events.emit('toast', { text, color });
    },
    district(id: DistrictId = 'centro') {
      const d = DISTRICTS.find((x) => x.id === id)!;
      game.events.emit('district', { id, name: d.name });
    },
    money(delta = 45, reason = 'Propina') {
      h.cash += delta;
      game.events.emit('money', { cash: h.cash, bank: h.bank, delta, reason });
    },
    hurt(amount = 20) {
      h.health = Math.max(0, h.health - amount);
      game.events.emit('player:hurt', { amount });
    },
    hover(poiId = 'casino') {
      // simula el ratón encima de un icono del mapa grande
      const bm = hud.bigMap as any;
      const poi = world.pois.find((p) => p.id === poiId)!;
      const o = bm.toScreen(poi.door.x, poi.door.z, { x: 0, y: 0 });
      const r = (document.querySelector('.hud-mapa__canvas') as HTMLCanvasElement).getBoundingClientRect();
      const ev = new PointerEvent('pointermove', { clientX: r.left + o.x, clientY: r.top + o.y, bubbles: true });
      document.querySelector('.hud-mapa__canvas')!.dispatchEvent(ev);
    },
    /**
     * Mide el minimapa real: `js` = coste en JS por frame (lo que cuenta en el bucle);
     * `conEspera` = dibujo + esperar a que la GPU termine (cota muy alta, fuerza sincronizar).
     */
    bench(n = 200) {
      const m = hud.minimap;
      const c = m.el.querySelector('canvas') as HTMLCanvasElement;
      const cx = c.getContext('2d')!;
      for (let i = 0; i < 10; i++) m.draw(game, world, 0, 0, i * 0.1, 0.016);
      let t0 = performance.now();
      for (let i = 0; i < n; i++) m.draw(game, world, i * 0.3 - 20, 10, i * 0.03, 0.016);
      const js = (performance.now() - t0) / n;
      t0 = performance.now();
      for (let i = 0; i < 30; i++) m.draw(game, world, i * 0.3 - 20, 10, i * 0.03, 0.016), cx.getImageData(0, 0, 1, 1);
      const conEspera = (performance.now() - t0) / 30;
      return { js: +js.toFixed(3), conEspera: +conEspera.toFixed(3), px: c.width, stats: { ...hud.stats } };
    },
    hud,
  };
  (window as any).__hudTest = test;

  game.start();
  if (params.get('notis') === '1') {
    setTimeout(() => test.notis(), 300);
    setTimeout(() => test.toast(), 400);
    setTimeout(() => test.money(45, 'Propina'), 900);
    setTimeout(() => test.district('centro'), 200);
  }
  if (params.get('mapa') === '1') setTimeout(() => hud.openMap(), 300);
  (window as any).__ready = true;
}

boot().catch((e) => console.error(e));
