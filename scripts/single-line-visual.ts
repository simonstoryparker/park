import { chromium, expect } from '@playwright/test';
const browser = await chromium.launch({ executablePath: process.env.PARK_CHROMIUM_PATH });
for (const width of [1440, 768, 390, 320]) {
  const page = await browser.newPage({
    viewport: { width, height: width < 600 ? 844 : 900 },
    reducedMotion: 'reduce',
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() =>
    localStorage.setItem(
      'park-account',
      JSON.stringify({ id: 'single-line-visual', email: 'visual@park.test' }),
    ),
  );
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
  );
  await page.goto('http://localhost:5173');
  const input = page.getByRole('textbox', { name: 'Idea to park' });
  await expect(input).toBeVisible();
  await page.screenshot({ path: `docs/verification/single-line-empty-${width}.png` });
  const enter = async (value: string) => {
    await input.fill(value);
    await input.press('Enter');
    await expect(input).toHaveValue('');
  };
  await enter('/lot Reading max 5');
  for (const value of [
    'Sketch the little workshop',
    'Try the coastal trail',
    'A better way to save ideas',
    'English outline tomorrow',
    'Read a novel next week',
  ])
    await enter(value);
  await enter('/set "Sketch the little workshop" size = big');
  await input.fill('');
  await page.screenshot({ path: `docs/verification/single-line-populated-${width}.png` });
  await input.fill('/');
  await expect(page.locator('.command-help')).toBeVisible();
  await page.screenshot({ path: `docs/verification/single-line-help-${width}.png` });
  await input.fill('');
  for (let n = 0; n < 30; n++)
    await enter(`A long thought about the coast and the next small project to explore ${n}`);
  await expect(page.locator('.drop-off-todo')).toHaveCount(33);
  await page.locator('.map-scroll').evaluate((el) => (el.scrollTop = 900));
  await expect
    .poll(() =>
      page.locator('.toolbar button').evaluateAll((buttons) => {
        const visible = buttons.find((button) => {
          const rect = button.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
        if (!visible) return false;
        const rect = visible.getBoundingClientRect();
        return visible.contains(
          document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
        );
      }),
    )
    .toBe(true);
  await page.screenshot({ path: `docs/verification/single-line-many-${width}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(errors).toEqual([]);
  console.log(JSON.stringify({ width, dropOffRows: 33, overflow: false, pageErrors: errors }));
  await page.close();
}
await browser.close();
