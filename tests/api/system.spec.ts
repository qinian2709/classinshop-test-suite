import { test, expect } from '@shared';
import { Endpoints, SUCCESS_CODE } from '@shared';

/**
 * 系统级公开接口冒烟：不需要登录，验证服务可达与统一信封格式。
 * 这是整套接口自动化的"健康基线"，CI 每次都应通过。
 */
test.describe('系统公开接口 @smoke', () => {
  test('GET /system/info 返回成功信封', async ({ anonApi }) => {
    const { status, body } = await anonApi.get(Endpoints.system.info);
    expect(status).toBe(200);
    expect(body).toHaveProperty('code');
    expect(body).toHaveProperty('msg');
    expect(body.code).toBe(SUCCESS_CODE);
  });

  test('GET /system/agreement 返回协议内容', async ({ anonApi }) => {
    const { body } = await anonApi.get(Endpoints.system.agreement);
    expect(body.code).toBe(SUCCESS_CODE);
  });

  test('GET /system/agreement/list 返回列表', async ({ anonApi }) => {
    const { body } = await anonApi.get(Endpoints.system.agreementList);
    expect(body.code).toBe(SUCCESS_CODE);
  });
});
