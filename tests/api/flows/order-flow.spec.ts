import { test, expect } from '@shared';
import { Endpoints, SUCCESS_CODE } from '@shared';
import { buildCalculatePayload, buildCreateOrderPayload, pickNumber } from '@shared';

/**
 * 下单链路（依赖型接口示例）：商品列表/详情 → 算价 →（选配）下单 → 订单详情。
 *
 * 关键点：
 *   - goodsId/skuId 不硬编码，由 sampleGoods fixture 通过「列表 + 详情」发现真实数据；
 *   - 默认只跑只读 + 算价，避免脏单；真实下单需显式开启 TEST_ALLOW_ORDER_CREATE=1；
 *   - 上游产物（orderId）通过 test.step 内的局部变量传给下游（订单详情）。
 */

const allowCreate = process.env.TEST_ALLOW_ORDER_CREATE === '1';

test.describe('下单链路（依赖商品数据）', () => {
  test('列表 → 详情 → 算价（只读全链路）', async ({ api, sampleGoods }) => {
    await test.step('上游：商品详情可查', async () => {
      const { body } = await api.get(Endpoints.shop.goodsDetail(sampleGoods.goodsId));
      expect(body.code, body.msg).toBe(SUCCESS_CODE);
      expect(body.data).toBeTruthy();
    });

    await test.step('下游：用真实 goodsId/skuId 算价成功', async () => {
      const { body } = await api.post(
        Endpoints.goods.orderCalculate,
        buildCalculatePayload({ goodsId: sampleGoods.goodsId, skuId: sampleGoods.skuId }),
      );
      expect(body.code, body.msg).toBe(SUCCESS_CODE);
      expect(body.data).toBeTruthy();
    });
  });

  test('选配：真实下单 → 订单详情可见', async ({ api, sampleGoods, data }) => {
    test.skip(!allowCreate, '未开启 TEST_ALLOW_ORDER_CREATE，跳过真实下单（避免脏单）');

    let orderId: number | undefined;

    await test.step('下单（上游）', async () => {
      const { body } = await api.post(
        Endpoints.goods.orderCreate,
        buildCreateOrderPayload({ goodsId: sampleGoods.goodsId, skuId: sampleGoods.skuId }),
      );
      expect(body.code, body.msg).toBe(SUCCESS_CODE);
      orderId = pickNumber(body.data, ['orderId', 'id', 'order_id']);
      if (orderId) {
        // 未支付订单一般无硬删除接口，登记仅作占位/审计；如有取消接口可在此调用。
        data.register(`order ${orderId}（未支付，待自然过期）`, async () => {});
      }
    });

    await test.step('订单详情（下游，依赖上游 orderId）', async () => {
      test.skip(!orderId, '下单未返回 orderId，无法校验订单详情');
      const { body } = await api.get(Endpoints.user.orderDetail(orderId!));
      expect(body.code, body.msg).toBe(SUCCESS_CODE);
      expect(body.data).toBeTruthy();
    });
  });
});
