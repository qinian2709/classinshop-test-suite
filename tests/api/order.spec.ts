import { test, expect } from '@shared';
import { Endpoints, SUCCESS_CODE } from '@shared';
import { buildOrderPayload } from '@shared';

const goodsIdEnv = process.env.TEST_GOODS_ID ? Number(process.env.TEST_GOODS_ID) : 0;

/**
 * 下单链路（需登录）：
 * - 异常/边界：不存在的商品、缺参数应失败；
 * - 正向：配置 TEST_GOODS_ID 后做一次算价（不真正支付，避免产生脏单）。
 */
test.describe('商品下单', () => {
  test('算价：不存在的商品应失败', async ({ api }) => {
    const { body } = await api.post(Endpoints.goods.orderCalculate, buildOrderPayload(999999999));
    expect(body.code).not.toBe(SUCCESS_CODE);
  });

  test('下单：缺少 goodsId 应失败', async ({ api }) => {
    const { body } = await api.post(Endpoints.goods.orderCreate, { num: 1 });
    expect(body.code).not.toBe(SUCCESS_CODE);
  });

  test('下单：数量为 0 的边界应失败', async ({ api }) => {
    const { body } = await api.post(
      Endpoints.goods.orderCreate,
      buildOrderPayload(goodsIdEnv || 1, { num: 0 }),
    );
    expect(body.code).not.toBe(SUCCESS_CODE);
  });

  test('算价：真实商品（配置 TEST_GOODS_ID 时）应成功', async ({ api }) => {
    test.skip(!goodsIdEnv, '未配置 TEST_GOODS_ID，跳过正向算价');
    const { body } = await api.post(Endpoints.goods.orderCalculate, buildOrderPayload(goodsIdEnv));
    expect(body.code).toBe(SUCCESS_CODE);
  });
});
