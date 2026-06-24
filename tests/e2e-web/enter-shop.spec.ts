import { test, expect } from './fixtures/authed.js';
import { attachStepScreenshot } from './helpers/screenshots.js';

test.describe('PC 后台店铺入口', () => {
  test('注入登录态后可从店铺列表进入店铺', async ({ page, authedShopList }, testInfo) => {
    await expect(authedShopList.enterShopButton).toBeVisible({ timeout: 5_000 });
    await attachStepScreenshot(page, testInfo, '01-店铺列表已展示');
    const listUrl = page.url();
    await authedShopList.enterShop();

    await expect(page).not.toHaveURL(listUrl);
    await attachStepScreenshot(page, testInfo, '02-已进入店铺');
  });
});
