import { test, expect } from '@shared';
import { Endpoints, SUCCESS_CODE } from '@shared';
import { env as configEnv, accounts, hasWhiteUserCredential, hasMobileWhiteUserCredential } from '@config';
import type { ListData, User, LoginResult } from '@shared';

interface MerchantShop {
  orgId: number;
}

/**
 * 用户中心（需登录）：依赖 token fixture（无凭据则整组跳过）。
 * 同时间接验证了登录链路（getAccessToken）是通的。
 */
test.describe('用户中心', () => {
  test('POST /user/loginbywhiteuser 商家/教师端白名单登录返回 token', async ({ anonApi }) => {
    test.skip(!hasWhiteUserCredential(), '未配置 TEST_PHONE_NUMBER，跳过商家/教师端白名单登录用例');

    const { body } = await anonApi.post<LoginResult>(Endpoints.user.loginByWhiteUser, {
      phone_number: accounts.whiteUser.phoneNumber,
      nation_code: accounts.whiteUser.nationCode,
    });
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(body.data?.accessToken, '应返回 accessToken').toBeTruthy();
    expect(body.data?.refreshToken, '应返回 refreshToken').toBeTruthy();
  });

  test('POST /user/loginbywhiteuser 用户端白名单登录返回 token', async ({ anonApi }) => {
    test.skip(!hasMobileWhiteUserCredential(), '未配置 MOBILE_TEST_PHONE_NUMBER，跳过用户端白名单登录用例');

    const { body } = await anonApi.post<LoginResult>(Endpoints.user.loginByWhiteUser, {
      phone_number: accounts.mobileWhiteUser.phoneNumber,
      nation_code: accounts.mobileWhiteUser.nationCode,
    });
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(body.data?.accessToken, '应返回 accessToken').toBeTruthy();
    expect(body.data?.refreshToken, '应返回 refreshToken').toBeTruthy();
  });

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

  test('GET /merchant/status 缺少 orgId 应返回参数错误', async ({ api }) => {
    // GetMerchantStatus 要求 query.orgId，缺失/非法时返回 ErrBadRequest(400)
    const { body } = await api.get(Endpoints.merchant.status);
    expect(body.code).not.toBe(SUCCESS_CODE);
  });

  test('GET /merchant/status?orgId=... 返回商户状态', async ({ api }) => {
    const orgId =
      process.env.TEST_ORG_ID ||
      configEnv.shopId ||
      (await api.expectData<MerchantShop[]>('get', Endpoints.user.myShops))[0]?.orgId;
    test.skip(!orgId, '当前账号没有可用于查询商户状态的店铺 orgId');

    const { body } = await api.get(Endpoints.merchant.status, { query: { orgId } });
    expect(body.code).toBe(SUCCESS_CODE);
  });
});
