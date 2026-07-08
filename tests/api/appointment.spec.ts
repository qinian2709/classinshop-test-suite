import { test, expect } from '@shared';
import { Endpoints, SUCCESS_CODE, attachApiCallLog } from '@shared';

/**
 * 约课管理（需登录）。
 * 覆盖接口：
 *   学员端（/student & /shop/appointment）：
 *     GET  /student/appointment                       — 我的预约列表
 *     GET  /student/appointment/:id                   — 预约详情（异常）
 *     POST /student/appointment/:id/cancel            — 取消预约（异常）
 *     GET  /student/order-appointment/:orderId        — 订单下约课信息
 *   商家端 /shop/:shopId/appointment（需 SHOP_ID）：
 *     GET  /appointment/schedule                      — 课表总览
 *     GET  /appointment/teachers                      — 约课老师下拉
 *     GET  /appointment/goods                         — 约课商品下拉
 *     GET  /appointment/creatable-orders              — 可关联订单下拉
 *     GET  /appointment/order-teachers                — 按订单查老师
 *     POST /appointment/create                        — 创建排课（异常）
 *     POST /appointment/assist-create                 — 代约（异常）
 *     POST /appointment/batch-create                  — 批量排课（异常）
 *     POST /appointment/batch-delete                  — 批量删排课（异常）
 *     POST /appointment/:id/cancel                    — 单条取消（异常）
 *     GET  /appointment/students                      — 学员搜索
 *     GET  /appointment/student-orders                — 按学员查可关联订单
 *     GET  /appointment/booking-students              — 约课学员列表
 *     GET  /appointment/booking-students/stats        — 约课学员统计卡
 *     GET  /appointment/booking-students/:userId      — 约课学员详情（异常）
 *     POST /appointment/booking-students/:userId/remark — 备注（异常）
 *     GET  /appointment/records                       — 预约记录列表
 *     GET  /appointment/records/:id                   — 预约记录详情（异常）
 *     POST /appointment/records/:id/cancel            — 取消预约记录（异常）
 *     POST /appointment/records/:id/remark            — 备注（异常）
 *     POST /appointment/records/:id/reschedule        — 改约（异常）
 *     GET  /appointment/changes                       — 改约审批列表
 *     GET  /appointment/changes/:id                   — 改约审批详情（异常）
 *     GET  /appointment/teacher-manage                — 老师管理列表
 *     GET  /appointment/teacher-manage/stats          — 老师管理统计
 *     GET  /appointment/teacher-manage/:id            — 老师管理详情（异常）
 *     GET  /appointment/teacher-slots                 — 老师时段列表
 *
 * author：qiukailiang
 */

// ── 学员端·我的预约 ────────────────────────────────────────────────────────

