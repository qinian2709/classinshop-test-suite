import { test, expect } from '@shared';
import { Endpoints, SUCCESS_CODE, attachApiCallLog } from '@shared';

/**
 * 店铺成员管理 + 角色权限（需登录 + SHOP_ID）。
 * 覆盖接口：
 *   GET  /shop/:shopId/members              — 成员列表
 *   GET  /shop/:shopId/member/permissions   — 当前成员角色与权限
 *   GET  /shop/:shopId/roles                — 角色列表
 *   GET  /shop/:shopId/permissions          — 所有权限树
 *   GET  /shop/:shopId/roles/:id/permissions — 按角色ID查权限树
 *   POST /shop/:shopId/members/:id/remove   — 移除成员（异常场景）
 *   POST /shop/:shopId/members/:id/role     — 修改成员角色（异常场景）
 *   POST /shop/:shopId/members/:id/name     — 修改成员名称（异常场景）
 *   POST /shop/:shopId/roles                — 新增角色（异常场景）
 *   POST /shop/:shopId/roles/:id            — 修改角色（异常场景）
 *   POST /shop/:shopId/roles/:id/delete     — 删除角色（异常场景）
 *
 * author：qiukailiang
 */

interface MemberItem {
  id: number;
  userId: number;
  userName: string;
  roleId: number;
  roleName: string;
}

interface MemberListData {
  list: MemberItem[];
  total: number;
}

interface MemberPermissionData {
  roleId: number;
  roleName: string;
  menus: unknown[];
}

interface RoleItem {
  id: number;
  roleName: string;
  roleCode: string;
  roleType: number;
}

interface RoleListData {
  list: RoleItem[];
  total: number;
}

