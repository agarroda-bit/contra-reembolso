// Página de prueba del cielo y del ciclo de día y noche.
// Parámetros: ?hora=19.5  ?mira=oeste|este|sur|norte|<grados>  ?inclina=<grados>  ?vista=suelo
//             ?calidad=baja|media|alta  ?velocidad=60 (el día pasa 60 veces más rápido)
// En consola: __setHour(h), __look(yawGrados, inclinaGrados)
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Game, DAY_LENGTH_SECONDS } from '../core/game';
import { installDebug } from '../core/debug';
import { buildPlaceholderWorld } from '../world/placeholder';
import { installDayNight } from '../world/daynight';
import { Rng } from '../core/rng';
import type { Quality } from '../core/settings';

async function boot() {
  await RAPIER.init();
  const game = new Game(document.getElementById('app')!, document.getElementById('ui')!);
  const params = game.params;
  const q = params.get('calidad') as Quality | null;
  if (q === 'baja' || q === 'media' || q === 'alta') game.applySettings({ quality: q });

  const world = buildPlaceholderWorld(game);
  game.world = world;
  const bulbs = buildTestTown(game, world.lampPositions);
  world.setNight = (n) => {
    const on = THREE.MathUtils.smoothstep(n, 0.25, 0.7);
    bulbs.emissiveIntensity = 0.1 + on * 2.2;
    windows.emissiveIntensity = on * 1.4;
  };
  const windows = buildWindows(game);

  installDebug(game);
  const dn = installDayNight(game);

  // ── Cámara ──
  const vista = params.get('vista');
  let autoAim = !params.has('mira') && vista !== 'suelo';
  const cam = game.camera;
  const look = (yawDeg: number, pitchDeg: number) => {
    const yaw = THREE.MathUtils.degToRad(yawDeg);
    const pitch = THREE.MathUtils.degToRad(pitchDeg);
    cam.position.set(0, 7, 38);
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    cam.lookAt(cam.position.clone().add(dir));
  };
  // yaw: 0 = norte (-Z), 90 = este (+X), 180 = sur (+Z), 270 = oeste (-X)
  const NAMED: Record<string, number> = { norte: 0, este: 90, sur: 180, oeste: 270 };
  const aimAuto = () => {
    // mira hacia el sol (o hacia la luna si es de noche) para que salga en la foto
    const d = dn.sunDirection.y > -0.2 ? dn.sunDirection : dn.moonDirection;
    const yaw = THREE.MathUtils.radToDeg(Math.atan2(d.x, -d.z));
    const elev = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)));
    look(yaw, THREE.MathUtils.clamp(elev * 0.55, 6, 24));
  };
  if (vista === 'suelo') {
    // desde el este mirando al oeste: a mediodía las sombras caen hacia la derecha (norte)
    cam.position.set(64, 26, 16);
    cam.lookAt(4, 0, 0);
  } else if (params.has('mira')) {
    const m = params.get('mira')!;
    look(NAMED[m] ?? Number(m), Number(params.get('inclina') ?? 10));
  }

  const hora = params.get('hora');
  if (hora !== null) {
    game.clock.frozen = true;
    dn.setHour(Number(hora));
  }
  if (autoAim) aimAuto();

  const speed = Number(params.get('velocidad') ?? 1);
  const reloj = document.getElementById('reloj')!;
  game.addSystem({
    name: 'prueba-cielo',
    update: (dt) => {
      if (speed !== 1 && !game.clock.frozen) {
        game.clock.hour = (game.clock.hour + (dt * 24 * (speed - 1)) / DAY_LENGTH_SECONDS + 24) % 24;
      }
      if (autoAim && speed !== 1) aimAuto();
      const h = game.clock.hour;
      const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
      reloj.firstChild!.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      (reloj.lastChild as HTMLElement).textContent = `noche ${game.night.toFixed(2)} · ${game.fps.toFixed(0)} fps`;
    },
  });

  (window as any).__setHour = (h: number) => {
    dn.setHour(h);
    if (autoAim) aimAuto();
  };
  (window as any).__look = (y: number, p: number) => {
    autoAim = false;
    look(y, p);
  };
  (window as any).__dn = dn;
  game.start();
  (window as any).__ready = true;
}