test.describe('学员端·我的预约', () => {
  test('GET /student/appointment 返回我的预约列表', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.appointment.studentList}?page=1&limit=10`;
    const { status, body } = await api.get(Endpoints.appointment.studentList, {
      query: { page: 1, limit: 10 },
    });

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-我的预约列表.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
  });

  test('GET /student/appointment/:id 不存在的预约应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.appointment.studentDetail(999999999)}`;
    const { status, body } = await api.get(Endpoints.appointment.studentDetail(999999999));

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-我的预约详情-不存在.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['不存在预约应返回非成功业务码'],
    });

    expect(body.code, '不存在预约应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  test('POST /student/appointment/:id/cancel 取消不存在的预约应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.appointment.studentCancel(999999999)}`;
    const { status, body } = await api.post(Endpoints.appointment.studentCancel(999999999), {});

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-取消预约-不存在.json',
      request: { method: 'POST', url, headers: {}, body: {} },
      response: { status, headers: {}, body },
      assertions: ['取消不存在预约应返回非成功业务码'],
    });

    expect(body.code, '取消不存在预约应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  test('GET /student/order-appointment/:orderId 不存在订单应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.appointment.studentOrderCourse(999999999)}`;
    const { status, body } = await api.get(Endpoints.appointment.studentOrderCourse(999999999));

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-订单约课信息-不存在.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['不存在订单约课信息应返回非成功业务码'],
    });

    expect(body.code, '不存在订单约课信息应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  test('未登录访问我的预约列表应被拒绝', async ({ anonApi, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.appointment.studentList}`;
    const res = await anonApi.raw('get', Endpoints.appointment.studentList);
    const body = res.status() === 200 ? await res.json() : null;

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-我的预约-未登录.json',
      request: { method: 'GET', url, headers: {}, body: null },
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

// ── 商家端·课表总览 ────────────────────────────────────────────────────────

test.describe('商家端·课表总览', () => {
  test.skip(({ env }) => !env.shopId, '未配置 SHOP_ID，跳过课表总览用例');

  test('GET /appointment/schedule 返回课表数据', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.appointmentSchedule(env.shopId)}`;
    const { status, body } = await api.get(Endpoints.shopAdmin.appointmentSchedule(env.shopId));

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-课表总览.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
  });

  test('GET /appointment/teachers 返回约课老师下拉列表', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.appointmentTeachers(env.shopId)}`;
    const { status, body } = await api.get(Endpoints.shopAdmin.appointmentTeachers(env.shopId));

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-约课老师下拉.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '老师列表应为数组'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    const teacherData = body.data as Record<string, unknown> | unknown[];
    const teacherList = Array.isArray(teacherData) ? teacherData : (teacherData as Record<string, unknown>).list;
    expect(Array.isArray(teacherList), '老师列表应为数组').toBe(true);
  });

  test('GET /appointment/goods 返回约课商品下拉列表', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.appointmentGoods(env.shopId)}`;
    const { status, body } = await api.get(Endpoints.shopAdmin.appointmentGoods(env.shopId));

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-约课商品下拉.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
  });

  test('GET /appointment/creatable-orders 返回可关联订单', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.appointmentCreatableOrders(env.shopId)}`;
    const { status, body } = await api.get(
      Endpoints.shopAdmin.appointmentCreatableOrders(env.shopId),
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-可关联订单下拉.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
  });

  test('POST /appointment/create 缺少必填字段应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.appointmentCreate(env.shopId)}`;
    const { status, body } = await api.post(Endpoints.shopAdmin.appointmentCreate(env.shopId), {});

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-创建排课-缺少必填.json',
      request: { method: 'POST', url, headers: {}, body: {} },
      response: { status, headers: {}, body },
      assertions: ['缺少必填字段应返回非成功业务码'],
    });

    expect(body.code, '缺少必填字段应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  test('POST /appointment/batch-create 缺少必填字段应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.appointmentBatchCreate(env.shopId)}`;
    const { status, body } = await api.post(
      Endpoints.shopAdmin.appointmentBatchCreate(env.shopId),
      {},
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-批量排课-缺少必填.json',
      request: { method: 'POST', url, headers: {}, body: {} },
      response: { status, headers: {}, body },
      assertions: ['缺少必填字段应返回非成功业务码'],
    });

    expect(body.code, '缺少必填字段应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  test('POST /appointment/batch-delete 缺少 ids 应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.appointmentBatchDelete(env.shopId)}`;
    const { status, body } = await api.post(
      Endpoints.shopAdmin.appointmentBatchDelete(env.shopId),
      {},
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-批量删排课-缺少ids.json',
      request: { method: 'POST', url, headers: {}, body: {} },
      response: { status, headers: {}, body },
      assertions: ['缺少 ids 应返回非成功业务码'],
    });

    expect(body.code, '缺少 ids 应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  test('POST /appointment/:id/cancel 取消不存在排课应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.appointmentCancel(env.shopId, 999999999)}`;
    const { status, body } = await api.post(
      Endpoints.shopAdmin.appointmentCancel(env.shopId, 999999999),
      {},
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-取消排课-不存在.json',
      request: { method: 'POST', url, headers: {}, body: {} },
      response: { status, headers: {}, body },
      assertions: ['取消不存在排课应返回非成功业务码'],
    });

    expect(body.code, '取消不存在排课应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });
});

// ── 商家端·约课学员管理 ────────────────────────────────────────────────────

test.describe('商家端·约课学员管理', () => {
  test.skip(({ env }) => !env.shopId, '未配置 SHOP_ID，跳过约课学员管理用例');

  test('GET /appointment/students 返回学员搜索结果', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.appointmentStudents(env.shopId)}`;
    const { status, body } = await api.get(Endpoints.shopAdmin.appointmentStudents(env.shopId), {
      query: { keyword: '' },
    });

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-约课学员搜索.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
  });

  test('GET /appointment/booking-students 返回约课学员列表', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.appointmentBookingStudents(env.shopId)}?page=1&limit=20`;
    const { status, body } = await api.get(
      Endpoints.shopAdmin.appointmentBookingStudents(env.shopId),
      { query: { page: 1, limit: 20 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-约课学员列表.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '约课学员列表应为数组'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(Array.isArray((body.data as Record<string, unknown>)?.list ?? []), '约课学员列表应为数组').toBe(true);
  });

  test('GET /appointment/booking-students/stats 返回约课学员统计卡', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.appointmentBookingStudentStats(env.shopId)}`;
    const { status, body } = await api.get(
      Endpoints.shopAdmin.appointmentBookingStudentStats(env.shopId),
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-约课学员统计卡.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
  });

  test('GET /appointment/booking-students/:userId 不存在学员应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.appointmentBookingStudentDetail(env.shopId, 999999999)}`;
    const { status, body } = await api.get(
      Endpoints.shopAdmin.appointmentBookingStudentDetail(env.shopId, 999999999),
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-约课学员详情-不存在.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['不存在学员应返回非成功业务码'],
    });

    expect(body.code, '不存在学员应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  test('POST /appointment/booking-students/:userId/remark 备注不存在学员应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.appointmentBookingStudentRemark(env.shopId, 999999999)}`;
    const { status, body } = await api.post(
      Endpoints.shopAdmin.appointmentBookingStudentRemark(env.shopId, 999999999),
      { remark: '测试备注' },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-约课学员备注-不存在.json',
      request: { method: 'POST', url, headers: {}, body: { remark: '测试备注' } },
      response: { status, headers: {}, body },
      assertions: ['备注不存在学员应返回非成功业务码'],
    });

    expect(body.code, '备注不存在学员应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });
});

// ── 商家端·预约记录 ────────────────────────────────────────────────────────

test.describe('商家端·预约记录', () => {
  test.skip(({ env }) => !env.shopId, '未配置 SHOP_ID，跳过预约记录用例');

  test('GET /appointment/records 返回预约记录列表', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.appointmentRecords(env.shopId)}?page=1&limit=20`;
    const { status, body } = await api.get(Endpoints.shopAdmin.appointmentRecords(env.shopId), {
      query: { page: 1, limit: 20 },
    });

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-预约记录列表.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '预约记录列表应为数组'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(Array.isArray((body.data as Record<string, unknown>)?.list ?? []), '预约记录列表应为数组').toBe(true);
  });

  test('GET /appointment/records/:id 不存在预约记录应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.appointmentRecordDetail(env.shopId, 999999999)}`;
    const { status, body } = await api.get(
      Endpoints.shopAdmin.appointmentRecordDetail(env.shopId, 999999999),
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-预约记录详情-不存在.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['不存在预约记录应返回非成功业务码'],
    });

    expect(body.code, '不存在预约记录应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  test('POST /appointment/records/:id/cancel 取消不存在预约记录应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.appointmentRecordCancel(env.shopId, 999999999)}`;
    const { status, body } = await api.post(
      Endpoints.shopAdmin.appointmentRecordCancel(env.shopId, 999999999),
      {},
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-取消预约记录-不存在.json',
      request: { method: 'POST', url, headers: {}, body: {} },
      response: { status, headers: {}, body },
      assertions: ['取消不存在预约记录应返回非成功业务码'],
    });

    expect(body.code, '取消不存在预约记录应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  test('POST /appointment/records/:id/remark 备注不存在预约记录应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.appointmentRecordRemark(env.shopId, 999999999)}`;
    const { status, body } = await api.post(
      Endpoints.shopAdmin.appointmentRecordRemark(env.shopId, 999999999),
      { remark: '测试备注' },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-预约记录备注-不存在.json',
      request: { method: 'POST', url, headers: {}, body: { remark: '测试备注' } },
      response: { status, headers: {}, body },
      assertions: ['备注不存在预约记录应返回非成功业务码'],
    });

    expect(body.code, '备注不存在预约记录应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  test('POST /appointment/records/:id/reschedule 改约不存在记录应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.appointmentRecordReschedule(env.shopId, 999999999)}`;
    const { status, body } = await api.post(
      Endpoints.shopAdmin.appointmentRecordReschedule(env.shopId, 999999999),
      { newSlotId: 1 },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-改约-不存在记录.json',
      request: { method: 'POST', url, headers: {}, body: { newSlotId: 1 } },
      response: { status, headers: {}, body },
      assertions: ['改约不存在预约记录应返回非成功业务码'],
    });

    expect(body.code, '改约不存在预约记录应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  /**
   * 预约记录链路：GET /appointment/records 提取 id → GET /appointment/records/:id。
   */
  test('预约记录链路：列表 -> 详情', async ({ api, env }) => {
    interface RecordItem { id: number }
    interface RecordList { list: RecordItem[]; total: number }

    const listUrl = `${env.apiBaseURL}${Endpoints.shopAdmin.appointmentRecords(env.shopId)}?page=1&limit=1`;
    const { body: listBody } = await api.get<RecordList>(
      Endpoints.shopAdmin.appointmentRecords(env.shopId),
      { query: { page: 1, limit: 1 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-预约记录链路-列表.json',
      request: { method: 'GET', url: listUrl, headers: {}, body: null },
      response: { status: 200, headers: {}, body: listBody },
      assertions: ['获取预约记录列表应成功'],
    });

    expect(listBody.code, '获取预约记录列表应成功').toBe(SUCCESS_CODE);
    test.skip(!listBody.data?.list?.[0], '当前无预约记录数据，跳过详情链路');

    const recordId = listBody.data.list[0]!.id;
    const detailUrl = `${env.apiBaseURL}${Endpoints.shopAdmin.appointmentRecordDetail(env.shopId, recordId)}`;
    const { status, body } = await api.get(
      Endpoints.shopAdmin.appointmentRecordDetail(env.shopId, recordId),
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-预约记录链路-详情.json',
      request: { method: 'GET', url: detailUrl, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '预约记录详情应存在'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(body.data, '预约记录详情应存在').toBeTruthy();
  });
});

// ── 商家端·改约审批 ────────────────────────────────────────────────────────

test.describe('商家端·改约审批', () => {
  test.skip(({ env }) => !env.shopId, '未配置 SHOP_ID，跳过改约审批用例');

  test('GET /appointment/changes 返回改约审批列表', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.appointmentChanges(env.shopId)}?page=1&limit=20`;
    const { status, body } = await api.get(Endpoints.shopAdmin.appointmentChanges(env.shopId), {
      query: { page: 1, limit: 20 },
    });

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-改约审批列表.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
  });

  test('GET /appointment/changes/teachers 返回改约老师下拉', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.appointmentChangeTeachers(env.shopId)}`;
    const { status, body } = await api.get(
      Endpoints.shopAdmin.appointmentChangeTeachers(env.shopId),
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-改约老师下拉.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
  });

  test('GET /appointment/changes/:id 不存在改约应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.appointmentChangeDetail(env.shopId, 999999999)}`;
    const { status, body } = await api.get(
      Endpoints.shopAdmin.appointmentChangeDetail(env.shopId, 999999999),
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-改约审批详情-不存在.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['不存在改约申请应返回非成功业务码'],
    });

    expect(body.code, '不存在改约申请应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });
});

