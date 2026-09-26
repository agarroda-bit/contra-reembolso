// Página de prueba del kit de personajes: una fila de muñecos, cada uno con una pose.
// Parámetros: ?pose=dance  ?speed=6  ?aim=pistol|rifle|heavy|throw  ?cara=1  ?giro=90  ?disparo=1
//             ?aire=subir|caer  ?wobble=1  ?pitch=0.3  ?foco=N (primer plano del personaje N)
//             ?seed=7 (otra tanda de aspectos)  ?foto=1 (sin parpadeo)
import * as THREE from 'three';
import type { CharacterAnimParams, CharacterPose } from '../core/contracts';
import { Rng } from '../core/rng';
import { makeCharacter, randomLook, DRIVE_LAYOUT, RIDE_LAYOUT, SIT_LAYOUT, type Character, type CharacterKind } from '../actors/character';

const params = new URLSearchParams(location.search);
const W = window as any;

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
// cielo de atardecer
{
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#3b2d6b');
  gr.addColorStop(0.45, '#c85a8a');
  gr.addColorStop(0.75, '#ff9f5a');
  gr.addColorStop(1, '#ffd27a');
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  scene.background = tex;
}
scene.fog = new THREE.Fog('#f0a070', 25, 60);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
scene.add(new THREE.HemisphereLight('#ffe9cc', '#6b4a7a', 1.25));
const sun = new THREE.DirectionalLight('#ffd9a8', 2.2);
sun.position.set(5, 7, 9);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -12;
sun.shadow.camera.right = 12;
sun.shadow.camera.top = 8;
sun.shadow.camera.bottom = -6;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 40;
sun.shadow.bias = -0.0005;
scene.add(sun);

// suelo de plaza con baldosas
{
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d8b48a';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#cfa77b';
  g.fillRect(0, 0, 64, 64);
  g.fillRect(64, 64, 64, 64);
  g.strokeStyle = '#b88e64';
  g.lineWidth = 3;
  g.strokeRect(0, 0, 128, 128);
  g.strokeRect(0, 0, 64, 64);
  g.strokeRect(64, 64, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(40, 40);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshLambertMaterial({ map: tex }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
}

// ───────── armas de prueba (enganche: +Z = cañón, +Y = arriba) ─────────
const gunMat = new THREE.MeshLambertMaterial({ color: '#2b2b33', flatShading: true });
const woodMat = new THREE.MeshLambertMaterial({ color: '#8a5a2b', flatShading: true });
function makePistol() {
  const g = new THREE.Group();
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.045, 0.19), gunMat);
  slide.position.set(0, 0.045, 0.06);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.045), gunMat);
  grip.position.set(0, 0, -0.005);
  grip.rotation.x = -0.25;
  g.add(slide, grip);
  return g;
}
function makeRifle() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.075, 0.5), gunMat);
  body.position.set(0, 0.04, 0.12);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.3), gunMat);
  barrel.position.set(0, 0.055, 0.5);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.09, 0.25), woodMat);
  stock.position.set(0, 0.02, -0.24);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.09, 0.04), gunMat);
  grip.position.set(0, -0.02, 0);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.05), gunMat);
  mag.position.set(0, -0.03, 0.14);
  g.add(body, barrel, stock, grip, mag);
  return g;
}

