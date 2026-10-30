import { chromium, expect } from '@playwright/test';
const browser = await chromium.launch({ executablePath: process.env.PARK_CHROMIUM_PATH });
for (const width of [390, 1440]) {
  const page = await browser.newPage({
    viewport: { width, height: width === 390 ? 844 : 900 },
    reducedMotion: 'no-preference',
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() =>
    localStorage.setItem(
      'park-account',
      JSON.stringify({ id: 'drop-off-motion', email: 'motion@park.test' }),
    ),
  );
  await page.route('**/api/**', (r) =>
    r.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
  );
  await page.goto('http://localhost:5173');
  const input = page.getByRole('textbox', { name: 'Idea to park' });
  const enter = async (text: string) => {
    await input.fill(text);
    await input.press('Enter');
    await expect(input).toHaveValue('');
  };
  await enter('Book the trail cabin');
  await enter('Sketch a little workshop');
  await enter('Call the garden centre');
  await enter('/set "Sketch a little workshop" size = big');
  await enter('Finish English outline tomorrow');
  await expect(page.locator('.journey')).toHaveCount(0);
  await page.mouse.click(width - 10, 130);
  const list = page.locator('.drop-off-todos');
  await expect(list.locator('.drop-off-todo')).toHaveCount(3);
  await expect(
    page.locator('.drop-off-plot .mini-world, .drop-off-plot .parking-grid'),
  ).toHaveCount(0);
  expect(await list.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
    'rgba(0, 0, 0, 0)',
  );
  await page.screenshot({ path: `docs/verification/drop-off-home-${width}.png` });
  // Hold the actual WAAPI departure to inspect its geometry and exercise interruption.
  await page.evaluate(() => {
    const animate = Element.prototype.animate;
    (window as any).departures = [];
    Element.prototype.animate = function (frames, options) {
      const animation = animate.call(this, frames, options);
      if (this.classList.contains('drive-off')) {
        animation.pause();
        (window as any).departure = animation;
        (window as any).departures.push({ frames, options });
      }
      return animation;
    };
  });
  const car = page.getByRole('button', { name: 'Complete Call the garden centre', exact: true });
  const before = await car.locator('svg').boundingBox();
  await car.click();
  await expect(list).not.toContainText('Call the garden centre');
  await expect(page.locator('.drive-off')).toHaveCount(1);
  const metrics = await page.evaluate(() => {
    const a = (window as any).departure as Animation;
    a.currentTime = 0;
    const bounds = document.querySelector('.drive-off svg')!.getBoundingClientRect();
    const keyframes = (a.effect as KeyframeEffect).getKeyframes();
    return {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      end: keyframes.at(-1)?.transform,
      duration: a.effect!.getTiming().duration,
    };
  });
  expect(metrics.x).toBeCloseTo(before!.x, 0);
  expect(metrics.y).toBeCloseTo(before!.y, 0);
  expect(metrics.width).toBeCloseTo(before!.width, 0);
  expect(metrics.end).toMatch(/translateX\(-/);
  expect(metrics.duration).toBe(280);
  await page.screenshot({ path: `docs/verification/drop-off-departure-start-${width}.png` });
  await page.evaluate(() => ((window as any).departure.currentTime = 35));
  await page.screenshot({ path: `docs/verification/drop-off-departure-left-${width}.png` });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(list).toContainText('Call the garden centre');
  await expect(page.locator('.drive-off')).toHaveCount(0);
  await car.click();
  await expect(page.locator('.drive-off')).toHaveCount(1);
  await page.locator('.map-scroll').evaluate((el) => {
    el.scrollTop = 30;
  });
  await expect(page.locator('.drive-off')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.locator('.map-scroll').evaluate((el) => {
    el.scrollTop = 0;
  });
  // One double event must produce one mutation/animation, not two undo records.
  const countBefore = await page.evaluate(() => (window as any).departures.length);
  await car.evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(page.locator('.drive-off')).toHaveCount(1);
  expect(await page.evaluate(() => (window as any).departures.length)).toBe(countBefore + 1);
  await page.setViewportSize({ width: width - 1, height: width === 390 ? 844 : 900 });
  await expect(page.locator('.drive-off')).toHaveCount(0);
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  await enter('/undo');
  await car.click();
  await expect(page.locator('.drive-off')).toHaveCount(1);
  await enter('/archive');
  await expect(page.locator('.drive-off')).toHaveCount(0);
  await enter('/undo');
  await enter('/lots');
  await car.click();
  await page.evaluate(() => (window as any).departure.play());
  await expect(page.locator('.drive-off')).toHaveCount(0);
  await page.reload();
  await expect(list).not.toContainText('Call the garden centre');
  await enter('/undo');
  await expect(list).toContainText('Call the garden centre');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await car.click();
  await expect(list).not.toContainText('Call the garden centre');
  await expect(page.locator('.drive-off')).toHaveCount(0);
  await enter('/undo');
  await enter('/set "Book the trail cabin" kind = idea');
  await page.getByRole('button', { name: 'Details for Book the trail cabin', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Idea details' })).toBeVisible();
  await expect(page.locator('.drive-off')).toHaveCount(0);
  expect(errors).toEqual([]);
  console.log(
    JSON.stringify({
      width,
      initialGeometry: metrics,
      leftExit: true,
      undo: true,
      scrollCancels: true,
      resizeCancels: true,
      navigationCancels: true,
      duplicateGuard: true,
      persisted: true,
      reducedMotion: true,
      ideasOpenDetails: true,
      errors,
    }),
  );
  await page.close();
}
await browser.close();
