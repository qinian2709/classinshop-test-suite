import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { accounts } from '@config';
import { resolveAuthTokens } from '../../../shared/auth/login.js';
import { installMobileAuth } from '../helpers/auth.js';
import { attachFailureScreenshot } from '../helpers/screenshots.js';

type Fixtures = {
  /** 已注入 H5/C 端登录态的 page。 */
  authedMobilePage: Page;
};

export const test = base.extend<Fixtures>({
  authedMobilePage: async ({ page }, use, testInfo) => {
    await resolveAuthTokens();
    if (!accounts.mobileToken) {
      test.skip(true, '未配置用户端鉴权凭据（MOBILE_TEST_TOKEN 或 MOBILE_TEST_PHONE_NUMBER），跳过 H5 登录态用例');
    }

    await installMobileAuth(page, accounts.mobileToken);
    await page.setViewportSize({ width: 393, height: 852 });
    await use(page);
    await attachFailureScreenshot(page, testInfo);
  },
});

export { expect };
