import { test, expect } from '@shared';
import {
  Endpoints,
  SUCCESS_CODE,
  GOODS_TYPE_APPOINTMENT,
  loggedGet,
  loggedPost,
} from '@shared';
import { hasApiCredential, hasMobileCredential } from '@config';
import {
  pickNumber,
  asArray,
  provisionTeacherAvailableSlots,
  pickOrderTeacherId,
  futureLocalDate,
  sparseTeacherSlotStarts,
  listBookableStudentSlots,
  parseBookingRefundPreview,
  buildAppointmentCloseOnlineRefundPayload,
  REFUND_CHANNEL_ONLINE,
  REPO_AUTH_CLOSE,
  BOOKING_REFUND_MODE_CANCEL,
} from '@shared';

/**
 * 约课链路（预约课 goodsType=3）：零元预约课上架（绑定老师）→ 学生下单 → 设置老师可约时段 → 约课 → 取消；
 * 并对有效订单补充商家退款（课程全选关闭 + 线上，金额取 booking-preview）。
 */

const WINDOW_SECONDS = 30 * 24 * 3600;

interface SlotPick {
  teacherId?: number;
  startUnix?: number;
  durationMin?: number;
}

function pickFirstBookableSlot(data: unknown, fallbackTeacherId?: number): SlotPick | undefined {
  return listBookableStudentSlots(data, fallbackTeacherId)[0];
}

function mergeSlotFromSetup(
  fromApi: SlotPick | undefined,
  setup: { teacherId: number; startUnix: number; durationMin: number },
): SlotPick {
  return {
    teacherId: fromApi?.teacherId ?? setup.teacherId,
    startUnix: fromApi?.startUnix ?? setup.startUnix,
    durationMin: fromApi?.durationMin ?? setup.durationMin,
  };
}

