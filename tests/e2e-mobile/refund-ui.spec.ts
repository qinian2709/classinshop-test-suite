import { test, expect } from './fixtures/authed.js';
import { env, hasApiCredential } from '@config';
import { resolveAuthTokens } from '../../shared/auth/login.js';
import { attachStepScreenshot } from './helpers/screenshots.js';
import {
  prepareRefundableCouponOrder,
  type RefundableCouponOrder,
} from './helpers/mobile-api.js';
import { applyZeroYuanRefundFromOrderDetail } from './helpers/recorded-flow.js';

/**
 * H5 退款申请：1 元固定课被无门槛券抵成实付 0 元后，详情仍展示申请退款。
 * 纯 0 元无券订单前端不开放退款入口。
 *
 * author：qiukailiang
 */
test.describe('H5 订单退款申请', () => {
  test.skip(!env.mobileBaseURL, '未配置 MOBILE_BASE_URL，跳过 H5 退款 UI');
  test.skip(!env.shopId, '未配置 SHOP_ID，跳过需上架商品的退款场景');
  test.skip(!hasApiCredential(), '未配置商家鉴权，跳过需造券下单的退款场景');

  let prepared: RefundableCouponOrder | null = null;

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    await resolveAuthTokens();
    prepared = await prepareRefundableCouponOrder();
  });

  test.afterAll(async () => {
    await prepared?.cleanup();
  });

  test('券后实付 0 元订单详情可提交退款申请', async ({ authedMobilePage: page }, testInfo) => {
    test.skip(!prepared, '无法准备带券实付 0 元订单（需固定课班级与领券成功），跳过退款 UI');

    await page.goto(`/order-detail?orderItemsId=${prepared!.orderItemId}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByText('订单详情', { exact: true }), '应打开订单详情').toBeVisible();
    await expect(page.getByText(prepared!.goodsName), '订单详情应展示刚购买的课程').toBeVisible();
    await attachStepScreenshot(page, testInfo, '01-带券订单详情已打开');

    await applyZeroYuanRefundFromOrderDetail(page);
    await attachStepScreenshot(page, testInfo, '02-零元退款申请已提交');
  });
});
