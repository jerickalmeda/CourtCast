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

test('clock correction pauses play and applies an exact game time', async ({ page }) => {
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: 'Menu (M)' }).click();
  await page.getByRole('button', { name: 'Correct Clocks' }).click();
  expect(await page.evaluate(() => [state.running, gameTimer.running, shotTimer.running])).toEqual([false, false, false]);
  const shotBefore = await page.evaluate(() => shotTimer.getRemaining());
  await page.getByLabel('Game clock (mm:ss.t)').fill('02:03.4');
  await page.getByRole('button', { name: 'Apply game clock' }).click();
  expect(await page.evaluate(() => [gameTimer.getRemaining(), shotTimer.getRemaining()])).toEqual([123400, shotBefore]);
  await expect(page.locator('#game-clock')).toHaveText('02:03');
  await expect(page.locator('#game-log')).toContainText('Game clock corrected');
});

test('clock correction validates drafts, steps within limits, and discards unapplied changes', async ({ page }) => {
  await page.getByRole('button', { name: 'Menu (M)' }).click();
  await page.getByRole('button', { name: 'Correct Clocks' }).click();
  const gameInput = page.getByLabel('Game clock (mm:ss.t)');
  const shotInput = page.getByLabel('Shot clock (seconds.tenths)');
  const original = await page.evaluate(() => [gameTimer.getRemaining(), shotTimer.getRemaining(), state.gameLog.length]);
  for (const value of ['00:00.0', '01:60.0', '100:00.0', 'bad']) {
    await gameInput.fill(value);
    await page.getByRole('button', { name: 'Apply game clock' }).click();
    expect(await gameInput.evaluate((input) => input.validity.valid)).toBe(false);
  }
  for (const value of ['0.0', '100.0', '-1', 'bad']) {
    await shotInput.fill(value);
    await page.getByRole('button', { name: 'Apply shot clock' }).click();
    expect(await shotInput.evaluate((input) => input.validity.valid)).toBe(false);
  }
  await gameInput.fill('99:59.9');
  await page.getByRole('button', { name: 'Increase game clock by 1 second' }).click();
  await expect(gameInput).toHaveValue('99:59.9');
  await shotInput.fill('0.1');
  await page.getByRole('button', { name: 'Decrease shot clock by 1 second' }).click();
  await expect(shotInput).toHaveValue('0.1');
  await page.getByRole('button', { name: 'Increase shot clock by 0.1 second' }).click();
  await expect(shotInput).toHaveValue('0.2');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => [gameTimer.getRemaining(), shotTimer.getRemaining(), state.gameLog.length])).toEqual(original);
});

test('game clock correction synchronizes and survives reload', async ({ page, context }) => {
  const display = await context.newPage();
  await display.goto('/?mode=display');
  await page.getByRole('button', { name: 'Menu (M)' }).click();
  await page.getByRole('button', { name: 'Correct Clocks' }).click();
  await page.getByLabel('Game clock (mm:ss.t)').fill('00:23.4');
  await page.getByRole('button', { name: 'Increase game clock by 0.1 second' }).click();
  await page.getByRole('button', { name: 'Apply game clock' }).click();
  await expect.poll(() => display.evaluate(() => gameTimer.getRemaining())).toBe(23500);
  await expect(display.locator('#game-clock')).toHaveText('00:23.5');
  await page.reload();
  expect(await page.evaluate(() => [state.running, gameTimer.getRemaining()])).toEqual([false, 23500]);
});

test('clock correction keeps keyboard focus inside the dialog', async ({ page }) => {
  await page.getByRole('button', { name: 'Menu (M)' }).click();
  await page.getByRole('button', { name: 'Correct Clocks' }).click();
  const closeIcon = page.getByRole('button', { name: 'Close clock correction' });
  const closeButton = page.locator('#clock-correction').getByRole('button', { name: 'Close', exact: true });
  await closeIcon.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(closeButton).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(closeIcon).toBeFocused();
});

