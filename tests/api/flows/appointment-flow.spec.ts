import { test, expect } from '@shared';
import { Endpoints, SUCCESS_CODE } from '@shared';
import { pickNumber, asArray } from '@shared';

/**
 * 约课链路（依赖型接口示例，串联最深的一条）：
 *   订单项 → 可约老师 → 可约时段 → 约课校验 →（选配）约课 → 我的预约校验 → 取消。
 *
 * 关键点：
 *   - orderItemId 由 appointmentOrderItem fixture 发现；teacherId/startUnix/durationMin
 *     由「可约时段」接口返回（duration 用 endUnix-startUnix 推导），层层依赖上游；
 *   - check（前置校验）是只读的，默认参与 CI；book 是写操作，需 TEST_ALLOW_APPOINTMENT_BOOK=1；
 *   - 约课成功后登记取消动作，结束自动清理。
 */

const allowBook = process.env.TEST_ALLOW_APPOINTMENT_BOOK === '1';
const WINDOW_SECONDS = 30 * 24 * 3600;

interface SlotPick {
  teacherId?: number;
  startUnix?: number;
  durationMin?: number;
}

function pickSlot(data: unknown, fallbackTeacherId?: number): SlotPick | undefined {
  const list = asArray(data);
  if (list.length === 0) return undefined;
  const s = list[0];
  const startUnix = pickNumber(s, ['startUnix', 'start_unix']);
  const endUnix = pickNumber(s, ['endUnix', 'end_unix']);
  return {
    teacherId: pickNumber(s, ['teacherId', 'teacher_id']) ?? fallbackTeacherId,
    startUnix,
    durationMin: startUnix && endUnix ? Math.round((endUnix - startUnix) / 60) : undefined,
  };
}

test.describe('约课链路（依赖订单项/老师/时段数据）', () => {
  test('订单项 → 可约老师 → 可约时段 → 约课校验（只读链路）', async ({
    api,
    appointmentOrderItem,
  }) => {
    const itemId = appointmentOrderItem.orderItemId;
    const now = Math.floor(Date.now() / 1000);

    await test.step('可约老师列表可查（上游）', async () => {
      const { body } = await api.get(Endpoints.appointment.orderTeachers(itemId));
      expect(body.code, body.msg).toBe(SUCCESS_CODE);
    });

    let slot: SlotPick | undefined;
    await test.step('可约时段取一个候选（中游）', async () => {
      const { body } = await api.get(Endpoints.appointment.orderSlots(itemId), {
        query: { begin_unix: now, end_unix: now + WINDOW_SECONDS },
      });
      expect(body.code, body.msg).toBe(SUCCESS_CODE);
      slot = pickSlot(body.data, appointmentOrderItem.teacherId);
      test.skip(!slot, '该订单项近 30 天无可约时段，跳过约课校验');
    });

    await test.step('约课前置校验（下游，依赖订单项+老师+时段）', async () => {
      test.skip(
        !slot?.startUnix || !slot?.teacherId || !slot?.durationMin,
        '候选时段信息不完整，跳过校验',
      );
      const { body } = await api.post(Endpoints.appointment.check, {
        order_item_id: itemId,
        teacher_id: slot!.teacherId,
        start_unix: slot!.startUnix,
        duration_min: slot!.durationMin,
      });
      // 可约/不可约（如时段冲突、课时不足）都属正常业务返回，链路打通即可。
      expect(typeof body.code).toBe('number');
    });
  });

  test('选配：约课 → 我的预约校验 → 取消', async ({ api, appointmentOrderItem, data }) => {
    test.skip(!allowBook, '未开启 TEST_ALLOW_APPOINTMENT_BOOK，跳过真实约课写操作');
    const itemId = appointmentOrderItem.orderItemId;
    const now = Math.floor(Date.now() / 1000);

    const slotsRes = await api.get(Endpoints.appointment.orderSlots(itemId), {
      query: { begin_unix: now, end_unix: now + WINDOW_SECONDS },
    });
    const slot = pickSlot(slotsRes.body.data, appointmentOrderItem.teacherId);
    test.skip(
      !slot?.startUnix || !slot?.teacherId || !slot?.durationMin,
      '无完整可约时段，跳过约课',
    );

    let appointmentId: number | undefined;
    await test.step('约课（上游）', async () => {
      const { body } = await api.post(Endpoints.appointment.book, {
        order_item_id: itemId,
        teacher_id: slot!.teacherId,
        start_unix: slot!.startUnix,
        duration_min: slot!.durationMin,
      });
      expect(body.code, body.msg).toBe(SUCCESS_CODE);
      appointmentId = pickNumber(body.data, ['appointmentId', 'appointment_id', 'id']);
      if (appointmentId) {
        data.register(`appointment ${appointmentId}`, async () => {
          await api.post(Endpoints.appointment.myCancel(appointmentId!), {
            reason: '自动化测试清理',
          });
        });
      }
    });

    await test.step('我的预约应包含新约（下游，依赖 appointmentId）', async () => {
      test.skip(!appointmentId, '约课未返回 appointmentId');
      const { body } = await api.get(Endpoints.appointment.my, {
        query: { page: 1, pageSize: 20 },
      });
      expect(body.code, body.msg).toBe(SUCCESS_CODE);
      const found = asArray(body.data).find(
        (a) => pickNumber(a, ['id', 'appointmentId', 'appointment_id']) === appointmentId,
      );
      expect(found, '我的预约列表应包含新约').toBeTruthy();
    });
  });
});
