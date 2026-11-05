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
 *   GET /shop/:shopId/analytics/booking/overview       — 约课分析总览
 *   GET /shop/:shopId/analytics/booking/trend          — 约课分析排期趋势
 *   GET /shop/:shopId/analytics/booking/teacher-slot-rank — 老师时段占用榜
 *   GET /shop/:shopId/analytics/booking/goods-performance — 商品预约表现
 *   GET /shop/:shopId/analytics/booking/heatmap        — 预约热点热力图
 *   GET /shop/:shopId/analytics/recorded/overview      — 录播商品分析总览
 *   GET /shop/:shopId/analytics/recorded/goods         — 录播商品分析列表与钻取
 *   GET /shop/:shopId/analytics/resource-usage/overview — 资源用量总览
 *   GET /shop/:shopId/analytics/resource-usage/products — 资源用量商品列表
 *   GET /shop/:shopId/storage/capacity                 — 组织存储容量
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

  // ── 约课分析 ──────────────────────────────────────────────────────────

  test('GET /analytics/booking/overview 返回约课分析总览指标', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.analyticsBookingOverview(env.shopId)}?range=30d`;
    const { status, body } = await api.get(
      Endpoints.shopAdmin.analyticsBookingOverview(env.shopId),
      { query: { range: '30d' } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-约课分析-总览.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '约课总览数据应存在'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(body.data, '约课总览数据应存在').toBeTruthy();
  });

  test('GET /analytics/booking/trend 返回约课排期趋势', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.analyticsBookingTrend(env.shopId)}?range=30d`;
    const { status, body } = await api.get(
      Endpoints.shopAdmin.analyticsBookingTrend(env.shopId),
      { query: { range: '30d' } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-约课分析-趋势.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '趋势数据应存在'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(body.data, '趋势数据应存在').toBeTruthy();
  });

  test('GET /analytics/booking/teacher-slot-rank 返回老师时段占用榜', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.analyticsBookingTeacherSlotRank(env.shopId)}?range=30d&top=5`;
    const { status, body } = await api.get(
      Endpoints.shopAdmin.analyticsBookingTeacherSlotRank(env.shopId),
      { query: { range: '30d', top: 5 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-约课分析-老师时段榜.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
  });

  test('GET /analytics/booking/goods-performance 返回商品预约表现列表', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.analyticsBookingGoodsPerformance(env.shopId)}?range=30d&page=1&page_size=10`;
    const { status, body } = await api.get(
      Endpoints.shopAdmin.analyticsBookingGoodsPerformance(env.shopId),
      { query: { range: '30d', page: 1, page_size: 10 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-约课分析-商品预约表现.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
  });

  test('GET /analytics/booking/heatmap 返回预约热点热力图', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.analyticsBookingHeatmap(env.shopId)}?range=30d`;
    const { status, body } = await api.get(
      Endpoints.shopAdmin.analyticsBookingHeatmap(env.shopId),
      { query: { range: '30d' } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-约课分析-热力图.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
  });

  // ── 录播商品分析 ──────────────────────────────────────────────────────

  test('GET /analytics/recorded/overview 返回录播商品分析总览', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.analyticsRecordedOverview(env.shopId)}?domain=private`;
    const { status, body } = await api.get(
      Endpoints.shopAdmin.analyticsRecordedOverview(env.shopId),
      { query: { domain: 'private' }, maxDurationMs: 5000 },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-录播分析-总览.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '录播总览数据应存在'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(body.data, '录播总览数据应存在').toBeTruthy();
  });

  test('GET /analytics/recorded/goods 返回录播商品列表并支持单商品钻取', async ({ api, env }) => {
    interface RecordedGoodsRow {
      goodsId?: number;
      goods_id?: number;
      productId?: number;
      product_id?: number;
    }
    interface RecordedGoodsList {
      list?: RecordedGoodsRow[];
      total?: number;
    }

    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.analyticsRecordedGoods(env.shopId)}?domain=private&page=1&page_size=10`;
    const { status, body } = await api.get<RecordedGoodsList>(
      Endpoints.shopAdmin.analyticsRecordedGoods(env.shopId),
      { query: { domain: 'private', page: 1, page_size: 10 }, maxDurationMs: 5000 },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-录播分析-商品列表.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', 'list 应为数组'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(Array.isArray(body.data?.list ?? []), '录播商品分析列表应为数组').toBe(true);

    const first = body.data?.list?.[0];
    const goodsId = Number(first?.goodsId ?? first?.goods_id ?? 0);
    const productId = Number(first?.productId ?? first?.product_id ?? goodsId);
    if (goodsId <= 0) return;

    const summaryUrl = `${env.apiBaseURL}${Endpoints.shopAdmin.recordedAnalyticsSummary(env.shopId, goodsId)}?product_id=${productId}`;
    const { status: sumStatus, body: sumBody } = await api.get(
      Endpoints.shopAdmin.recordedAnalyticsSummary(env.shopId, goodsId),
      { query: { product_id: productId } },
    );
    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-录播分析-单商品汇总卡.json',
      request: { method: 'GET', url: summaryUrl, headers: {}, body: null },
      response: { status: sumStatus, headers: {}, body: sumBody },
      assertions: ['单商品录播汇总业务 code 应为成功码'],
    });
    expect(sumBody.code, '单商品录播汇总业务 code 应为成功码').toBe(SUCCESS_CODE);

    const studentsUrl = `${env.apiBaseURL}${Endpoints.shopAdmin.recordedAnalyticsStudents(env.shopId, goodsId)}?product_id=${productId}&page=1&page_size=10`;
    const { status: stuStatus, body: stuBody } = await api.get(
      Endpoints.shopAdmin.recordedAnalyticsStudents(env.shopId, goodsId),
      { query: { product_id: productId, page: 1, page_size: 10 } },
    );
    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-录播分析-单商品按学员.json',
      request: { method: 'GET', url: studentsUrl, headers: {}, body: null },
      response: { status: stuStatus, headers: {}, body: stuBody },
      assertions: ['单商品按学员分析业务 code 应为成功码'],
    });
    expect(stuBody.code, '单商品按学员分析业务 code 应为成功码').toBe(SUCCESS_CODE);

    const actUrl = `${env.apiBaseURL}${Endpoints.shopAdmin.recordedAnalyticsActivities(env.shopId, goodsId)}?product_id=${productId}`;
    const { status: actStatus, body: actBody } = await api.get(
      Endpoints.shopAdmin.recordedAnalyticsActivities(env.shopId, goodsId),
      { query: { product_id: productId } },
    );
    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-录播分析-单商品按活动.json',
      request: { method: 'GET', url: actUrl, headers: {}, body: null },
      response: { status: actStatus, headers: {}, body: actBody },
      assertions: ['单商品按活动分析业务 code 应为成功码'],
    });
    expect(actBody.code, '单商品按活动分析业务 code 应为成功码').toBe(SUCCESS_CODE);
  });

  // ── 资源用量 & 存储容量 ────────────────────────────────────────────────

  test('GET /storage/capacity 返回店铺组织存储容量', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.storageCapacity(env.shopId)}`;
    const { status, body } = await api.get(Endpoints.shopAdmin.storageCapacity(env.shopId));

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-存储容量.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '存储容量数据应存在'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(body.data, '存储容量数据应存在').toBeTruthy();
  });

  test('GET /analytics/resource-usage/overview 返回资源用量总览', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.analyticsResourceUsageOverview(env.shopId)}`;
    const { status, body } = await api.get(
      Endpoints.shopAdmin.analyticsResourceUsageOverview(env.shopId),
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-资源用量-总览.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '资源用量总览数据应存在'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(body.data, '资源用量总览数据应存在').toBeTruthy();
  });

  test('GET /analytics/resource-usage/products 返回资源用量商品列表', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.analyticsResourceUsageProducts(env.shopId)}?page=1&page_size=10`;
    const { status, body } = await api.get(
      Endpoints.shopAdmin.analyticsResourceUsageProducts(env.shopId),
      { query: { page: 1, page_size: 10 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-资源用量-商品列表.json',
      request: { method: 'GET', url, headers: {}, body: null },
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
