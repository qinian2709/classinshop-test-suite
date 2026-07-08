import { test, expect } from '@shared';
import { Endpoints, SUCCESS_CODE, loggedPost } from '@shared';
import { buildOrderPayload } from '@shared';

const goodsIdEnv = process.env.TEST_GOODS_ID ? Number(process.env.TEST_GOODS_ID) : 0;

/**
 * 下单链路（需登录）：
 * - 异常/边界：不存在的商品、缺参数应失败；
 * - 正向：配置 TEST_GOODS_ID 后做一次算价（不真正支付，避免产生脏单）。
 */
test.describe('商品下单', () => {
  test('算价：不存在的商品应失败', async ({ api, env }) => {
    const testInfo = test.info();
    const payload = buildOrderPayload(999999999);
    const { body } = await loggedPost(api, {
      testInfo,
      apiBaseURL: env.apiBaseURL,
      logName: '请求日志-算价-不存在商品.json',
      assertions: ['不存在商品应返回非成功码'],
    }, Endpoints.goods.orderCalculate, payload);
    expect(body.code, '不存在商品算价应失败').not.toBe(SUCCESS_CODE);
  });

  test('下单：缺少 goodsId 应失败', async ({ api, env }) => {
    const testInfo = test.info();
    const { body } = await loggedPost(api, {
      testInfo,
      apiBaseURL: env.apiBaseURL,
      logName: '请求日志-下单-缺少goodsId.json',
      assertions: ['缺少 goodsId 应返回非成功码'],
    }, Endpoints.goods.orderCreate, { num: 1 });
    expect(body.code, '缺少 goodsId 应失败').not.toBe(SUCCESS_CODE);
  });

  test('下单：数量为 0 的边界应失败', async ({ api, env }) => {
    const testInfo = test.info();
    const payload = buildOrderPayload(goodsIdEnv || 1, { num: 0 });
    const { body } = await loggedPost(api, {
      testInfo,
      apiBaseURL: env.apiBaseURL,
      logName: '请求日志-下单-数量为0.json',
      assertions: ['数量为 0 应返回非成功码'],
    }, Endpoints.goods.orderCreate, payload);
    expect(body.code, '数量为 0 应失败').not.toBe(SUCCESS_CODE);
  });

  test('算价：真实商品（配置 TEST_GOODS_ID 时）应成功', async ({ api, env }) => {
    test.skip(!goodsIdEnv, '未配置 TEST_GOODS_ID，跳过正向算价');
    const testInfo = test.info();
    const payload = buildOrderPayload(goodsIdEnv);
    const { body } = await loggedPost(api, {
      testInfo,
      apiBaseURL: env.apiBaseURL,
      logName: '请求日志-算价-真实商品.json',
      assertions: ['业务 code 应为成功码'],
    }, Endpoints.goods.orderCalculate, payload);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
  });
});
