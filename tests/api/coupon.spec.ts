import { test, expect } from '@shared';
import { Endpoints, SUCCESS_CODE, loggedGet, loggedPost } from '@shared';

/**
 * 优惠券（需登录 + 店铺维度）：领券、可用券列表。
 * C 端店铺域名使用 MOBILE_BASE_URL（X-Shop-Domain），未配置时跳过。
 */
test.describe('优惠券', () => {
  test.skip(({ env }) => !env.mobileBaseURL, '未配置 MOBILE_BASE_URL，跳过店铺维度优惠券用例');

  test('GET /shop/coupon/available 返回当前商品可用优惠券', async ({ api, env, sampleGoods }) => {
    const testInfo = test.info();
    const query = { goodsId: sampleGoods.goodsId, skuId: sampleGoods.skuId };
    const { body } = await loggedGet(api, {
      testInfo,
      apiBaseURL: env.apiBaseURL,
      logName: '请求日志-商品可用优惠券.json',
      assertions: ['业务 code 应为成功码'],
    }, Endpoints.shop.availableCoupons, { query });
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
  });

  test('领取不存在的优惠券应失败', async ({ api, env }) => {
    const testInfo = test.info();
    const { body } = await loggedPost(api, {
      testInfo,
      apiBaseURL: env.apiBaseURL,
      logName: '请求日志-领取不存在优惠券.json',
      assertions: ['领取不存在券应返回非成功码'],
    }, Endpoints.shop.receiveCoupon(999999999));
    expect(body.code, '领取不存在券应失败').not.toBe(SUCCESS_CODE);
  });
});