test('clock correction keeps the shot clock off and avoids accidental hotkeys', async ({ page }) => {
  await page.evaluate(() => {
    state.shotClockAutoOff = true;
    gameTimer.reset(15000);
    shotTimer.reset(5000);
    window.testBuzzerCount = 0;
    playBuzzer = () => { window.testBuzzerCount++; };
  });
  await page.getByRole('button', { name: 'Menu (M)' }).click();
  await page.getByRole('button', { name: 'Correct Clocks' }).click();
  await page.getByLabel('Game clock (mm:ss.t)').fill('00:20.0');
  await expect(page.locator('#game-clock-correction-current')).toHaveText('Current: 00:15.0');
  await page.getByRole('button', { name: 'Apply game clock' }).click();
  await expect(page.locator('#game-clock-correction-current')).toHaveText('Current: 00:20.0');
  await page.keyboard.press('h');
  expect(await page.evaluate(() => [state.shotClockAutoOff, shotTimer.getRemaining(), state.homeScore, window.testBuzzerCount])).toEqual([true, 5000, 0, 0]);
  await page.getByRole('button', { name: 'Close', exact: true }).last().click();
  await page.getByRole('button', { name: 'Close (M)' }).click();
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => [state.running, gameTimer.running, shotTimer.running])).toEqual([true, true, false]);
});

test('shot correction overrides auto-off and synchronizes across display and reload', async ({ page, context }) => {
  const display = await context.newPage();
  await display.goto('/?mode=display');
  await page.evaluate(() => {
    gameTimer.reset(15000);
    state.shotClockAutoOff = true;
    shotTimer.reset(0);
    persistRuntimeState();
  });
  await expect.poll(() => display.evaluate(() => state.shotClockAutoOff)).toBe(true);
  await page.getByRole('button', { name: 'Menu (M)' }).click();
  await page.getByRole('button', { name: 'Correct Clocks' }).click();
  await expect(page.locator('#shot-clock-correction-state')).toContainText('Off');
  await page.getByLabel('Shot clock (seconds.tenths)').fill('12.3');
  await page.getByRole('button', { name: 'Apply shot clock' }).click();
  expect(await page.evaluate(() => [state.shotClockAutoOff, gameTimer.getRemaining(), shotTimer.getRemaining()])).toEqual([false, 15000, 12300]);
  await expect.poll(() => display.evaluate(() => [state.shotClockAutoOff, shotTimer.getRemaining()])).toEqual([false, 12300]);
  await expect(display.locator('#shot-clock')).toBeVisible();
  await page.reload();
  expect(await page.evaluate(() => [state.running, state.shotClockAutoOff, shotTimer.getRemaining()])).toEqual([false, false, 12300]);
});

test('period-end correction can be canceled without advancing', async ({ page }) => {
  await page.evaluate(() => {
    gameTimer.reset(0);
    showAutoAdvanceOverlay();
    window.testBuzzerCount = 0;
    playBuzzer = () => { window.testBuzzerCount++; };
  });
  await page.locator('#auto-advance-overlay').getByRole('button', { name: 'Correct Clocks' }).click();
  await page.getByLabel('Game clock (mm:ss.t)').fill('00:10.0');
  await page.keyboard.press('Escape');
  await expect(page.locator('#auto-advance-overlay')).toBeVisible();
  expect(await page.evaluate(() => [state.period, state.awaitingAdvance, gameTimer.getRemaining(), window.testBuzzerCount])).toEqual([1, true, 0, 0]);
});

test('period-end correction button supports Enter and Space without advancing', async ({ page }) => {
  await page.evaluate(() => {
    gameTimer.reset(0);
    showAutoAdvanceOverlay();
  });
  const correctionButton = page.locator('#auto-advance-overlay').getByRole('button', { name: 'Correct Clocks' });
  for (const key of ['Enter', 'Space']) {
    await correctionButton.focus();
    await page.keyboard.press(key);
    await expect(page.getByRole('dialog', { name: 'Correct Clocks' })).toBeVisible();
    expect(await page.evaluate(() => [state.period, state.awaitingAdvance])).toEqual([1, true]);
    await page.keyboard.press('Escape');
  }
});

