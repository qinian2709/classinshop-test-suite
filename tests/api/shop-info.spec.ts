import { test, expect } from '@shared';
import { Endpoints, SUCCESS_CODE, attachApiCallLog } from '@shared';

/**
 * 店铺基础信息（需登录 + SHOP_ID）。
 * 覆盖接口：
 *   POST /shop/:shopId/info                    — 更新店铺基础信息（异常）
 *   GET  /shop/:shopId/share                   — 店铺分享信息
 *   GET  /shop/:shopId/goods/attribute/list    — 商品属性列表
 *   POST /shop/:shopId/goods/attribute/create  — 创建商品属性（异常）
 *   GET  /shop/:shopId/classin/version-limit   — ClassIn 版本限制
 *   POST /shop/:shopId/member/guide/complete   — 标记新手引导完成
 *
 * author：qiukailiang
 */

interface AttributeItem {
  id: number;
  name: string;
}

test.describe('店铺基础信息', () => {
  test.skip(({ env }) => !env.shopId, '未配置 SHOP_ID，跳过店铺基础信息用例');

  // ── 店铺分享信息 ──────────────────────────────────────────────────────

  test('GET /shop/:shopId/share 返回分享链接与二维码', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.shopShare(env.shopId)}`;
    const { status, body } = await api.get(Endpoints.shopAdmin.shopShare(env.shopId));

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-店铺分享信息.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '分享数据应存在'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(body.data, '分享数据应存在').toBeTruthy();
  });

  test('GET /shop/:shopId/share 无权限店铺应被拒绝', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.shopShare(999999999)}`;
    const { status, body } = await api.get(Endpoints.shopAdmin.shopShare(999999999));

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-店铺分享信息-无权限.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['访问无权限店铺应返回非成功业务码'],
    });

    expect(body.code, '访问无权限店铺应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  // ── 更新店铺基础信息（异常场景）────────────────────────────────────

  test('POST /shop/:shopId/info 缺少必填字段应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.shopInfo(env.shopId)}`;
    const { status, body } = await api.post(Endpoints.shopAdmin.shopInfo(env.shopId), {});

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-更新店铺信息-缺少必填.json',
      request: { method: 'POST', url, headers: {}, body: {} },
      response: { status, headers: {}, body },
      assertions: ['缺少必填字段应返回非成功业务码'],
    });

    expect(body.code, '缺少必填字段应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  test('POST /shop/:shopId/info 无权限店铺应被拒绝', async ({ api, env }) => {
    const payload = { name: '测试店铺', description: '测试' };
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.shopInfo(999999999)}`;
    const { status, body } = await api.post(Endpoints.shopAdmin.shopInfo(999999999), payload);

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-更新店铺信息-无权限.json',
      request: { method: 'POST', url, headers: {}, body: payload },
      response: { status, headers: {}, body },
      assertions: ['访问无权限店铺应返回非成功业务码'],
    });

    expect(body.code, '访问无权限店铺应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  // ── 商品属性列表 ──────────────────────────────────────────────────────

  test('GET /shop/:shopId/goods/attribute/list 返回属性列表', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.attributeList(env.shopId)}`;
    const { status, body } = await api.get<AttributeItem[]>(
      Endpoints.shopAdmin.attributeList(env.shopId),
      { query: { pid: 0 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-商品属性列表.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '属性列表应为数组'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(Array.isArray(body.data), '属性列表应为数组').toBe(true);
  });

  // ── 创建商品属性（异常场景）──────────────────────────────────────────

  test('POST /shop/:shopId/goods/attribute/create 缺少 name 应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.attributeCreate(env.shopId)}`;
    const { status, body } = await api.post(Endpoints.shopAdmin.attributeCreate(env.shopId), {});

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-创建商品属性-缺少name.json',
      request: { method: 'POST', url, headers: {}, body: {} },
      response: { status, headers: {}, body },
      assertions: ['缺少 name 应返回非成功业务码'],
    });

    expect(body.code, '缺少 name 应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  // ── ClassIn 版本限制 ──────────────────────────────────────────────────

  test('GET /shop/:shopId/classin/version-limit 返回版本限额', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.shopClassinVersionLimit(env.shopId)}`;
    const { status, body } = await api.get(Endpoints.shopAdmin.shopClassinVersionLimit(env.shopId));

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-ClassIn版本限额.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '版本限额数据应存在'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(body.data, '版本限额数据应存在').toBeTruthy();
  });

  // ── 新手引导完成 ──────────────────────────────────────────────────────

  test('POST /shop/:shopId/member/guide/complete 标记引导完成应返回成功', async ({ api, env }) => {
    const url = `${env.apiBaseURL}/shop/${env.shopId}/member/guide/complete`;
    const { status, body } = await api.post(`/shop/${env.shopId}/member/guide/complete`, {});

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-新手引导完成.json',
      request: { method: 'POST', url, headers: {}, body: {} },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
  });

  // ── 鉴权 ──────────────────────────────────────────────────────────────

  test('未登录访问店铺分享信息应被拒绝', async ({ anonApi, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.shopShare(env.shopId)}`;
    const res = await anonApi.raw('get', Endpoints.shopAdmin.shopShare(env.shopId));
    const body = res.status() === 200 ? await res.json() : null;

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-店铺分享信息-未登录.json',
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