// ── 商家端·老师管理 ────────────────────────────────────────────────────────

test.describe('商家端·老师管理', () => {
  test.skip(({ env }) => !env.shopId, '未配置 SHOP_ID，跳过老师管理用例');

  test('GET /appointment/teacher-manage 返回老师管理列表', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.appointmentTeacherManageList(env.shopId)}?page=1&limit=20`;
    const { status, body } = await api.get(
      Endpoints.shopAdmin.appointmentTeacherManageList(env.shopId),
      { query: { page: 1, limit: 20 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-老师管理列表.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
  });

  test('GET /appointment/teacher-manage/stats 返回老师管理统计', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.appointmentTeacherManageStats(env.shopId)}`;
    const { status, body } = await api.get(
      Endpoints.shopAdmin.appointmentTeacherManageStats(env.shopId),
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-老师管理统计.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
  });

  test('GET /appointment/teacher-manage/:id 不存在老师应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.appointmentTeacherManageDetail(env.shopId, 999999999)}`;
    const { status, body } = await api.get(
      Endpoints.shopAdmin.appointmentTeacherManageDetail(env.shopId, 999999999),
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-老师管理详情-不存在.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['不存在老师应返回非成功业务码'],
    });

    expect(body.code, '不存在老师应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  test('GET /appointment/teacher-slots 返回老师时段', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.appointmentTeacherSlots(env.shopId)}`;
    const { status, body } = await api.get(
      Endpoints.shopAdmin.appointmentTeacherSlots(env.shopId),
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-老师时段列表.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
  });

  test('未登录访问老师管理列表应被拒绝', async ({ anonApi, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shopAdmin.appointmentTeacherManageList(env.shopId)}`;
    const res = await anonApi.raw('get', Endpoints.shopAdmin.appointmentTeacherManageList(env.shopId));
    const body = res.status() === 200 ? await res.json() : null;

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-老师管理-未登录.json',
      request: { method: 'GET', url, headers: {}, body: null },
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