test('period-end correction dismisses the overlay without advancing or restarting', async ({ page, context }) => {
  const display = await context.newPage();
  await display.goto('/?mode=display');
  await page.evaluate(() => {
    gameTimer.reset(0);
    shotTimer.reset(0);
    showAutoAdvanceOverlay();
  });
  await expect(display.locator('#auto-advance-overlay')).toBeVisible();
  await expect(display.locator('#auto-advance-overlay').getByRole('button', { name: 'Correct Clocks' })).toBeHidden();
  await page.locator('#auto-advance-overlay').getByRole('button', { name: 'Correct Clocks' }).click();
  await page.getByLabel('Game clock (mm:ss.t)').fill('00:10.2');
  await page.getByRole('button', { name: 'Apply game clock' }).click();
  await expect(page.locator('#auto-advance-overlay')).toBeHidden();
  await expect(display.locator('#auto-advance-overlay')).toBeHidden();
  expect(await page.evaluate(() => [state.period, state.running, state.awaitingAdvance, gameTimer.getRemaining(), shotTimer.getRemaining()])).toEqual([1, false, false, 10200, 0]);
  await page.getByRole('button', { name: 'Close', exact: true }).last().click();
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => [state.running, gameTimer.running, shotTimer.running])).toEqual([false, false, false]);
});

test('canceling a running clock correction leaves both clocks paused', async ({ page }) => {
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: 'Menu (M)' }).click();
  await page.getByRole('button', { name: 'Correct Clocks' }).click();
  const paused = await page.evaluate(() => [gameTimer.getRemaining(), shotTimer.getRemaining()]);
  await page.getByLabel('Game clock (mm:ss.t)').fill('00:01.0');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => [state.running, gameTimer.running, shotTimer.running])).toEqual([false, false, false]);
  expect(await page.evaluate(() => [gameTimer.getRemaining(), shotTimer.getRemaining()])).toEqual(paused);
  await page.reload();
  expect(await page.evaluate(() => [state.running, gameTimer.getRemaining(), shotTimer.getRemaining()])).toEqual([false, ...paused]);
});

test.describe('touch clock corrections', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test('supports touch controls without horizontal overflow', async ({ page }) => {
    await page.getByRole('button', { name: 'Menu (M)' }).tap();
    await page.getByRole('button', { name: 'Correct Clocks' }).tap();
    const dialog = page.getByRole('dialog', { name: 'Correct Clocks' });
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.getByLabel('Shot clock (seconds.tenths)').fill('10.0');
    await page.getByRole('button', { name: 'Increase shot clock by 0.1 second' }).tap();
    await page.getByRole('button', { name: 'Apply shot clock' }).tap();
    expect(await page.evaluate(() => shotTimer.getRemaining())).toBe(10100);
  });
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

test('away logo appears after applying and synchronizes to the display', async ({ page, context }) => {
  const display = await context.newPage();
  await display.goto('/?mode=display');
  await page.getByRole('button', { name: 'Menu (M)' }).click();
  await page.locator('#input-away-logo').setInputFiles({
    name: 'away.svg', mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="red"/></svg>'),
  });
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.locator('#away-logo')).toBeVisible();
  await expect(display.locator('#away-logo')).toBeVisible();
  await expect.poll(() => display.locator('#away-logo').evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
  await page.reload();
  await display.reload();
  await expect(page.locator('#away-logo')).toBeVisible();
  await expect(display.locator('#away-logo')).toBeVisible();
  await expect.poll(() => page.locator('#away-logo').evaluate((image) => image.naturalWidth)).toBe(120);
  await expect.poll(() => display.locator('#away-logo').evaluate((image) => image.naturalWidth)).toBe(120);
});

test('resized team logo keeps its visual size after reload', async ({ page }) => {
  await page.getByRole('button', { name: 'Menu (M)' }).click();
  await page.locator('#input-away-logo').setInputFiles({
    name: 'away.svg', mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="red"/></svg>'),
  });
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.locator('#away-logo')).toBeVisible();
  await page.keyboard.press('s');
  await page.keyboard.press('e');
  const frame = page.locator('#away-logo-wrap .team-logo-frame');
  const before = await frame.boundingBox();
  const handle = await page.locator('#away-logo-wrap .resize-handle-nw').boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 - 60, handle.y + handle.height / 2 - 60);
  await page.mouse.up();
  const resized = await frame.boundingBox();
  expect(resized.width).toBeGreaterThan(before.width + 10);
  await page.keyboard.press('e');
  await page.reload();
  const restored = await frame.boundingBox();
  expect(restored.width).toBeCloseTo(resized.width, 0);
  expect(restored.height).toBeCloseTo(resized.height, 0);
});

