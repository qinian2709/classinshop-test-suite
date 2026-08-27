import { test, expect } from '@playwright/test';
import { env } from '@config';
import { attachStepScreenshot } from './helpers/screenshots.js';
import { MobileHomePage } from './pages/MobileHomePage.js';

/**
 * H5 底部 TabBar：首页 / 学习 / 我的 可切换。
 * author：qiukailiang
 */
test.describe('H5 TabBar 导航 @smoke', () => {
  test.skip(!env.mobileBaseURL, '未配置 MOBILE_BASE_URL，跳过 H5 TabBar 用例');

  test('底部 Tab 可在首页、学习、我的之间切换', async ({ page }, testInfo) => {
    const home = new MobileHomePage(page);
    await home.goto();
    await expect(home.tabItem('首页'), '首页应展示底部 TabBar').toBeVisible();
    await expect(home.tabItem('学习'), '应展示学习 Tab').toBeVisible();
    await expect(home.tabItem('我的'), '应展示我的 Tab').toBeVisible();
    await attachStepScreenshot(page, testInfo, '01-首页 TabBar 已展示');

    await home.gotoTab('学习');
    await expect(page, '点击学习 Tab 后应进入学习页').toHaveURL(/\/learn(?:\?|$)/);
    await attachStepScreenshot(page, testInfo, '02-已切换到学习页');

    await home.gotoTab('我的');
    await expect(page, '点击我的 Tab 后应进入我的页').toHaveURL(/\/mine(?:\?|$)/);
    await attachStepScreenshot(page, testInfo, '03-已切换到我的页');

    await home.gotoTab('首页');
    expect(new URL(page.url()).pathname, '点击首页 Tab 后应回到店铺首页').toBe('/');
    await attachStepScreenshot(page, testInfo, '04-已回到首页');
  });
});
