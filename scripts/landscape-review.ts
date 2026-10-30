import { chromium, expect } from '@playwright/test';
const browser = await chromium.launch({ executablePath: process.env.PARK_CHROMIUM_PATH });
for (const width of [320, 390, 768, 1440]) {
  const page = await browser.newPage({
    viewport: { width, height: width < 700 ? 844 : 900 },
    reducedMotion: 'reduce',
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() =>
    localStorage.setItem(
      'park-account',
      JSON.stringify({ id: 'coastal-review', email: 'coast@park.test' }),
    ),
  );
  await page.route('**/api/**', (r) =>
    r.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
  );
  await page.goto('http://localhost:5173');
  const input = page.getByRole('textbox', { name: 'Idea to park' });
  const enter = async (value: string) => {
    await input.fill(value);
    await input.press('Enter');
    await expect(input).toHaveValue('');
  };
  for (const value of [
    'Call the garden centre',
    'Sketch the workshop',
    'Walk the coastal trail',
    '/set "Sketch the workshop" size = big',
    '/lot Reading max 8',
    'Read Dune in Reading',
    'Find a new author in Reading',
    'Start a book club in Reading',
    '/set "Start a book club in Reading" size = big',
    'English outline tomorrow',
    'Finish the sketch tomorrow',
    'Call Jamie tomorrow',
    'Design a cabin next week',
    'Plan the trail next week',
  ])
    await enter(value);
  await input.blur();
  await expect(page.locator('.filter-menu, .search-control, .finder')).toHaveCount(0);
  await expect(page.locator('.drop-off-heading p')).toHaveCount(0);
  await expect(page.locator('[data-scenery-building]')).not.toHaveCount(0);
  await expect(page.locator('.drop-off-todo')).toHaveCount(3);
  const path = await page.locator('[data-shore]').getAttribute('d');
  const viewportCheck = async () => {
    expect(
      await page.locator('.toolbar').evaluate((el) => getComputedStyle(el).backgroundColor),
    ).toBe('rgba(0, 0, 0, 0)');
    expect(await page.locator('.map-lots').evaluate((el) => getComputedStyle(el).clipPath)).toBe(
      'none',
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    await expect(page.locator('[data-shore]')).toHaveAttribute('d', path!);
    // All visual plot rectangles, including their leftmost border, must remain
    // right of the actual rendered shoreline at every sampled vertical point.
    const bad = await page.evaluate(() => {
      const shore = document.querySelector<SVGPathElement>('[data-shore]')!;
      const plots = [...document.querySelectorAll<HTMLElement>('[data-world-lot]')];
      return plots
        .filter((p) => {
          const left = p.offsetLeft,
            top = p.offsetTop,
            height = p.offsetHeight;
          for (let y = top; y <= top + height; y += 12) {
            let lo = 0,
              hi = shore.getTotalLength();
            for (let n = 0; n < 16; n++) {
              const mid = (lo + hi) / 2;
              if (shore.getPointAtLength(mid).y < y) lo = mid;
              else hi = mid;
            }
            if (left - 10 < shore.getPointAtLength((lo + hi) / 2).x + 10) return true;
          }
          return p.offsetLeft + p.offsetWidth > innerWidth - 15;
        })
        .map((p) => p.dataset.worldLot);
    });
    expect(bad).toEqual([]);
  };
  await viewportCheck();
  await page.screenshot({ path: `docs/verification/neighborhood-home-${width}.png` });
  await page.locator('.map-scroll').evaluate((el) => (el.scrollTop = 480));
  await viewportCheck();
  await page.screenshot({ path: `docs/verification/neighborhood-scrolled-${width}.png` });
  await page.locator('.map-scroll').evaluate((el) => (el.scrollTop = 0));
  // Large text changes measured bands; geometry must still keep full lots on land.
  await page.evaluate(() => (document.documentElement.style.fontSize = '32px'));
  await page
    .locator('.landscape')
    .evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
  await viewportCheck();
  await page.screenshot({ path: `docs/verification/neighborhood-large-text-${width}.png` });
  expect(errors).toEqual([]);
  console.log(
    JSON.stringify({
      width,
      fixedShore: true,
      transparentNav: true,
      allContentOnLand: true,
      largeText: true,
      errors,
    }),
  );
  await page.close();
}
await browser.close();
