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
} from '@shared';

/**
 * 约课链路（预约课 goodsType=3）：零元预约课上架（绑定老师）→ 学生下单 → 设置老师可约时段 → 约课 → 取消。
 */

const WINDOW_SECONDS = 30 * 24 * 3600;

interface SlotPick {
  teacherId?: number;
  startUnix?: number;
  durationMin?: number;
}

function listAvailableSlots(data: unknown, fallbackTeacherId?: number): SlotPick[] {
  const slots: SlotPick[] = [];
  for (const s of asArray(data)) {
    const startUnix = pickNumber(s, ['startUnix', 'start_unix']);
    const endUnix = pickNumber(s, ['endUnix', 'end_unix']);
    const teacherId = pickNumber(s, ['teacherId', 'teacher_id']) ?? fallbackTeacherId;
    const durationMin =
      startUnix && endUnix ? Math.round((endUnix - startUnix) / 60) : undefined;
    if (startUnix && teacherId && durationMin) {
      slots.push({ teacherId, startUnix, durationMin });
    }
  }
  return slots;
}

function pickFirstAvailableSlot(data: unknown, fallbackTeacherId?: number): SlotPick | undefined {
  return listAvailableSlots(data, fallbackTeacherId)[0];
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
      slot = mergeSlotFromSetup(pickFirstAvailableSlot(body.data, teacherId), slotSetup!);
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

    await provisionTeacherAvailableSlots(api, env.shopId!, teacherId!, {
      date: futureLocalDate(2),
      startHhmms: ['09:00', '11:00', '13:00', '15:00', '17:00'],
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
    const candidates = listAvailableSlots(slotsRes.body.data, teacherId);
    test.skip(candidates.length === 0, '无完整可约时段，跳过约课');

    let appointmentId: number | undefined;
    await test.step('约课（上游）', async () => {
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
      }
      expect(appointmentId, '应至少有一个可约时段约课成功').toBeTruthy();
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
