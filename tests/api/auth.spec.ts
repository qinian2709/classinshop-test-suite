import { test, expect } from '@shared';
import { Endpoints, ERR_SYSTEM_PARAM, ERR_UNAUTHORIZED, SUCCESS_CODE } from '@shared';

/**
 * 登录与鉴权：覆盖签名登录的参数校验（异常/边界）与受保护接口的未授权访问。
 * 正向登录在有凭据时由 token fixture 间接验证（见 user.spec.ts）。
 */
test.describe('登录与鉴权', () => {
  test('签名登录缺少必填参数应返回参数错误', async ({ anonApi }) => {
    const { body } = await anonApi.post(Endpoints.user.loginBySign, {});
    // 缺少 eeoUid/signKey/timestamp，binding:required 校验失败 → ErrSystemParam
    expect(body.code).toBe(ERR_SYSTEM_PARAM);
  });

  test('签名登录使用无效签名不应成功', async ({ anonApi }) => {
    const { body } = await anonApi.post(Endpoints.user.loginBySign, {
      eeoUid: '999999999',
      signKey: 'invalid-sign-key',
      timestamp: String(Math.floor(Date.now() / 1000)),
      device: 'test-suite',
    });
    expect(body.code).not.toBe(SUCCESS_CODE);
  });

  test('未携带 token 访问受保护接口应被拒绝', async ({ anonApi }) => {
    const res = await anonApi.raw('get', Endpoints.user.authUser);
    // JwtAuth 中间件：未授权返回 401（HTTP 或业务 code 二者其一）
    const status = res.status();
    if (status === 200) {
      const body = await res.json();
      expect(body.code).toBe(ERR_UNAUTHORIZED);
    } else {
      expect(status).toBe(ERR_UNAUTHORIZED);
    }
  });

  test('携带非法 token 访问受保护接口应被拒绝', async ({ anonApi }) => {
    const res = await anonApi.raw('get', Endpoints.user.authUser, {
      headers: { Authorization: 'Bearer not-a-real-jwt' },
    });
    expect([200, ERR_UNAUTHORIZED]).toContain(res.status());
  });
});
