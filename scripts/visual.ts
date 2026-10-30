import { chromium } from '@playwright/test';
const browser = await chromium.launch({ executablePath: process.env.PARK_CHROMIUM_PATH });
for (const [name, width, height] of [
  ['phone', 390, 844],
  ['desktop', 1440, 900],
] as const) {
  const page = await browser.newPage({ viewport: { width, height } });
  const client = crypto.randomUUID().replaceAll('-', '').slice(0, 8);
  const ip = `2001:db8:${client.slice(0, 4)}:${client.slice(4)}::1`;
  await page.route('**/api/auth/**', async (route) => {
    const headers = { ...route.request().headers(), 'CF-Connecting-IP': ip };
    if (route.request().url().endsWith('/google')) {
      const body = route.request().postDataJSON();
      body.devEmail = `visual-${crypto.randomUUID()}@park.test`;
      await route.continue({ headers, postData: JSON.stringify(body) });
    } else await route.continue({ headers });
  });
  await page.goto('http://localhost:5173');
  await page.getByRole('button', { name: 'Use local development account' }).click();
  await page.getByRole('textbox', { name: 'Idea to park' }).waitFor();
  await page.evaluate(async () => {
    const owner = JSON.parse(localStorage.getItem('park-account')!).id;
    const req = indexedDB.open(`park-v1-${owner}`);
    const db = await new Promise<IDBDatabase>(
      (resolve) => (req.onsuccess = () => resolve(req.result)),
    );
    const tx = db.transaction(['lots', 'ideas'], 'readwrite');
    const stamp = new Date().toISOString();
    const names = [
      'General',
      'Robotics',
      'December experiments',
      'Photography',
      'Reading',
      'Weekend projects',
    ];
    names.forEach((name, n) => {
      const id = n === 0 ? 'general' : `visual-${n}`;
      const capacity = [null, 6, 10, 6, 8, 6][n];
      tx.objectStore('lots').put({
        id,
        ownerId: owner,
        name,
        nameKey: name.toLowerCase(),
        startOn: n === 2 ? '2026-12-01' : null,
        endExclusive: null,
        capacity,
        capacityPolicy: 'soft',
        accent: 'blue',
        sortOrder: n,
        isArchived: false,
        endedPromptDismissedFor: null,
        createdAt: stamp,
        updatedAt: stamp,
        serverVersion: 0,
      });
      const titles = [
        'Build a swerve simulator',
        'Try a weekend trail',
        'Read about coastal birds',
        'Sketch the little workshop',
        'A better way to save ideas',
        'Learn something new',
      ];
      const count = [3, 4, 5, 2, 3, 2][n];
      for (let k = 0; k < count; k++)
        tx.objectStore('ideas').put({
          id: crypto.randomUUID(),
          ownerId: owner,
          originalText: titles[k],
          title: titles[k],
          notes: '',
          status: 'parked',
          kind: 'idea',
          vehicleSize: k === 0 && n % 2 ? 'truck' : 'compact',
          lotId: id,
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
    });
    await new Promise<void>((resolve) => (tx.oncomplete = () => resolve()));
    db.close();
  });
  await page.reload();
  await page.getByRole('heading', { name: 'Robotics', exact: true }).waitFor();
  await page.screenshot({ path: `docs/verification/${name}-populated.png`, fullPage: false });
  if (name === 'phone') {
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.screenshot({ path: 'docs/verification/phone-navigation.png' });
    await page.keyboard.press('Escape');
  }
  await page.locator('.map-scroll').evaluate((el) => (el.scrollTop = 830));
  await page.waitForTimeout(150);
  await page.screenshot({ path: `docs/verification/${name}-coast-scroll.png` });
  await page.locator('.map-scroll').evaluate((el) => (el.scrollTop = 0));
  if (name === 'desktop') {
    await page.getByRole('button', { name: /^December experiments, .*expand$/ }).click();
    await page.screenshot({ path: 'docs/verification/desktop-panel.png', fullPage: false });
  }
  await page.close();
}
await browser.close();
