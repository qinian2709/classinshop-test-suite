import { test, expect } from '@playwright/test';
import { MobileHomePage } from './pages/MobileHomePage.js';

/**
 * H5 商城冒烟（移动仿真）：首页可加载、应用挂载、无致命 JS 报错。
 * 注意：H5 通常需要 X-Shop-Domain / 子域名识别店铺，baseURL 由 MOBILE_BASE_URL 指定。
 */
test.describe('H5 商城冒烟 @smoke', () => {
  test('首页可加载且应用外壳渲染成功', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    const home = new MobileHomePage(page);
    await home.goto();

    await expect(page, 'H5 首页应设置页面标题').toHaveTitle(/.+/);
    expect((await home.appShellText()).length, 'H5 首页应渲染应用外壳').toBeGreaterThan(0);
    await expect(home.tabItem('首页'), '首页应展示底部首页 Tab').toBeVisible();
    expect(errors, `页面 JS 报错：\n${errors.join('\n')}`).toHaveLength(0);
  });

  test('视口为移动端尺寸', async ({ page }) => {
    const viewport = page.viewportSize();
    expect(viewport, '应使用移动端仿真视口').not.toBeNull();
    expect(viewport!.width, '视口宽度应符合移动端仿真').toBeLessThan(820);
  });
});
