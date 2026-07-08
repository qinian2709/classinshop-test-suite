import { test, expect } from '@shared';
import { Endpoints, SUCCESS_CODE, attachApiCallLog } from '@shared';

/**
 * 退款（需登录）。
 * 覆盖接口：
 *   用户端：
 *     POST /user/order/:id/refund/request        — 用户发起退款申请
 *     GET  /user/order/:id/refund/request        — 查询退款申请状态
 *     GET  /user/order/:id/refund/booking-preview — 约课退款预览（用户端）
 *   商家端（需 SHOP_ID）：
 *     POST /shop/:shopId/refund                  — 商家直接退款（异常）
 *     GET  /shop/:shopId/refund                  — 商家退款列表
 *     GET  /shop/:shopId/refund/booking-preview  — 约课退款预览（商家端，异常）
 *     GET  /shop/:shopId/refund/requests         — 退款申请列表
 *     GET  /shop/:shopId/refund/requests/:id     — 退款申请详情（异常）
 *     POST /shop/:shopId/refund/requests/:id/approve — 审批通过（异常）
 *     POST /shop/:shopId/refund/requests/:id/reject  — 审批拒绝（异常）
 *
 * author：qiukailiang
 */

interface RefundItem {
  id: number;
  orderId?: number;
  amount?: number;
  status?: number;
}

interface RefundListData {
  list: RefundItem[];
  total: number;
}

interface RefundRequestItem {
  id: number;
  orderId?: number;
  status?: number;
  reason?: string;
}

interface RefundRequestListData {
  list: RefundRequestItem[];
  total: number;
}

// ── 用户端退款申请 ────────────────────────────────────────────────────────