// ───────── accesorios de pose (asiento, moto, banco) ─────────
const propMat = new THREE.MeshLambertMaterial({ color: '#4a5a8a', flatShading: true });
const darkMat = new THREE.MeshLambertMaterial({ color: '#222228', flatShading: true });
function propFor(pose: string): THREE.Object3D | null {
  const g = new THREE.Group();
  if (pose === 'drive' || pose === 'enter_car') {
    const L = DRIVE_LAYOUT;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.5), propMat);
    seat.position.set(0, L.seatY - 0.06, L.seatZ);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.12), propMat);
    back.position.set(0, L.seatY + 0.36, L.seatZ - 0.3);
    back.rotation.x = -0.2;
    const nx = -Math.sin(L.wheelTilt), nz = Math.cos(L.wheelTilt);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), darkMat);
    col.position.set(0, L.wheel.y + nx * 0.25, L.wheel.z + nz * 0.25);
    col.rotation.x = L.wheelTilt + Math.PI / 2;
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(L.wheelRadius, 0.022, 6, 14), darkMat);
    wheel.position.set(L.wheel.x, L.wheel.y, L.wheel.z);
    wheel.rotation.x = L.wheelTilt;
    g.add(seat, back, col, wheel);
  } else if (pose === 'ride') {
    const L = RIDE_LAYOUT;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.6), propMat);
    seat.position.set(0, L.seatY - 0.06, L.seatZ);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.36, 1.1), new THREE.MeshLambertMaterial({ color: '#e63946', flatShading: true }));
    body.position.set(0, L.seatY - 0.3, 0.05);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.85, 6), darkMat);
    stem.position.set(0, L.bar.y - 0.4, L.bar.z + 0.14);
    stem.rotation.x = 0.35;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(L.barHalfWidth * 2 + 0.12, 0.035, 0.035), darkMat);
    bar.position.set(L.bar.x, L.bar.y, L.bar.z);
    // reposapiés donde apoya las suelas
    for (const sx of [1, -1]) {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.3), darkMat);
      pad.position.set(sx * L.feet.halfWidth, L.feet.y - 0.015, L.feet.z);
      g.add(pad);
    }
    for (const z of [-0.55, 0.75]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 10), darkMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(0, 0.2, z);
      g.add(w);
    }
    g.add(seat, body, stem, bar);
  } else if (pose === 'sit') {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.45), woodMat);
    seat.position.set(0, SIT_LAYOUT.seatY - 0.04, SIT_LAYOUT.seatZ);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.6, SIT_LAYOUT.seatY - 0.08, 0.3), darkMat);
    leg.position.set(0, (SIT_LAYOUT.seatY - 0.08) / 2, SIT_LAYOUT.seatZ - 0.02);
    g.add(seat, leg);
  } else return null;
  g.traverse((m) => ((m as THREE.Mesh).castShadow = true));
  return g;
}

// ───────── la fila ─────────
interface Actor {
  rig: Character;
  params: CharacterAnimParams;
  label: string;
  airMode?: string;
  shoot?: boolean;
}

const rng = new Rng(Number(params.get('seed') ?? 7));
const kinds: CharacterKind[] = ['civil', 'devuelto', 'policia', 'repartidor', 'rico', 'abuela', 'fiestero', 'civil', 'civil'];
const defaults: { label: string; p: Partial<CharacterAnimParams>; aire?: string; shoot?: boolean }[] = [
  { label: 'parado', p: { pose: 'normal', speed: 0 } },
  { label: 'andando', p: { pose: 'normal', speed: 2 } },
  { label: 'apunta pistola', p: { pose: 'normal', speed: 0, aiming: true, weapon: 'pistol' }, shoot: true },
  { label: 'corriendo', p: { pose: 'normal', speed: 6 } },
  { label: 'móvil', p: { pose: 'phone', speed: 0 } },
  { label: 'andando (abuela)', p: { pose: 'normal', speed: 1.2 } },
  { label: 'bailando', p: { pose: 'dance', speed: 0 } },
  { label: 'manos arriba', p: { pose: 'hands_up', speed: 0 } },
  { label: 'mareado', p: { pose: 'stunned', speed: 0 } },
];

const poseParam = params.get('pose') as CharacterPose | null;
const speedParam = params.get('speed');
const aimParam = params.get('aim') as CharacterAnimParams['weapon'] | null;
const aireParam = params.get('aire');
const cara = params.get('cara') === '1';
const giro = (Number(params.get('giro') ?? (params.has('foco') ? 0 : 22)) * Math.PI) / 180;
const shootAll = params.get('disparo') === '1';

