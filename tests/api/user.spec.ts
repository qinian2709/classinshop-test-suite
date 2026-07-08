import { test, expect } from '@shared';
import { Endpoints, SUCCESS_CODE, loggedGet, loggedPost } from '@shared';
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
  test('POST /user/loginbywhiteuser 商家/教师端白名单登录返回 token', async ({ anonApi, env }) => {
    test.skip(!hasWhiteUserCredential(), '未配置 TEST_PHONE_NUMBER，跳过商家/教师端白名单登录用例');
    const testInfo = test.info();
    const logBase = { testInfo, apiBaseURL: env.apiBaseURL };
    const payload = {
      phone_number: accounts.whiteUser.phoneNumber,
      nation_code: accounts.whiteUser.nationCode,
    };
    const { body } = await loggedPost<LoginResult>(anonApi, {
      ...logBase,
      logName: '请求日志-白名单登录-商家端.json',
      assertions: ['业务 code 应为成功码', '应返回 accessToken'],
    }, Endpoints.user.loginByWhiteUser, payload);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(body.data?.accessToken, '应返回 accessToken').toBeTruthy();
    expect(body.data?.refreshToken, '应返回 refreshToken').toBeTruthy();
  });

  test('POST /user/loginbywhiteuser 用户端白名单登录返回 token', async ({ anonApi, env }) => {
    test.skip(!hasMobileWhiteUserCredential(), '未配置 MOBILE_TEST_PHONE_NUMBER，跳过用户端白名单登录用例');
    const testInfo = test.info();
    const logBase = { testInfo, apiBaseURL: env.apiBaseURL };
    const payload = {
      phone_number: accounts.mobileWhiteUser.phoneNumber,
      nation_code: accounts.mobileWhiteUser.nationCode,
    };
    const { body } = await loggedPost<LoginResult>(anonApi, {
      ...logBase,
      logName: '请求日志-白名单登录-用户端.json',
      assertions: ['业务 code 应为成功码', '应返回 accessToken'],
    }, Endpoints.user.loginByWhiteUser, payload);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(body.data?.accessToken, '应返回 accessToken').toBeTruthy();
    expect(body.data?.refreshToken, '应返回 refreshToken').toBeTruthy();
  });

  test('GET /auth/user 返回当前登录用户', async ({ api, env }) => {
    const testInfo = test.info();
    const { body } = await loggedGet<User>(api, {
      testInfo,
      apiBaseURL: env.apiBaseURL,
      logName: '请求日志-当前登录用户.json',
      assertions: ['业务 code 应为成功码', 'data 不应为空'],
    }, Endpoints.user.authUser);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(body.data, '应返回当前用户').toBeTruthy();
  });

  test('GET /user/shops 返回我的店铺列表', async ({ api, env }) => {
    const testInfo = test.info();
    const { body } = await loggedGet(api, {
      testInfo,
      apiBaseURL: env.apiBaseURL,
      logName: '请求日志-我的店铺列表.json',
      assertions: ['业务 code 应为成功码'],
    }, Endpoints.user.myShops);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
  });

  test('GET /user/orders 返回我的订单（分页结构）', async ({ api, env }) => {
    const testInfo = test.info();
    const query = { page: 1, limit: 10 };
    const { body } = await loggedGet<ListData>(api, {
      testInfo,
      apiBaseURL: env.apiBaseURL,
      logName: '请求日志-我的订单列表.json',
      assertions: ['业务 code 应为成功码'],
    }, Endpoints.user.orders, { query });
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
  });

  test('GET /user/coupon/list 返回我的优惠券', async ({ api, env }) => {
    const testInfo = test.info();
    const { body } = await loggedGet(api, {
      testInfo,
      apiBaseURL: env.apiBaseURL,
      logName: '请求日志-我的优惠券列表.json',
      assertions: ['业务 code 应为成功码'],
    }, Endpoints.user.couponList);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
  });

  test('GET /merchant/status 缺少 orgId 应返回参数错误', async ({ api, env }) => {
    const testInfo = test.info();
    const { body } = await loggedGet(api, {
      testInfo,
      apiBaseURL: env.apiBaseURL,
      logName: '请求日志-商户状态-缺少orgId.json',
      assertions: ['缺少 orgId 应返回非成功码'],
    }, Endpoints.merchant.status);
    expect(body.code, '缺少 orgId 应失败').not.toBe(SUCCESS_CODE);
  });

  test('GET /merchant/status?orgId=... 返回商户状态', async ({ api, env }) => {
    const testInfo = test.info();
    const logBase = { testInfo, apiBaseURL: env.apiBaseURL };
    let orgId: string | number | undefined =
      process.env.TEST_ORG_ID || configEnv.shopId;

    if (!orgId) {
      const shops = await loggedGet<MerchantShop[]>(api, {
        ...logBase,
        logName: '请求日志-商户状态-解析orgId-店铺列表.json',
        assertions: ['业务 code 应为成功码'],
      }, Endpoints.user.myShops);
      orgId = shops.body.data?.[0]?.orgId;
    }
    test.skip(!orgId, '当前账号没有可用于查询商户状态的店铺 orgId');

    const query = { orgId };
    const { body } = await loggedGet(api, {
      ...logBase,
      logName: '请求日志-商户状态.json',
      assertions: ['业务 code 应为成功码'],
    }, Endpoints.merchant.status, { query });
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
  });
});
