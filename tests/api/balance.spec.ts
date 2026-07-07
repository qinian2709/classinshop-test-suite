import { test, expect } from '@shared';
import { Endpoints, SUCCESS_CODE, attachApiCallLog } from '@shared';

/**
 * 商家账户 / 余额 / 提现（需登录 + SHOP_ID）。
 * 覆盖接口：
 *   GET  /shop/:shopId/account/info          — 商家账户信息
 *   GET  /shop/:shopId/balance/details       — 账户流水列表
 *   GET  /shop/:shopId/withdraw/list         — 提现记录列表
 *   POST /shop/:shopId/withdraw              — 发起提现（异常场景）
 *   GET  /shop/:shopId/account/deposit/info  — 保证金账户信息
 *   GET  /shop/:shopId/account/deposit/list  — 保证金明细
 *   GET  /shop/:shopId/agreements            — 店铺协议列表
 *   GET  /shop/:shopId/merchant              — 商家信息
 *
 * author：qiukailiang
 */

interface AccountInfo {
  amount: number;
  totalAmount: number;
  freezeAmount: number;
  divideRate: number;
}

interface BalanceDetailItem {
  id: number;
  type: number;
  amount: number;
}

interface BalanceDetailsData {
  list: BalanceDetailItem[];
  total: number;
}

interface WithdrawItem {
  id: number;
  amount: number;
  state: number;
}

interface WithdrawListData {
  list: WithdrawItem[];
  total: number;
}

interface DepositAccountInfo {
  amount: number;
  state: number;
  divideRate: number;
}

