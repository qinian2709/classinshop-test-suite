import { test, expect } from '@shared';
import { Endpoints, SUCCESS_CODE, ERR_SYSTEM_PARAM, attachApiCallLog } from '@shared';

/**
 * 系统公开接口（无需登录）。
 * 覆盖接口：
 *   GET  /system/info              — 系统信息
 *   GET  /system/agreement         — 协议详情
 *   GET  /system/agreement/list    — 协议列表
 *   POST /system/sendcode          — 发送验证码（异常场景）
 *   GET  /system/cos/sign          — COS 上传签名（公开，无需登录）
 *   GET  /system/cos/download/sign — COS 下载签名（需登录）
 *   POST /system/feedback          — 反馈（需登录，异常场景）
 *
 * author：qiukailiang
 */

interface AgreementItem {
  type: string;
  title?: string;
}

// ── 系统信息 ──────────────────────────────────────────────────────────────

test.describe('系统信息', () => {
  test('GET /system/info 返回成功信封且包含 code/msg', async ({ anonApi, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.system.info}`;
    const { status, body } = await anonApi.get(Endpoints.system.info);

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-系统信息.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body, '响应应包含 code 字段').toHaveProperty('code');
    expect(body, '响应应包含 msg 字段').toHaveProperty('msg');
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
  });
});

// ── 系统协议 ──────────────────────────────────────────────────────────────

test.describe('系统协议', () => {
  test('GET /system/agreement/list 返回协议列表', async ({ anonApi, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.system.agreementList}`;
    const { status, body } = await anonApi.get<AgreementItem[]>(Endpoints.system.agreementList);

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-协议列表.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '协议列表应为数组'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(Array.isArray(body.data), '协议列表应为数组').toBe(true);
  });

  test('GET /system/agreement 缺少 type 参数应返回参数错误', async ({ anonApi, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.system.agreement}`;
    const { status, body } = await anonApi.get(Endpoints.system.agreement);

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-协议详情-缺少type.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['缺少 type 参数应返回参数错误码'],
    });

    expect(body.code, '缺少 type 参数应返回参数错误码').toBe(ERR_SYSTEM_PARAM);
  });

  test('GET /system/agreement?type=... 返回协议内容', async ({ anonApi, env }) => {
    // 先拉列表，取第一个 type 再查详情
    const { body: listBody } = await anonApi.get<AgreementItem[]>(Endpoints.system.agreementList);
    expect(listBody.code, '拉协议列表应成功').toBe(SUCCESS_CODE);

    const agreementType = listBody.data?.[0]?.type;
    test.skip(!agreementType, '环境无协议数据，跳过协议详情校验');

    const url = `${env.apiBaseURL}${Endpoints.system.agreement}?type=${agreementType}&lang=zh-CN&platform=4`;
    const { status, body } = await anonApi.get(Endpoints.system.agreement, {
      query: { type: agreementType!, lang: 'zh-CN', platform: 4 },
    });

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-协议详情.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '协议内容应存在'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(body.data, '协议内容应存在').toBeTruthy();
  });
});

// ── 发送验证码（异常场景）────────────────────────────────────────────────

test.describe('发送验证码', () => {
  test('POST /system/sendcode 缺少必填参数应失败', async ({ anonApi, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.system.sendCode}`;
    const { status, body } = await anonApi.post(Endpoints.system.sendCode, {});

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-发送验证码-缺少必填.json',
      request: { method: 'POST', url, headers: {}, body: {} },
      response: { status, headers: {}, body },
      assertions: ['缺少必填参数应返回非成功业务码'],
    });

    expect(body.code, '缺少必填参数应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  test('POST /system/sendcode 非法手机号格式应失败', async ({ anonApi, env }) => {
    const payload = { phone: '123', nationCode: '86', scene: 'login' };
    const url = `${env.apiBaseURL}${Endpoints.system.sendCode}`;
    const { status, body } = await anonApi.post(Endpoints.system.sendCode, payload);

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-发送验证码-非法手机号.json',
      request: { method: 'POST', url, headers: {}, body: payload },
      response: { status, headers: {}, body },
      assertions: ['非法手机号格式应返回非成功业务码'],
    });

    expect(body.code, '非法手机号格式应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });
});

// ── COS 签名（公开接口）──────────────────────────────────────────────────

test.describe('COS 签名', () => {
  test('GET /system/cos/sign 未登录可获取上传签名', async ({ anonApi, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.system.cosSign}?fileName=test.png&dir=thumbnails`;
    const { status, body } = await anonApi.get<{ uploadUrl: string; objectKey: string; accessUrl: string }>(
      Endpoints.system.cosSign,
      { query: { fileName: 'test.png', dir: 'thumbnails' } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-COS签名-未登录.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['未登录访问 COS 签名应成功', '应返回 uploadUrl/objectKey/accessUrl'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '未登录访问 COS 签名应成功').toBe(SUCCESS_CODE);
    expect(body.data?.uploadUrl, '应返回 uploadUrl').toBeTruthy();
    expect(body.data?.objectKey, '应返回 objectKey').toBeTruthy();
    expect(body.data?.accessUrl, '应返回 accessUrl').toBeTruthy();
  });

  test('GET /system/cos/sign 缺少 fileName 参数应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.system.cosSign}?dir=thumbnails`;
    const { status, body } = await api.get(Endpoints.system.cosSign, { query: { dir: 'thumbnails' } });

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-COS签名-缺少fileName.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['缺少 fileName 参数应返回非成功业务码'],
    });

    expect(body.code, '缺少 fileName 参数应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  test('GET /system/cos/sign 正常参数返回上传签名字段', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.system.cosSign}?fileName=test.png&dir=thumbnails`;
    const { status, body } = await api.get<{ uploadUrl: string; objectKey: string; accessUrl: string }>(
      Endpoints.system.cosSign,
      { query: { fileName: 'test.png', dir: 'thumbnails' } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-COS签名-正常.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '应返回 uploadUrl/objectKey/accessUrl'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(body.data?.uploadUrl, '应返回 uploadUrl').toBeTruthy();
    expect(body.data?.objectKey, '应返回 objectKey').toBeTruthy();
    expect(body.data?.accessUrl, '应返回 accessUrl').toBeTruthy();
  });

  test('GET /system/cos/download/sign 缺少 objectKey 应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.system.cosDownloadSign}`;
    const { status, body } = await api.get(Endpoints.system.cosDownloadSign);

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-COS下载签名-缺少objectKey.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['缺少 objectKey 应返回非成功业务码'],
    });

    expect(body.code, '缺少 objectKey 应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });
});

// ── 反馈（需登录）────────────────────────────────────────────────────────

test.describe('用户反馈', () => {
  test('POST /system/feedback 缺少必填字段应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.system.feedback}`;
    const { status, body } = await api.post(Endpoints.system.feedback, {});

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-反馈-缺少必填.json',
      request: { method: 'POST', url, headers: {}, body: {} },
      response: { status, headers: {}, body },
      assertions: ['缺少必填字段应返回非成功业务码'],
    });

    expect(body.code, '缺少必填字段应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  test('POST /system/feedback 未登录应被拒绝', async ({ anonApi, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.system.feedback}`;
    const res = await anonApi.raw('post', Endpoints.system.feedback, { data: { content: '测试' } });
    const body = res.status() === 200 ? await res.json() : null;

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-反馈-未登录.json',
      request: { method: 'POST', url, headers: {}, body: { content: '测试' } },
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
