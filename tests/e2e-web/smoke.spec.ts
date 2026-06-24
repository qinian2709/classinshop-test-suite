import { test, expect } from '@playwright/test';
import { ShopListPage } from './pages/ShopListPage.js';
import { attachStepScreenshot } from './helpers/screenshots.js';

/**
 * PC 后台冒烟：验证站点可访问、SPA 正常挂载、无致命 JS 报错。
 * 这是 E2E 的最低保障，不依赖登录态。
 */
test.describe('PC 后台冒烟 @smoke', () => {
  test('首页可加载且应用外壳渲染成功', async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    const home = new ShopListPage(page);
    await home.goto();
    await attachStepScreenshot(page, testInfo, '01-PC后台首页已加载');

    await expect(page).toHaveTitle(/.+/);
    expect(await home.hasRenderedAppShell()).toBeTruthy();
    // React 应用不应抛出未捕获异常
    expect(errors, `页面 JS 报错：\n${errors.join('\n')}`).toHaveLength(0);
  });

  test('首页关键静态资源应成功加载（无 4xx/5xx 主文档）', async ({ page }, testInfo) => {
    const response = await page.goto('/');
    expect(response?.ok(), `主文档响应状态 ${response?.status()}`).toBeTruthy();
    await attachStepScreenshot(page, testInfo, '01-PC后台主文档已加载');
  });
});
