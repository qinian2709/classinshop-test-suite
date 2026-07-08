import { test, expect } from '@shared';
import { Endpoints, SUCCESS_CODE, attachApiCallLog } from '@shared';

/**
 * 营销活动管理（需登录 + SHOP_ID）。
 * 覆盖接口：
 *   GET  /shop/:shopId/activity/multi-course/list        — 联报活动列表
 *   GET  /shop/:shopId/activity/multi-course/:id         — 联报活动详情（异常）
 *   POST /shop/:shopId/activity/multi-course/create      — 新建联报（缺参异常）
 *   POST /shop/:shopId/activity/multi-course/status      — 修改联报状态（异常）
 *   POST /shop/:shopId/activity/multi-course/delete      — 删除联报（异常）
 *   GET  /shop/:shopId/activity/group/list               — 拼团活动列表
 *   GET  /shop/:shopId/activity/group/:id                — 拼团详情（异常）
 *   POST /shop/:shopId/activity/group/create             — 新建拼团（缺参异常）
 *   POST /shop/:shopId/activity/group/status             — 修改拼团状态（异常）
 *   POST /shop/:shopId/activity/group/delete             — 删除拼团（异常）
 *   GET  /shop/:shopId/activity/limited-time-discount/list   — 限时折扣列表
 *   GET  /shop/:shopId/activity/limited-time-discount/:id    — 限时折扣详情（异常）
 *   POST /shop/:shopId/activity/limited-time-discount/create — 新建折扣（缺参异常）
 *   POST /shop/:shopId/activity/limited-time-discount/status — 修改折扣状态（异常）
 *
 * author：qiukailiang
 */

// ── 联报活动 ──────────────────────────────────────────────────────────────

