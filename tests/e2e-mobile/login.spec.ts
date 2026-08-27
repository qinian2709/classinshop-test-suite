import { test, expect } from '@playwright/test';
import { env } from '@config';
import { attachStepScreenshot } from './helpers/screenshots.js';
import { MobileLoginPage } from './pages/MobileLoginPage.js';

/**
 * H5 登录页表单展示。不发验证码、不走滑块、不提交登录。
 * author：qiukailiang
 */
test.describe('H5 登录页 @smoke', () => {
  test.skip(!env.mobileBaseURL, '未配置 MOBILE_BASE_URL，跳过 H5 登录页用例');

  test('登录页应展示验证码登录表单，切换密码登录后展示密码框', async ({ page }, testInfo) => {
    const login = new MobileLoginPage(page);
    await login.goto();
    await expect(login.title, '登录页应展示标题').toBeVisible();
    await expect(login.codeTab, '默认应展示验证码登录 Tab').toBeVisible();
    await expect(login.passwordTab, '应展示密码登录 Tab').toBeVisible();
    await expect(login.phoneInput, '应展示手机号输入框').toBeVisible();
    await expect(page.getByPlaceholder('请输入验证码'), '验证码登录应展示验证码输入框').toBeVisible();
    await expect(page.getByRole('button', { name: '获取验证码' }), '应展示获取验证码').toBeVisible();
    await expect(page.getByText('我已阅读并同意'), '应展示协议勾选文案').toBeVisible();
    await expect(page.getByRole('button', { name: '注册/登录' }), '验证码登录应展示注册/登录').toBeVisible();
    await attachStepScreenshot(page, testInfo, '01-验证码登录表单已展示');

    await login.passwordTab.click();
    await expect(page.getByPlaceholder('请输入密码'), '密码登录应展示密码输入框').toBeVisible();
    await expect(page.getByRole('button', { name: '登录', exact: true }), '密码登录应展示登录按钮').toBeVisible();
    await attachStepScreenshot(page, testInfo, '02-密码登录表单已展示');
  });
});
