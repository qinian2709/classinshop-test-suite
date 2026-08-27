/**
 * 约课前置：商家端设置老师可约时段；学生端零元购课拿 orderItemId。
 */
import type { ApiHelper } from '../fixtures/api-helper.js';
import { Endpoints } from '../api/endpoints.js';
import type { ApiLogOptions } from '../api/logged-call.js';
import { loggedPost } from '../api/logged-call.js';
import { SUCCESS_CODE } from '../http/types.js';
import { asArray, pickNumber } from './discovery.js';
import type { DataRegistry } from './cleanup.js';
import { buildCreateOrderPayload } from './factory.js';
import {
  provisionPublishedAppointmentGoods,
  GOODS_TYPE_APPOINTMENT,
} from './goods-provision.js';
import { cleanupRefundAppointmentOrder } from './refund.js';
import { INFRA_API_OPTS } from './infra.js';

export interface TeacherSlotSetup {
  teacherId: number;
  date: string;
  startHhmm: string;
  durationMin: number;
  startUnix: number;
}

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function tomorrowLocalDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return formatLocalDate(d);
}

export function futureLocalDate(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return formatLocalDate(d);
}

/** 生成稀疏可约起点，降低与历史 pending 预约撞车概率（后端仅允许 15/30/60）。 */
export function sparseTeacherSlotStarts(count = 6): string[] {
  const stepMin = 60;
  // 以当前分钟偏移挑起点，避免多轮自动化总落在 09/11/13…
  const seed = Math.floor(Date.now() / 60_000) % 8;
  const starts: string[] = [];
  for (let i = 0; i < count; i++) {
    const totalMin = (8 + seed) * 60 + i * stepMin;
    if (totalMin + stepMin > 22 * 60) break;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    starts.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
  return starts.length > 0 ? starts : ['10:00', '12:00', '14:00', '16:00', '18:00'];
}

function localDateTimeUnix(dateStr: string, hhmm: string): number {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  const [y = 1970, mo = 1, day = 1] = dateStr.split('-').map(Number);
  // 与后端 appointmentTZ（CST +08）对齐，避免本机非东八区时 startUnix 偏移
  const utcMs = Date.UTC(y, mo - 1, day, h - 8, m, 0);
  return Math.floor(utcMs / 1000);
}

function readNonNegInt(obj: Record<string, unknown>, keys: string[], fallback: number): number {
  for (const k of keys) {
    const v = obj[k];
    const n = typeof v === 'string' ? Number(v) : v;
    if (typeof n === 'number' && Number.isFinite(n) && n >= 0) return n;
  }
  return fallback;
}

export interface BookableStudentSlot {
  teacherId: number;
  startUnix: number;
  durationMin: number;
  capacity: number;
  bookedNum: number;
}

/**
 * 从学员可约时段响应中筛「仍有空位」的候选。
 * 后端 slots 列表会返回已约满时段（bookedNum），约课冲突校验才拒绝；测试必须先过滤。
 */
export function listBookableStudentSlots(
  data: unknown,
  fallbackTeacherId?: number,
): BookableStudentSlot[] {
  const slots: BookableStudentSlot[] = [];
  for (const s of asArray(data)) {
    const startUnix = pickNumber(s, ['startUnix', 'start_unix']);
    const endUnix = pickNumber(s, ['endUnix', 'end_unix']);
    const teacherId = pickNumber(s, ['teacherId', 'teacher_id']) ?? fallbackTeacherId;
    const capacity = readNonNegInt(s, ['capacity'], 1) || 1;
    const bookedNum = readNonNegInt(s, ['bookedNum', 'booked_num'], 0);
    const durationMin =
      startUnix && endUnix ? Math.round((endUnix - startUnix) / 60) : undefined;
    if (!startUnix || !teacherId || !durationMin) continue;
    if (bookedNum >= capacity) continue;
    slots.push({ teacherId, startUnix, durationMin, capacity, bookedNum });
  }
  return slots;
}

/** 从 orderTeachers 等接口响应里取第一个老师 ID。 */
export function pickOrderTeacherId(data: unknown): number | undefined {
  const list = asArray(data);
  if (list.length > 0) {
    return pickNumber(list[0], ['id', 'teacherId', 'teacher_id']);
  }
  if (data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>).list)) {
    const nested = (data as Record<string, unknown>).list as unknown[];
    if (nested.length > 0) {
      return pickNumber(nested[0], ['id', 'teacherId', 'teacher_id']);
    }
  }
  return undefined;
}