/** Pueblo de mentira: mar, calle con farolas, casitas de colores y árboles. Devuelve el material de las bombillas. */
function buildTestTown(game: Game, lampPositions: THREE.Vector3[]): THREE.MeshLambertMaterial {
  const scene = game.scene;
  const rng = new Rng('pueblo-prueba');

  // mar alrededor (hasta el horizonte)
  const sea = new THREE.Mesh(
    new THREE.CircleGeometry(2500, 48).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: '#2a9dbf' }),
  );
  sea.position.y = -0.6;
  sea.receiveShadow = true;
  scene.add(sea);

  // calles
  const asphalt = new THREE.MeshLambertMaterial({ color: '#4a4a55' });
  const road = new THREE.Mesh(new THREE.BoxGeometry(190, 0.1, 9), asphalt);
  road.position.set(0, 0.05, 20);
  road.receiveShadow = true;
  scene.add(road);
  const road2 = new THREE.Mesh(new THREE.BoxGeometry(9, 0.1, 150), asphalt);
  road2.position.set(-45, 0.05, -5);
  road2.receiveShadow = true;
  scene.add(road2);

  // farolas a los dos lados de la calle
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 5.6, 6).translate(0, 2.8, 0);
  const armGeo = new THREE.BoxGeometry(1.2, 0.12, 0.12).translate(0.5, 5.55, 0);
  const pole = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: '#2d2f3a' }), 40);
  const arm = new THREE.InstancedMesh(armGeo, pole.material, 40);
  const bulbMat = new THREE.MeshLambertMaterial({ color: '#fff4d6', emissive: '#ffcf7a', emissiveIntensity: 0.1 });
  const bulb = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.28, 0), bulbMat, 40);
  const m = new THREE.Matrix4();
  let n = 0;
  for (let x = -88; x <= 88; x += 16) {
    for (const side of [-1, 1]) {
      if (n >= 40) break;
      const px = x + (side > 0 ? 8 : 0), pz = 20 + side * 5.2;
      const rot = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      m.makeRotationY(rot).setPosition(px, 0, pz);
      pole.setMatrixAt(n, m);
      arm.setMatrixAt(n, m);
      const b = new THREE.Vector3(1.05, 5.4, 0).applyMatrix4(m);
      bulb.setMatrixAt(n, new THREE.Matrix4().makeTranslation(b.x, b.y, b.z));
      lampPositions.push(b.clone().setY(b.y - 0.3));
      n++;
    }
  }
  for (const im of [pole, arm, bulb]) {
    im.count = n;
    im.castShadow = im !== bulb;
    scene.add(im);
  }

  // casitas de colores con tejado a cuatro aguas
  const COLORS = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff9f1c', '#c77dff', '#f4f1de', '#ff8fab', '#2ec4b6'];
  const houseGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const roofGeo = new THREE.ConeGeometry(0.75, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);
  const N = 34;
  const houses = new THREE.InstancedMesh(houseGeo, new THREE.MeshLambertMaterial({ color: '#ffffff' }), N);
  const roofs = new THREE.InstancedMesh(roofGeo, new THREE.MeshLambertMaterial({ color: '#d9643a', flatShading: true }), N);
  const c = new THREE.Color();
  const s = new THREE.Vector3(), p = new THREE.Vector3(), qt = new THREE.Quaternion();
  let placed = 0;
  for (let i = 0; placed < N && i < 400; i++) {
    const x = rng.range(-95, 95), z = rng.range(-95, 12);
    if (Math.abs(z - 20) < 12 || Math.abs(x + 45) < 9) continue; // no encima de las calles
    if (Math.hypot(x, z) < 42) continue; // deja libres las cajas del mundo provisional
    const w = rng.range(6, 11), d = rng.range(6, 10), h = rng.range(5, 14);
    p.set(x, 0, z);
    qt.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.pick([0, Math.PI / 2]));
    s.set(w, h, d);
    houses.setMatrixAt(placed, m.compose(p, qt, s));
    houses.setColorAt(placed, c.set(rng.pick(COLORS)));
    p.y = h;
    s.set(w * 1.02, rng.range(2, 3.5), d * 1.02);
    roofs.setMatrixAt(placed, m.compose(p, qt, s));
    placed++;
  }
  houses.count = roofs.count = placed;
  for (const im of [houses, roofs]) {
    im.castShadow = im.receiveShadow = true;
    scene.add(im);
  }

  // árboles
  const treeTop = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1.8, 4.2, 6).translate(0, 4.2, 0),
    new THREE.MeshLambertMaterial({ color: '#3fa34d', flatShading: true }),
    30,
  );
  const trunk = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.22, 0.3, 2.4, 5).translate(0, 1.2, 0),
    new THREE.MeshLambertMaterial({ color: '#7a4a2a' }),
    30,
  );
  for (let i = 0; i < 30; i++) {
    const x = rng.range(-90, 90), z = rng.range(26, 90);
    const k = rng.range(0.8, 1.4);
    m.compose(p.set(x, 0, z), qt.identity(), s.set(k, k, k));
    treeTop.setMatrixAt(i, m);
    trunk.setMatrixAt(i, m);
  }
  for (const im of [treeTop, trunk]) {
    im.castShadow = im.receiveShadow = true;
    scene.add(im);
  }
  return bulbMat;
}

/** Ventanas que se encienden de noche en las cajas naranjas del mundo provisional. */
function buildWindows(game: Game): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ color: '#3a3550', emissive: '#ffd27a', emissiveIntensity: 0 });
  const geo = new THREE.PlaneGeometry(1.1, 1.3);
  const im = new THREE.InstancedMesh(geo, mat, 200);
  const m = new THREE.Matrix4();
  let n = 0;
  for (let i = 0; i < 12; i++) {
    const w = 4 + (i % 3) * 3, h = 3 + (i % 4) * 4, d = 5;
    const x = Math.cos(i) * 30, z = Math.sin(i * 1.7) * 30;
    for (let fy = 1.6; fy < h - 0.8 && n < 200; fy += 2.6) {
      for (let fx = -w / 2 + 1.2; fx <= w / 2 - 1.2 && n < 200; fx += 2.2) {
        m.makeTranslation(x + fx, fy, z + d / 2 + 0.02);
        im.setMatrixAt(n++, m);
      }
    }
  }
  im.count = n;
  game.scene.add(im);
  return mat;
}

boot().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#fff;position:fixed;top:60px;left:12px">${String(e?.stack ?? e)}</pre>`);
});
