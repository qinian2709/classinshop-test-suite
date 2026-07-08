import { test, expect } from '@shared';
import { Endpoints, SUCCESS_CODE, attachApiCallLog } from '@shared';

/**
 * 数据分析（需登录 + SHOP_ID）。
 * 覆盖接口：
 *   GET /shop/:shopId/analytics/overview               — 数据概况
 *   GET /shop/:shopId/analytics/traffic                — 流量转化
 *   GET /shop/:shopId/analytics/products               — 商品分析汇总
 *   GET /shop/:shopId/analytics/products/list          — 商品分析列表
 *   GET /shop/:shopId/analytics/users                  — 用户分析
 *   GET /shop/:shopId/analytics/users/pay-distribution — 付费分布
 *   POST /shop/:shopId/analytics/report                — 访问/浏览埋点上报
 *
 * author：qiukailiang
 */

test.describe('数据分析', () => {
  test.skip(({ env }) => !env.shopId, '未配置 SHOP_ID，跳过数据分析用例');

  // ── 数据概况 ──────────────────────────────────────────────────────────

  test('GET /analytics/overview 返回数据概况指标', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.analyticsOverview(env.shopId)}`;
    const { status, body } = await api.get(Endpoints.shopAdmin.analyticsOverview(env.shopId));

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-数据分析-概况.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '概况数据应存在'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(body.data, '概况数据应存在').toBeTruthy();
  });

  test('GET /analytics/overview 无权限店铺应被拒绝', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.analyticsOverview(999999999)}`;
    const { status, body } = await api.get(Endpoints.shopAdmin.analyticsOverview(999999999));

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-数据分析-概况-无权限.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['访问无权限店铺应返回非成功业务码'],
    });

    expect(body.code, '访问无权限店铺应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  // ── 流量转化 ──────────────────────────────────────────────────────────

  test('GET /analytics/traffic 返回流量转化数据', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.analyticsTraffic(env.shopId)}`;
    const { status, body } = await api.get(Endpoints.shopAdmin.analyticsTraffic(env.shopId));

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-数据分析-流量转化.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '流量数据应存在'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(body.data, '流量数据应存在').toBeTruthy();
  });

  // ── 商品分析 ──────────────────────────────────────────────────────────

  test('GET /analytics/products 返回商品分析汇总', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.analyticsProducts(env.shopId)}`;
    const { status, body } = await api.get(Endpoints.shopAdmin.analyticsProducts(env.shopId));

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-数据分析-商品汇总.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '商品分析汇总数据应存在'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(body.data, '商品分析汇总数据应存在').toBeTruthy();
  });

  test('GET /analytics/products/list 返回商品分析列表', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.analyticsProductsList(env.shopId)}?page=1&limit=10`;
    const { status, body } = await api.get(
      Endpoints.shopAdmin.analyticsProductsList(env.shopId),
      { query: { page: 1, limit: 10 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-数据分析-商品列表.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
  });

  // ── 用户分析 ──────────────────────────────────────────────────────────

  test('GET /analytics/users 返回用户分析数据', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.analyticsUsers(env.shopId)}`;
    const { status, body } = await api.get(Endpoints.shopAdmin.analyticsUsers(env.shopId));

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-数据分析-用户分析.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '用户分析数据应存在'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(body.data, '用户分析数据应存在').toBeTruthy();
  });

  test('GET /analytics/users/pay-distribution 返回付费分布数据', async ({ api, env }) => {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.analyticsUserPayDistribution(env.shopId)}?month=${month}`;
    const { status, body } = await api.get<{ payDistribution?: unknown[]; monthLabel?: string }>(
      Endpoints.shopAdmin.analyticsUserPayDistribution(env.shopId),
      { query: { month } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-数据分析-付费分布.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', 'payDistribution 应为数组'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(Array.isArray(body.data.payDistribution), 'payDistribution 应为数组').toBe(true);
  });

  // ── 埋点上报 ──────────────────────────────────────────────────────────

  test('POST /analytics/report 店铺访问埋点上报应成功', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.analyticsReport(env.shopId)}`;
    const payload = { eventType: 1, targetId: 0 };
    const { status, body } = await api.post(Endpoints.shopAdmin.analyticsReport(env.shopId), payload);

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-数据分析-埋点上报.json',
      request: { method: 'POST', url, headers: {}, body: payload },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
  });

  // ── 鉴权 ──────────────────────────────────────────────────────────────

  test('未登录访问数据分析应被拒绝', async ({ anonApi, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.analyticsOverview(env.shopId)}`;
    const res = await anonApi.raw('get', Endpoints.shopAdmin.analyticsOverview(env.shopId));
    const body = res.status() === 200 ? await res.json() : null;

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-数据分析-未登录.json',
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
