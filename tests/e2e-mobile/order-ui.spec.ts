import { test, expect } from './fixtures/authed.js';
import { env } from '@config';
import { attachStepScreenshot } from './helpers/screenshots.js';
import { findUserOrder, resolveMobileShopContext } from './helpers/mobile-api.js';
import { MobileOrderPage } from './pages/MobileOrderPage.js';

/**
 * H5 购课订单：列表 Tab 只读展示；有订单时进入详情但不支付。
 * author：qiukailiang
 */
test.describe('H5 购课订单 @smoke', () => {
  test.skip(!env.mobileBaseURL, '未配置 MOBILE_BASE_URL，跳过 H5 订单 UI 用例');

  test('订单列表应展示搜索与状态 Tab', async ({ authedMobilePage: page }, testInfo) => {
    const orderPage = new MobileOrderPage(page);
    await orderPage.goto();
    await expect(orderPage.title, '订单页应展示订单列表标题').toBeVisible();
    await expect(orderPage.searchBox, '订单页应展示课程搜索框').toBeVisible();
    await expect(orderPage.tab('全部'), '订单页应展示全部 Tab').toBeVisible();
    await expect(orderPage.tab('待付款'), '订单页应展示待付款 Tab').toBeVisible();
    await expect(orderPage.tab('待学习'), '订单页应展示待学习 Tab').toBeVisible();
    await attachStepScreenshot(page, testInfo, '01-订单列表已展示');

    await orderPage.tab('待付款').click();
    await expect(orderPage.tab('待付款'), '切换后待付款 Tab 应保持可见').toBeVisible();
    await attachStepScreenshot(page, testInfo, '02-已切换待付款');

    await orderPage.tab('待学习').click();
    await expect(orderPage.tab('待学习'), '切换后待学习 Tab 应保持可见').toBeVisible();
    await attachStepScreenshot(page, testInfo, '03-已切换待学习');
  });

  test('已有订单时可打开订单详情且不发起支付', async ({ authedMobilePage: page }, testInfo) => {
    const shop = await resolveMobileShopContext(testInfo);
    const order = await findUserOrder(testInfo, shop);
    test.skip(!order, '当前 C 端账号暂无购课订单，跳过订单详情 UI');

    await page.goto(`/order-detail?orderItemsId=${order!.orderItemsId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('订单详情', { exact: true }), '订单详情页应展示标题').toBeVisible();
    await expect(page.getByText('订单编号', { exact: true }), '订单详情应展示订单编号').toBeVisible();
    await attachStepScreenshot(page, testInfo, '01-订单详情已展示');
  });
});
