import { test, expect } from './fixtures/authed.js';
import { env } from '@config';
import { attachStepScreenshot } from './helpers/screenshots.js';
import { gotoShopModule } from './helpers/shop.js';

/**
 * PC 入店后模块冒烟：概况 / 商品 / 约课课表 / 售课订单 / 数据中心。
 *
 * author：qiukailiang
 */
test.describe('PC 后台入店后模块 @smoke', () => {
  test.skip(!env.shopId, '未配置 SHOP_ID，跳过入店后模块用例');

  test('概况页应展示近期待办与经营数据', async ({ authedShopPage: page }, testInfo) => {
    await expect(page, '入店后应停留在概况').toHaveURL(/\/shop\/\d+\/dashboard/);
    await expect(page.getByText('近期待办', { exact: true }), '概况应展示近期待办').toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText('经营数据', { exact: true }), '概况应展示经营数据').toBeVisible();
    await attachStepScreenshot(page, testInfo, '01-概况页已展示');
  });

  test('商品管理页应展示商品列表标题', async ({ authedShopPage: page }, testInfo) => {
    await gotoShopModule(page, '/goods/list');
    await expect(page.getByText('商品管理', { exact: true }), '商品页应展示商品管理标题').toBeVisible({
      timeout: 20_000,
    });
    await attachStepScreenshot(page, testInfo, '01-商品管理已打开');
  });

  test('约课课表总览应可打开', async ({ authedShopPage: page }, testInfo) => {
    await gotoShopModule(page, '/appointment/schedule');
    await expect(page.getByRole('heading', { name: '课表总览' }), '约课课表应展示课表总览').toBeVisible({
      timeout: 20_000,
    });
    await attachStepScreenshot(page, testInfo, '01-课表总览已打开');
  });

  test('售课订单页应展示课程交易记录', async ({ authedShopPage: page }, testInfo) => {
    await gotoShopModule(page, '/transactions/orders');
    await expect(page.getByText('课程交易记录', { exact: true }), '订单页应展示课程交易记录').toBeVisible({
      timeout: 20_000,
    });
    await attachStepScreenshot(page, testInfo, '01-售课订单已打开');
  });

  test('约课分析页应展示区间筛选', async ({ authedShopPage: page }, testInfo) => {
    await gotoShopModule(page, '/analytics/booking');
    await expect(
      page.getByText('约课分析 · 当前区间：近 30 天'),
      '约课分析页应展示当前区间标题',
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('近 30 天', { exact: true }), '约课分析应展示近 30 天').toBeVisible();
    await attachStepScreenshot(page, testInfo, '01-约课分析已打开');
  });

  test('录播商品分析页应展示私域商品数据', async ({ authedShopPage: page }, testInfo) => {
    await gotoShopModule(page, '/analytics/recorded');
    await expect(page.getByText('私域商品', { exact: true }), '录播分析应展示私域商品 Tab').toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText('录播商品数据', { exact: true }), '录播分析应展示录播商品数据').toBeVisible();
    await attachStepScreenshot(page, testInfo, '01-录播商品分析已打开');
  });

  test('资源用量页应展示用量标题', async ({ authedShopPage: page }, testInfo) => {
    await gotoShopModule(page, '/analytics/resource-usage');
    await expect(page.getByRole('heading', { name: '资源用量' }), '资源用量页应展示标题').toBeVisible({
      timeout: 20_000,
    });
    await attachStepScreenshot(page, testInfo, '01-资源用量已打开');
  });
});
