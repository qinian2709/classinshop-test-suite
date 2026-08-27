import { test as authedTest, expect as authedExpect } from './fixtures/authed.js';
import { test, expect } from '@playwright/test';
import { env } from '@config';
import { attachStepScreenshot } from './helpers/screenshots.js';
import { MobileMinePage } from './pages/MobileMinePage.js';

/**
 * H5 我的：未登录入口、已登录菜单跳转。
 * author：qiukailiang
 */
test.describe('H5 我的页（未登录）@smoke', () => {
  test.skip(!env.mobileBaseURL, '未配置 MOBILE_BASE_URL，跳过 H5 我的页用例');

  test('未登录访问我的页应展示登录入口', async ({ page }, testInfo) => {
    const mine = new MobileMinePage(page);
    await mine.goto();
    await expect(mine.guestWelcome, '未登录我的页应展示欢迎文案').toBeVisible();
    await expect(mine.guestLoginButton, '未登录我的页应展示登录按钮').toBeVisible();
    await attachStepScreenshot(page, testInfo, '01-未登录我的页已展示');
  });
});

authedTest.describe('H5 我的页（已登录）@smoke', () => {
  authedTest.skip(!env.mobileBaseURL, '未配置 MOBILE_BASE_URL，跳过 H5 我的页用例');

  authedTest('我的菜单可进入订单、预约、地址与优惠券', async ({ authedMobilePage: page }, testInfo) => {
    const mine = new MobileMinePage(page);
    await mine.goto();
    await authedExpect(mine.menu('购课订单'), '已登录我的页应展示购课订单').toBeVisible();
    await authedExpect(mine.menu('我的预约'), '已登录我的页应展示我的预约').toBeVisible();
    await authedExpect(mine.menu('地址管理'), '已登录我的页应展示地址管理').toBeVisible();
    await authedExpect(mine.menu('我的优惠券'), '已登录我的页应展示我的优惠券').toBeVisible();
    await attachStepScreenshot(page, testInfo, '01-已登录我的菜单已展示');

    await mine.openMenu('购课订单');
    await authedExpect(page, '购课订单应进入订单列表').toHaveURL(/\/order(?:\?|$)/);
    await authedExpect(page.getByText('订单列表', { exact: true }), '订单页应展示标题').toBeVisible();
    await attachStepScreenshot(page, testInfo, '02-已进入订单列表');

    await mine.goto();
    await mine.openMenu('我的预约');
    await authedExpect(page, '我的预约应进入预约列表').toHaveURL(/\/my-appointment(?:\?|$)/);
    await authedExpect(page.getByText('我的预约', { exact: true }), '预约页应展示标题').toBeVisible();
    await attachStepScreenshot(page, testInfo, '03-已进入我的预约');

    await mine.goto();
    await mine.openMenu('地址管理');
    await authedExpect(page, '地址管理应进入地址列表').toHaveURL(/\/address(?:\?|$)/);
    await authedExpect(page.getByRole('button', { name: '新增地址' }), '地址页应展示新增地址').toBeVisible();
    await attachStepScreenshot(page, testInfo, '04-已进入地址管理');

    await mine.goto();
    await mine.openMenu('我的优惠券');
    await authedExpect(page, '我的优惠券应进入券包').toHaveURL(/\/coupons(?:\?|$)/);
    await authedExpect(page.getByText('我的优惠券', { exact: true }), '券包应展示标题').toBeVisible();
    await authedExpect(page.getByRole('tab', { name: '未使用' }), '券包应展示未使用 Tab').toBeVisible();
    await authedExpect(page.getByRole('tab', { name: '已使用' }), '券包应展示已使用 Tab').toBeVisible();
    await authedExpect(page.getByRole('tab', { name: '已失效' }), '券包应展示已失效 Tab').toBeVisible();
    await attachStepScreenshot(page, testInfo, '05-已进入我的优惠券');
  });
});
