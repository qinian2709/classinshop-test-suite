import { test, expect } from '@shared';
import { Endpoints, SUCCESS_CODE } from '@shared';
import type { ListData, User } from '@shared';

/**
 * 用户中心（需登录）：依赖 token fixture（无凭据则整组跳过）。
 * 同时间接验证了登录链路（getAccessToken）是通的。
 */
test.describe('用户中心', () => {
  test('GET /auth/user 返回当前登录用户', async ({ api }) => {
    const { body } = await api.get<User>(Endpoints.user.authUser);
    expect(body.code).toBe(SUCCESS_CODE);
    expect(body.data).toBeTruthy();
  });

  test('GET /user/shops 返回我的店铺列表', async ({ api }) => {
    const { body } = await api.get(Endpoints.user.myShops);
    expect(body.code).toBe(SUCCESS_CODE);
  });

  test('GET /user/orders 返回我的订单（分页结构）', async ({ api }) => {
    const { body } = await api.get<ListData>(Endpoints.user.orders, {
      query: { page: 1, limit: 10 },
    });
    expect(body.code).toBe(SUCCESS_CODE);
  });

  test('GET /user/coupon/list 返回我的优惠券', async ({ api }) => {
    const { body } = await api.get(Endpoints.user.couponList);
    expect(body.code).toBe(SUCCESS_CODE);
  });

  test('GET /merchant/status 返回商户状态', async ({ api }) => {
    const { body } = await api.get(Endpoints.merchant.status);
    expect(body.code).toBe(SUCCESS_CODE);
  });
});
