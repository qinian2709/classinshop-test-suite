import { test as base, expect } from '@playwright/test';
import { accounts, env } from '@config';
import { resolveAuthTokens } from '../../../shared/auth/login.js';
import { bootstrapClassInAuth, installClassInAuth } from '../helpers/auth.js';
import { attachFailureScreenshot } from '../helpers/screenshots.js';
import { ShopListPage } from '../pages/ShopListPage.js';

interface AuthedFixtures {
  /** 已注入 PC 后台登录态，并停留在店铺列表/入口页。 */
  authedShopList: ShopListPage;
}

export const test = base.extend<AuthedFixtures>({
  authedShopList: async ({ page }, use, testInfo) => {
    await resolveAuthTokens();
    test.skip(!accounts.token, '未配置商家/教师端鉴权凭据（TEST_TOKEN 或 TEST_PHONE_NUMBER），跳过需登录态注入的用例');
    test.skip(!env.shopHost, '未配置 SHOP_HOST，跳过 PC 后台店铺入口用例');

    await installClassInAuth(page, accounts.token);
    await page.goto(env.shopHost, { waitUntil: 'domcontentloaded' });

    const authBootstrap = await bootstrapClassInAuth(page, accounts.token, env.apiBaseURL);
    await testInfo.attach('登录态注入日志.json', {
      contentType: 'application/json',
      body: JSON.stringify(authBootstrap, null, 2),
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    const shopList = new ShopListPage(page);
    await shopList.waitForReady();

    await use(shopList);
    await attachFailureScreenshot(page, testInfo);
  },
});

export { expect };
