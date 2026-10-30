import { test, expect } from '@playwright/test';

test('Pages captures, persists, exports/imports and reopens offline without an API', async ({
  page,
  context,
}, testInfo) => {
  const apiRequests: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.includes('/api/')) apiRequests.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await expect(
    page.getByRole('link', { name: 'Sign in with Google', exact: true }),
  ).toHaveAttribute('href', 'https://park.simonstoryparker.workers.dev/');
  await expect(page.getByText('No sign-in or cloud sync.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Open my park', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Idea to park' });
  await input.fill('English outline tomorrow');
  await input.press('Enter');
  await expect(input).toHaveValue('');
  await input.fill('A quiet afternoon');
  await input.press('Enter');
  await expect(input).toHaveValue('');
  await expect(
    page.getByRole('button', { name: 'Drop-off zone, 1 car, expand', exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-world-lot^="date-"] .lot-meta')).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Drop-off zone, 1 car, expand', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('park.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await input.fill('/settings');
  await input.press('Enter');
  await expect(
    page.getByRole('link', { name: 'Sign in with Google', exact: true }),
  ).toHaveAttribute('href', 'https://park.simonstoryparker.workers.dev/');
  await expect(page.getByRole('button', { name: 'Sync now', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toHaveCount(0);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup and pending work', exact: true }).click();
  const download = await downloadPromise;
  const backupPath = testInfo.outputPath('backup.json');
  await download.saveAs(backupPath);

  // A fresh browser storage partition restores the same park from its JSON backup.
  const fresh = await context.browser()!.newContext({ viewport: { width: 390, height: 844 } });
  const restored = await fresh.newPage();
  await restored.goto('http://127.0.0.1:4173/park/');
  await restored.getByRole('button', { name: 'Open my park', exact: true }).click();
  await restored.getByRole('button', { name: 'Open navigation' }).click();
  await restored.getByRole('button', { name: 'Settings', exact: true }).click();
  await restored.locator('input[type="file"]').setInputFiles(backupPath);
  await restored.getByRole('button', { name: 'Confirm merge', exact: true }).click();
  await expect(restored.getByRole('status')).toContainText('Backup imported');
  await restored.reload();
  await expect(
    restored.getByRole('button', { name: 'Drop-off zone, 1 car, expand', exact: true }),
  ).toBeVisible();
  await fresh.close();

  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(input).toBeVisible();
  await input.fill('Offline thought');
  await input.press('Enter');
  await expect(input).toHaveValue('');
  await expect(
    page.getByRole('button', { name: 'Drop-off zone, 2 cars, expand', exact: true }),
  ).toBeVisible();
  expect(apiRequests).toEqual([]);
  expect(errors).toEqual([]);
});