test.describe('预约课约课链路（绑定老师）', () => {
  test.skip(({ env }) => !env.shopId, '未配置 SHOP_ID，跳过约课链路');
  test.skip(!hasApiCredential(), '未配置商家鉴权凭据，跳过需上架/设置老师时段的约课链路');
  test.skip(!hasMobileCredential(), '未配置 C 端鉴权，跳过学生约课链路');

  test('零元购预约课 → 设置时段 → 可约时段 → 约课校验（只读链路）', async ({
    api,
    mobileApi,
    env,
    studentAppointmentOrderItem,
  }) => {
    expect(studentAppointmentOrderItem.goodsId, 'fixture 应产出预约课订单').toBeTruthy();
    expect(studentAppointmentOrderItem.goodsType, 'fixture 应为预约课 goodsType=3').toBe(
      GOODS_TYPE_APPOINTMENT,
    );
    const { orderItemId, teacherId: presetTeacherId } = studentAppointmentOrderItem;
    const now = Math.floor(Date.now() / 1000);
    const testInfo = test.info();
    const logBase = { testInfo, apiBaseURL: env.apiBaseURL };

    let teacherId: number | undefined;
    await test.step('可约老师列表可查（上游）', async () => {
      const { body } = await loggedGet(mobileApi, {
        ...logBase,
        logName: '请求日志-约课链路-可约老师列表.json',
        assertions: ['业务 code 应为成功码'],
      }, Endpoints.appointment.orderTeachers(orderItemId));
      expect(body.code, body.msg).toBe(SUCCESS_CODE);
      teacherId = pickOrderTeacherId(body.data) ?? presetTeacherId;
      test.skip(!teacherId, '订单项无可约老师，跳过约课校验');
    });

    let slotSetup: { teacherId: number; startUnix: number; durationMin: number };
    await test.step('设置老师可约时段（商家端）', async () => {
      const setup = await provisionTeacherAvailableSlots(api, env.shopId!, teacherId!, {
        log: {
          ...logBase,
          logName: '请求日志-约课链路-设置老师时段.json',
          assertions: ['设置老师可约时段业务 code 应为成功码'],
        },
      });
      slotSetup = {
        teacherId: setup.teacherId,
        startUnix: setup.startUnix,
        durationMin: setup.durationMin,
      };
    });

    let slot: SlotPick | undefined;
    await test.step('可约时段取一个候选（中游）', async () => {
      const query = { begin_unix: now, end_unix: now + WINDOW_SECONDS };
      const { body } = await loggedGet(mobileApi, {
        ...logBase,
        logName: '请求日志-约课链路-可约时段列表.json',
        assertions: ['业务 code 应为成功码'],
      }, Endpoints.appointment.orderSlots(orderItemId), { query });
      expect(body.code, body.msg).toBe(SUCCESS_CODE);
      slot = mergeSlotFromSetup(pickFirstBookableSlot(body.data, teacherId), slotSetup!);
    });

    await test.step('约课前置校验（下游，依赖订单项+老师+时段）', async () => {
      test.skip(
        !slot?.startUnix || !slot?.teacherId || !slot?.durationMin,
        '候选时段信息不完整，跳过校验',
      );
      const payload = {
        order_item_id: orderItemId,
        teacher_id: slot!.teacherId,
        start_unix: slot!.startUnix,
        duration_min: slot!.durationMin,
      };
      const { body } = await loggedPost(mobileApi, {
        ...logBase,
        logName: '请求日志-约课链路-约课前置校验.json',
        assertions: ['应返回业务 code（可约/不可约均属正常）'],
      }, Endpoints.appointment.check, payload);
      expect(typeof body.code).toBe('number');
    });
  });

  test('零元购预约课 → 商家退款（课程关闭·线上）', async ({
    api,
    mobileApi,
    env,
    studentAppointmentOrderItem,
  }) => {
    expect(studentAppointmentOrderItem.goodsType, 'fixture 应为预约课 goodsType=3').toBe(
      GOODS_TYPE_APPOINTMENT,
    );
    const { orderItemId: fixtureOrderItemId } = studentAppointmentOrderItem;
    let orderId = studentAppointmentOrderItem.orderId;
    const testInfo = test.info();
    const logBase = { testInfo, apiBaseURL: env.apiBaseURL };

    await test.step('订单详情：确认已支付并解析 orderId', async () => {
      const { body } = await loggedGet(mobileApi, {
        ...logBase,
        logName: '请求日志-约课退款-订单详情.json',
        assertions: ['业务 code 应为成功码', '订单应已支付'],
      }, Endpoints.user.orderDetail(fixtureOrderItemId));
      expect(body.code, body.msg).toBe(SUCCESS_CODE);
      const order = asArray(
        (body.data as { originalOrder?: unknown } | null)?.originalOrder ?? body.data,
      )[0];
      expect(order, '订单详情应返回主订单').toBeTruthy();
      expect(pickNumber(order, ['tradeResult', 'trade_result']), '预约课订单应已支付').toBe(1);
      orderId = orderId ?? pickNumber(order, ['orderId', 'order_id', 'id']);
      expect(orderId, '退款前应拿到 orderId').toBeTruthy();
    });

    /**
     * 预约课退款必须先调 booking-preview，再按预览字段组 POST /refund：
     *   orderId / refundAmount(=refundableAmount) / refundChannel / repoAuth
     *   + bookingRefund.{ orderItemId, refundHours(=maxRefundHours), mode }
     * 关闭课程（repoAuth=0）要求 refundHours === maxRefundHours，且无已约未开课或 mode=0。
     */
    await test.step('预约课退款预览 → 商家退款（关闭课程·线上）', async () => {
      const previewRes = await loggedGet(api, {
        ...logBase,
        logName: '请求日志-约课退款-预览.json',
        assertions: [
          '业务 code 应为成功码',
          '预览应返回 orderId/orderItemId/maxRefundHours/refundableAmount',
        ],
      }, Endpoints.shopAdmin.refundBookingPreview(env.shopId!), {
        query: { orderId: orderId! },
      });
      expect(previewRes.body.code, `预约课退款预览失败：${previewRes.body.msg}`).toBe(SUCCESS_CODE);

      const preview = parseBookingRefundPreview(previewRes.body.data);
      expect(preview, '退款预览字段应完整可解析').toBeTruthy();
      expect(preview!.orderId, '预览 orderId 应与订单一致').toBe(orderId);
      expect(preview!.orderItemId, '预览 orderItemId 应有效').toBeGreaterThan(0);
      expect(preview!.orderItemId, '预览 orderItemId 应与下单 orderItemId 一致').toBe(
        fixtureOrderItemId,
      );
      expect(preview!.maxRefundHours, '关闭课程要求可退课时 > 0').toBeGreaterThan(0);
      expect(preview!.maxRefundHours, '可退课时不应超过总课时').toBeLessThanOrEqual(
        preview!.totalHours,
      );
      expect(preview!.refundableAmount, '免费预约课可退金额应为 0').toBe(0);

      const payload = buildAppointmentCloseOnlineRefundPayload(preview!);
      expect(payload.orderId, '退款 orderId').toBe(preview!.orderId);
      expect(payload.refundAmount, '退款金额取预览 refundableAmount').toBe(
        preview!.refundableAmount,
      );
      expect(payload.refundChannel, '退款方式应为线上').toBe(REFUND_CHANNEL_ONLINE);
      expect(payload.repoAuth, '课程权限应为关闭').toBe(REPO_AUTH_CLOSE);
      expect(payload.bookingRefund, '预约课必须带 bookingRefund').toBeTruthy();
      expect(payload.bookingRefund!.orderItemId, 'bookingRefund.orderItemId 取预览').toBe(
        preview!.orderItemId,
      );
      expect(payload.bookingRefund!.refundHours, '关闭课程须退全部可退课时').toBe(
        preview!.maxRefundHours,
      );
      expect(payload.bookingRefund!.mode, '关闭课程用取消预约一并退款').toBe(
        BOOKING_REFUND_MODE_CANCEL,
      );

      const { body } = await loggedPost(api, {
        ...logBase,
        logName: '请求日志-约课退款-商家退款.json',
        assertions: [
          '商家退款业务 code 应为成功码',
          'payload 含 bookingRefund.orderItemId/refundHours/mode',
          'refundChannel=0 线上 / repoAuth=0 关闭 / refundAmount=0',
        ],
      }, Endpoints.shopAdmin.refundCreate(env.shopId!), payload);
      expect(body.code, `预约课商家退款失败：${body.msg}`).toBe(SUCCESS_CODE);
    });
  });

  test('约课 → 我的预约校验 → 取消', async ({
    api,
    mobileApi,
    env,
    studentAppointmentOrderItem,
    data,
  }) => {
    expect(studentAppointmentOrderItem.goodsType, 'fixture 应为预约课 goodsType=3').toBe(
      GOODS_TYPE_APPOINTMENT,
    );
    const { orderItemId, teacherId: presetTeacherId } = studentAppointmentOrderItem;
    const now = Math.floor(Date.now() / 1000);
    const testInfo = test.info();
    const logBase = { testInfo, apiBaseURL: env.apiBaseURL };

    const teachersRes = await loggedGet(mobileApi, {
      ...logBase,
      logName: '请求日志-约课链路-可约老师列表-约课.json',
      assertions: ['业务 code 应为成功码'],
    }, Endpoints.appointment.orderTeachers(orderItemId));
    expect(teachersRes.body.code, teachersRes.body.msg).toBe(SUCCESS_CODE);
    const teacherId = pickOrderTeacherId(teachersRes.body.data) ?? presetTeacherId;
    test.skip(!teacherId, '订单项无可约老师，跳过约课');

    // 多日 + 稀疏起点：共享老师上常有历史 pending，固定 09/11/13 易全撞「该老师该时段已有排课」
    await provisionTeacherAvailableSlots(api, env.shopId!, teacherId!, {
      dates: [3, 4, 5, 6].map((d) => futureLocalDate(d)),
      startHhmms: sparseTeacherSlotStarts(6),
      log: {
        ...logBase,
        logName: '请求日志-约课链路-设置老师时段-约课.json',
        assertions: ['设置老师可约时段业务 code 应为成功码'],
      },
    });

    const slotsQuery = { begin_unix: now, end_unix: now + WINDOW_SECONDS };
    const slotsRes = await loggedGet(mobileApi, {
      ...logBase,
      logName: '请求日志-约课链路-可约时段列表-约课.json',
      assertions: ['业务 code 应为成功码'],
    }, Endpoints.appointment.orderSlots(orderItemId), { query: slotsQuery });
    expect(slotsRes.body.code, slotsRes.body.msg).toBe(SUCCESS_CODE);
    // slots 接口会带回已约满时段（bookedNum>=capacity），须先过滤再约
    const candidates = listBookableStudentSlots(slotsRes.body.data, teacherId);
    test.skip(candidates.length === 0, '无仍有空位的可约时段，跳过约课');

    let appointmentId: number | undefined;
    await test.step('约课（上游）', async () => {
      const failures: string[] = [];
      for (const [index, slot] of candidates.entries()) {
        const payload = {
          order_item_id: orderItemId,
          teacher_id: slot.teacherId,
          start_unix: slot.startUnix,
          duration_min: slot.durationMin,
        };
        const { body } = await loggedPost(mobileApi, {
          ...logBase,
          logName: `请求日志-约课链路-提交约课-${index + 1}.json`,
          assertions: ['约课接口应返回业务 code'],
        }, Endpoints.appointment.book, payload);
        if (body.code === SUCCESS_CODE) {
          appointmentId = pickNumber(body.data, ['appointmentId', 'appointment_id', 'id']);
          break;
        }
        failures.push(`#${index + 1} start=${slot.startUnix} code=${body.code} msg=${body.msg ?? ''}`);
      }
      expect(
        appointmentId,
        `应至少有一个可约时段约课成功；失败明细: ${failures.join(' | ') || '无候选'}`,
      ).toBeTruthy();
      if (appointmentId) {
        data.register(`appointment ${appointmentId}`, async () => {
          await mobileApi.post(Endpoints.appointment.myCancel(appointmentId!), {
            reason: '自动化测试清理',
          });
        });
      }
    });

    await test.step('我的预约应包含新约（下游，依赖 appointmentId）', async () => {
      test.skip(!appointmentId, '约课未返回 appointmentId');
      const query = { page: 1, pageSize: 20 };
      const { body } = await loggedGet(mobileApi, {
        ...logBase,
        logName: '请求日志-约课链路-我的预约列表.json',
        assertions: ['业务 code 应为成功码', '列表应包含新约'],
      }, Endpoints.appointment.my, { query });
      expect(body.code, body.msg).toBe(SUCCESS_CODE);
      const found = asArray(body.data).find(
        (a) => pickNumber(a, ['id', 'appointmentId', 'appointment_id']) === appointmentId,
      );
      expect(found, '我的预约列表应包含新约').toBeTruthy();
    });
  });
});