test.describe('联报活动', () => {
  test.skip(({ env }) => !env.shopId, '未配置 SHOP_ID，跳过联报活动用例');

  test('GET /activity/multi-course/list 返回联报活动列表', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.activityMultiCourseList(env.shopId)}?page=1&limit=10`;
    const { status, body } = await api.get<{ list: unknown[]; total: number }>(
      Endpoints.shopAdmin.activityMultiCourseList(env.shopId),
      { query: { page: 1, limit: 10 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-联报-活动列表.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '联报列表应为数组'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(Array.isArray(body.data.list), '联报列表应为数组').toBe(true);
    expect(typeof body.data.total, 'total 应为数字类型').toBe('number');
  });

  test('GET /activity/multi-course/:id 查询不存在联报应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.activityMultiCourseDetail(env.shopId, 999999999)}`;
    const { status, body } = await api.get(
      Endpoints.shopAdmin.activityMultiCourseDetail(env.shopId, 999999999),
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-联报-详情-不存在.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['查询不存在联报应返回非成功业务码'],
    });

    expect(body.code, '查询不存在联报应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  test('POST /activity/multi-course/create 缺少必填字段应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.activityMultiCourseCreate(env.shopId)}`;
    const { status, body } = await api.post(
      Endpoints.shopAdmin.activityMultiCourseCreate(env.shopId),
      {},
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-联报-创建-缺少必填.json',
      request: { method: 'POST', url, headers: {}, body: {} },
      response: { status, headers: {}, body },
      assertions: ['缺少必填字段应返回非成功业务码'],
    });

    expect(body.code, '缺少必填字段应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  test('POST /activity/multi-course/status 修改不存在联报状态应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.activityMultiCourseStatus(env.shopId)}`;
    const { status, body } = await api.post(
      Endpoints.shopAdmin.activityMultiCourseStatus(env.shopId),
      { id: 999999999, status: 0 },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-联报-状态-不存在.json',
      request: { method: 'POST', url, headers: {}, body: { id: 999999999, status: 0 } },
      response: { status, headers: {}, body },
      assertions: ['修改不存在联报状态应返回非成功业务码'],
    });

    expect(body.code, '修改不存在联报状态应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  test('POST /activity/multi-course/delete 删除不存在联报应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.activityMultiCourseDelete(env.shopId)}`;
    const { status, body } = await api.post(
      Endpoints.shopAdmin.activityMultiCourseDelete(env.shopId),
      { id: 999999999 },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-联报-删除-不存在.json',
      request: { method: 'POST', url, headers: {}, body: { id: 999999999 } },
      response: { status, headers: {}, body },
      assertions: ['删除不存在联报应返回非成功业务码'],
    });

    expect(body.code, '删除不存在联报应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });
});

// ── 拼团活动 ──────────────────────────────────────────────────────────────

test.describe('拼团活动', () => {
  test.skip(({ env }) => !env.shopId, '未配置 SHOP_ID，跳过拼团活动用例');

  test('GET /activity/group/list 返回拼团活动列表', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.activityGroupList(env.shopId)}?page=1&limit=10`;
    const { status, body } = await api.get<{ list: unknown[]; total: number }>(
      Endpoints.shopAdmin.activityGroupList(env.shopId),
      { query: { page: 1, limit: 10 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-拼团-活动列表.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '拼团列表应为数组'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(Array.isArray(body.data.list), '拼团列表应为数组').toBe(true);
    expect(typeof body.data.total, 'total 应为数字类型').toBe('number');
  });

  test('GET /activity/group/:id 查询不存在拼团应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.activityGroupDetail(env.shopId, 999999999)}`;
    const { status, body } = await api.get(
      Endpoints.shopAdmin.activityGroupDetail(env.shopId, 999999999),
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-拼团-详情-不存在.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['查询不存在拼团应返回非成功业务码'],
    });

    expect(body.code, '查询不存在拼团应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  test('POST /activity/group/create 缺少必填字段应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.activityGroupCreate(env.shopId)}`;
    const { status, body } = await api.post(
      Endpoints.shopAdmin.activityGroupCreate(env.shopId),
      {},
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-拼团-创建-缺少必填.json',
      request: { method: 'POST', url, headers: {}, body: {} },
      response: { status, headers: {}, body },
      assertions: ['缺少必填字段应返回非成功业务码'],
    });

    expect(body.code, '缺少必填字段应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  test('POST /activity/group/status 修改不存在拼团状态应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.activityGroupStatus(env.shopId)}`;
    const { status, body } = await api.post(
      Endpoints.shopAdmin.activityGroupStatus(env.shopId),
      { id: 999999999, status: 0 },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-拼团-状态-不存在.json',
      request: { method: 'POST', url, headers: {}, body: { id: 999999999, status: 0 } },
      response: { status, headers: {}, body },
      assertions: ['修改不存在拼团状态应返回非成功业务码'],
    });

    expect(body.code, '修改不存在拼团状态应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  test('POST /activity/group/delete 删除不存在拼团应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.activityGroupDelete(env.shopId)}`;
    const { status, body } = await api.post(
      Endpoints.shopAdmin.activityGroupDelete(env.shopId),
      { id: 999999999 },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-拼团-删除-不存在.json',
      request: { method: 'POST', url, headers: {}, body: { id: 999999999 } },
      response: { status, headers: {}, body },
      assertions: ['删除不存在拼团应返回非成功业务码'],
    });

    expect(body.code, '删除不存在拼团应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });
});

// ── 限时折扣活动 ──────────────────────────────────────────────────────────

test.describe('限时折扣活动', () => {
  test.skip(({ env }) => !env.shopId, '未配置 SHOP_ID，跳过限时折扣用例');

  test('GET /activity/limited-time-discount/list 返回限时折扣列表', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.activityLimitedTimeDiscountList(env.shopId)}?page=1&limit=10`;
    const { status, body } = await api.get<{ list: unknown[]; total: number }>(
      Endpoints.shopAdmin.activityLimitedTimeDiscountList(env.shopId),
      { query: { page: 1, limit: 10 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-限时折扣-活动列表.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '限时折扣列表应为数组'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(Array.isArray(body.data.list), '限时折扣列表应为数组').toBe(true);
    expect(typeof body.data.total, 'total 应为数字类型').toBe('number');
  });

  test('GET /activity/limited-time-discount/:id 查询不存在折扣应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.activityLimitedTimeDiscountDetail(env.shopId, 999999999)}`;
    const { status, body } = await api.get(
      Endpoints.shopAdmin.activityLimitedTimeDiscountDetail(env.shopId, 999999999),
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-限时折扣-详情-不存在.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['查询不存在限时折扣应返回非成功业务码'],
    });

    expect(body.code, '查询不存在限时折扣应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  test('POST /activity/limited-time-discount/create 缺少必填字段应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.activityLimitedTimeDiscountCreate(env.shopId)}`;
    const { status, body } = await api.post(
      Endpoints.shopAdmin.activityLimitedTimeDiscountCreate(env.shopId),
      {},
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-限时折扣-创建-缺少必填.json',
      request: { method: 'POST', url, headers: {}, body: {} },
      response: { status, headers: {}, body },
      assertions: ['缺少必填字段应返回非成功业务码'],
    });

    expect(body.code, '缺少必填字段应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  test('POST /activity/limited-time-discount/status 修改不存在折扣状态应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.activityLimitedTimeDiscountStatus(env.shopId)}`;
    const { status, body } = await api.post(
      Endpoints.shopAdmin.activityLimitedTimeDiscountStatus(env.shopId),
      { id: 999999999, status: 0 },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-限时折扣-状态-不存在.json',
      request: { method: 'POST', url, headers: {}, body: { id: 999999999, status: 0 } },
      response: { status, headers: {}, body },
      assertions: ['修改不存在限时折扣状态应返回非成功业务码'],
    });

    expect(body.code, '修改不存在限时折扣状态应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  test('未登录访问限时折扣列表应被拒绝', async ({ anonApi, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.activityLimitedTimeDiscountList(env.shopId)}`;
    const res = await anonApi.raw('get', Endpoints.shopAdmin.activityLimitedTimeDiscountList(env.shopId));
    const body = res.status() === 200 ? await res.json() : null;

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-限时折扣-未登录.json',
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
