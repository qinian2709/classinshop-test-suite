import { test, expect } from '@shared';
import { Endpoints, SUCCESS_CODE } from '@shared';

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

    const { status, body } = await api.get<NotificationsSummary>(
      Endpoints.shopAdmin.notificationsSummary(env.shopId),
    );
    expect(status).toBe(200);
    expect(body.code, body.msg).toBe(SUCCESS_CODE);
    expect(body.data).toBeTruthy();
    expect(typeof body.data.unreadCount).toBe('number');
    expect(typeof body.data.pendingRefundCount).toBe('number');
    expect(body.data.unreadCount).toBeGreaterThanOrEqual(0);
    expect(body.data.pendingRefundCount).toBeGreaterThanOrEqual(0);
  });

  test('访问不存在/无权限的店铺应被拒绝', async ({ api }) => {
    const { body } = await api.get(Endpoints.shopAdmin.notificationsSummary(999999999));
    // 非店铺成员 / 店铺不存在：业务错误码（如无权限），不应为成功
    expect(body.code).not.toBe(SUCCESS_CODE);
  });

  test('未登录访问商家后台接口应被拒绝', async ({ anonApi, env }) => {
    const shopId = env.shopId || '999999999';
    const res = await anonApi.raw('get', Endpoints.shopAdmin.notificationsSummary(shopId));
    // 被拒绝可能体现为 HTTP 4xx（401/403/404）或成功信封内的非 0 业务码
    if (res.status() === 200) {
      const b = await res.json();
      expect(b.code).not.toBe(SUCCESS_CODE);
    } else {
      expect(res.status()).toBeGreaterThanOrEqual(400);
    }
  });
});
