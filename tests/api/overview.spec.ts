import { test, expect } from '@shared';
import { Endpoints, SUCCESS_CODE, attachApiCallLog } from '@shared';

/**
 * 概况页（需登录 + SHOP_ID）。
 * 覆盖接口：
 *   GET /shop/:shopId/overview/operation — 运营数据
 *   GET /shop/:shopId/overview/todo      — 待办事项
 *   GET /shop/:shopId/overview/goods     — 商品概况
 *   GET /shop/:shopId/overview/dynamics  — 动态消息
 *
 * author：qiukailiang
 */

test.describe('概况页', () => {
  test.skip(({ env }) => !env.shopId, '未配置 SHOP_ID，跳过概况页用例');

  // ── 运营数据 ──────────────────────────────────────────────────────────

  test('GET /overview/operation 返回运营核心指标', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.overviewOperation(env.shopId)}`;
    const { status, body } = await api.get(Endpoints.shopAdmin.overviewOperation(env.shopId));

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-概况-运营数据.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '运营数据应存在'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(body.data, '运营数据应存在').toBeTruthy();
  });

  test('GET /overview/operation 无权限店铺应被拒绝', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.overviewOperation(999999999)}`;
    const { status, body } = await api.get(Endpoints.shopAdmin.overviewOperation(999999999));

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-概况-运营数据-无权限.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['访问无权限店铺应返回非成功业务码'],
    });

    expect(body.code, '访问无权限店铺应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  // ── 待办事项 ──────────────────────────────────────────────────────────

  test('GET /overview/todo 返回待办事项列表', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.overviewTodo(env.shopId)}`;
    const { status, body } = await api.get(Endpoints.shopAdmin.overviewTodo(env.shopId));

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-概况-待办事项.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '待办数据应存在'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(body.data, '待办数据应存在').toBeTruthy();
  });

  // ── 商品概况 ──────────────────────────────────────────────────────────

  test('GET /overview/goods 返回商品概况数据', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.overviewGoods(env.shopId)}`;
    const { status, body } = await api.get(Endpoints.shopAdmin.overviewGoods(env.shopId));

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-概况-商品概况.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '商品概况数据应存在'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(body.data, '商品概况数据应存在').toBeTruthy();
  });

  // ── 动态消息 ──────────────────────────────────────────────────────────

  test('GET /overview/dynamics 返回店铺动态消息', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.overviewDynamics(env.shopId)}`;
    const { status, body } = await api.get(Endpoints.shopAdmin.overviewDynamics(env.shopId));

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-概况-动态消息.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '动态数据应存在'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(body.data, '动态数据应存在').toBeTruthy();
  });

  // ── 鉴权 ──────────────────────────────────────────────────────────────

  test('未登录访问概况页应被拒绝', async ({ anonApi, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.overviewOperation(env.shopId)}`;
    const res = await anonApi.raw('get', Endpoints.shopAdmin.overviewOperation(env.shopId));
    const body = res.status() === 200 ? await res.json() : null;

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-概况-未登录.json',
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