const actors: Actor[] = [];
const count = cara ? 2 : kinds.length;
const spacing = 1.32;
for (let i = 0; i < count; i++) {
  const kind = cara ? (i === 0 ? 'repartidor' : 'devuelto') : kinds[i];
  const look = randomLook(rng, kind);
  if (cara) { look.glasses = false; if (i === 0) (look as any).facial = null; }
  const rig = makeCharacter(look);
  if (cara || params.has("foto")) rig.anim.blinkEnabled = false;
  const x = cara ? (i === 0 ? -0.23 : 0.23) : (i - (count - 1) / 2) * spacing;
  rig.root.position.set(x, 0, 0);
  rig.root.rotation.y = giro + (cara ? (i === 0 ? 0.35 : -0.35) : 0);
  scene.add(rig.root);
  const d = defaults[i % defaults.length];
  const p: CharacterAnimParams = { speed: 0, grounded: true, pose: 'normal', weapon: 'none', aimPitch: 0, ...d.p };
  let label = `${kind}\n${d.label}`;
  let shoot = !!d.shoot;
  if (poseParam || speedParam || aimParam || aireParam || params.has('wobble')) {
    p.pose = poseParam ?? 'normal';
    p.speed = Number(speedParam ?? 0);
    p.aiming = !!aimParam;
    p.weapon = aimParam ?? 'none';
    p.aimPitch = Number(params.get('pitch') ?? 0);
    p.wobble = params.has('wobble') ? Number(params.get('wobble')) || 1 : 0;
    label = `${kind}\n${p.pose}${p.speed ? ' ' + p.speed + ' m/s' : ''}${aimParam ? ' · ' + aimParam : ''}`;
    shoot = shootAll;
  }
  if (cara) {
    p.pose = 'normal';
    p.speed = 0;
  }
  const actor: Actor = { rig, params: p, label, airMode: aireParam ?? undefined, shoot };
  // arma en la mano
  if (p.aiming || p.weapon !== 'none') {
    if (p.weapon === 'rifle' || p.weapon === 'heavy') rig.attach('handR', makeRifle());
    else if (p.weapon === 'pistol' || p.weapon === 'none') rig.attach('handR', makePistol());
  }
  // mochila de reparto a la espalda (prueba del enganche 'back')
  if (kind === 'repartidor' && !cara) {
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.22), new THREE.MeshLambertMaterial({ color: '#ffb000', flatShading: true }));
    bag.position.set(0, -0.02, -0.11);
    bag.castShadow = true;
    rig.attach('back', bag);
  }
  // accesorio de la pose
  const prop = propFor(p.pose);
  if (prop) {
    prop.position.copy(rig.root.position);
    prop.rotation.y = rig.root.rotation.y;
    scene.add(prop);
  }
  actors.push(actor);
}

// cámara
const foco = params.has('foco') ? Number(params.get('foco')) : -1;
if (cara) {
  camera.position.set(0, 1.62, 0.95);
  camera.lookAt(0, 1.57, 0);
  camera.fov = 40;
} else if (foco >= 0 && actors[foco]) {
  // primer plano de un personaje (de 3/4)
  const x = actors[foco].rig.root.position.x;
  camera.position.set(x + 1.3, 1.45, 3.1);
  camera.lookAt(x, 0.85, 0);
  camera.fov = 40;
} else {
  camera.position.set(0, 1.5, 9.1);
  camera.lookAt(0, 0.88, 0);
  camera.fov = 40;
}
camera.updateProjectionMatrix();
document.getElementById('titulo')!.textContent = cara
  ? 'Personajes — primer plano de caras'
  : `Personajes — ${poseParam ?? (aimParam ? 'apuntando ' + aimParam : speedParam ? 'velocidad ' + speedParam + ' m/s' : aireParam ? 'en el aire (' + aireParam + ')' : params.has('wobble') ? 'colocado' : 'una pose cada uno')}`;

