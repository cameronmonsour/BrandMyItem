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
    await page.getByRole('button', { name: /IRLi applied/i }).click();
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
    await expect(page.locator(`#dashGrid .lcard[data-listing-id="${listing.id}"]`)).toContainText(
      listing.method,
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
});