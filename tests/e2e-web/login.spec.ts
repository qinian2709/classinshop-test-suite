import { test, expect } from '@playwright/test';
import { accounts } from '@config';
import { LoginPage } from './pages/LoginPage.js';

/**
 * PC 后台登录主流程：需要 E2E_USERNAME / E2E_PASSWORD（账号密码登录）。
 * 未配置时跳过。登录中心选择器需团队按 accounts*.eeo.im 实际页面校准。
 */
test.describe('PC 后台登录', () => {
  test.skip(
    !accounts.e2e.username || !accounts.e2e.password,
    '未配置 E2E_USERNAME/E2E_PASSWORD，跳过登录主流程',
  );

  test('使用账号密码登录后进入后台', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(accounts.e2e.username, accounts.e2e.password);

    // 登录成功后地址栏应离开登录页 / 出现已登录态标识
    await expect(page).not.toHaveURL(/login/i);
  });
});