/** 商家 POST 设置老师可约时段（replace 替换同日同时长档位）。 */
export async function provisionTeacherAvailableSlots(
  api: ApiHelper,
  shopId: string | number,
  teacherId: number,
  options?: {
    date?: string;
    dates?: string[];
    startHhmm?: string;
    startHhmms?: string[];
    durationMin?: number;
    log?: ApiLogOptions;
  },
): Promise<TeacherSlotSetup> {
  const dates =
    options?.dates && options.dates.length > 0
      ? options.dates
      : [options?.date ?? tomorrowLocalDate()];
  const startHhmms = options?.startHhmms ?? (options?.startHhmm ? [options.startHhmm] : ['10:00']);
  const durationMin = options?.durationMin ?? 60;
  const payload = {
    teacher_id: teacherId,
    duration_min: durationMin,
    dates,
    start_hhmms: startHhmms,
    replace: true,
  };
  const path = Endpoints.shopAdmin.appointmentTeacherSlots(shopId);
  // 用例传入 log → logged* 仍走正文 SLA；无 log 的基建调用跳过耗时
  const { body } = options?.log
    ? await loggedPost(api, options.log, path, payload)
    : await api.post(path, payload, INFRA_API_OPTS);
  if (body.code !== SUCCESS_CODE) {
    throw new Error(`设置老师可约时段失败: code=${body.code} msg=${body.msg ?? ''}`);
  }

  const startHhmm = startHhmms[0]!;
  const date = dates[0]!;
  return {
    teacherId,
    date,
    startHhmm,
    durationMin,
    startUnix: localDateTimeUnix(date, startHhmm),
  };
}

export interface StudentAppointmentOrderItem {
  orderItemId: number;
  orderId?: number;
  goodsId: number;
  skuId: number;
  goodsType: number;
  title?: string;
  teacherId?: number;
}

/**
 * 商家上架零元预约课 → 学生下单（自动支付）→ 返回可约课 orderItemId。
 */
export async function provisionStudentAppointmentOrderItem(
  merchantApi: ApiHelper,
  mobileApi: ApiHelper,
  options: { shopId: string | number; data?: DataRegistry; keep?: boolean; namePrefix?: string },
): Promise<StudentAppointmentOrderItem | null> {
  const goods = await provisionPublishedAppointmentGoods(merchantApi, {
    shopId: options.shopId,
    data: options.data,
    keep: options.keep,
    price: 0,
    namePrefix: options.namePrefix ?? 'flow约课测试课',
  });
  if (!goods || goods.goodsType !== GOODS_TYPE_APPOINTMENT) return null;

  const { body: goodsDetail } = await merchantApi.get<{ goodsType: number }>(
    Endpoints.shopAdmin.goodsDetail(options.shopId, goods.goodsId),
    INFRA_API_OPTS,
  );
  if (goodsDetail.code !== SUCCESS_CODE || goodsDetail.data?.goodsType !== GOODS_TYPE_APPOINTMENT) {
    return null;
  }

  const { body } = await mobileApi.post(
    Endpoints.goods.orderCreate,
    buildCreateOrderPayload({ goodsId: goods.goodsId, skuId: goods.skuId }),
    INFRA_API_OPTS,
  );
  if (body.code !== SUCCESS_CODE) return null;

  const orderItemId = pickNumber(body.data, ['orderItemId', 'order_item_id']);
  if (!orderItemId) return null;

  const orderId = pickNumber(body.data, ['orderId', 'order_id', 'id']);
  // 每条用到本 fixture 的用例都会下一单；用例内未必退款，必须登记清理退款避免脏单堆积
  if (orderId && options.data) {
    options.data.register(`退款清理预约课订单 ${orderId}`, async () => {
      await cleanupRefundAppointmentOrder(merchantApi, options.shopId, orderId);
    });
  }

  return {
    orderItemId,
    orderId,
    goodsId: goods.goodsId,
    skuId: goods.skuId,
    goodsType: goods.goodsType,
    title: goods.title,
    teacherId: goods.teacherId,
  };
}
