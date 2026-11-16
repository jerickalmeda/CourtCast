const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('preserves paused clocks when applying unrelated settings', async ({ page }) => {
  await page.evaluate(() => {
    gameTimer.reset(123456);
    shotTimer.reset(12345);
  });
  await page.getByRole('button', { name: 'Menu (M)' }).click();
  await page.locator('#input-home-name').fill('Test Home');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();

  expect(await page.evaluate(() => [gameTimer.getRemaining(), shotTimer.getRemaining()])).toEqual([123456, 12345]);
  await expect(page.locator('#home-name')).toHaveText('TEST HOME');
});

test('applies new durations to untouched full clocks', async ({ page }) => {
  await page.getByRole('button', { name: 'Menu (M)' }).click();
  await page.locator('#input-period-duration').fill('12');
  await page.locator('#input-shot-full').fill('30');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();

  expect(await page.evaluate(() => [gameTimer.getRemaining(), shotTimer.getRemaining()])).toEqual([720000, 30000]);
});

test('changing durations does not reset clocks partway through a period', async ({ page }) => {
  await page.evaluate(() => {
    gameTimer.reset(123456);
    shotTimer.reset(12345);
  });
  await page.getByRole('button', { name: 'Menu (M)' }).click();
  await page.locator('#input-period-duration').fill('12');
  await page.locator('#input-shot-full').fill('30');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();

  expect(await page.evaluate(() => [gameTimer.getRemaining(), shotTimer.getRemaining()])).toEqual([123456, 12345]);
});

test('rejects invalid settings without applying other changes', async ({ page }) => {
  await page.getByRole('button', { name: 'Menu (M)' }).click();
  await page.locator('#input-home-name').fill('Changed');
  await page.locator('#input-periods').fill('11');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();

  await expect(page.locator('#modal')).toBeVisible();
  await expect(page.locator('#input-periods')).toBeFocused();
  expect(await page.evaluate(() => [state.config.homeName, state.config.periods])).toEqual(['HOME', 4]);
  expect(await page.locator('#input-periods').evaluate((input) => input.validity.valid)).toBe(false);

  await page.locator('#input-periods').fill('');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  expect(await page.locator('#input-periods').evaluate((input) => input.validity.valid)).toBe(false);
  await page.locator('#input-periods').fill('3');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  expect(await page.evaluate(() => [state.config.homeName, state.config.periods])).toEqual(['Changed', 3]);
});

test('keyboard controls score and pause the clocks', async ({ page }) => {
  await page.keyboard.press('h');
  await expect(page.locator('#home-score')).toHaveText('01');
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => gameTimer.getRemaining())).toBeLessThan(600000);
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => [state.running, gameTimer.running, shotTimer.running])).toEqual([false, false, false]);
});

test('restores a paused game after reload', async ({ page }) => {
  await page.keyboard.press('h');
  await page.evaluate(() => {
    gameTimer.reset(123456);
    shotTimer.reset(12345);
    persistRuntimeState();
  });
  await page.reload();

  await expect(page.locator('#home-score')).toHaveText('01');
  expect(await page.evaluate(() => [state.running, gameTimer.getRemaining(), shotTimer.getRemaining()])).toEqual([false, 123456, 12345]);
});

test('game reset requires confirmation', async ({ page }) => {
  await page.keyboard.press('h');
  await page.getByRole('button', { name: 'Menu (M)' }).click();
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Full Reset' }).click();
  expect(await page.evaluate(() => state.homeScore)).toBe(1);

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Full Reset' }).click();
  await expect(page.locator('#home-score')).toHaveText('00');
});

test('clearing the game log requires confirmation', async ({ page }) => {
  await page.keyboard.press('h');
  await page.getByRole('button', { name: 'Menu (M)' }).click();
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.locator('#game-log')).toContainText('score +1');

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.locator('#game-log')).not.toContainText('score +1');
  await expect(page.locator('#game-log')).toContainText('Game log cleared');
});

test('display follows score and clock changes from the control window', async ({ page, context }) => {
  const display = await context.newPage();
  await display.goto('/?mode=display');
  await page.keyboard.press('h');
  await expect(display.locator('#home-score')).toHaveText('01');
  await page.keyboard.press('Space');
  await expect.poll(() => display.evaluate(() => state.running)).toBe(true);
  await page.keyboard.press('Space');
  await expect.poll(() => display.evaluate(() => state.running)).toBe(false);
});

test('opens directly from disk without a network connection', async ({ page }) => {
  await page.context().setOffline(true);
  await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
  await expect(page.locator('#game-clock')).toHaveText('10:00');
  await page.keyboard.press('h');
  await expect(page.locator('#home-score')).toHaveText('01');
});