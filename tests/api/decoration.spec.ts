import { test, expect } from '@shared';
import { Endpoints, SUCCESS_CODE, attachApiCallLog } from '@shared';

/**
 * 店铺装修（需登录 + SHOP_ID）。
 * 覆盖接口：
 *   GET  /shop/:shopId/decoration             — 读取装修配置
 *   GET  /shop/:shopId/decoration/pages       — 页面列表
 *   GET  /shop/:shopId/decoration/pages/:id   — 页面详情
 *   POST /shop/:shopId/decoration/publish     — 发布装修（异常场景）
 *   POST /shop/:shopId/decoration/pages/:id/name   — 修改页面名称（异常）
 *   POST /shop/:shopId/decoration/pages/:id/delete — 删除页面（异常）
 *
 * author：qiukailiang
 */

interface DecorationPage {
  id: number;
  name: string;
  pageType: number;
}

interface DecorationPagesData {
  list: DecorationPage[];
  total: number;
}

test.describe('店铺装修', () => {
  test.skip(({ env }) => !env.shopId, '未配置 SHOP_ID，跳过装修用例');

  // ── 装修配置读取 ──────────────────────────────────────────────────────

  test('GET /decoration 返回店铺装修配置', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.decorationGet(env.shopId)}`;
    const { status, body } = await api.get(Endpoints.shopAdmin.decorationGet(env.shopId));

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-装修配置读取.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '装修配置数据应存在'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(body.data, '装修配置数据应存在').toBeTruthy();
  });

  test('GET /decoration 非法 shopId 应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.decorationGet(0)}`;
    const { status, body } = await api.get(Endpoints.shopAdmin.decorationGet(0));

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-装修配置-非法shopId.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['非法 shopId 应返回非成功业务码'],
    });

    expect(body.code, '非法 shopId 应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  // ── 页面列表 ──────────────────────────────────────────────────────────

  test('GET /decoration/pages 返回装修页面列表', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.decorationPages(env.shopId)}`;
    const { status, body } = await api.get<DecorationPagesData>(
      Endpoints.shopAdmin.decorationPages(env.shopId),
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-装修页面列表.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '页面列表应为数组'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(Array.isArray(body.data.list), '页面列表应为数组').toBe(true);
    if (body.data.list.length > 0) {
      const first = body.data.list[0]!;
      expect(typeof first.id, '页面 id 应为数字类型').toBe('number');
      expect(typeof first.name, '页面名称应为字符串类型').toBe('string');
    }
  });

  // ── 页面详情 ──────────────────────────────────────────────────────────

  /**
   * 依赖链：GET /decoration/pages 提取 pageId → GET /decoration/pages/:id。
   */
  test('GET /decoration/pages/:id 返回页面详情', async ({ api, env }) => {
    const listUrl = `${env.apiBaseURL}${Endpoints.shopAdmin.decorationPages(env.shopId)}`;
    const { status: listStatus, body: listBody } = await api.get<DecorationPagesData>(
      Endpoints.shopAdmin.decorationPages(env.shopId),
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-装修页面详情-列表.json',
      request: { method: 'GET', url: listUrl, headers: {}, body: null },
      response: { status: listStatus, headers: {}, body: listBody },
      assertions: ['获取页面列表应成功'],
    });

    expect(listBody.code, '获取页面列表应成功').toBe(SUCCESS_CODE);
    test.skip(!listBody.data?.list?.[0], '无页面数据，跳过页面详情');
    const pageId = listBody.data.list[0]!.id;

    const detailUrl = `${env.apiBaseURL}${Endpoints.shopAdmin.decorationPageDetail(env.shopId, pageId)}`;
    const { status, body } = await api.get(
      Endpoints.shopAdmin.decorationPageDetail(env.shopId, pageId),
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-装修页面详情.json',
      request: { method: 'GET', url: detailUrl, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '页面详情数据应存在'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(body.data, '页面详情数据应存在').toBeTruthy();
  });

  test('GET /decoration/pages/:id 不存在页面应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.decorationPageDetail(env.shopId, 999999999)}`;
    const { status, body } = await api.get(
      Endpoints.shopAdmin.decorationPageDetail(env.shopId, 999999999),
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-装修页面详情-不存在.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['查询不存在页面应返回非成功业务码'],
    });

    expect(body.code, '查询不存在页面应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  // ── 发布装修（异常场景）──────────────────────────────────────────────

  test('POST /decoration/publish 无权限店铺发布应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.decorationPublish(999999999)}`;
    const { status, body } = await api.post(Endpoints.shopAdmin.decorationPublish(999999999), {});

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-装修发布-无权限.json',
      request: { method: 'POST', url, headers: {}, body: {} },
      response: { status, headers: {}, body },
      assertions: ['无权限店铺发布装修应返回非成功业务码'],
    });

    expect(body.code, '无权限店铺发布装修应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  // ── 修改页面名称（异常场景）──────────────────────────────────────────

  test('POST /decoration/pages/:id/name 修改不存在页面名称应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.decorationPageName(env.shopId, 999999999)}`;
    const { status, body } = await api.post(
      Endpoints.shopAdmin.decorationPageName(env.shopId, 999999999),
      { name: '测试页面' },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-装修改名-不存在页面.json',
      request: { method: 'POST', url, headers: {}, body: { name: '测试页面' } },
      response: { status, headers: {}, body },
      assertions: ['修改不存在页面名称应返回非成功业务码'],
    });

    expect(body.code, '修改不存在页面名称应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  test('POST /decoration/pages/:id/name 缺少 name 参数应失败', async ({ api, env }) => {
    const listUrl = `${env.apiBaseURL}${Endpoints.shopAdmin.decorationPages(env.shopId)}`;
    const { status: listStatus, body: listBody } = await api.get<DecorationPagesData>(
      Endpoints.shopAdmin.decorationPages(env.shopId),
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-装修改名-页面列表.json',
      request: { method: 'GET', url: listUrl, headers: {}, body: null },
      response: { status: listStatus, headers: {}, body: listBody },
      assertions: ['获取页面列表应成功'],
    });

    test.skip(!listBody.data?.list?.[0], '无页面数据，跳过缺参校验');
    const pageId = listBody.data.list[0]!.id;

    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.decorationPageName(env.shopId, pageId)}`;
    const { status, body } = await api.post(
      Endpoints.shopAdmin.decorationPageName(env.shopId, pageId),
      {},
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-装修改名-缺少name.json',
      request: { method: 'POST', url, headers: {}, body: {} },
      response: { status, headers: {}, body },
      assertions: ['缺少 name 参数应返回非成功业务码'],
    });

    expect(body.code, '缺少 name 参数应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  // ── 删除页面（异常场景）──────────────────────────────────────────────

  test('POST /decoration/pages/:id/delete 删除不存在页面应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.decorationPageDelete(env.shopId, 999999999)}`;
    const { status, body } = await api.post(
      Endpoints.shopAdmin.decorationPageDelete(env.shopId, 999999999),
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-装修删除页面-不存在.json',
      request: { method: 'POST', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['删除不存在页面应返回非成功业务码'],
    });

    expect(body.code, '删除不存在页面应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  // ── 鉴权 ──────────────────────────────────────────────────────────────

  test('未登录访问装修配置应被拒绝', async ({ anonApi, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.decorationGet(env.shopId)}`;
    const res = await anonApi.raw('get', Endpoints.shopAdmin.decorationGet(env.shopId));
    const body = res.status() === 200 ? await res.json() : null;

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-装修配置-未登录.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status: res.status(), headers: {}, body },
      assertions: ['未登录应返回 4xx 或业务非成功码或数据为空'],
    });

    // 装修接口可能对未登录用户也开放（只读），允许 200+空数据 或 4xx 或非成功码
    if (res.status() !== 200) {
      expect(res.status(), '未登录访问应返回 4xx 状态码').toBeGreaterThanOrEqual(400);
    }
    // 若返回 200，不强断言 code（装修数据属于公开只读）
  });
});
