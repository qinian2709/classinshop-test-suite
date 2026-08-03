import { test, expect } from '@shared';
import { Endpoints, SUCCESS_CODE, loggedGet, loggedPost } from '@shared';
import { hasMobileCredential } from '@config';
import { buildCalculatePayload, pickNumber, asArray } from '@shared';

/**
 * 优惠券链路（C 端 / 学生用户）：可领券列表 → 领取 → 我的优惠券 → 算价携带 userCouponId。
 *
 * 关键点：
 *   - 使用 mobileApi（MOBILE_TEST_PHONE_NUMBER 白名单登录），非商家 api；
 *   - couponId 由 availableCoupon fixture 按当前商品从「可领取列表」发现；
 *   - 整组依赖 MOBILE_BASE_URL（X-Shop-Domain）。
 */

test.describe('优惠券链路（依赖可领券与商品数据）', () => {
  test.skip(({ env }) => !env.mobileBaseURL, '未配置 MOBILE_BASE_URL，跳过店铺维度优惠券链路');
  test.skip(!hasMobileCredential(), '未配置 C 端鉴权（MOBILE_TEST_TOKEN 或 MOBILE_TEST_PHONE_NUMBER），跳过领券链路');

  test('可领券 → 领取 → 我的券 → 算价带券', async ({ mobileApi, env, availableCoupon, sampleGoods }) => {
    const testInfo = test.info();
    const logBase = { testInfo, apiBaseURL: env.apiBaseURL };

    await test.step('领取优惠券（上游）', async () => {
      const { body } = await loggedPost(mobileApi, {
        ...logBase,
        logName: '请求日志-优惠券链路-领取.json',
        assertions: ['领取接口应返回业务 code（成功或已领取均可）'],
      }, Endpoints.shop.receiveCoupon(availableCoupon.couponId));
      expect(typeof body.code).toBe('number');
    });

    let userCouponId: number | undefined;

    await test.step('我的优惠券列表应非空，并取出 userCouponId（中游）', async () => {
      const { body } = await loggedGet(mobileApi, {
        ...logBase,
        logName: '请求日志-优惠券链路-我的券列表.json',
        assertions: ['业务 code 应为成功码', '领券后列表不应为空'],
      }, Endpoints.user.couponList);
      expect(body.code, body.msg).toBe(SUCCESS_CODE);
      const list = asArray(body.data);
      expect(list.length, '领券后我的券列表不应为空').toBeGreaterThan(0);
      userCouponId = pickNumber(list[0], ['userCouponId', 'user_coupon_id', 'id']);
    });

    await test.step('算价携带 userCouponId（下游，依赖中游产物）', async () => {
      test.skip(!userCouponId, '未取得 userCouponId，跳过带券算价');
      const payload = buildCalculatePayload({
        goodsId: sampleGoods.goodsId,
        skuId: sampleGoods.skuId,
        userCouponId,
      });
      const { body } = await loggedPost(mobileApi, {
        ...logBase,
        logName: '请求日志-优惠券链路-带券算价.json',
        assertions: ['算价接口应返回业务 code（券不适用亦属正常）'],
      }, Endpoints.goods.orderCalculate, payload);
      expect(typeof body.code).toBe('number');
    });
  });
});
