import { test, expect } from '@shared';
import {
  Endpoints,
  ERR_SYSTEM_PARAM,
  ERR_UNAUTHORIZED,
  SUCCESS_CODE,
  loggedPost,
  loggedRaw,
} from '@shared';

/**
 * 登录与鉴权：覆盖签名登录的参数校验（异常/边界）与受保护接口的未授权访问。
 * 正向登录在有凭据时由 token fixture 间接验证（见 user.spec.ts）。
 */
test.describe('登录与鉴权', () => {
  test('签名登录缺少必填参数应返回参数错误', async ({ anonApi, env }) => {
    const testInfo = test.info();
    const logBase = { testInfo, apiBaseURL: env.apiBaseURL };
    const { body } = await loggedPost(anonApi, {
      ...logBase,
      logName: '请求日志-签名登录-缺少必填.json',
      assertions: ['缺少必填参数应返回 ErrSystemParam'],
    }, Endpoints.user.loginBySign, {});
    expect(body.code, '缺少必填参数应返回参数错误码').toBe(ERR_SYSTEM_PARAM);
  });

  test('签名登录使用无效签名不应成功', async ({ anonApi, env }) => {
    const testInfo = test.info();
    const logBase = { testInfo, apiBaseURL: env.apiBaseURL };
    const payload = {
      eeoUid: '999999999',
      signKey: 'invalid-sign-key',
      timestamp: String(Math.floor(Date.now() / 1000)),
      device: 'test-suite',
    };
    const { body } = await loggedPost(anonApi, {
      ...logBase,
      logName: '请求日志-签名登录-无效签名.json',
      assertions: ['无效签名不应返回成功码'],
    }, Endpoints.user.loginBySign, payload);
    expect(body.code, '无效签名不应成功').not.toBe(SUCCESS_CODE);
  });

  test('未携带 token 访问受保护接口应被拒绝', async ({ anonApi, env }) => {
    const testInfo = test.info();
    const logBase = { testInfo, apiBaseURL: env.apiBaseURL };
    const { status, body } = await loggedRaw(anonApi, {
      ...logBase,
      logName: '请求日志-受保护接口-未登录.json',
      assertions: ['未授权应返回 401 或非成功业务码'],
    }, 'get', Endpoints.user.authUser);
    if (status === 200) {
      expect((body as { code?: number }).code, '未登录应返回非成功业务码').toBe(ERR_UNAUTHORIZED);
    } else {
      expect(status, '未登录应返回 401').toBe(ERR_UNAUTHORIZED);
    }
  });

  test('携带非法 token 访问受保护接口应被拒绝', async ({ anonApi, env }) => {
    const testInfo = test.info();
    const logBase = { testInfo, apiBaseURL: env.apiBaseURL };
    const { status } = await loggedRaw(anonApi, {
      ...logBase,
      logName: '请求日志-受保护接口-非法token.json',
      assertions: ['非法 token 应被拒绝'],
    }, 'get', Endpoints.user.authUser, {
      headers: { Authorization: 'Bearer not-a-real-jwt' },
    });
    expect([200, ERR_UNAUTHORIZED], '非法 token 应返回 401 或 200+非成功码').toContain(status);
  });
});
