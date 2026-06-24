import { test, expect } from '@shared';
import { Endpoints, SUCCESS_CODE } from '@shared';

/**
 * 优惠券（需登录 + 店铺维度）：领券、可用券列表。
 * 依赖 X-Shop-Domain，未配置 SHOP_DOMAIN 时跳过。
 */
test.describe('优惠券', () => {
  test.skip(({ env }) => !env.shopDomain, '未配置 SHOP_DOMAIN，跳过店铺维度优惠券用例');

  test('GET /shop/coupon/available 返回可领取优惠券', async ({ api }) => {
    const { body } = await api.get(Endpoints.shop.availableCoupons);
    expect(body.code).toBe(SUCCESS_CODE);
  });

  test('领取不存在的优惠券应失败', async ({ api }) => {
    const { body } = await api.post(Endpoints.shop.receiveCoupon(999999999));
    expect(body.code).not.toBe(SUCCESS_CODE);
  });
});
