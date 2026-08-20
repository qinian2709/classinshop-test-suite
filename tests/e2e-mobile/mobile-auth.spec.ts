import { test, expect } from './fixtures/authed.js';
import { attachStepScreenshot } from './helpers/screenshots.js';

test.describe('H5 登录态 @smoke', () => {
  test('注入 MOBILE_TEST_TOKEN 后可打开我的页面', async ({ authedMobilePage: page }, testInfo) => {
    await page.goto('/mine', { waitUntil: 'domcontentloaded' });
    await page.locator('#root').waitFor({ state: 'attached', timeout: 15_000 });
    await attachStepScreenshot(page, testInfo, '01-我的页面已加载');

    await expect(page.getByText('登录', { exact: true }), '已注入登录态后不应展示登录按钮').toHaveCount(0);
    await attachStepScreenshot(page, testInfo, '02-未展示登录按钮');

    await expect(page.getByText('购课订单'), '应展示登录后的购课订单入口').toBeVisible();
    await expect(page.getByText('我的预约'), '应展示登录后的我的预约入口').toBeVisible();
    await expect(page.getByText('我的优惠券'), '应展示登录后的我的优惠券入口').toBeVisible();
    await expect(page.getByText('退出登录'), '应展示登录后的退出登录入口').toBeVisible();
    await attachStepScreenshot(page, testInfo, '03-登录菜单已展示');

    const hasToken = await page.evaluate(() => Boolean(localStorage.getItem('cshop_token')));
    expect(hasToken, '应写入 mobile-web 使用的 cshop_token').toBe(true);
    await attachStepScreenshot(page, testInfo, '04-登录态校验完成');

    await page.goto('/learn', { waitUntil: 'domcontentloaded' });
    await expect(page.getByPlaceholder(/搜索课程名/), '学习页应展示课程搜索框').toBeVisible();
    await expect(page.getByRole('button', { name: '小店商品' }), '学习页应展示小店商品入口').toBeVisible();
    await expect(page.getByRole('button', { name: '公域商品' }), '学习页应展示公域商品入口').toBeVisible();
    await expect(page.getByRole('button', { name: /^全部/ }), '学习页应展示全部筛选').toBeVisible();
    await expect(page.getByRole('button', { name: /^录播课/ }), '学习页应展示录播课筛选').toBeVisible();
    await expect(page.getByRole('button', { name: /^预约课/ }), '学习页应展示预约课筛选').toBeVisible();
    await expect(page.getByRole('button', { name: /^固定课/ }), '学习页应展示固定课筛选').toBeVisible();
    await attachStepScreenshot(page, testInfo, '05-学习页面已展示');
  });
});
