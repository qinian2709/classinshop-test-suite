import { test, expect } from './fixtures/authed.js';

test.describe('PC 后台店铺入口', () => {
  test('注入登录态后可从店铺列表进入店铺', async ({ page, authedShopList }) => {
    await expect(authedShopList.enterShopButton).toBeVisible({ timeout: 5_000 });
    const listUrl = page.url();
    await authedShopList.enterShop();

    await expect(page).not.toHaveURL(listUrl);
  });
});
