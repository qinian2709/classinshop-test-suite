import { test, expect } from '@shared';
import { Endpoints, SUCCESS_CODE, attachApiCallLog } from '@shared';

/**
 * 学员管理（需登录 + SHOP_ID）。
 * 覆盖接口：
 *   GET  /shop/:shopId/users/students          — 学员列表
 *   POST /shop/:shopId/users/students/:id/name — 修改学员名称（异常场景）
 *
 * author：qiukailiang
 */

interface StudentItem {
  id: number;
  studentName: string;
  learnerName: string;
  phoneNumber?: string;
  source?: number;
  sourceChannel?: string;
  registerTime?: string;
  purchaseCount?: number;
  purchaseAmount?: number;
}

interface StudentListData {
  list: StudentItem[];
  total: number;
}

test.describe('学员管理', () => {
  test.skip(({ env }) => !env.shopId, '未配置 SHOP_ID，跳过学员管理用例');

  // ── 学员列表 ──────────────────────────────────────────────────────────

  test('GET /users/students 返回学员列表（分页结构）', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.studentsList(env.shopId)}?page=1&limit=20`;
    const { status, body } = await api.get<StudentListData>(
      Endpoints.shopAdmin.studentsList(env.shopId),
      { query: { page: 1, limit: 20 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-学员列表.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: [
        'HTTP 状态码应为 200',
        '业务 code 应为成功码',
        '学员列表应为数组',
        '列表项应包含 id、studentName、learnerName',
      ],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(Array.isArray(body.data.list), '学员列表应为数组').toBe(true);
    expect(typeof body.data.total, 'total 应为数字类型').toBe('number');
    if (body.data.list.length > 0) {
      const first = body.data.list[0]!;
      expect(typeof first.id, '学员 id 应为数字类型').toBe('number');
      expect(typeof first.studentName, '学员名称应为字符串类型').toBe('string');
      expect(typeof first.learnerName, '学生姓名应为字符串类型').toBe('string');
      expect(typeof first.purchaseCount, '累计购买次数应为数字类型').toBe('number');
    }
  });

  test('GET /users/students 按关键词搜索学员', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.studentsList(env.shopId)}?page=1&pageSize=10&keyword=`;
    const { status, body } = await api.get<StudentListData>(
      Endpoints.shopAdmin.studentsList(env.shopId),
      { query: { page: 1, pageSize: 10, keyword: '' } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-学员列表-关键词搜索.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '学员列表应为数组'],
    });

    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(Array.isArray(body.data.list), '学员列表应为数组').toBe(true);
  });

  test('GET /users/students 无权限店铺应被拒绝', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.studentsList(999999999)}`;
    const { status, body } = await api.get(Endpoints.shopAdmin.studentsList(999999999));

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-学员列表-无权限.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['访问无权限店铺应返回非成功业务码'],
    });

    expect(body.code, '访问无权限店铺应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  // ── 修改学员名称（异常场景）──────────────────────────────────────────

  test('POST /users/students/:id/name 修改不存在学员名称应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.studentUpdateName(env.shopId, 999999999)}`;
    const { status, body } = await api.post(
      Endpoints.shopAdmin.studentUpdateName(env.shopId, 999999999),
      { userName: '测试学员' },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-学员改名-不存在学员.json',
      request: { method: 'POST', url, headers: {}, body: { userName: '测试学员' } },
      response: { status, headers: {}, body },
      assertions: ['修改不存在学员名称应返回非成功业务码'],
    });

    expect(body.code, '修改不存在学员名称应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  /**
   * 缺参校验：GET /users/students 提取 userId → POST /users/students/:id/name 缺 userName。
   */
  test('POST /users/students/:id/name 缺少 userName 应失败', async ({ api, env }) => {
    const listUrl = `${env.apiBaseURL}${Endpoints.shopAdmin.studentsList(env.shopId)}?page=1&pageSize=1`;
    const { status: listStatus, body: listBody } = await api.get<StudentListData>(
      Endpoints.shopAdmin.studentsList(env.shopId),
      { query: { page: 1, pageSize: 1 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-学员改名-学员列表.json',
      request: { method: 'GET', url: listUrl, headers: {}, body: null },
      response: { status: listStatus, headers: {}, body: listBody },
      assertions: ['获取学员列表应成功'],
    });

    test.skip(!listBody.data?.list?.[0], '学员列表为空，跳过缺参校验');
    const userId = listBody.data.list[0]!.id;
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.studentUpdateName(env.shopId, userId)}`;
    const { status, body } = await api.post(
      Endpoints.shopAdmin.studentUpdateName(env.shopId, userId),
      {},
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-学员改名-缺少userName.json',
      request: { method: 'POST', url, headers: {}, body: {} },
      response: { status, headers: {}, body },
      assertions: ['缺少 userName 应返回非成功业务码'],
    });

    expect(body.code, '缺少 userName 应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  // ── 鉴权 ──────────────────────────────────────────────────────────────

  test('未登录访问学员列表应被拒绝', async ({ anonApi, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.studentsList(env.shopId)}`;
    const res = await anonApi.raw('get', Endpoints.shopAdmin.studentsList(env.shopId));
    const body = res.status() === 200 ? await res.json() : null;

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-学员列表-未登录.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status: res.status(), headers: {}, body },
      assertions: ['未登录应返回 4xx 或业务非成功码'],
    });

    if (res.status() === 200) {
      expect(body.code, '未登录访问应返回非成功业务码').not.toBe(SUCCESS_CODE);
    } else {
      expect(res.status(), '未登录访问应返回 4xx 状态码').toBeGreaterThanOrEqual(400);
    }
  });
});