// etiquetas
const labelBox = document.getElementById('etiquetas')!;
const labelEls = actors.map((a) => {
  const el = document.createElement('div');
  el.textContent = a.label;
  if (!cara) labelBox.appendChild(el);
  return el;
});
const _v = new THREE.Vector3();
function placeLabels() {
  actors.forEach((a, i) => {
    _v.set(a.rig.root.position.x, -0.05, a.rig.root.position.z).project(camera);
    labelEls[i].style.left = ((_v.x + 1) / 2) * window.innerWidth + 'px';
    labelEls[i].style.top = ((1 - _v.y) / 2) * window.innerHeight + 'px';
  });
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  placeLabels();
});

// ───────── medida de rendimiento: 40 personajes animándose ─────────
function measure() {
  const r = new Rng(99);
  const kindsAll: CharacterKind[] = ['civil', 'devuelto', 'policia', 'repartidor', 'rico', 'abuela', 'fiestero'];
  const poses: Partial<CharacterAnimParams>[] = [
    { pose: 'normal', speed: 1.5 }, { pose: 'normal', speed: 5 }, { pose: 'normal', speed: 0 },
    { pose: 'normal', speed: 2, aiming: true, weapon: 'rifle' }, { pose: 'dance' }, { pose: 'drive' },
    { pose: 'stunned' }, { pose: 'hands_up' },
  ];
  const group = new THREE.Group();
  const rigs: { rig: Character; p: CharacterAnimParams }[] = [];
  const t0 = performance.now();
  let triMin = 1e9, triMax = 0;
  for (let i = 0; i < 40; i++) {
    const rig = makeCharacter(randomLook(r, kindsAll[i % kindsAll.length]));
    triMin = Math.min(triMin, rig.triangles);
    triMax = Math.max(triMax, rig.triangles);
    rig.root.position.set((i % 8) * 2, 0, -30 - Math.floor(i / 8) * 2);
    group.add(rig.root);
    rigs.push({ rig, p: { speed: 0, grounded: true, pose: 'normal', ...poses[i % poses.length] } as CharacterAnimParams });
  }
  const build = (performance.now() - t0) / 40;
  // calentar
  for (let f = 0; f < 60; f++) for (const x of rigs) x.rig.update(1 / 60, x.p);
  const frames = 300;
  let tu = 0, tm = 0;
  for (let f = 0; f < frames; f++) {
    const a = performance.now();
    for (const x of rigs) x.rig.update(1 / 60, x.p);
    const b = performance.now();
    group.updateMatrixWorld(true);
    for (const x of rigs) x.rig.mesh.skeleton.update();
    tm += performance.now() - b;
    tu += b - a;
  }
  for (const x of rigs) x.rig.dispose();
  return {
    update40ms: +(tu / frames).toFixed(3),
    matrices40ms: +(tm / frames).toFixed(3),
    buildMsPerCharacter: +build.toFixed(2),
    trianglesMin: triMin,
    trianglesMax: triMax,
  };
}

const perf = measure();
W.__perf = perf;
document.getElementById('perf')!.textContent =
  `40 personajes: update ${perf.update40ms} ms/frame · huesos ${perf.matrices40ms} ms · triángulos ${perf.trianglesMin}–${perf.trianglesMax} · creación ${perf.buildMsPerCharacter} ms`;
console.log('[perf]', JSON.stringify(perf));

// ───────── bucle ─────────
let last = performance.now();
let elapsed = 0;
let shotTimer = 0;
W.__actors = actors;
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  elapsed += dt;
  shotTimer += dt;
  const fire = shotTimer > 0.6;
  if (fire) shotTimer = 0;
  for (const a of actors) {
    a.params.shot = !!a.shoot && fire;
    if (a.airMode) {
      a.params.grounded = false;
      a.params.vy = a.airMode === 'caer' ? -9 : a.airMode === 'subir' ? 5 : 5 - ((elapsed * 8) % 16);
    }
    a.rig.update(dt, a.params);
  }
  renderer.render(scene, camera);
  if (!W.__ready) {
    placeLabels();
    W.__ready = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
