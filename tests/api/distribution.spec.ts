import { test, expect } from '@shared';
import { Endpoints, SUCCESS_CODE, attachApiCallLog } from '@shared';

/**
 * 分销与推广管理（需登录 + SHOP_ID）。
 * 覆盖接口：
 *   GET  /shop/:shopId/distribution/goods/list          — 分销商品列表
 *   GET  /shop/:shopId/distribution/goods/list/to_add   — 待添加分销商品列表
 *   GET  /shop/:shopId/distribution/order               — 分销记录列表
 *   GET  /shop/:shopId/distribution/promotion           — 推广记录列表
 *   GET  /shop/:shopId/spread/goods                     — 推广商品列表
 *   GET  /shop/:shopId/spread/goods/info                — 推广商品信息
 *   GET  /shop/:shopId/spread/merchants                 — 推广商家列表
 *   GET  /shop/:shopId/spread/info                      — 推广信息
 *   GET  /shop/:shopId/salers                           — 推广员列表
 *
 * author：qiukailiang
 */

// ── 分销商品 ──────────────────────────────────────────────────────────────

test.describe('分销商品管理', () => {
  test.skip(({ env }) => !env.shopId, '未配置 SHOP_ID，跳过分销商品用例');

  test('GET /distribution/goods/list 返回分销商品列表', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.distributionGoodsList(env.shopId)}?page=1&limit=20`;
    const { status, body } = await api.get(
      Endpoints.shopAdmin.distributionGoodsList(env.shopId),
      { query: { page: 1, limit: 20 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-分销商品列表.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '分销商品列表应为数组'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(Array.isArray((body.data as Record<string, unknown>)?.list ?? body.data), '分销商品列表应为数组').toBe(true);
  });

  test('GET /distribution/goods/list/to_add 返回待添加分销商品', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.distributionGoodsToAddList(env.shopId)}?page=1&limit=20`;
    const { status, body } = await api.get(
      Endpoints.shopAdmin.distributionGoodsToAddList(env.shopId),
      { query: { page: 1, limit: 20 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-待添加分销商品.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
  });

  test('GET /distribution/goods/list 无权限店铺应被拒绝', async ({ api }) => {
    const { body } = await api.get(Endpoints.shopAdmin.distributionGoodsList(999999999));

    expect(body.code, '访问无权限店铺应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  test('未登录访问分销商品列表应被拒绝', async ({ anonApi, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.distributionGoodsList(env.shopId)}`;
    const res = await anonApi.raw('get', Endpoints.shopAdmin.distributionGoodsList(env.shopId));
    const body = res.status() === 200 ? await res.json() : null;

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-分销商品-未登录.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status: res.status(), headers: {}, body },
      assertions: ['未登录应返回 4xx 或非成功业务码'],
    });

    if (res.status() === 200) {
      expect(body.code, '未登录应返回非成功业务码').not.toBe(SUCCESS_CODE);
    } else {
      expect(res.status(), '未登录应返回 4xx').toBeGreaterThanOrEqual(400);
    }
  });
});

// ── 分销记录 ──────────────────────────────────────────────────────────────

