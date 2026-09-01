import { expect, test } from '@playwright/test';

function titleCaseMethod(method) {
  return method.charAt(0).toUpperCase() + method.slice(1);
}

test.describe('item-specific branding methods', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto('/#build');
    await expect(page.locator('#v-build')).toHaveClass(/on/);
    await expect(page.locator('#buildMaterialOut')).toBeVisible();
  });

  test('keeps every catalog method in sync while switching items and fulfillment', async ({ page }) => {
    const catalog = await page.evaluate(() =>
      Object.keys(ITEMS).map((key) => ({
        key,
        method: BRANDING_METHODS[key],
      })),
    );
    expect(catalog.length).toBeGreaterThan(0);
    expect(catalog.every((item) => item.method)).toBe(true);

    const itemButtons = page.locator('#itemPick button');
    await expect(itemButtons).toHaveCount(catalog.length);

    for (const [index, item] of catalog.entries()) {
      await itemButtons.nth(index).click();
      await expect(page.locator('#buildMaterialOut')).toHaveText(
        new RegExp(`${titleCaseMethod(item.method)} for you to apply`, 'i'),
      );
    }

    await itemButtons.filter({ hasText: 'Quencher' }).click();
    await page.getByRole('button', { name: /BrandMyItem applied/i }).click();
    await expect(page.locator('#buildFulfillmentOut')).toHaveText(
      'BrandMyItem applies branding',
    );
    await expect(page.locator('#buildMaterialOut')).toHaveText(
      'Laser-engraved logo applied by BrandMyItem',
    );
    await expect(page.locator('#buildFeeOut')).toHaveText('30%');

    await itemButtons.filter({ hasText: 'Search Backpack' }).click();
    await expect(page.locator('#buildMaterialOut')).toHaveText(
      'Embroidered patch applied by BrandMyItem',
    );
    await page.getByRole('button', { name: /You apply it/i }).click();
    await expect(page.locator('#buildMaterialOut')).toHaveText(
      'Embroidered patch for you to apply',
    );
    await expect(page.locator('#buildFeeOut')).toHaveText('20%');
  });

  test('shows the method in campaign details and open spot details', async ({ page }) => {
    await page.goto('/#dashboard');
    await expect(page.locator('#dashGrid .lcard').first()).toBeVisible();
    const listing = await page.evaluate(() => {
      const item = DB.listings.find((candidate) => ITEMS[candidate.type]);
      return { id: item.id, method: BRANDING_METHODS[item.type] };
    });

    await page.locator(`#dashGrid .lcard[data-listing-id="${listing.id}"]`).click();
    await expect(page.locator('#campaignDetailsBg')).toHaveClass(/on/);
    await expect(page.locator('#campaignDetails')).toContainText(
      titleCaseMethod(listing.method),
    );
    await page.getByRole('button', { name: /View full listing/i }).click();
    await expect(page.locator('#v-item')).toHaveClass(/on/);
    await page.evaluate(() => {
      const index = CUR.claims.findIndex((claim) => !claim);
      openBid(index);
    });
    await expect(page.locator('#mStep1')).toBeVisible();
    await expect(page.locator('#mSlotInfo')).toContainText(
      `Branding method: ${listing.method}`,
    );
  });

  test('keeps every sponsor spot action bound to its placement and checkout price', async ({ page }) => {
    await page.goto('/#item/demo1');
    await expect(page.locator('#v-item')).toHaveClass(/on/);
    await expect(page.locator('#iSpotList')).toBeVisible();

    const listing = await page.evaluate(() => {
      const item = DB.listings.find((candidate) => candidate.id === 'demo1');
      return {
          spotCount: item.prices.length,
        openSpots: item.prices
          .map((price, index) => ({ price, index }))
          .filter(({ index }) => !item.claims[index])
          .map(({ price, index }) => {
            const fee = feeFor(item, price);
            const meta = slotMeta(item.type, item.slots, index);
            return {
              index,
              placement: `${meta.pos} · ${meta.size}`,
              price: money(price),
              fee: money(fee),
              total: money(price + fee),
            };
          }),
        claimedCount: item.claims.filter(Boolean).length,
      };
    });

    expect(listing.openSpots.length).toBeGreaterThanOrEqual(2);
    expect(listing.claimedCount).toBeGreaterThan(0);

    const rows = page.locator('#iSpotList .ap-spot-option');
    await expect(rows).toHaveCount(listing.spotCount);
    for (let index = 0; index < listing.spotCount; index += 1) {
      const expected = await page.evaluate((spotIndex) => {
        const item = DB.listings.find((candidate) => candidate.id === 'demo1');
        const price = item.prices[spotIndex];
        const meta = slotMeta(item.type, item.slots, spotIndex);
        return {
          index: spotIndex,
          placement: `${meta.pos} · ${meta.size}`,
          price: money(price),
          claimed: Boolean(item.claims[spotIndex]),
        };
      }, index);
      const row = rows.nth(index);

      await expect(row).toContainText(`Spot ${expected.index + 1}`);
      await expect(row).toContainText(expected.placement);
      await expect(row).toContainText(expected.price);
      await expect(row.locator('.ap-spot-price span')).toHaveText(
        expected.claimed ? 'Claimed' : 'Buy',
      );

      if (expected.claimed) {
        await expect(row).toBeDisabled();
        await row.click({ force: true });
        await expect(page.locator('#modalBg')).not.toBeVisible();
        continue;
      }

      await expect(row).toBeEnabled();
      await expect(row).toHaveAttribute(
        'aria-label',
        `Buy Spot ${expected.index + 1} for ${expected.price}`,
      );
      await row.click();

      await expect(page.locator('#modalBg')).toBeVisible();
      await expect(page.locator('#mStep1')).toBeVisible();
      await expect(page.locator('#uplBox')).toContainText('Upload your logo');
      await expect(page.locator('#mSlotInfo')).toContainText(
        `${expected.placement} placement`,
      );
      await expect(page.locator('#mPrice')).toHaveText(expected.price);

      await page.locator('#mCancel').click();
      await expect(page.locator('#modalBg')).not.toBeVisible();
      await expect(row).toBeFocused();
    }

    const widths = await page.evaluate(() => ({
      viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
    }));
    expect(widths.documentWidth).toBeLessThanOrEqual(widths.viewport);
    expect(widths.bodyWidth).toBeLessThanOrEqual(widths.viewport);
  });
});
