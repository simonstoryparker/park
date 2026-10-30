import { test, expect, type Page } from '@playwright/test';
async function signIn(page: Page) {
  // Each isolated browser context represents a separate client behind Cloudflare.
  const client = crypto.randomUUID().replaceAll('-', '').slice(0, 8);
  const ip = `2001:db8:${client.slice(0, 4)}:${client.slice(4)}::1`;
  await page.route('**/api/auth/**', async (route) => {
    const headers = { ...route.request().headers(), 'CF-Connecting-IP': ip };
    if (route.request().url().endsWith('/google')) {
      const b = route.request().postDataJSON();
      if (b.devEmail) b.devEmail = `browser-${crypto.randomUUID()}@park.test`;
      await route.continue({ headers, postData: JSON.stringify(b) });
    } else await route.continue({ headers });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Use local development account' }).click();
  await expect(page.getByRole('textbox', { name: 'Idea to park' })).toBeVisible();
}
async function capture(page: Page, text: string) {
  const input = page.getByRole('textbox', { name: 'Idea to park' });
  await input.fill(text);
  await input.press('Enter');
  await expect(input).toHaveValue('');
}
async function openLot(page: Page, name = 'Drop-off zone') {
  await page.getByRole('button', { name: new RegExp(`^${name}, .*expand$`) }).click();
}
test('one-line actions create, move, postpone, start, complete and restore without panels', async ({
  page,
}) => {
  await signIn(page);
  await capture(page, '/lot Books max 5');
  await capture(page, 'Read a novel');
  await expect(page.locator('.drop-off-todos')).toContainText('Read a novel');
  await capture(page, '/set "Read a novel" lot = Books');
  await expect(page.locator('.drop-off-todos')).not.toContainText('Read a novel');
  await capture(page, '/set "Read a novel" date = tomorrow');
  await capture(page, '/start "Read a novel"');
  await capture(page, '/complete "Read a novel"');
  await capture(page, '/archive');
  await expect(page.locator('.full-list')).toContainText('Read a novel');
  await capture(page, '/restore "Read a novel"');
  await expect(page.locator('.full-list')).not.toContainText('Read a novel');
  await expect(page.locator('.panel')).toHaveCount(0);
});
test('bad single-line actions preserve the draft and drop-off lists every item after reload', async ({
  page,
}) => {
  await signIn(page);
  for (let n = 0; n < 7; n++) await capture(page, `Drop-off thought ${n}`);
  await expect(page.locator('.drop-off-todo')).toHaveCount(7);
  const input = page.getByRole('textbox', { name: 'Idea to park' });
  await input.fill('/complete "Missing thought"');
  await input.press('Enter');
  await expect(input).toHaveValue('/complete "Missing thought"');
  await expect(page.locator('.feedback')).toContainText('Couldn’t find');
  await page.reload();
  await expect(input).toHaveValue('/complete "Missing thought"');
  await expect(page.locator('.drop-off-todo')).toHaveCount(7);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
test('command preferences, explicit drop-off routing, help and protected entry points', async ({
  page,
}) => {
  await signIn(page);
  const input = page.getByRole('textbox', { name: 'Idea to park' });
  await input.fill('/');
  await expect(page.locator('.command-help')).toBeVisible();
  await page.locator('.command-help').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(input).toHaveValue('');
  await capture(page, '/prefer reduced = on');
  await capture(page, '/prefer destination = "drop-off zone"');
  await capture(page, 'Stay here tomorrow');
  await expect(page.locator('.drop-off-todos')).toContainText('Stay here');
  await capture(page, '/set "Stay here" notes = A saved note');
  await capture(page, '/edit "Stay here"');
  await expect(page.getByRole('textbox', { name: 'Notes', exact: true })).toHaveValue(
    'A saved note',
  );
  await page.getByRole('button', { name: 'Close panel' }).click();
  const download = page.waitForEvent('download');
  await capture(page, '/export');
  expect((await download).suggestedFilename()).toContain('park');
  await capture(page, '/delete-account');
  await expect(page.getByRole('textbox', { name: 'Type DELETE' })).toBeVisible();
  await page.getByRole('button', { name: 'Close panel' }).click();
});
test('capture, refresh, edit task, complete and Undo', async ({ page }) => {
  await signIn(page);
  const text = `An idea ${Date.now()}`;
  await capture(page, text);
  await page.reload();
  await openLot(page);
  await page
    .getByRole('button', { name: text, exact: false })
    .filter({ has: page.locator('strong') })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'Idea details' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Kind', exact: true }).selectOption('task');
  await page.getByRole('button', { name: 'Save idea', exact: true }).click();
  await page.getByRole('button', { name: 'Close panel' }).click();
  if ((await page.getByRole('button', { name: `Complete ${text}`, exact: true }).count()) === 0)
    await openLot(page);
  await page
    .getByRole('button', { name: `Complete ${text}`, exact: true })
    .first()
    .click();
  await expect(page.getByRole('status')).toContainText('Completed');
  await page.getByRole('button', { name: 'Undo', exact: true }).last().click();
  await expect(page.getByRole('status')).toContainText('Undone');
});
test('strict lot retains blocked draft; size and capacity are visible', async ({ page }) => {
  await signIn(page);
  await page.keyboard.press('l');
  const name = `Side projects ${Date.now()}`;
  await page.getByLabel('Describe your new lot').fill(`${name} max 3`);
  await page.getByRole('button', { name: 'Edit details manually' }).click();
  await page.getByLabel('Strict capacity', { exact: false }).check();
  await page.getByRole('button', { name: 'Create lot', exact: true }).click();
  await page.getByRole('button', { name: 'Park here', exact: true }).click();
  await page.getByRole('button', { name: 'Compact', exact: true }).click();
  await capture(page, 'A big idea');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: new RegExp(`^${name}, .*expand$`) }).click();
  if (page.viewportSize()!.width < 1000)
    await page.getByRole('button', { name: 'Lot actions', exact: true }).click();
  await page.getByRole('button', { name: 'Park here', exact: true }).click();
  await page.getByRole('textbox', { name: 'Idea to park' }).fill('Another big idea');
  await page.getByRole('button', { name: 'Park idea', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Idea to park' })).toHaveValue('Another big idea');
  await expect(page.getByRole('status')).toContainText('strict lot');
});
test('offline capture and quota failure preserve text and navigation', async ({
  page,
  context,
}) => {
  await signIn(page);
  await page.route('**/api/**', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"error":"quota_exhausted"}',
    }),
  );
  await context.setOffline(true);
  await capture(page, 'Offline thought');
  await expect(page.getByRole('status')).toContainText('Parked in Drop-off zone');
  if (page.viewportSize()!.width < 1000)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('navigation', {
      name: page.viewportSize()!.width < 1000 ? 'Navigation' : 'Main navigation',
      exact: true,
    })
    .getByRole('button', { name: 'Drop-off zone', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Drop-off zone', exact: true })).toBeVisible();
  await context.setOffline(false);
});
test('screenshots: empty, full, overflow, 30 vehicles, long text, offline, reduced motion', async ({
  page,
}, info) => {
  await signIn(page);
  await page.screenshot({
    path: `docs/verification/${info.project.name}-empty.png`,
    fullPage: false,
  });
  await page.evaluate(async () => {
    const owner = JSON.parse(localStorage.getItem('park-account')!).id;
    const request = indexedDB.open(`park-v1-${owner}`);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction(['lots', 'ideas'], 'readwrite');
    const now = new Date().toISOString();
    const lot = {
      id: 'fixture',
      ownerId: owner,
      name: 'Peninsula experiments',
      nameKey: 'peninsula experiments',
      startOn: null,
      endExclusive: null,
      capacity: 3,
      capacityPolicy: 'soft',
      accent: 'blue',
      sortOrder: 1,
      isArchived: false,
      endedPromptDismissedFor: null,
      createdAt: now,
      updatedAt: now,
      serverVersion: 0,
    };
    transaction.objectStore('lots').put(lot);
    for (let n = 0; n < 32; n++)
      transaction.objectStore('ideas').put({
        id: crypto.randomUUID(),
        ownerId: owner,
        originalText: `Idea ${n}`,
        title:
          n === 0
            ? 'A very long idea about returning to the coast and making a little room for the thoughts that deserve another look'
            : 'Try a different approach ' + n,
        notes: '',
        lotId: 'fixture',
        kind: 'idea',
        vehicleSize: n % 3 === 0 ? 'truck' : 'compact',
        status: 'parked',
        revisitOn: null,
        datePrecision: null,
        dateLabel: null,
        createdAt: now,
        updatedAt: now,
        activatedAt: null,
        archivedAt: null,
        archiveReason: null,
        serverVersion: 0,
      });
    await new Promise<void>((resolve) => (transaction.oncomplete = () => resolve()));
    database.close();
  });
  await page.reload();
  await expect(page.getByText('Peninsula experiments', { exact: true }).first()).toBeVisible();
  await page.screenshot({
    path: `docs/verification/${info.project.name}-overflow-many.png`,
    fullPage: false,
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await capture(page, 'Reduced motion capture');
  await page.screenshot({
    path: `docs/verification/${info.project.name}-reduced.png`,
    fullPage: false,
  });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.screenshot({
    path: `docs/verification/${info.project.name}-320.png`,
    fullPage: false,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('chronological coast stays scrollable with 50 lots and 1,000 ideas', async ({ page }) => {
  await signIn(page);
  await page.evaluate(async () => {
    const owner = JSON.parse(localStorage.getItem('park-account')!).id;
    const request = indexedDB.open(`park-v1-${owner}`);
    const db = await new Promise<IDBDatabase>(
      (resolve) => (request.onsuccess = () => resolve(request.result)),
    );
    const tx = db.transaction(['lots', 'ideas'], 'readwrite');
    const stamp = new Date().toISOString();
    for (let n = 0; n < 50; n++) {
      const id = `coast-${n}`;
      tx.objectStore('lots').put({
        id,
        ownerId: owner,
        name: `Coastal lot ${n}`,
        nameKey: `coastal lot ${n}`,
        startOn: `2027-${String(1 + Math.floor(n / 28)).padStart(2, '0')}-${String((n % 28) + 1).padStart(2, '0')}`,
        endExclusive: null,
        capacity: null,
        capacityPolicy: 'soft',
        accent: 'blue',
        sortOrder: 50 - n,
        isArchived: false,
        endedPromptDismissedFor: null,
        createdAt: stamp,
        updatedAt: stamp,
        serverVersion: 0,
      });
      for (let k = 0; k < 20; k++)
        tx.objectStore('ideas').put({
          id: crypto.randomUUID(),
          ownerId: owner,
          originalText: `Thought ${n}-${k}`,
          title: `Thought ${n}-${k}`,
          notes: '',
          lotId: id,
          kind: 'idea',
          vehicleSize: k % 4 ? 'compact' : 'truck',
          status: 'parked',
          revisitOn: null,
          datePrecision: null,
          dateLabel: null,
          createdAt: stamp,
          updatedAt: stamp,
          activatedAt: null,
          archivedAt: null,
          archiveReason: null,
          serverVersion: 0,
        });
    }
    await new Promise<void>((resolve) => (tx.oncomplete = () => resolve()));
    db.close();
  });
  await page.reload();
  await expect(page.locator('[data-world-lot]')).toHaveCount(52);
  const y = await page
    .locator('[data-world-lot]')
    .evaluateAll((elements) =>
      Object.fromEntries(
        elements.map((e) => [(e as HTMLElement).dataset.worldLot, (e as HTMLElement).offsetTop]),
      ),
    );
  expect(y['coast-49']).toBeGreaterThan(y['coast-0']);
  await page.getByRole('button', { name: /^Coastal lot 49, .*expand$/ }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: /^Coastal lot 49, .*expand$/ })).toBeInViewport();
  const desktop = page.viewportSize()!.width >= 1000;
  expect(await page.locator('.map-scroll').evaluate((e) => e.scrollTop)).toBeGreaterThan(
    desktop ? 4500 : 12000,
  );
  expect(
    await page.locator('.world-art').evaluate((e) => e.getBoundingClientRect().height),
  ).toBeGreaterThan(desktop ? 5500 : 16000);
  await page.screenshot({ path: `docs/verification/coast-50-${page.viewportSize()!.width}.png` });
  if (page.viewportSize()!.width < 1000) {
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(page.getByRole('navigation', { name: 'Navigation', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('navigation', { name: 'Navigation', exact: true })).toBeHidden();
    await expect(
      page.getByRole('navigation', { name: 'Main navigation', exact: true }),
    ).toBeHidden();
  }
});

test('readable drop-off rows and matching car colors follow an active idea', async ({ page }) => {
  await signIn(page);
  await capture(page, 'Sketch a coastal garden');
  const car = page.locator('[data-world-lot="general"] [data-spot]').first();
  await car.scrollIntoViewIfNeeded();
  await expect(page.locator('.drop-off-todo .todo-title')).toHaveText('Sketch a coastal garden');
  await expect(page.locator('.drop-off-plot .mini-world')).toHaveCount(0);
  const color = await car.locator('svg path').nth(3).getAttribute('fill');
  await openLot(page);
  const item = page
    .locator('.panel .idea-row')
    .filter({ hasText: 'Sketch a coastal garden' })
    .first();
  await expect(item.locator('.vehicle path').nth(3)).toHaveAttribute('fill', color!);
  await item.getByRole('button', { name: 'Start', exact: true }).click();
  const close = page.getByRole('button', { name: 'Close panel' });
  if (await close.isVisible()) await close.click();
  const dropOff = page.getByRole('button', {
    name: 'Drop-off zone, 0 cars, expand',
    exact: true,
  });
  await dropOff.click();
  const activeItem = page
    .locator('.panel .idea-row')
    .filter({ hasText: 'Sketch a coastal garden' });
  await expect(activeItem.locator('.vehicle path').nth(3)).toHaveAttribute('fill', color!);
  await activeItem
    .getByRole('button')
    .filter({ has: page.locator('strong') })
    .click();
  await expect(page.getByRole('heading', { name: 'Idea details' })).toBeVisible();
});

test('the coast stays fixed and navigation stays transparent while scrolling', async ({ page }) => {
  await signIn(page);
  const shore = page.locator('[data-shore]');
  const path = await shore.getAttribute('d');
  await expect(page.getByRole('combobox', { name: 'Timing filter' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Search ideas and lots' })).toHaveCount(0);
  await expect(page.locator('.finder, .filter-menu, .search-control')).toHaveCount(0);
  const header = page.locator('.toolbar');
  const before = await header.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(before).toBe('rgba(0, 0, 0, 0)');
  for (const scroll of [120, 280, 600, 0]) {
    await page.locator('.map-scroll').evaluate((el, top) => (el.scrollTop = top), scroll);
    await expect(shore).toHaveAttribute('d', path!);
    expect(await header.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(before);
    expect(await page.locator('.map-lots').evaluate((el) => getComputedStyle(el).clipPath)).toBe(
      'none',
    );
    await expect(page.locator('.map-scrolled')).toHaveCount(0);
  }
});

test('create a lot from the typing bar and keep an unfinished idea', async ({ page }) => {
  await signIn(page);
  await page.getByRole('textbox', { name: 'Idea to park' }).fill('Keep this thought');
  await page.locator('.toolbar').getByRole('button', { name: '+ New lot', exact: true }).click();
  const description = page.getByRole('textbox', { name: 'Describe your new lot', exact: true });
  await expect(description).toBeFocused();
  await description.fill('Weekend projects for 2 weeks max 5');
  await expect(page.locator('.lot-capture-preview')).toContainText('5 spaces');
  await expect(page.locator('.panel')).toHaveCount(0);
  await page.locator('.capture-hint').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Idea to park' })).toHaveValue(
    'Keep this thought',
  );
  await page.locator('.toolbar').getByRole('button', { name: '+ New lot', exact: true }).click();
  await expect(description).toHaveValue('Weekend projects for 2 weeks max 5');
  await description.press('Enter');
  await expect(page.getByRole('status')).toContainText('Created Weekend projects');
  await expect(page.getByRole('combobox', { name: 'Destination lot' })).toHaveCount(0);
  await expect(page.locator('.capture-hint')).toContainText('Weekend projects');
  await expect(page.getByRole('textbox', { name: 'Idea to park' })).toHaveValue(
    'Keep this thought',
  );
  await expect(page.getByRole('textbox', { name: 'Idea to park' })).toBeFocused();
  await page.screenshot({ path: `/tmp/park-quick-lot-${page.viewportSize()!.width}.png` });
  await capture(page, 'First weekend thought');
  await expect(page.getByRole('status')).toContainText('Parked in Weekend projects');
});

test('infer the destination from an idea and show the dated demo lot', async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole('combobox', { name: 'Destination lot' })).toHaveCount(0);
  await expect(page.locator('[data-world-lot="after-break"]')).toContainText('After break');
  await expect(page.locator('[data-world-lot="after-break"]')).toContainText('Nov 10, 2026');
  await page.locator('.toolbar').getByRole('button', { name: '+ New lot' }).click();
  await page
    .getByRole('textbox', { name: 'Describe your new lot' })
    .fill('Garden starting November 20');
  await page.getByRole('button', { name: 'Create lot', exact: true }).click();
  await expect(page.locator('.capture-hint')).toContainText('Garden');
  const input = page.getByRole('textbox', { name: 'Idea to park' });
  await input.fill('Call the school after break');
  await expect(page.locator('.capture-hint')).toContainText('Garden');
  await input.press('Enter');
  await expect(page.getByRole('status')).toContainText('Parked in Garden');
  await input.fill('Plan the school after break');
  await expect(page.locator('.capture-hint')).toContainText('After break');
  await input.press('Enter');
  await expect(page.getByRole('status')).toContainText('Parked in After break');
  await input.fill('Plant bulbs on November 21');
  await expect(page.locator('.capture-hint')).toContainText('Nov 21');
  await input.press('Enter');
  await expect(page.getByRole('status')).toContainText('Nov 21');
  await page.screenshot({ path: `/tmp/park-inferred-${page.viewportSize()!.width}.png` });
});

test('natural capture creates and reuses tomorrow, defaults to drop-off, and preserves drafts', async ({
  page,
}) => {
  await signIn(page);
  const input = page.getByRole('textbox', { name: 'Idea to park' });
  await input.fill('English outline tomorrow');
  await expect(page.locator('.capture-hint')).toContainText('New lot');
  await input.press('Enter');
  await expect(input).toHaveValue('');
  const dated = page.locator('[data-world-lot^="date-day-"]');
  await expect(dated).toHaveCount(1);
  await expect(dated.locator('[data-spot]')).toHaveCount(1);
  await capture(page, 'Journal tomorrow');
  await expect(dated).toHaveCount(1);
  await expect(dated.locator('[data-spot]')).toHaveCount(2);
  await input.fill('Substack post');
  await expect(page.locator('.capture-hint')).toContainText('Drop-off zone');
  await input.press('Enter');
  await expect(input).toHaveValue('');
  await expect(page.locator('[data-world-lot="general"] [data-spot]')).toHaveCount(1);
  await input.fill('Keep this unfinished');
  await page.reload();
  await expect(input).toHaveValue('Keep this unfinished');
  await expect(dated.locator('[data-spot]')).toHaveCount(2);
  await input.fill('Read tomorrow');
  await page.getByRole('button', { name: 'Keep date in title', exact: true }).click();
  await expect(page.locator('.capture-hint')).toContainText('Drop-off zone');
  await input.press('Enter');
  await expect(input).toHaveValue('');
  await openLot(page);
  await expect(page.locator('.panel')).toContainText('Read tomorrow');
});