test.describe('用户端退款申请', () => {
  test('POST /user/order/:id/refund/request 对不存在订单申请退款应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.user.refundRequest(999999999)}`;
    const payload = { reason: '自动化测试-不存在订单' };
    const { status, body } = await api.post(Endpoints.user.refundRequest(999999999), payload);

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-用户退款申请-不存在订单.json',
      request: { method: 'POST', url, headers: {}, body: payload },
      response: { status, headers: {}, body },
      assertions: ['对不存在订单发起退款应返回非成功业务码'],
    });

    expect(body.code, '对不存在订单发起退款应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  test('POST /user/order/:id/refund/request 缺少 reason 参数应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.user.refundRequest(999999999)}`;
    const { status, body } = await api.post(Endpoints.user.refundRequest(999999999), {});

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-用户退款申请-缺少reason.json',
      request: { method: 'POST', url, headers: {}, body: {} },
      response: { status, headers: {}, body },
      assertions: ['缺少 reason 应返回非成功业务码'],
    });

    expect(body.code, '缺少 reason 应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  test('GET /user/order/:id/refund/request 查询不存在订单的退款申请应失败或为空', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.user.refundRequest(999999999)}`;
    const { status, body } = await api.get(Endpoints.user.refundRequest(999999999));

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-用户退款申请查询-不存在.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['查询不存在订单退款应返回非成功业务码或数据为空'],
    });

    // 可能返回非成功码，也可能返回成功但 data 为空
    if (body.code === SUCCESS_CODE) {
      expect(body.data ?? null, '不存在订单退款申请 data 应为空').toBeFalsy();
    } else {
      expect(body.code, '应返回非成功业务码').not.toBe(SUCCESS_CODE);
    }
  });

  test('GET /user/order/:id/refund/booking-preview 不存在订单应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.user.refundBookingPreview(999999999)}`;
    const { status, body } = await api.get(Endpoints.user.refundBookingPreview(999999999));

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-用户约课退款预览-不存在.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['不存在订单约课退款预览应返回非成功业务码'],
    });

    expect(body.code, '不存在订单约课退款预览应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  test('未登录发起退款申请应被拒绝', async ({ anonApi, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.user.refundRequest(999999999)}`;
    const res = await anonApi.raw('post', Endpoints.user.refundRequest(999999999), {
      data: { reason: '测试' },
    });
    const body = res.status() === 200 ? await res.json() : null;

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-用户退款申请-未登录.json',
      request: { method: 'POST', url, headers: {}, body: { reason: '测试' } },
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

// ── 商家端退款管理 ────────────────────────────────────────────────────────

test.describe('商家端退款管理', () => {
  test.skip(({ env }) => !env.shopId, '未配置 SHOP_ID，跳过商家退款用例');

  // ── 商家退款列表 ──────────────────────────────────────────────────────

  test('GET /shop/:shopId/refund 返回退款列表（分页结构）', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.refundList(env.shopId)}?page=1&limit=20`;
    const { status, body } = await api.get<RefundListData>(
      Endpoints.shopAdmin.refundList(env.shopId),
      { query: { page: 1, limit: 20 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-商家退款列表.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '退款列表应为数组'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(Array.isArray(body.data.list), '退款列表应为数组').toBe(true);
    expect(typeof body.data.total, 'total 应为数字类型').toBe('number');
  });

  test('GET /shop/:shopId/refund 按状态过滤退款列表', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.refundList(env.shopId)}?page=1&limit=10&status=2`;
    const { status, body } = await api.get<RefundListData>(
      Endpoints.shopAdmin.refundList(env.shopId),
      { query: { page: 1, limit: 10, status: 2 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-商家退款列表-状态过滤.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '退款列表应为数组'],
    });

    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(Array.isArray(body.data.list), '退款列表应为数组').toBe(true);
  });

  test('GET /shop/:shopId/refund 无权限店铺应被拒绝', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.refundList(999999999)}`;
    const { status, body } = await api.get(Endpoints.shopAdmin.refundList(999999999));

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-商家退款列表-无权限.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['访问无权限店铺应返回非成功业务码'],
    });

    expect(body.code, '访问无权限店铺应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  // ── 商家直接退款（异常场景）──────────────────────────────────────────

  test('POST /shop/:shopId/refund 缺少必填参数应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}/shop/${env.shopId}/refund`;
    const { status, body } = await api.post(`/shop/${env.shopId}/refund`, {});

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-商家退款-缺少必填.json',
      request: { method: 'POST', url, headers: {}, body: {} },
      response: { status, headers: {}, body },
      assertions: ['缺少必填参数应返回非成功业务码'],
    });

    expect(body.code, '缺少必填参数应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  test('POST /shop/:shopId/refund 对不存在订单退款应失败', async ({ api, env }) => {
    const payload = { orderId: 999999999, amount: 1, reason: '自动化测试' };
    const url = `${env.apiBaseURL}/shop/${env.shopId}/refund`;
    const { status, body } = await api.post(`/shop/${env.shopId}/refund`, payload);

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-商家退款-不存在订单.json',
      request: { method: 'POST', url, headers: {}, body: payload },
      response: { status, headers: {}, body },
      assertions: ['对不存在订单退款应返回非成功业务码'],
    });

    expect(body.code, '对不存在订单退款应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  // ── 约课退款预览（商家端，异常场景）────────────────────────────────

  test('GET /shop/:shopId/refund/booking-preview 不存在订单应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.refundBookingPreview(env.shopId)}?orderId=999999999`;
    const { status, body } = await api.get(
      Endpoints.shopAdmin.refundBookingPreview(env.shopId),
      { query: { orderId: 999999999 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-商家约课退款预览-不存在.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['不存在订单退款预览应返回非成功业务码'],
    });

    expect(body.code, '不存在订单退款预览应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  // ── 退款申请列表 ──────────────────────────────────────────────────────

  test('GET /shop/:shopId/refund/requests 返回退款申请列表', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.refundRequestList(env.shopId)}?page=1&limit=20`;
    const { status, body } = await api.get<RefundRequestListData>(
      Endpoints.shopAdmin.refundRequestList(env.shopId),
      { query: { page: 1, limit: 20 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-退款申请列表.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '退款申请列表应为数组'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(Array.isArray(body.data.list), '退款申请列表应为数组').toBe(true);
    expect(typeof body.data.total, 'total 应为数字类型').toBe('number');
  });

  test('GET /shop/:shopId/refund/requests 按状态过滤', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.refundRequestList(env.shopId)}?page=1&limit=10&status=0`;
    const { status, body } = await api.get<RefundRequestListData>(
      Endpoints.shopAdmin.refundRequestList(env.shopId),
      { query: { page: 1, limit: 10, status: 0 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-退款申请列表-状态过滤.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['业务 code 应为成功码', '退款申请列表应为数组'],
    });

    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(Array.isArray(body.data.list), '退款申请列表应为数组').toBe(true);
  });

  // ── 退款申请详情（异常场景）──────────────────────────────────────────

  test('GET /shop/:shopId/refund/requests/:id 查询不存在申请应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.refundRequestDetail(env.shopId, 999999999)}`;
    const { status, body } = await api.get(
      Endpoints.shopAdmin.refundRequestDetail(env.shopId, 999999999),
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-退款申请详情-不存在.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['查询不存在退款申请应返回非成功业务码'],
    });

    expect(body.code, '查询不存在退款申请应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  // ── 审批通过/拒绝（异常场景）────────────────────────────────────────

  test('POST /shop/:shopId/refund/requests/:id/approve 审批不存在申请应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.refundRequestApprove(env.shopId, 999999999)}`;
    const { status, body } = await api.post(
      Endpoints.shopAdmin.refundRequestApprove(env.shopId, 999999999),
      {},
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-退款申请审批-不存在.json',
      request: { method: 'POST', url, headers: {}, body: {} },
      response: { status, headers: {}, body },
      assertions: ['审批不存在退款申请应返回非成功业务码'],
    });

    expect(body.code, '审批不存在退款申请应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  test('POST /shop/:shopId/refund/requests/:id/reject 拒绝不存在申请应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.refundRequestReject(env.shopId, 999999999)}`;
    const { status, body } = await api.post(
      Endpoints.shopAdmin.refundRequestReject(env.shopId, 999999999),
      { reason: '测试拒绝' },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-退款申请拒绝-不存在.json',
      request: { method: 'POST', url, headers: {}, body: { reason: '测试拒绝' } },
      response: { status, headers: {}, body },
      assertions: ['拒绝不存在退款申请应返回非成功业务码'],
    });

    expect(body.code, '拒绝不存在退款申请应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  /**
   * 退款申请详情链路：GET /refund/requests 提取 id → GET/POST 详情/审批。
   */
  test('退款申请详情链路：列表 -> 详情', async ({ api, env }) => {
    const listUrl = `${env.apiBaseURL}${Endpoints.shopAdmin.refundRequestList(env.shopId)}?page=1&limit=1`;
    const { body: listBody } = await api.get<RefundRequestListData>(
      Endpoints.shopAdmin.refundRequestList(env.shopId),
      { query: { page: 1, limit: 1 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-退款申请链路-列表.json',
      request: { method: 'GET', url: listUrl, headers: {}, body: null },
      response: { status: 200, headers: {}, body: listBody },
      assertions: ['获取退款申请列表应成功'],
    });

    expect(listBody.code, '获取退款申请列表应成功').toBe(SUCCESS_CODE);
    test.skip(!listBody.data?.list?.[0], '当前无退款申请数据，跳过详情链路');

    const requestId = listBody.data.list[0]!.id;
    const detailUrl = `${env.apiBaseURL}${Endpoints.shopAdmin.refundRequestDetail(env.shopId, requestId)}`;
    const { status, body } = await api.get(
      Endpoints.shopAdmin.refundRequestDetail(env.shopId, requestId),
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-退款申请链路-详情.json',
      request: { method: 'GET', url: detailUrl, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '退款申请详情数据应存在'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(body.data, '退款申请详情数据应存在').toBeTruthy();
  });

  // ── 鉴权 ──────────────────────────────────────────────────────────────

  test('未登录访问退款列表应被拒绝', async ({ anonApi, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.refundList(env.shopId)}`;
    const res = await anonApi.raw('get', Endpoints.shopAdmin.refundList(env.shopId));
    const body = res.status() === 200 ? await res.json() : null;

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-商家退款列表-未登录.json',
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