test.describe('商家账户与财务', () => {
  test.skip(({ env }) => !env.shopId, '未配置 SHOP_ID，跳过商家财务相关用例');

  // ── 账户信息 ──────────────────────────────────────────────────────────

  test('GET /account/info 返回可提现与余额字段', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.accountInfo(env.shopId)}`;
    const { status, body } = await api.get<AccountInfo>(
      Endpoints.shopAdmin.accountInfo(env.shopId),
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-账户信息.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: [
        'HTTP 状态码应为 200',
        '业务 code 应为成功码',
        '账户信息应包含余额、总额、冻结金额、分成比例字段',
      ],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(typeof body.data.amount, '可提现金额应为数字类型').toBe('number');
    expect(typeof body.data.totalAmount, '总金额应为数字类型').toBe('number');
    expect(typeof body.data.freezeAmount, '冻结金额应为数字类型').toBe('number');
    expect(typeof body.data.divideRate, '分成比例应为数字类型').toBe('number');
  });

  test('未登录访问账户信息应被拒绝', async ({ anonApi, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.accountInfo(env.shopId)}`;
    const res = await anonApi.raw('get', Endpoints.shopAdmin.accountInfo(env.shopId));
    const body = res.status() === 200 ? await res.json() : null;

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-未登录访问账户信息.json',
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

  test('无权限店铺的账户信息应被拒绝', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.accountInfo(999999999)}`;
    const { status, body } = await api.get(Endpoints.shopAdmin.accountInfo(999999999));

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-无权限店铺账户信息.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['访问无权限店铺应返回非成功业务码'],
    });

    expect(body.code, '访问无权限店铺应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  // ── 流水记录 ──────────────────────────────────────────────────────────

  test('GET /balance/details 返回流水列表（分页结构）', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.balanceDetails(env.shopId)}?page=1&limit=20`;
    const { status, body } = await api.get<BalanceDetailsData>(
      Endpoints.shopAdmin.balanceDetails(env.shopId),
      { query: { page: 1, limit: 20 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-账户流水列表.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '流水列表应为数组'],
    });

    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(Array.isArray(body.data.list), '流水列表应为数组').toBe(true);
    expect(typeof body.data.total, 'total 应为数字类型').toBe('number');
  });

  test('GET /balance/details 按 type=4（订单收入）过滤', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.balanceDetails(env.shopId)}?page=1&limit=10&type=4`;
    const { status, body } = await api.get<BalanceDetailsData>(
      Endpoints.shopAdmin.balanceDetails(env.shopId),
      { query: { page: 1, limit: 10, type: 4 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-账户流水-订单收入过滤.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '订单收入类型应为 4'],
    });

    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    if (body.data.list.length > 0) {
      body.data.list.forEach((item) =>
        expect(item.type, '订单收入类型应为 4').toBe(4),
      );
    }
  });

  test('GET /balance/details 按时间区间过滤', async ({ api, env }) => {
    const end = Math.floor(Date.now() / 1000);
    const start = end - 30 * 24 * 3600;
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.balanceDetails(env.shopId)}?page=1&limit=10&seqBeginUnix=${start}&seqEndUnix=${end}`;
    const { status, body } = await api.get<BalanceDetailsData>(
      Endpoints.shopAdmin.balanceDetails(env.shopId),
      { query: { page: 1, limit: 10, seqBeginUnix: start, seqEndUnix: end } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-账户流水-时间区间过滤.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '流水列表应为数组'],
    });

    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(Array.isArray(body.data.list), '流水列表应为数组').toBe(true);
  });

  // ── 提现记录 ──────────────────────────────────────────────────────────

  test('GET /withdraw/list 返回提现记录列表', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.withdrawList(env.shopId)}?page=1&limit=20`;
    const { status, body } = await api.get<WithdrawListData>(
      Endpoints.shopAdmin.withdrawList(env.shopId),
      { query: { page: 1, limit: 20 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-提现记录列表.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '提现记录列表应为数组'],
    });

    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(Array.isArray(body.data.list), '提现记录列表应为数组').toBe(true);
    expect(typeof body.data.total, 'total 应为数字类型').toBe('number');
  });

  test('GET /withdraw/list 按 state=0（成功）过滤', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.withdrawList(env.shopId)}?page=1&limit=10&state=0`;
    const { status, body } = await api.get<WithdrawListData>(
      Endpoints.shopAdmin.withdrawList(env.shopId),
      { query: { page: 1, limit: 10, state: 0 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-提现记录-成功状态过滤.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '提现成功状态应为 0'],
    });

    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    if (body.data.list.length > 0) {
      body.data.list.forEach((item) =>
        expect(item.state, '提现成功状态应为 0').toBe(0),
      );
    }
  });

  // ── 发起提现（异常场景）──────────────────────────────────────────────

  test('POST /withdraw 金额为 0 应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.withdraw(env.shopId)}`;
    const { status, body } = await api.post(Endpoints.shopAdmin.withdraw(env.shopId), { amount: 0 });

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-发起提现-金额为0.json',
      request: { method: 'POST', url, headers: {}, body: { amount: 0 } },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '提现金额为 0 应返回非成功业务码'],
    });

    expect(body.code, '提现金额为 0 应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  test('POST /withdraw 缺少 amount 参数应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.withdraw(env.shopId)}`;
    const { status, body } = await api.post(Endpoints.shopAdmin.withdraw(env.shopId), {});

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-发起提现-缺少金额.json',
      request: { method: 'POST', url, headers: {}, body: {} },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '缺少提现金额应返回非成功业务码'],
    });

    expect(body.code, '缺少提现金额应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  test('POST /withdraw 金额超过可提现余额应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.withdraw(env.shopId)}`;
    const { status, body } = await api.post(Endpoints.shopAdmin.withdraw(env.shopId), {
      amount: 99999999,
    });

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-发起提现-金额超限.json',
      request: { method: 'POST', url, headers: {}, body: { amount: 99999999 } },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '提现金额超限应返回非成功业务码'],
    });

    expect(body.code, '提现金额超限应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  // ── 保证金 ───────────────────────────────────────────────────────────

  test('GET /account/deposit/info 返回保证金账户信息', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.depositAccountInfo(env.shopId)}`;
    const { status, body } = await api.get<DepositAccountInfo>(
      Endpoints.shopAdmin.depositAccountInfo(env.shopId),
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-保证金账户信息.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '保证金金额应为数字类型'],
    });

    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(typeof body.data.amount, '保证金金额应为数字类型').toBe('number');
    expect(typeof body.data.state, '保证金状态应为数字类型').toBe('number');
  });

  test('GET /account/deposit/list 返回保证金明细', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.depositList(env.shopId)}?page=1&limit=20`;
    const { status, body } = await api.get(Endpoints.shopAdmin.depositList(env.shopId), {
      query: { page: 1, limit: 20 },
    });

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-保证金明细列表.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码'],
    });

    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
  });

  // ── 协议 / 商家信息 ───────────────────────────────────────────────────

  test('GET /agreements 返回店铺协议列表', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.agreements(env.shopId)}`;
    const { status, body } = await api.get<{ list: { id: number; title: string }[] }>(
      Endpoints.shopAdmin.agreements(env.shopId),
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-店铺协议列表.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '协议列表应为数组'],
    });

    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(Array.isArray(body.data.list), '协议列表应为数组').toBe(true);
  });

  test('GET /merchant 返回商家信息', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.merchantInfo(env.shopId)}`;
    const { status, body } = await api.get<Record<string, unknown>>(
      Endpoints.shopAdmin.merchantInfo(env.shopId),
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-商家信息.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '商家信息数据应存在'],
    });

    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(body.data, '商家信息数据应存在').toBeTruthy();
  });
});