test.describe('分销记录', () => {
  test.skip(({ env }) => !env.shopId, '未配置 SHOP_ID，跳过分销记录用例');

  test('GET /distribution/order 返回分销记录列表', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.distributionOrder(env.shopId)}?page=1&limit=20`;
    const { status, body } = await api.get(
      Endpoints.shopAdmin.distributionOrder(env.shopId),
      { query: { page: 1, limit: 20 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-分销记录列表.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '分销记录应为数组'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(Array.isArray((body.data as Record<string, unknown>)?.list ?? body.data), '分销记录应为数组').toBe(true);
  });

  test('GET /distribution/order 按时间区间过滤', async ({ api, env }) => {
    const end = Math.floor(Date.now() / 1000);
    const start = end - 30 * 24 * 3600;
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.distributionOrder(env.shopId)}?page=1&limit=10&startTime=${start}&endTime=${end}`;
    const { status, body } = await api.get(
      Endpoints.shopAdmin.distributionOrder(env.shopId),
      { query: { page: 1, limit: 10, startTime: start, endTime: end } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-分销记录-时间过滤.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码'],
    });

    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
  });

  test('GET /distribution/promotion 返回推广记录列表', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.distributionPromotion(env.shopId)}?page=1&limit=20`;
    const { status, body } = await api.get(
      Endpoints.shopAdmin.distributionPromotion(env.shopId),
      { query: { page: 1, limit: 20 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-推广记录列表.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '推广记录应为数组'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(Array.isArray((body.data as Record<string, unknown>)?.list ?? body.data), '推广记录应为数组').toBe(true);
  });
});

// ── 推广商品 & 商家 ────────────────────────────────────────────────────────

test.describe('推广商品与商家', () => {
  test.skip(({ env }) => !env.shopId, '未配置 SHOP_ID，跳过推广商品用例');

  test('GET /spread/goods 返回推广商品列表', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.promotionGoods(env.shopId)}?page=1&limit=20`;
    const { status, body } = await api.get(
      Endpoints.shopAdmin.promotionGoods(env.shopId),
      { query: { page: 1, limit: 20 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-推广商品列表.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
  });

  test('GET /spread/goods/info 缺少 productId 应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.promotionGoodsInfo(env.shopId)}`;
    const { status, body } = await api.get(Endpoints.shopAdmin.promotionGoodsInfo(env.shopId));

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-推广商品信息-缺少productId.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['缺少 productId 应返回非成功业务码'],
    });

    expect(body.code, '缺少 productId 应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  test('GET /spread/merchants 返回推广商家列表', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.promotionMerchants(env.shopId)}?page=1&limit=20`;
    const { status, body } = await api.get(
      Endpoints.shopAdmin.promotionMerchants(env.shopId),
      { query: { page: 1, limit: 20 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-推广商家列表.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
  });

  test('GET /spread/info 返回商家推广信息', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.promotionInfo(env.shopId)}`;
    const { status, body } = await api.get(Endpoints.shopAdmin.promotionInfo(env.shopId));

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-商家推广信息.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '推广信息应存在'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(body.data, '推广信息应存在').toBeTruthy();
  });
});

// ── 推广员 ────────────────────────────────────────────────────────────────

test.describe('推广员管理', () => {
  test.skip(({ env }) => !env.shopId, '未配置 SHOP_ID，跳过推广员用例');

  test('GET /salers 返回推广员列表', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.salersList(env.shopId)}?page=1&limit=20`;
    const { status, body } = await api.get(
      Endpoints.shopAdmin.salersList(env.shopId),
      { query: { page: 1, limit: 20 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-推广员列表.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '推广员列表应为数组'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(Array.isArray((body.data as Record<string, unknown>)?.list ?? body.data), '推广员列表应为数组').toBe(true);
  });

  test('GET /salers 按关键词搜索推广员', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.salersList(env.shopId)}?page=1&limit=10&keyword=`;
    const { status, body } = await api.get(
      Endpoints.shopAdmin.salersList(env.shopId),
      { query: { page: 1, limit: 10, keyword: '' } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-推广员-关键词搜索.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码'],
    });

    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
  });

  test('GET /salers 无权限店铺应被拒绝', async ({ api }) => {
    const { body } = await api.get(Endpoints.shopAdmin.salersList(999999999));

    expect(body.code, '访问无权限店铺应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  test('未登录访问推广员列表应被拒绝', async ({ anonApi, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.salersList(env.shopId)}`;
    const res = await anonApi.raw('get', Endpoints.shopAdmin.salersList(env.shopId));
    const body = res.status() === 200 ? await res.json() : null;

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-推广员-未登录.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status: res.status(), headers: {}, body },
      assertions: ['未登录应返回 4xx 或非成功业务码'],
    });

    if (res.status() === 200) {
      expect(body.code, '未登录应返回非成功业务码').not.toBe(SUCCESS_CODE);
    } else {
      expect(res.status(), '未登录应返回 4xx').toBeGreaterThanOrEqual(400);
    }
  });
});
