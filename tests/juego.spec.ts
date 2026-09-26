// Pruebas del juego completo (apartado 14 del encargo).
// Chromium headless con WebGL por SwiftShader. Guarda capturas en capturas/fase-N/.
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const FASE = process.env.FASE || 'actual';
const DIR = `capturas/fase-${FASE}`;
mkdirSync(DIR, { recursive: true });

async function arrancar(page: Page, extra = '') {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`./?debug=1&prueba=1${extra}`);
  await page.waitForFunction(() => (window as any).__ready === true, null, { timeout: 90_000 });
  // unos frames para asentar
  await page.waitForTimeout(1500);
  return errors;
}

const g = (page: Page, js: string) => page.evaluate(js);

test('el juego carga sin errores y se ve la isla', async ({ page }) => {
  const errors = await arrancar(page);
  const info = await g(page, `({ w: !!__cr.world, pois: __cr.world.pois.length, spots: __cr.world.deliverySpots.length, frames: __cr.time.frame })`) as any;
  expect(info.w).toBe(true);
  expect(info.pois).toBeGreaterThan(10);
  expect(info.spots).toBeGreaterThan(20);
  await page.screenshot({ path: `${DIR}/01-inicio.png` });
  expect(errors).toEqual([]);
});

test('andar, saltar y no atravesar paredes', async ({ page }) => {
  const errors = await arrancar(page);
  const p0 = await g(page, `__cr.mod.player.position.clone()`) as any;
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2500);
  await page.keyboard.up('KeyW');
  const p1 = await g(page, `__cr.mod.player.position.clone()`) as any;
  const moved = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  expect(moved).toBeGreaterThan(1);
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  const y = await g(page, `__cr.mod.player.grounded`);
  expect(y).toBe(false);
  await page.screenshot({ path: `${DIR}/02-a-pie.png` });
  expect(errors).toEqual([]);
});

test('subir a la furgoneta y conducir 10 segundos', async ({ page }) => {
  const errors = await arrancar(page);
  // ponerse junto a la furgoneta
  await g(page, `(() => { const v = __cr.mod.vehicles.list.find(v => v.spec.kind === 'van'); const d = __cr.mod.vehicles.doorPoint(v, new THREE.Vector3()); d.y = __cr.world.heightAt(d.x, d.z); __cr.mod.player.teleport(d); })()`);
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(1200);
  expect(await g(page, `__cr.mod.player.state`)).toBe('vehicle');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(10000);
  const speed = await g(page, `__cr.hud.vehicle ? __cr.hud.vehicle.speedKmh : 0`) as number;
  await page.screenshot({ path: `${DIR}/03-conduciendo.png` });
  await page.keyboard.up('KeyW');
  expect(speed).toBeGreaterThan(5);
  expect(errors).toEqual([]);
});

test('abrir el móvil y aceptar un encargo', async ({ page }) => {
  const errors = await arrancar(page);
  await g(page, `__cr.mod.jobs && __cr.mod.jobs.createOffer()`);
  await page.waitForTimeout(500);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${DIR}/04-movil.png` });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  const active = await g(page, `__cr.mod.jobs ? __cr.mod.jobs.active.length : -1`);
  await page.keyboard.press('Tab');
  expect(active).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('disparar', async ({ page }) => {
  const errors = await arrancar(page);
  await g(page, `__cr.mod.combat && (__cr.mod.combat.give('pistol', 60), __cr.mod.combat.select('pistol'))`);
  await page.mouse.move(640, 360);
  await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(300);
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.up();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/05-apuntando.png` });
  await page.mouse.up({ button: 'right' });
  const clip = await g(page, `__cr.mod.combat ? __cr.mod.combat.ammo.pistol.clip : 12`) as number;
  expect(clip).toBeLessThan(12);
  expect(errors).toEqual([]);
});

test('capturas de los barrios, de día y de noche', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = await arrancar(page);
  const ds = await g(page, `__cr.world.districts.map(d => ({ id: d.id, x: d.center.x, z: d.center.z }))`) as any[];
  for (const d of ds) {
    await g(page, `(() => { const y = __cr.world.heightAt(${d.x}, ${d.z}); __cr.mod.player.teleport(new THREE.Vector3(${d.x}, y + 0.2, ${d.z})); __cr.clock.hour = 12; })()`);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${DIR}/barrio-${d.id}-dia.png` });
  }
  await g(page, `__cr.clock.hour = 23`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${DIR}/barrio-noche.png` });
  await g(page, `__cr.clock.hour = 19.4`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${DIR}/atardecer.png` });
  expect(errors).toEqual([]);
});
