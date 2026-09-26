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
  // con SwiftShader va a pocos fps: se espera a que salga la bala (máx. 15 s)
  await page.waitForFunction(() => (window as any).__cr.mod.combat.ammo.pistol.clip < 12, null, { timeout: 15_000 });
  await page.screenshot({ path: `${DIR}/05-apuntando.png` });
  await page.mouse.up({ button: 'right' });
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

test('menú principal y creación del repartidor', async ({ page }) => {
  test.skip(FASE < 5, 'los menús llegan en la fase 5');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`./?calidad=baja&fase=${FASE}`);
  await page.waitForFunction(() => (window as any).__ready === true, null, { timeout: 120_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${DIR}/07-menu.png` });
  await page.getByText('Nueva partida').click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${DIR}/08-creacion.png` });
  await page.getByText('¡A repartir!').click();
  await page.waitForFunction(() => (window as any).__cr.mod.menus.mode === 'play', null, { timeout: 20_000 });
  expect(errors).toEqual([]);
});

test('tiendas: armería, ropa, taller y empresa', async ({ page }) => {
  test.skip(FASE < 5, 'las tiendas llegan en la fase 5');
  const errors = await arrancar(page);
  // desde la fase 6 la puerta de la oficina lleva al interior (el tablón está dentro)
  const shops = [['gunshop', '09-armeria'], ['clothes', '10-ropa'], ['garage', '11-taller']];
  if (FASE < 6) shops.push(['office', '12-empresa']);
  for (const [kind, file] of shops) {
    await g(page, `__cr.mod.player.teleport(__cr.world.pois.find(p => p.kind === '${kind}').door.clone())`);
    await page.waitForFunction(() => !!(window as any).__cr.mod.interaction.current, null, { timeout: 15_000 });
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => (window as any).__cr.mod.shopUI.isOpen, null, { timeout: 15_000 });
    await page.screenshot({ path: `${DIR}/${file}.png` });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !(window as any).__cr.mod.shopUI.isOpen, null, { timeout: 15_000 });
  }
  expect(errors).toEqual([]);
});

test('la vida de lujo: casino, club, hierbas y vehículo loco', async ({ page }) => {
  test.skip(FASE < 6, 'llega en la fase 6');
  test.setTimeout(240_000);
  const errors = await arrancar(page);
  await g(page, `__cr.mod.economy.cash = 90000`);
  // casino
  await g(page, `__cr.mod.player.teleport(__cr.world.pois.find(p => p.kind === 'casino').door.clone())`);
  await page.waitForFunction(() => !!(window as any).__cr.mod.interaction.current, null, { timeout: 15_000 });
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${DIR}/13-casino.png` });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !(window as any).__cr.paused, null, { timeout: 15_000 });
  // club VIP
  await g(page, `__cr.mod.player.teleport(__cr.world.pois.find(p => p.kind === 'club').door.clone())`);
  await page.waitForFunction(() => !!(window as any).__cr.mod.interaction.current, null, { timeout: 15_000 });
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => (window as any).__cr.mod.interiors.inside, null, { timeout: 30_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${DIR}/14-club.png` });
  await g(page, `__cr.mod.interiors.exit()`);
  await page.waitForFunction(() => !(window as any).__cr.mod.interiors.inside, null, { timeout: 30_000 });
  // hierbas
  await g(page, `__cr.mod.high.start(20)`);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${DIR}/15-hierbas.png` });
  await g(page, `__cr.mod.high.stop()`);
  // vehículo loco: el carrito del súper
  const n = await g(page, `__cr.mod.crazy.list.length`);
  expect(n).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('historia: el reloj de la señora Puri', async ({ page }) => {
  test.skip(FASE < 7, 'llega en la fase 7');
  test.setTimeout(240_000);
  const errors = await arrancar(page);
  await g(page, `__cr.mod.economy.fame = 5000; __cr.mod.story.start('reloj')`);
  await g(page, `__cr.mod.player.teleport(__cr.mod.story.active.ctx.data.shop.door.clone())`);
  await page.waitForFunction(() => /Recoger el reloj/.test((window as any).__cr.hud.hint ?? ''), null, { timeout: 20_000 });
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => (window as any).__cr.mod.story.active?.step === 1, null, { timeout: 20_000 });
  await page.screenshot({ path: `${DIR}/16-historia.png` });
  await g(page, `__cr.mod.player.teleport(__cr.mod.story.active.ctx.data.dest.door.clone())`);
  await page.waitForFunction(() => /Entregar el reloj/.test((window as any).__cr.hud.hint ?? ''), null, { timeout: 20_000 });
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => (window as any).__cr.mod.story.completed.has('reloj'), null, { timeout: 20_000 });
  await page.screenshot({ path: `${DIR}/17-mision-cumplida.png` });
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
