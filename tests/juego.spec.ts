// Pruebas del juego completo (apartado 14 del encargo). Se ejecutan según la fase:
//   FASE=3 npx playwright test
// Chromium headless con WebGL por SwiftShader. Guarda capturas en capturas/fase-N/.
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const FASE = Number(process.env.FASE || 1);
const DIR = `capturas/fase-${FASE}`;
mkdirSync(DIR, { recursive: true });

async function arrancar(page: Page, extra = '') {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`./?debug=1&prueba=1&calidad=baja&fase=${FASE}${extra}`);
  await page.waitForFunction(() => (window as any).__ready === true, null, { timeout: 120_000 });
  await page.waitForTimeout(1500);
  return errors;
}

const g = (page: Page, js: string) => page.evaluate(js);

/** Lleva al jugador al cruce de calles más cercano a un punto. */
const irA = (x: number, z: number) =>
  `(() => { let best = null, bd = 1e9; for (const n of __cr.world.roads.nodes) { const d = Math.hypot(n.pos.x - ${x}, n.pos.z - ${z}); if (d < bd) { bd = d; best = n; } } const p = best.pos; __cr.mod.player.teleport(new THREE.Vector3(p.x, p.y + 0.1, p.z)); })()`;

test('el juego carga sin errores y se ve la isla', async ({ page }) => {
  const errors = await arrancar(page);
  const info = (await g(page, `({ pois: __cr.world.pois.length, spots: __cr.world.deliverySpots.length, frames: __cr.time.frame })`)) as any;
  expect(info.pois).toBeGreaterThan(10);
  expect(info.spots).toBeGreaterThan(20);
  await page.screenshot({ path: `${DIR}/01-inicio.png` });
  expect(errors).toEqual([]);
});

test('andar y saltar', async ({ page }) => {
  const errors = await arrancar(page);
  const p0 = (await g(page, `__cr.mod.player.position.clone()`)) as any;
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2500);
  await page.keyboard.up('KeyW');
  const p1 = (await g(page, `__cr.mod.player.position.clone()`)) as any;
  expect(Math.hypot(p1.x - p0.x, p1.z - p0.z)).toBeGreaterThan(1);
  // saltar: se mide la altura máxima alcanzada (con SwiftShader va lento)
  const y0 = (await g(page, `__cr.mod.player.position.y`)) as number;
  await g(page, `window.__maxY = -1e9; window.__iv = setInterval(() => { window.__maxY = Math.max(window.__maxY, __cr.mod.player.position.y) }, 10)`);
  await page.keyboard.down('Space');
  await page.waitForTimeout(250);
  await page.keyboard.up('Space');
  await page.waitForTimeout(2000);
  const maxY = (await g(page, `(clearInterval(window.__iv), window.__maxY)`)) as number;
  expect(maxY - y0).toBeGreaterThan(0.5);
  await page.screenshot({ path: `${DIR}/02-a-pie.png` });
  expect(errors).toEqual([]);
});

test('barrios de día, al atardecer y de noche', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await arrancar(page);
  const ds = (await g(page, `__cr.world.districts.map(d => ({ id: d.id, x: d.center.x, z: d.center.z }))`)) as any[];
  for (const d of ds) {
    await g(page, irA(d.x, d.z) + `; __cr.clock.hour = 12`);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${DIR}/barrio-${d.id}.png` });
  }
  await g(page, `__cr.clock.hour = 19.4`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${DIR}/atardecer.png` });
  await g(page, `__cr.clock.hour = 23`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${DIR}/noche.png` });
  expect(errors).toEqual([]);
});

test('subir a la furgoneta y conducir 10 segundos', async ({ page }) => {
  test.skip(FASE < 2, 'los vehículos llegan en la fase 2');
  const errors = await arrancar(page);
  await g(page, `(() => { const v = __cr.mod.vehicles.list.find(v => v.spec.kind === 'van'); const d = __cr.mod.vehicles.doorPoint(v, new THREE.Vector3()); d.y = __cr.world.heightAt(d.x, d.z); __cr.mod.player.teleport(d); })()`);
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyF');
  // con SwiftShader va a pocos fps: se espera a que se siente (máx. 20 s)
  await page.waitForFunction(() => (window as any).__cr.mod.player.state === 'vehicle', null, { timeout: 20_000 });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(10000);
  const speed = (await g(page, `__cr.hud.vehicle ? __cr.hud.vehicle.speedKmh : 0`)) as number;
  const moved = (await g(page, `__cr.mod.vehicles.current.getPosition(new THREE.Vector3()).distanceTo(__cr.world.playerSpawn.pos)`)) as number;
  await page.screenshot({ path: `${DIR}/03-conduciendo.png` });
  await page.keyboard.up('KeyW');
  expect(Math.max(speed, moved)).toBeGreaterThan(5);
  expect(errors).toEqual([]);
});

test('disparar', async ({ page }) => {
  test.skip(FASE < 3, 'las armas llegan en la fase 3');
  const errors = await arrancar(page);
  await g(page, `__cr.mod.combat.give('pistol', 60); __cr.mod.combat.select('pistol')`);
  await page.mouse.move(640, 360);
  await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(300);
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.up();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/05-apuntando.png` });
  await page.mouse.up({ button: 'right' });
  expect((await g(page, `__cr.mod.combat.ammo.pistol.clip`)) as number).toBeLessThan(12);
  // tiroteo con la banda
  await g(page, `__cr.mod.gang.ambush(__cr.mod.player.position.clone().add(new THREE.Vector3(0,0,-16)), 3)`);
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${DIR}/06-tiroteo.png` });
  expect(errors).toEqual([]);
});

test('abrir el móvil y aceptar un encargo', async ({ page }) => {
  test.skip(FASE < 4, 'los encargos llegan en la fase 4');
  const errors = await arrancar(page);
  await g(page, `__cr.mod.jobs.createOffer()`);
  await page.waitForTimeout(500);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${DIR}/04-movil.png` });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  const active = await g(page, `__cr.mod.jobs.active.length`);
  await page.keyboard.press('Tab');
  expect(active).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('fps con ?debug=1', async ({ page }) => {
  const errors = await arrancar(page);
  await page.waitForTimeout(4000);
  const fps = (await g(page, `__cr.fps`)) as number;
  writeFileSync(`${DIR}/fps-swiftshader.txt`, `${fps.toFixed(1)} fps (SwiftShader, por software)\n`);
  expect(fps).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});
