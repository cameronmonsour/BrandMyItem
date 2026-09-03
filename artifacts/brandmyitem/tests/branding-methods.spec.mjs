import { expect, test } from '@playwright/test';

function titleCaseMethod(method) {
  return method.charAt(0).toUpperCase() + method.slice(1);
}

test.describe('item-specific branding methods', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('branding-methods-e2e-initialized')) {
        localStorage.clear();
        sessionStorage.clear();
        sessionStorage.setItem('branding-methods-e2e-initialized', 'true');
      }
    });
    await page.goto('/#build');
    await expect(page.locator('#v-build')).toHaveClass(/on/);
    await expect(page.locator('#buildMaterialOut')).toBeVisible();
  });

  test('keeps every catalog method BrandMyItem-applied while switching items', async ({ page }) => {
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
        new RegExp(`${titleCaseMethod(item.method)} applied by BrandMyItem`, 'i'),
      );
    }

    await itemButtons.filter({ hasText: 'Quencher' }).click();
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
    await expect(page.locator('#buildFeeOut')).toHaveText('30%');
    await expect(page.getByRole('button', { name: /You apply it/i })).toHaveCount(0);
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

  test('shows no-results guidance for an unknown Track order email', async ({ page }) => {
    await page.goto('/#track');
    await expect(page.locator('#v-track')).toHaveClass(/on/);
    await expect(page.locator('#tkResult')).toBeHidden();

    await page.locator('#tkMail').fill('unknown-sponsor@example.com');
    await page.locator('#tkBtn').click();

    await expect(page.locator('#tkErr')).toBeVisible();
    await expect(page.locator('#tkErr')).toHaveText('No items found for that email yet.');
    await expect(page.locator('#tkResult')).toBeHidden();
  });

  test('keeps a completed sponsor purchase trackable with case-insensitive email after reload', async ({ page }) => {
    await page.goto('/#item/demo1');
    await expect(page.locator('#v-item')).toHaveClass(/on/);
    await expect(page.locator('#iSpotList')).toBeVisible();

    const listing = await page.evaluate(() => {
      const item = DB.listings.find((candidate) => candidate.id === 'demo1');
      const openIndex = item.claims.findIndex((claim) => !claim);
      return {
        openIndex,
        price: money(item.prices[openIndex]),
        rawPrice: item.prices[openIndex],
        total: money(item.prices[openIndex] + feeFor(item, item.prices[openIndex])),
      };
    });
    expect(listing.openIndex).toBeGreaterThanOrEqual(0);

    const row = page.locator('#iSpotList .ap-spot-option').nth(listing.openIndex);
    await expect(row).toBeEnabled();
    await expect(row).toContainText(listing.price);
    await row.click();
    await expect(page.locator('#mStep1')).toBeVisible();
    await expect(page.locator('#uplBox')).toContainText('Upload your logo');
    await expect(page.locator('#mPrice')).toHaveText(listing.price);

    await page.locator('#uplInput').setInputFiles({
      name: 'fixture-logo.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"><rect width="80" height="80" rx="16" fill="#1d1d1f"/><path d="M20 40h40M40 20v40" stroke="#fff" stroke-width="8" stroke-linecap="round"/></svg>',
      ),
    });
    await expect(page.locator('#uplBox img[alt="logo"]')).toBeVisible();

    const brand = 'Fixture Sponsor';
    const email = 'fixture-sponsor@example.com';
    await page.locator('#mBrand').fill(brand);
    await page.locator('#mMail').fill(email);
    await page.locator('#mLink').fill('https://fixture-sponsor.example.com');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.locator('#mStep1')).toBeHidden();
    await expect(page.locator('#mStep3')).toBeVisible();
    await expect(page.locator('#mSubMail')).toHaveText(email);
    const submissionId = await page.locator('#mSubId').textContent();
    expect(submissionId).toMatch(/^BMI-[A-Z0-9]{6}$/);

    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.locator('#modalBg')).not.toBeVisible();
    await expect(row).toBeDisabled();
    await expect(row).toContainText(listing.price);
    await expect(row.locator('.ap-spot-price span')).toHaveText('Claimed');
    await expect(row).toHaveAttribute(
      'aria-label',
      `Spot ${listing.openIndex + 1} claimed by ${brand}`,
    );

    const completedClaim = await page.evaluate((spotIndex) => {
      const item = DB.listings.find((candidate) => candidate.id === 'demo1');
      const claim = item.claims[spotIndex];
      return {
        brand: claim.brand,
        mail: claim.mail,
        amount: claim.amt,
        price: item.prices[spotIndex],
        subId: claim.subId,
      };
    }, listing.openIndex);
    expect(completedClaim).toMatchObject({
      brand,
      mail: email,
      amount: listing.rawPrice,
      price: listing.rawPrice,
      subId: submissionId,
    });

    await page.reload();
    await expect(page.locator('#v-item')).toHaveClass(/on/);
    await expect(page.locator('#iSpotList')).toBeVisible();
    const reloadedRow = page.locator('#iSpotList .ap-spot-option').nth(listing.openIndex);
    await expect(reloadedRow).toBeDisabled();
    await expect(reloadedRow).toContainText(listing.price);
    await expect(reloadedRow.locator('.ap-spot-price span')).toHaveText('Claimed');
    await expect(reloadedRow).toHaveAttribute(
      'aria-label',
      `Spot ${listing.openIndex + 1} claimed by ${brand}`,
    );

    const reloadedClaim = await page.evaluate((spotIndex) => {
      const item = DB.listings.find((candidate) => candidate.id === 'demo1');
      const claim = item.claims[spotIndex];
      return { amount: claim.amt, price: item.prices[spotIndex], subId: claim.subId };
    }, listing.openIndex);
    expect(reloadedClaim).toEqual({
      amount: listing.rawPrice,
      price: listing.rawPrice,
      subId: submissionId,
    });

    const itemLabel = await page.evaluate(() => {
      const item = DB.listings.find((candidate) => candidate.id === 'demo1');
      return LBLL(item);
    });
    const verifyTrackedPurchase = async () => {
      await expect(page.locator('#v-track')).toHaveClass(/on/);
      await expect(page.locator('#tkResult')).toBeHidden();
      await page.locator('#tkMail').fill(email.toUpperCase());
      await page.locator('#tkBtn').click();

      const trackCard = page.locator('#tkResult .track-order');
      await expect(trackCard).toHaveCount(1);
      await expect(trackCard.locator('.track-order-title')).toHaveText(itemLabel);
      await expect(trackCard.locator('.track-order-meta')).toHaveText(
        `${brand} · ${submissionId}`,
      );
      await expect(trackCard).toContainText('Spot purchased');

      await trackCard.locator('.track-order-summary').click();
      await trackCard.getByText('Advanced details', { exact: true }).click();
      await expect(trackCard).toContainText(`Spot price ${listing.price}`);
      await expect(trackCard).toContainText(`Total charged ${listing.total}`);
      await expect(trackCard).toContainText(`Submission ID ${submissionId}`);
    };

    await page.goto('/#track');
    await verifyTrackedPurchase();

    await page.reload();
    await verifyTrackedPurchase();
  });
});
