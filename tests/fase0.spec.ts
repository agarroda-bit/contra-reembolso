import { test, expect } from '@playwright/test';

test('la página de prueba carga sin errores y el cubo cae', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('./');
  await page.waitForFunction(() => (window as any).__game?.frames > 60, null, { timeout: 60_000 });
  const g = await page.evaluate(() => (window as any).__game);
  expect(g.ready).toBe(true);
  expect(g.cubeY).toBeLessThan(3.9);
  await page.screenshot({ path: 'capturas/fase-0/cubo.png' });
  expect(errors).toEqual([]);
});
