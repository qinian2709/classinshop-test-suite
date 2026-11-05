import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { accounts, env } from '@config';
import { resolveAuthTokens } from '../../../shared/auth/login.js';
import { bootstrapClassInAuth, installClassInAuth } from '../helpers/auth.js';
import { attachFailureScreenshot } from '../helpers/screenshots.js';
import { ShopListPage } from '../pages/ShopListPage.js';

interface AuthedFixtures {
  /** 已注入 PC 后台登录态，并停留在店铺列表/入口页。 */
  authedShopList: ShopListPage;
  /** 已注入登录态并进入指定店铺后台。 */
  authedShopPage: Page;
}

async function injectMerchantAuth(page: Page, testInfo: { attach: (name: string, options: { contentType: string; body: string }) => Promise<void> }): Promise<void> {
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
}

export const test = base.extend<AuthedFixtures>({
  authedShopList: async ({ page }, use, testInfo) => {
    await injectMerchantAuth(page, testInfo);
    await page.reload({ waitUntil: 'domcontentloaded' });
    const shopList = new ShopListPage(page);
    await shopList.waitForReady();

    await use(shopList);
    await attachFailureScreenshot(page, testInfo);
  },

  authedShopPage: async ({ page }, use, testInfo) => {
    await injectMerchantAuth(page, testInfo);
    test.skip(!env.shopId, '未配置 SHOP_ID，跳过入店后模块用例');
    await page.goto(`/shop/${env.shopId}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.locator('#root').waitFor({ state: 'attached', timeout: 15_000 });

    await use(page);
    await attachFailureScreenshot(page, testInfo);
  },
});

export { expect };