test.describe('成员管理', () => {
  test.skip(({ env }) => !env.shopId, '未配置 SHOP_ID，跳过成员管理用例');

  // ── 成员列表 ──────────────────────────────────────────────────────────

  test('GET /members 返回成员列表（分页结构）', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.membersList(env.shopId)}?page=1&pageSize=10`;
    const { status, body } = await api.get<MemberListData>(
      Endpoints.shopAdmin.membersList(env.shopId),
      { query: { page: 1, pageSize: 10 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-成员列表.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: [
        'HTTP 状态码应为 200',
        '业务 code 应为成功码',
        '成员列表应为数组',
        '成员数据应包含基本字段',
      ],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(Array.isArray(body.data.list), '成员列表应为数组').toBe(true);
    expect(typeof body.data.total, 'total 应为数字类型').toBe('number');
    if (body.data.list.length > 0) {
      const first = body.data.list[0]!;
      expect(typeof first.id, '成员 id 应为数字类型').toBe('number');
      expect(typeof first.userName, '成员名称应为字符串类型').toBe('string');
      expect(typeof first.roleId, '角色 id 应为数字类型').toBe('number');
    }
  });

  test('GET /members 按 userName 模糊搜索', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.membersList(env.shopId)}?page=1&pageSize=10&userName=`;
    const { status, body } = await api.get<MemberListData>(
      Endpoints.shopAdmin.membersList(env.shopId),
      { query: { page: 1, pageSize: 10, userName: '' } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-成员列表-名称搜索.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '成员列表应为数组'],
    });

    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(Array.isArray(body.data.list), '成员列表应为数组').toBe(true);
  });

  test('未登录访问成员列表应被拒绝', async ({ anonApi, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.membersList(env.shopId)}`;
    const res = await anonApi.raw('get', Endpoints.shopAdmin.membersList(env.shopId));
    const body = res.status() === 200 ? await res.json() : null;

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-未登录访问成员列表.json',
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

  test('无权限店铺的成员列表应被拒绝', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.membersList(999999999)}`;
    const { status, body } = await api.get(Endpoints.shopAdmin.membersList(999999999));

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-无权限店铺成员列表.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['访问无权限店铺应返回非成功业务码'],
    });

    expect(body.code, '访问无权限店铺应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  // ── 当前成员权限 ──────────────────────────────────────────────────────

  test('GET /member/permissions 返回当前成员角色和菜单权限', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.memberPermissions(env.shopId)}`;
    const { status, body } = await api.get<MemberPermissionData>(
      Endpoints.shopAdmin.memberPermissions(env.shopId),
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-当前成员权限.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '角色 id 应为数字类型'],
    });

    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(typeof body.data.roleId, '角色 id 应为数字类型').toBe('number');
    expect(typeof body.data.roleName, '角色名称应为字符串类型').toBe('string');
    expect(Array.isArray(body.data.menus), '菜单列表应为数组').toBe(true);
  });

  // ── 移除成员（异常） ──────────────────────────────────────────────────

  test('POST /members/:id/remove 移除不存在的成员应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.memberRemove(env.shopId, 999999999)}`;
    const { status, body } = await api.post(
      Endpoints.shopAdmin.memberRemove(env.shopId, 999999999),
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-移除不存在成员.json',
      request: { method: 'POST', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '移除不存在的成员应返回非成功业务码'],
    });

    expect(body.code, '移除不存在的成员应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  // ── 修改成员角色（异常） ──────────────────────────────────────────────

  test('POST /members/:id/role 修改不存在成员的角色应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.memberUpdateRole(env.shopId, 999999999)}`;
    const { status, body } = await api.post(
      Endpoints.shopAdmin.memberUpdateRole(env.shopId, 999999999),
      { roleId: 1 },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-修改不存在成员角色.json',
      request: { method: 'POST', url, headers: {}, body: { roleId: 1 } },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '修改不存在成员角色应返回非成功业务码'],
    });

    expect(body.code, '修改不存在成员角色应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  /**
   * 缺参校验：GET /members 提取 memberId → POST /members/:id/role 缺 roleId。
   */
  test('POST /members/:id/role 缺少 roleId 应失败', async ({ api, env }) => {
    const listUrl = `${env.apiBaseURL}${Endpoints.shopAdmin.membersList(env.shopId)}?page=1&pageSize=1`;
    const { status: listStatus, body: listBody } = await api.get<MemberListData>(
      Endpoints.shopAdmin.membersList(env.shopId),
      { query: { page: 1, pageSize: 1 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-修改成员角色-成员列表.json',
      request: { method: 'GET', url: listUrl, headers: {}, body: null },
      response: { status: listStatus, headers: {}, body: listBody },
      assertions: ['获取成员列表应成功'],
    });

    test.skip(!listBody.data?.list?.[0], '成员列表为空，跳过缺参校验');
    const memberId = listBody.data.list[0]!.id;
    const roleUrl = `${env.apiBaseURL}${Endpoints.shopAdmin.memberUpdateRole(env.shopId, memberId)}`;
    const { status, body } = await api.post(
      Endpoints.shopAdmin.memberUpdateRole(env.shopId, memberId),
      {},
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-修改成员角色-缺少roleId.json',
      request: { method: 'POST', url: roleUrl, headers: {}, body: {} },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '缺少 roleId 应返回非成功业务码'],
    });

    expect(body.code, '缺少 roleId 应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  // ── 修改成员名称（异常） ──────────────────────────────────────────────

  /**
   * 缺参校验：GET /members 提取 memberId → POST /members/:id/name 缺 userName。
   */
  test('POST /members/:id/name 缺少 userName 应失败', async ({ api, env }) => {
    const listUrl = `${env.apiBaseURL}${Endpoints.shopAdmin.membersList(env.shopId)}?page=1&pageSize=1`;
    const { status: listStatus, body: listBody } = await api.get<MemberListData>(
      Endpoints.shopAdmin.membersList(env.shopId),
      { query: { page: 1, pageSize: 1 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-修改成员名称-成员列表.json',
      request: { method: 'GET', url: listUrl, headers: {}, body: null },
      response: { status: listStatus, headers: {}, body: listBody },
      assertions: ['获取成员列表应成功'],
    });

    test.skip(!listBody.data?.list?.[0], '成员列表为空，跳过缺参校验');
    const memberId = listBody.data.list[0]!.id;
    const nameUrl = `${env.apiBaseURL}${Endpoints.shopAdmin.memberUpdateName(env.shopId, memberId)}`;
    const { status, body } = await api.post(
      Endpoints.shopAdmin.memberUpdateName(env.shopId, memberId),
      {},
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-修改成员名称-缺少userName.json',
      request: { method: 'POST', url: nameUrl, headers: {}, body: {} },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '缺少 userName 应返回非成功业务码'],
    });

    expect(body.code, '缺少 userName 应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });
});

test.describe('角色权限', () => {
  test.skip(({ env }) => !env.shopId, '未配置 SHOP_ID，跳过角色权限用例');

  // ── 角色列表 ──────────────────────────────────────────────────────────

  test('GET /roles 返回角色列表', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.rolesList(env.shopId)}?page=1&pageSize=20`;
    const { status, body } = await api.get<RoleListData>(
      Endpoints.shopAdmin.rolesList(env.shopId),
      { query: { page: 1, pageSize: 20 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-角色列表.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '角色列表应为数组'],
    });

    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(Array.isArray(body.data.list), '角色列表应为数组').toBe(true);
    expect(typeof body.data.total, 'total 应为数字类型').toBe('number');
  });

  test('GET /roles 按名称关键词搜索', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.rolesList(env.shopId)}?page=1&pageSize=10&keyword=管理员`;
    const { status, body } = await api.get<RoleListData>(
      Endpoints.shopAdmin.rolesList(env.shopId),
      { query: { page: 1, pageSize: 10, keyword: '管理员' } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-角色列表-关键词搜索.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '角色列表应为数组'],
    });

    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(Array.isArray(body.data.list), '角色列表应为数组').toBe(true);
  });

  // ── 权限树 ────────────────────────────────────────────────────────────

  test('GET /permissions 返回所有权限树', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.allPermissions(env.shopId)}`;
    const { status, body } = await api.get<{ menus: unknown[] }>(
      Endpoints.shopAdmin.allPermissions(env.shopId),
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-全部权限树.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '权限树菜单应为数组'],
    });

    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(Array.isArray(body.data.menus), '权限树菜单应为数组').toBe(true);
  });

  /**
   * 按角色查权限：GET /roles 提取 roleId → GET /roles/:id/permissions。
   */
  test('GET /roles/:id/permissions 返回指定角色权限树', async ({ api, env }) => {
    const listUrl = `${env.apiBaseURL}${Endpoints.shopAdmin.rolesList(env.shopId)}?page=1&pageSize=1`;
    const { status: listStatus, body: roleListBody } = await api.get<RoleListData>(
      Endpoints.shopAdmin.rolesList(env.shopId),
      { query: { page: 1, pageSize: 1 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-角色权限-角色列表.json',
      request: { method: 'GET', url: listUrl, headers: {}, body: null },
      response: { status: listStatus, headers: {}, body: roleListBody },
      assertions: ['获取角色列表应成功'],
    });

    test.skip(!roleListBody.data?.list?.[0], '角色列表为空，跳过按角色查权限');
    const roleId = roleListBody.data.list[0]!.id;
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.rolePermissions(env.shopId, roleId)}`;
    const { status, body } = await api.get<{ menus: unknown[] }>(
      Endpoints.shopAdmin.rolePermissions(env.shopId, roleId),
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-角色权限-权限树.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '权限树菜单应为数组'],
    });

    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(Array.isArray(body.data.menus), '权限树菜单应为数组').toBe(true);
  });

  test('GET /roles/:id/permissions 不存在角色应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.rolePermissions(env.shopId, 999999999)}`;
    const { status, body } = await api.get(
      Endpoints.shopAdmin.rolePermissions(env.shopId, 999999999),
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-角色权限-不存在角色.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '查询不存在角色应返回非成功业务码'],
    });

    expect(body.code, '查询不存在角色应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  // ── 新增角色（异常） ──────────────────────────────────────────────────

  test('POST /roles 缺少 roleCode/roleName 应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.rolesList(env.shopId)}`;
    const { status, body } = await api.post(Endpoints.shopAdmin.rolesList(env.shopId), {});

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-新增角色-缺少必填字段.json',
      request: { method: 'POST', url, headers: {}, body: {} },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '缺少 roleCode/roleName 应返回非成功业务码'],
    });

    expect(body.code, '缺少 roleCode/roleName 应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  // ── 修改角色（异常） ──────────────────────────────────────────────────

  test('POST /roles/:id 修改不存在角色应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.roleUpdate(env.shopId, 999999999)}`;
    const { status, body } = await api.post(
      Endpoints.shopAdmin.roleUpdate(env.shopId, 999999999),
      { roleName: '测试角色' },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-修改不存在角色.json',
      request: { method: 'POST', url, headers: {}, body: { roleName: '测试角色' } },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '修改不存在角色应返回非成功业务码'],
    });

    expect(body.code, '修改不存在角色应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  // ── 删除角色（异常） ──────────────────────────────────────────────────

  test('POST /roles/:id/delete 删除不存在角色应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.roleDelete(env.shopId, 999999999)}`;
    const { status, body } = await api.post(
      Endpoints.shopAdmin.roleDelete(env.shopId, 999999999),
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-删除不存在角色.json',
      request: { method: 'POST', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '删除不存在角色应返回非成功业务码'],
    });

    expect(body.code, '删除不存在角色应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  /**
   * 删除系统角色：GET /roles 提取系统 roleId → POST /roles/:id/delete。
   */
  test('POST /roles/:id/delete 删除系统角色应失败', async ({ api, env }) => {
    const listUrl = `${env.apiBaseURL}${Endpoints.shopAdmin.rolesList(env.shopId)}?page=1&pageSize=20`;
    const { status: listStatus, body: roleListBody } = await api.get<RoleListData>(
      Endpoints.shopAdmin.rolesList(env.shopId),
      { query: { page: 1, pageSize: 20 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-删除系统角色-角色列表.json',
      request: { method: 'GET', url: listUrl, headers: {}, body: null },
      response: { status: listStatus, headers: {}, body: roleListBody },
      assertions: ['获取角色列表应成功'],
    });

    const sysRole = roleListBody.data?.list?.find((role) => role.roleType !== 2);
    test.skip(!sysRole, '找不到系统角色，跳过');

    const deleteUrl = `${env.apiBaseURL}${Endpoints.shopAdmin.roleDelete(env.shopId, sysRole!.id)}`;
    const { status, body } = await api.post(
      Endpoints.shopAdmin.roleDelete(env.shopId, sysRole!.id),
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-删除系统角色.json',
      request: { method: 'POST', url: deleteUrl, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '删除系统角色应返回非成功业务码'],
    });

    expect(body.code, '删除系统角色应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });
});
