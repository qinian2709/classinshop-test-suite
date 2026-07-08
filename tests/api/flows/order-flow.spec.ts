import { test, expect } from '@shared';
import { Endpoints, SUCCESS_CODE, GOODS_TYPE_FIXED, loggedGet, loggedPost } from '@shared';
import { hasApiCredential, hasMobileCredential } from '@config';
import { buildCalculatePayload, buildCreateOrderPayload, pickNumber, asArray } from '@shared';

/**
 * 固定课下单链路：上架固定课（绑定班级）→ 商品详情 → 算价 → 零元购课（自动支付进班）→ 学习列表/订单详情校验。
 *
 * 关键点：
 *   - publishedSampleGoods 上架 goodsType=1 固定课并绑定 ClassIn 班级，非预约课；
 *   - 零元单支付成功后服务端同步进班，用 mobileApi 查学习列表与订单详情。
 */

test.describe('固定课下单链路（绑定班级）', () => {
  test.skip(({ env }) => !env.shopId, '未配置 SHOP_ID，跳过固定课下单链路');
  test.skip(!hasApiCredential(), '未配置商家鉴权凭据，跳过需上架固定课的链路');

  test('上架 → 详情 → 算价（只读全链路）', async ({ api, env, publishedSampleGoods }) => {
    expect(publishedSampleGoods.goodsType, 'fixture 应为固定课 goodsType=1').toBe(GOODS_TYPE_FIXED);
    const testInfo = test.info();
    const logBase = { testInfo, apiBaseURL: env.apiBaseURL };

    await test.step('上游：固定课商品详情可查', async () => {
      const { body } = await loggedGet(api, {
        ...logBase,
        logName: '请求日志-固定课链路-商品详情.json',
        assertions: ['业务 code 应为成功码', '商品详情 data 不应为空'],
      }, Endpoints.shop.goodsDetail(publishedSampleGoods.goodsId));
      expect(body.code, body.msg).toBe(SUCCESS_CODE);
      expect(body.data).toBeTruthy();
    });

    await test.step('下游：用真实 goodsId/skuId 算价成功', async () => {
      const payload = buildCalculatePayload({
        goodsId: publishedSampleGoods.goodsId,
        skuId: publishedSampleGoods.skuId,
      });
      const { body } = await loggedPost(api, {
        ...logBase,
        logName: '请求日志-固定课链路-算价.json',
        assertions: ['业务 code 应为成功码', '算价 data 不应为空'],
      }, Endpoints.goods.orderCalculate, payload);
      expect(body.code, body.msg).toBe(SUCCESS_CODE);
      expect(body.data).toBeTruthy();
    });
  });

  test('零元购课 → 自动进班 → 学习列表可见', async ({ mobileApi, env, publishedSampleGoods }) => {
    test.skip(!hasMobileCredential(), '未配置 C 端鉴权，跳过固定课购课/进班链路');
    expect(publishedSampleGoods.goodsType, 'fixture 应为固定课 goodsType=1').toBe(GOODS_TYPE_FIXED);
    const testInfo = test.info();
    const logBase = { testInfo, apiBaseURL: env.apiBaseURL };

    let orderItemId: number | undefined;

    await test.step('学生零元购课（自动支付）', async () => {
      const payload = buildCreateOrderPayload({
        goodsId: publishedSampleGoods.goodsId,
        skuId: publishedSampleGoods.skuId,
      });
      const { body } = await loggedPost(mobileApi, {
        ...logBase,
        logName: '请求日志-固定课链路-零元购课.json',
        assertions: ['业务 code 应为成功码', '应返回 orderItemId'],
      }, Endpoints.goods.orderCreate, payload);
      expect(body.code, body.msg).toBe(SUCCESS_CODE);
      orderItemId = pickNumber(body.data, ['orderItemId', 'order_item_id']);
      expect(orderItemId, '下单应返回 orderItemId').toBeTruthy();
    });

    await test.step('订单详情：已支付且绑定班级信息', async () => {
      const { body } = await loggedGet(mobileApi, {
        ...logBase,
        logName: '请求日志-固定课链路-订单详情.json',
        assertions: ['业务 code 应为成功码', '订单应已支付且含班级名称'],
      }, Endpoints.user.orderDetail(orderItemId!));
      expect(body.code, body.msg).toBe(SUCCESS_CODE);
      const order = asArray(
        (body.data as { originalOrder?: unknown } | null)?.originalOrder ?? body.data,
      )[0];
      expect(order, '订单详情应返回主订单').toBeTruthy();
      expect(pickNumber(order, ['tradeResult', 'trade_result']), '固定课订单应已支付').toBe(1);
      expect(
        order?.className ?? order?.class_name,
        '固定课订单应写入班级名称（进班链路）',
      ).toBeTruthy();
    });

    await test.step('学习列表（固定课 Tab）应包含该订单', async () => {
      const query = { type: 'fixed', page: 1, pageSize: 20 };
      const { body } = await loggedGet(mobileApi, {
        ...logBase,
        logName: '请求日志-固定课链路-学习列表.json',
        assertions: ['业务 code 应为成功码', '学习列表应包含新购固定课'],
      }, Endpoints.shop.learnList, { query });
      expect(body.code, body.msg).toBe(SUCCESS_CODE);
      const list = asArray(
        (body.data as { list?: unknown } | null)?.list ?? body.data,
      );
      const found = list.find(
        (item) => pickNumber(item, ['orderItemId', 'order_item_id']) === orderItemId,
      );
      expect(found, '固定课学习列表应包含新购课程').toBeTruthy();
      expect(pickNumber(found, ['goodsType', 'goods_type']), '学习列表项应为固定课').toBe(
        GOODS_TYPE_FIXED,
      );
    });
  });
});
