import { test, expect } from '@shared';
import { Endpoints, SUCCESS_CODE, loggedGet, loggedRaw } from '@shared';

/**
 * 商家后台（需登录 + 店铺成员）：以真实接口
 *   GET /api/v1/shop/:shopId/notifications/summary
 * 为模板。需配置 SHOP_ID（被测店铺，如 14 环境的 18537）。
 *
 * 返回示例：{"code":0,"msg":"成功","data":{"unreadCount":6,"pendingRefundCount":0}}
 */
interface NotificationsSummary {
  unreadCount: number;
  pendingRefundCount: number;
}

test.describe('商家后台-通知概览', () => {
  test('GET /shop/:shopId/notifications/summary 返回未读与待退款数', async ({ api, env }) => {
    test.skip(!env.shopId, '未配置 SHOP_ID，跳过商家后台通知概览');
    const testInfo = test.info();
    const { status, body } = await loggedGet<NotificationsSummary>(api, {
      testInfo,
      apiBaseURL: env.apiBaseURL,
      logName: '请求日志-商家通知概览.json',
      assertions: ['HTTP 200', '业务 code 应为成功码', '应返回未读与待退款数'],
    }, Endpoints.shopAdmin.notificationsSummary(env.shopId));
    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, body.msg).toBe(SUCCESS_CODE);
    expect(body.data, '应返回 data').toBeTruthy();
    expect(typeof body.data!.unreadCount, 'unreadCount 应为 number').toBe('number');
    expect(typeof body.data!.pendingRefundCount, 'pendingRefundCount 应为 number').toBe('number');
    expect(body.data!.unreadCount).toBeGreaterThanOrEqual(0);
    expect(body.data!.pendingRefundCount).toBeGreaterThanOrEqual(0);
  });

  test('访问不存在/无权限的店铺应被拒绝', async ({ api, env }) => {
    const testInfo = test.info();
    const { body } = await loggedGet(api, {
      testInfo,
      apiBaseURL: env.apiBaseURL,
      logName: '请求日志-商家通知概览-无权限店铺.json',
      assertions: ['无权限店铺应返回非成功码'],
    }, Endpoints.shopAdmin.notificationsSummary(999999999));
    expect(body.code, '无权限店铺应失败').not.toBe(SUCCESS_CODE);
  });

  test('未登录访问商家后台接口应被拒绝', async ({ anonApi, env }) => {
    const testInfo = test.info();
    const shopId = env.shopId || '999999999';
    const { status, body } = await loggedRaw(anonApi, {
      testInfo,
      apiBaseURL: env.apiBaseURL,
      logName: '请求日志-商家通知概览-未登录.json',
      assertions: ['未登录应返回 4xx 或非成功业务码'],
    }, 'get', Endpoints.shopAdmin.notificationsSummary(shopId));
    if (status === 200) {
      expect((body as { code?: number }).code, '未登录应返回非成功业务码').not.toBe(SUCCESS_CODE);
    } else {
      expect(status, '未登录应返回 4xx').toBeGreaterThanOrEqual(400);
    }
  });
});
