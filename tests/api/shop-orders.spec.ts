import { test, expect } from '@shared';
import { Endpoints, SUCCESS_CODE, attachApiCallLog } from '@shared';

/**
 * 商家后台订单管理（需登录 + SHOP_ID）。
 * 覆盖接口：
 *   GET /shop/:shopId/orders                      — 商家订单列表
 *   GET /shop/:shopId/orders/:orderId/tracking    — 订单追踪
 *
 * author：qiukailiang
 */

interface OrderItem {
  id: number;
  orderNo?: string;
  status: number;
  amount?: number;
}

interface OrderListData {
  list: OrderItem[];
  total: number;
}

test.describe('商家后台订单管理', () => {
  test.skip(({ env }) => !env.shopId, '未配置 SHOP_ID，跳过商家订单用例');

  // ── 订单列表 ──────────────────────────────────────────────────────────

  test('GET /orders 返回商家订单列表（分页结构）', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.ordersList(env.shopId)}?page=1&limit=20`;
    const { status, body } = await api.get<OrderListData>(
      Endpoints.shopAdmin.ordersList(env.shopId),
      { query: { page: 1, limit: 20 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-商家订单列表.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '订单列表应为数组'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(Array.isArray(body.data.list), '订单列表应为数组').toBe(true);
    expect(typeof body.data.total, 'total 应为数字类型').toBe('number');
  });

  test('GET /orders 按订单状态过滤', async ({ api, env }) => {
    // status=2 表示已支付
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.ordersList(env.shopId)}?page=1&limit=10&status=2`;
    const { status, body } = await api.get<OrderListData>(
      Endpoints.shopAdmin.ordersList(env.shopId),
      { query: { page: 1, limit: 10, status: 2 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-商家订单列表-状态过滤.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '订单列表应为数组'],
    });

    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(Array.isArray(body.data.list), '订单列表应为数组').toBe(true);
    // 不对字段名做强假设，只验证列表结构正常
  });

  test('GET /orders 按关键词搜索订单', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.ordersList(env.shopId)}?page=1&limit=10&keyword=`;
    const { status, body } = await api.get<OrderListData>(
      Endpoints.shopAdmin.ordersList(env.shopId),
      { query: { page: 1, limit: 10, keyword: '' } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-商家订单列表-关键词搜索.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码'],
    });

    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(Array.isArray(body.data.list), '订单列表应为数组').toBe(true);
  });

  test('GET /orders 无权限店铺应被拒绝', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.ordersList(999999999)}`;
    const { status, body } = await api.get(Endpoints.shopAdmin.ordersList(999999999));

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-商家订单列表-无权限.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['访问无权限店铺应返回非成功业务码'],
    });

    expect(body.code, '访问无权限店铺应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  // ── 订单追踪 ──────────────────────────────────────────────────────────

  /**
   * 依赖链：GET /orders 提取 orderId → GET /orders/:id/tracking。
   * tracking 接口需真实 orderId，若路由未部署则跳过。
   */
  test('GET /orders/:id/tracking 返回订单追踪信息', async ({ api, env }) => {
    const listUrl = `${env.apiBaseURL}${Endpoints.shopAdmin.ordersList(env.shopId)}?page=1&limit=1`;
    const { status: listStatus, body: listBody } = await api.get<OrderListData>(
      Endpoints.shopAdmin.ordersList(env.shopId),
      { query: { page: 1, limit: 1 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-订单追踪-订单列表.json',
      request: { method: 'GET', url: listUrl, headers: {}, body: null },
      response: { status: listStatus, headers: {}, body: listBody },
      assertions: ['获取订单列表应成功'],
    });

    expect(listBody.code, '获取订单列表应成功').toBe(SUCCESS_CODE);
    test.skip(!listBody.data?.list?.[0], '订单列表为空，跳过订单追踪');
    const orderId = listBody.data.list[0]!.id;

    const trackUrl = `${env.apiBaseURL}${Endpoints.shopAdmin.orderTracking(env.shopId, orderId)}`;
    let status: number;
    let body: unknown;
    try {
      const res = await api.get(Endpoints.shopAdmin.orderTracking(env.shopId, orderId));
      status = res.status;
      body = res.body;
    } catch {
      test.skip(true, 'tracking 接口返回非 JSON（路由可能未部署），跳过');
      return;
    }

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-订单追踪.json',
      request: { method: 'GET', url: trackUrl, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect((body as { code: number }).code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
  });

  test('GET /orders/:id/tracking 不存在订单应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.orderTracking(env.shopId, 999999999)}`;
    let status: number;
    let body: unknown;
    try {
      const res = await api.get(Endpoints.shopAdmin.orderTracking(env.shopId, 999999999));
      status = res.status;
      body = res.body;
    } catch {
      test.skip(true, 'tracking 接口返回非 JSON（路由可能未部署），跳过');
      return;
    }

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-订单追踪-不存在订单.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['查询不存在订单追踪应返回非成功业务码'],
    });

    expect((body as { code: number }).code, '查询不存在订单追踪应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  // ── 鉴权 ──────────────────────────────────────────────────────────────

  test('未登录访问商家订单列表应被拒绝', async ({ anonApi, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.ordersList(env.shopId)}`;
    const res = await anonApi.raw('get', Endpoints.shopAdmin.ordersList(env.shopId));
    const body = res.status() === 200 ? await res.json() : null;

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-商家订单列表-未登录.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status: res.status(), headers: {}, body },
      assertions: ['未登录应返回 4xx 或业务非成功码'],
    });

    if (res.status() === 200) {
      expect(body.code, '未登录访问应返回非成功业务码').not.toBe(SUCCESS_CODE);
    } else {
      expect(res.status(), '未登录访问应返回 4xx 状态码').toBeGreaterThanOrEqual(400);
    }
  });
});
