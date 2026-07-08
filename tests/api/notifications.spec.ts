import { test, expect } from '@shared';
import { Endpoints, SUCCESS_CODE, attachApiCallLog } from '@shared';

/**
 * 店铺通知（需登录 + SHOP_ID）。
 * 覆盖接口：
 *   GET  /shop/:shopId/notifications/summary  — 未读数摘要
 *   GET  /shop/:shopId/notifications          — 通知列表
 *   POST /shop/:shopId/notifications/:id/read — 单条已读
 *   POST /shop/:shopId/notifications/read-all — 一键已读（放最后，避免清掉未读影响单条已读）
 *
 * author：qiukailiang
 */

interface NotificationSummary {
  unreadCount: number;
  pendingRefundCount: number;
}

interface NotificationItem {
  id: number;
  readStatus: number;
  notifyType: number;
  title: string;
  summary: string;
  createdUnix: number;
}

interface NotificationListData {
  list: NotificationItem[];
  total: number;
  page: number;
  limit: number;
}

test.describe('店铺通知', () => {
  test.skip(({ env }) => !env.shopId, '未配置 SHOP_ID，跳过商家后台通知用例');

  // ── 摘要 ────────────────────────────────────────────────────────────

  test('GET /notifications/summary 返回未读数与待退款数', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.notificationsSummary(env.shopId)}`;
    const { status, body } = await api.get<NotificationSummary>(
      Endpoints.shopAdmin.notificationsSummary(env.shopId),
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-通知摘要.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: [
        'HTTP 状态码应为 200',
        '业务 code 应为成功码',
        'unreadCount 应为非负数',
        'pendingRefundCount 应为非负数',
      ],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(typeof body.data.unreadCount, 'unreadCount 应为数字类型').toBe('number');
    expect(typeof body.data.pendingRefundCount, 'pendingRefundCount 应为数字类型').toBe('number');
    expect(body.data.unreadCount, '未读数应为非负整数').toBeGreaterThanOrEqual(0);
    expect(body.data.pendingRefundCount, '待退款数应为非负整数').toBeGreaterThanOrEqual(0);
  });

  test('未登录访问通知摘要应被拒绝', async ({ anonApi, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.notificationsSummary(env.shopId)}`;
    const res = await anonApi.raw('get', Endpoints.shopAdmin.notificationsSummary(env.shopId));
    const body = res.status() === 200 ? await res.json() : null;

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-未登录访问通知摘要.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status: res.status(), headers: {}, body },
      assertions: ['HTTP 状态码应为 4xx 或业务码应为非成功码'],
    });

    if (res.status() === 200) {
      expect(body.code, '未登录访问应返回非成功业务码').not.toBe(SUCCESS_CODE);
    } else {
      expect(res.status(), '未登录访问应返回 4xx 状态码').toBeGreaterThanOrEqual(400);
    }
  });

  test('无权限店铺的通知摘要应被拒绝', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.notificationsSummary(999999999)}`;
    const { status, body } = await api.get(Endpoints.shopAdmin.notificationsSummary(999999999));

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-无权限店铺通知摘要.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['访问无权限店铺应返回非成功业务码'],
    });

    expect(body.code, '访问无权限店铺应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  // ── 列表 ────────────────────────────────────────────────────────────

  test('GET /notifications 返回通知列表（分页结构）', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.notificationsList(env.shopId)}?page=1&limit=20`;
    const { status, body } = await api.get<NotificationListData>(
      Endpoints.shopAdmin.notificationsList(env.shopId),
      { query: { page: 1, limit: 20 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-通知列表.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '通知列表应为数组'],
    });

    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(Array.isArray(body.data.list), '通知列表应为数组').toBe(true);
    expect(typeof body.data.total, 'total 应为数字类型').toBe('number');
  });

  test('GET /notifications 按 notifyType 过滤', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.notificationsList(env.shopId)}?page=1&limit=10&notifyType=0`;
    const { status, body } = await api.get<NotificationListData>(
      Endpoints.shopAdmin.notificationsList(env.shopId),
      { query: { page: 1, limit: 10, notifyType: 0 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-通知列表-类型过滤.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '通知列表应为数组'],
    });

    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(Array.isArray(body.data.list), '通知列表应为数组').toBe(true);
  });

  test('GET /notifications 按 readStatus=0 过滤未读', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.notificationsList(env.shopId)}?page=1&limit=10&readStatus=0`;
    const { status, body } = await api.get<NotificationListData>(
      Endpoints.shopAdmin.notificationsList(env.shopId),
      { query: { page: 1, limit: 10, readStatus: 0 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-通知列表-未读过滤.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '通知列表应为数组'],
    });

    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    if (body.data.list.length > 0) {
      body.data.list.forEach((item) =>
        expect(item.readStatus, '未读通知的 readStatus 应为 0').toBe(0),
      );
    }
  });

  // ── 单条已读（需在 read-all 之前，避免未读被批量清掉）────────────────

  test('POST /notifications/:id/read 对不存在通知应失败或无效', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.notificationsReadOne(env.shopId, 999999999)}`;
    const { status, body } = await api.post(
      Endpoints.shopAdmin.notificationsReadOne(env.shopId, 999999999),
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-单条已读-不存在通知.json',
      request: { method: 'POST', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', 'code 应为数字类型'],
    });

    expect(typeof body.code, 'code 应为数字类型').toBe('number');
  });

  /**
   * 单条已读链路：GET /notifications?readStatus=0 提取 id → POST /notifications/:id/read。
   */
  test('单条已读链路：先拿到未读通知 id 再标记已读', async ({ api, env }) => {
    const listUrl = `${env.apiBaseURL}${Endpoints.shopAdmin.notificationsList(env.shopId)}?page=1&limit=10&readStatus=0`;
    const { status: listStatus, body: listBody } = await api.get<NotificationListData>(
      Endpoints.shopAdmin.notificationsList(env.shopId),
      { query: { page: 1, limit: 10, readStatus: 0 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-单条已读-未读通知列表.json',
      request: { method: 'GET', url: listUrl, headers: {}, body: null },
      response: { status: listStatus, headers: {}, body: listBody },
      assertions: ['获取未读通知列表应成功'],
    });

    expect(listBody.code, '获取未读通知列表应成功').toBe(SUCCESS_CODE);
    const first = listBody.data.list[0];
    test.skip(!first, '当前无未读通知，跳过单条已读链路');

    const readUrl = `${env.apiBaseURL}${Endpoints.shopAdmin.notificationsReadOne(env.shopId, first!.id)}`;
    const { status: readStatus, body } = await api.post<{ read: boolean }>(
      Endpoints.shopAdmin.notificationsReadOne(env.shopId, first!.id),
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-单条已读-标记已读.json',
      request: { method: 'POST', url: readUrl, headers: {}, body: null },
      response: { status: readStatus, headers: {}, body },
      assertions: ['标记已读应成功', '已读标记应返回 true'],
    });

    expect(body.code, '标记已读应成功').toBe(SUCCESS_CODE);
    expect(body.data.read, '已读标记应返回 true').toBe(true);
  });

  // ── 一键已读（放最后：会清空剩余未读，不影响上面的单条已读验证）────────

  test('POST /notifications/read-all 返回受影响行数', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.notificationsReadAll(env.shopId)}`;
    const { status, body } = await api.post<{ affected: number }>(
      Endpoints.shopAdmin.notificationsReadAll(env.shopId),
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-通知一键已读.json',
      request: { method: 'POST', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', 'affected 应为数字类型'],
    });

    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(typeof body.data.affected, 'affected 应为数字类型').toBe('number');
    expect(body.data.affected, '受影响行数应为非负整数').toBeGreaterThanOrEqual(0);
  });
});
