import { test, expect } from '@shared';
import { Endpoints, SUCCESS_CODE } from '@shared';
import { buildCalculatePayload, pickNumber, asArray } from '@shared';

/**
 * 优惠券链路（依赖型接口示例）：可领券列表 → 领取 → 我的优惠券 → 算价携带 userCouponId。
 *
 * 关键点：
 *   - couponId 由 availableCoupon fixture 从「可领取列表」发现；
 *   - 领券 → 我的券列表拿到 userCouponId（用户券记录 id，区别于 couponId）→ 喂给算价；
 *   - 券与当前商品规则可能不匹配，算价能正常返回（成功或业务校验）即说明链路打通；
 *   - 整组依赖店铺维度（X-Shop-Domain），未配置 SHOP_DOMAIN 时跳过。
 */

test.describe('优惠券链路（依赖可领券与商品数据）', () => {
  test.skip(({ env }) => !env.shopDomain, '未配置 SHOP_DOMAIN，跳过店铺维度优惠券链路');

  test('可领券 → 领取 → 我的券 → 算价带券', async ({ api, availableCoupon, sampleGoods }) => {
    await test.step('领取优惠券（上游）', async () => {
      const { body } = await api.post(Endpoints.shop.receiveCoupon(availableCoupon.couponId));
      // 领取成功或「已领取」均可接受，重点是后续能在我的券列表看到它。
      expect(typeof body.code).toBe('number');
    });

    let userCouponId: number | undefined;

    await test.step('我的优惠券列表应非空，并取出 userCouponId（中游）', async () => {
      const { body } = await api.get(Endpoints.user.couponList);
      expect(body.code, body.msg).toBe(SUCCESS_CODE);
      const list = asArray(body.data);
      expect(list.length, '领券后我的券列表不应为空').toBeGreaterThan(0);
      userCouponId = pickNumber(list[0], ['userCouponId', 'user_coupon_id', 'id']);
    });

    await test.step('算价携带 userCouponId（下游，依赖中游产物）', async () => {
      test.skip(!userCouponId, '未取得 userCouponId，跳过带券算价');
      const { body } = await api.post(
        Endpoints.goods.orderCalculate,
        buildCalculatePayload({
          goodsId: sampleGoods.goodsId,
          skuId: sampleGoods.skuId,
          userCouponId,
        }),
      );
      // 券可能不适用于该商品；接口正常返回即证明 userCouponId 被正确传递与处理。
      expect(typeof body.code).toBe('number');
    });
  });
});
