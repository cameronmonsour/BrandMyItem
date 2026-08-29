import { expect, test } from '@playwright/test';

const tracePoints = [
  [0.35, 0.35],
  [0.49, 0.28],
  [0.60, 0.59],
];

async function tapCanvasPoint(page, canvas, [x, y]) {
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
}

async function traceState(page) {
  return page.evaluate(() => ({
    tracing: CU.tracing,
    points: CU.poly.length,
    tiles: CU.tiles.length,
    closed: CU.closed,
  }));
}

test.describe('ad-zone tracing regression coverage', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto('/#build');
    await expect(page.locator('#v-build')).toHaveClass(/on/);
    await expect(page.locator('#buildSpecTable')).toBeVisible();

    const canvas = page.locator('#cuCanvas');
    await expect(canvas).toBeVisible();
    await expect.poll(() => canvas.evaluate((element) => element.width)).toBeGreaterThan(1);
    await canvas.scrollIntoViewIfNeeded();
  });

  test('keeps an open trace unfilled, handles recovery controls, and closes only on the first dot', async ({ page }) => {
    const canvas = page.locator('#cuCanvas');
    const traceButton = page.getByRole('button', { name: 'Trace a custom shape' });
    const undoButton = page.getByRole('button', { name: 'Undo the last traced point' });
    const cancelButton = page.getByRole('button', { name: 'Cancel the current trace' });
    const resetButton = page.getByRole('button', { name: 'Reset all placement zones' });
    const status = page.locator('#cuTraceStatus');
    const toast = page.locator('#toast');

    const specText = await page.locator('#buildSpecTable').innerText();
    expect(specText).toContain('Chip');
    expect(specText).not.toMatch(/ad\s*(?:surface|zone)|surface\s*size|placement\s*dimensions?|(?:width|height)\s*[:×x]/i);

    const initial = await traceState(page);
    expect(initial.tiles).toBeGreaterThan(0);

    await traceButton.click();
    await expect(status).toHaveText(/0 points.*first point/i);
    await expect(cancelButton).toBeEnabled();
    await expect(undoButton).toBeDisabled();

    for (const point of tracePoints) {
      await tapCanvasPoint(page, canvas, point);
    }
    await expect(status).toHaveText(/first dot to finish/i);
    await expect(undoButton).toBeEnabled();

    const openTrace = await traceState(page);
    expect(openTrace).toEqual({
      tracing: true,
      points: 3,
      tiles: initial.tiles,
      closed: initial.closed,
    });
    await expect(toast).not.toHaveClass(/on/);

    await undoButton.click();
    await expect(status).toHaveText(/2 points/);
    expect((await traceState(page)).points).toBe(2);

    await cancelButton.click();
    await expect(status).toBeHidden();
    await expect(cancelButton).toBeDisabled();
    await expect(undoButton).toBeDisabled();
    expect(await traceState(page)).toMatchObject({
      tracing: false,
      points: 0,
      tiles: initial.tiles,
    });

    await traceButton.click();
    for (const point of tracePoints) {
      await tapCanvasPoint(page, canvas, point);
    }
    await expect(status).toHaveText(/first dot to finish/i);
    expect((await traceState(page)).points).toBe(3);

    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(
      box.x + box.width * (tracePoints[0][0] + 0.08),
      box.y + box.height * tracePoints[0][1],
    );
    await expect(status).toHaveText(/first dot to finish/i);
    expect(await traceState(page)).toMatchObject({
      tracing: true,
      points: 4,
      tiles: initial.tiles,
    });

    await tapCanvasPoint(page, canvas, tracePoints[0]);
    await expect(toast).toHaveText(/Zone closed/i);
    await expect(status).toBeHidden();
    expect(await traceState(page)).toMatchObject({
      tracing: false,
      points: 0,
      closed: true,
    });

    await resetButton.click();
    await expect(toast).toHaveText(/Placement zones reset/i);
    expect(await traceState(page)).toMatchObject({
      tracing: false,
      points: 0,
      closed: true,
    });
    await expect(resetButton).toBeEnabled();
  });
});