test('invalid away logo preserves the previous image and reports the error', async ({ page }) => {
  await page.getByRole('button', { name: 'Menu (M)' }).click();
  const input = page.locator('#input-away-logo');
  await input.setInputFiles({
    name: 'away.svg', mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="red"/></svg>'),
  });
  await expect.poll(() => page.locator('#away-logo-preview').evaluate((image) => image.naturalWidth)).toBe(120);
  const previous = await page.locator('#away-logo-preview').getAttribute('src');
  await input.setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
  await expect(page.locator('#away-logo-status')).toContainText('Unable to load');
  await expect(page.locator('#away-logo-preview')).toHaveAttribute('src', previous);
  await input.setInputFiles({ name: 'broken.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg>') });
  await expect(page.locator('#away-logo-status')).toContainText('Unable to load');
  await expect(page.locator('#away-logo-preview')).toHaveAttribute('src', previous);
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.locator('#away-logo')).toHaveAttribute('src', previous);
});

test('newer away-logo selections and removal ignore stale image reads', async ({ page }) => {
  await page.evaluate(() => {
    window.pendingLogoReads = [];
    readImageForStorage = (file, onLoad) => window.pendingLogoReads.push({ name: file.name, onLoad });
  });
  await page.getByRole('button', { name: 'Menu (M)' }).click();
  const input = page.locator('#input-away-logo');
  await input.setInputFiles({ name: 'first.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('first') });
  await expect(page.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  await input.setInputFiles({ name: 'second.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('second') });
  await page.evaluate(() => {
    window.pendingLogoReads[1].onLoad('data:image/svg+xml,second');
    window.pendingLogoReads[0].onLoad('data:image/svg+xml,first');
  });
  await expect(page.locator('#away-logo-preview')).toHaveAttribute('src', 'data:image/svg+xml,second');
  await expect(page.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled();
  await input.setInputFiles({ name: 'third.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('third') });
  await page.locator('button[onclick="removeLogo(\'away\')"]').click();
  await page.evaluate(() => window.pendingLogoReads[2].onLoad('data:image/svg+xml,third'));
  await expect(page.locator('#away-logo-preview')).toBeHidden();
});

test('settings wait for a pending away-logo upload before applying', async ({ page, context }) => {
  const display = await context.newPage();
  await display.goto('/?mode=display');
  await page.evaluate(() => {
    readImageForStorage = (file, onLoad) => { window.completeLogoRead = onLoad; };
  });
  await page.getByRole('button', { name: 'Menu (M)' }).click();
  await page.locator('#input-away-logo').setInputFiles({ name: 'away.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('pending') });
  const apply = page.getByRole('button', { name: 'Apply', exact: true });
  await expect(apply).toBeDisabled();
  await page.evaluate(() => applySettings());
  await expect(page.locator('#modal')).toBeVisible();
  await page.evaluate(() => window.completeLogoRead(`data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="red"/></svg>')}`));
  await expect(apply).toBeEnabled();
  await apply.click();
  await expect(page.locator('#away-logo')).toBeVisible();
  await expect(display.locator('#away-logo')).toBeVisible();
  await expect.poll(() => display.locator('#away-logo').evaluate((image) => image.naturalWidth)).toBe(120);
});

test('both logos accept supported image formats and reach the display', async ({ page, context }) => {
  const display = await context.newPage();
  await display.goto('/?mode=display');
  await page.getByRole('button', { name: 'Menu (M)' }).click();
  for (const [extension, mimeType] of [['png', 'image/png'], ['jpg', 'image/jpeg'], ['webp', 'image/webp']]) {
    const dataUrl = await page.evaluate((type) => {
      const canvas = document.createElement('canvas');
      canvas.width = 120;
      canvas.height = 80;
      const context = canvas.getContext('2d');
      context.fillStyle = '#d83232';
      context.fillRect(0, 0, 120, 80);
      return canvas.toDataURL(type);
    }, mimeType);
    const buffer = Buffer.from(dataUrl.split(',')[1], 'base64');
    for (const team of ['home', 'away']) {
      await page.locator(`#input-${team}-logo`).setInputFiles({ name: `${team}.${extension}`, mimeType, buffer });
      await expect(page.locator(`#${team}-logo-status`)).toHaveText('Logo ready.');
      await expect.poll(() => page.locator(`#${team}-logo-preview`).evaluate((image) => image.naturalWidth)).toBe(120);
      await expect.poll(() => display.locator(`#${team}-logo`).evaluate((image) => image.naturalWidth)).toBe(120);
    }
  }
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.locator('#home-logo')).toBeVisible();
  await expect(page.locator('#away-logo')).toBeVisible();
  await expect(display.locator('#home-logo')).toBeVisible();
  await expect(display.locator('#away-logo')).toBeVisible();
});

test('both logo sizes persist, scale, and reset independently', async ({ page, context }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const display = await context.newPage();
  await display.setViewportSize({ width: 1280, height: 800 });
  await display.goto('/?mode=display');
  await page.getByRole('button', { name: 'Menu (M)' }).click();
  for (const [team, color] of [['home', '#1368b3'], ['away', '#dc3030']]) {
    await page.locator(`#input-${team}-logo`).setInputFiles({
      name: `${team}.svg`, mimeType: 'image/svg+xml',
      buffer: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="${color}"/></svg>`),
    });
    await expect(page.locator(`#${team}-logo-status`)).toHaveText('Logo ready.');
    await expect(display.locator(`#${team}-logo`)).toBeVisible();
  }
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('logos-before.png') });
  await page.keyboard.press('s');
  await page.keyboard.press('e');
  const resized = {};
  for (const [team, distance] of [['home', 35], ['away', 65]]) {
    const frame = page.locator(`#${team}-logo-wrap .team-logo-frame`);
    const before = await frame.boundingBox();
    const handle = await page.locator(`#${team}-logo-wrap .resize-handle-nw`).boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 - distance, handle.y + handle.height / 2 - distance);
    await page.mouse.up();
    resized[team] = await frame.boundingBox();
    expect(resized[team].width).toBeGreaterThan(before.width + 10);
  }
  expect(resized.away.width).toBeGreaterThan(resized.home.width + 10);
  await page.keyboard.press('e');
  for (const team of ['home', 'away']) {
    await expect.poll(async () => (await display.locator(`#${team}-logo-wrap .team-logo-frame`).boundingBox()).width).toBeCloseTo(resized[team].width, 0);
    const image = display.locator(`#${team}-logo`);
    expect(await image.evaluate((element) => [element.naturalWidth, element.naturalHeight, getComputedStyle(element).objectFit])).toEqual([120, 80, 'contain']);
    const imageBox = await image.boundingBox();
    expect(imageBox.width).toBeCloseTo(resized[team].width, 0);
  }
  await page.screenshot({ path: testInfo.outputPath('logos-resized.png') });
  await display.screenshot({ path: testInfo.outputPath('logos-display.png') });
  await page.reload();
  for (const team of ['home', 'away']) {
    expect((await page.locator(`#${team}-logo-wrap .team-logo-frame`).boundingBox()).width).toBeCloseTo(resized[team].width, 0);
  }
  await page.screenshot({ path: testInfo.outputPath('logos-reloaded.png') });
  await page.setViewportSize({ width: 900, height: 600 });
  for (const team of ['home', 'away']) {
    await expect.poll(async () => (await page.locator(`#${team}-logo-wrap .team-logo-frame`).boundingBox()).width).toBeCloseTo(resized[team].width * (900 / 1280), 0);
  }
  await page.screenshot({ path: testInfo.outputPath('logos-tablet.png') });
  await page.getByRole('button', { name: 'Menu (M)' }).click();
  await page.getByRole('button', { name: 'Reset Layout', exact: true }).click();
  for (const team of ['home', 'away']) {
    expect(await page.locator(`#${team}-logo-wrap .team-logo-frame`).evaluate((element) => [element.style.width, element.style.height])).toEqual(['', '']);
    await expect.poll(() => display.locator(`#${team}-logo-wrap .team-logo-frame`).evaluate((element) => [element.style.width, element.style.height])).toEqual(['', '']);
  }
});

test('Alt+wheel keeps resizing scores, names and clocks across repeated ticks', async ({ page }) => {
  await page.keyboard.press('e');
  for (const id of ['home-score', 'home-name', 'game-clock']) {
    const target = page.locator(`#${id}`);
    const start = await target.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const box = await target.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.down('Alt');
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, -100);
      await page.waitForTimeout(60);
    }
    await page.keyboard.up('Alt');
    const grown = await target.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(grown, id).toBeGreaterThanOrEqual(start + 12);
  }
  await page.keyboard.press('e');
  await page.reload();
  expect(await page.locator('#home-score').evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThan(185);
});

test('older saved layouts without logo dimensions remain compatible', async ({ page }) => {
  await page.keyboard.press('e');
  const handle = await page.locator('#away-logo-wrap .resize-handle-nw').boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 - 40, handle.y + handle.height / 2 - 40);
  await page.mouse.up();
  await page.keyboard.press('e');
  await page.evaluate(() => {
    const positions = JSON.parse(localStorage.getItem('cc_positions'));
    for (const team of ['home', 'away']) {
      delete positions[`${team}-logo-wrap`].logoWidth;
      delete positions[`${team}-logo-wrap`].logoHeight;
    }
    localStorage.setItem('cc_positions', JSON.stringify(positions));
  });
  await page.reload();
  await expect(page.locator('#scoreboard')).not.toHaveClass(/\bgrid\b/);
  for (const team of ['home', 'away']) {
    expect(await page.locator(`#${team}-logo-wrap .team-logo-frame`).evaluate((element) => [element.style.width, element.style.height])).toEqual(['', '']);
  }
});

test('opens directly from disk without a network connection', async ({ page }) => {
  await page.context().setOffline(true);
  await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
  await expect(page.locator('#game-clock')).toHaveText('10:00');
  await page.keyboard.press('h');
  await expect(page.locator('#home-score')).toHaveText('01');
  await page.getByRole('button', { name: 'Menu (M)' }).click();
  await page.locator('#input-away-logo').setInputFiles({
    name: 'away.svg', mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="red"/></svg>'),
  });
  await expect(page.locator('#away-logo-status')).toHaveText('Logo ready.');
  await page.getByRole('button', { name: 'Correct Clocks' }).click();
  await page.getByLabel('Game clock (mm:ss.t)').fill('00:30.0');
  await page.getByRole('button', { name: 'Apply game clock' }).click();
  expect(await page.evaluate(() => gameTimer.getRemaining())).toBe(30000);
  await expect(page.locator('#away-logo')).toBeVisible();
});