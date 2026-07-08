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

function localDateTimeUnix(dateStr: string, hhmm: string): number {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  const [y = 1970, mo = 1, day = 1] = dateStr.split('-').map(Number);
  return Math.floor(new Date(y, mo - 1, day, h, m, 0).getTime() / 1000);
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
    startHhmm?: string;
    startHhmms?: string[];
    durationMin?: number;
    log?: ApiLogOptions;
  },
): Promise<TeacherSlotSetup> {
  const date = options?.date ?? tomorrowLocalDate();
  const startHhmms = options?.startHhmms ?? (options?.startHhmm ? [options.startHhmm] : ['10:00']);
  const durationMin = options?.durationMin ?? 60;
  const payload = {
    teacher_id: teacherId,
    duration_min: durationMin,
    dates: [date],
    start_hhmms: startHhmms,
    replace: true,
  };
  const path = Endpoints.shopAdmin.appointmentTeacherSlots(shopId);
  const { body } = options?.log
    ? await loggedPost(api, options.log, path, payload)
    : await api.post(path, payload);
  if (body.code !== SUCCESS_CODE) {
    throw new Error(`设置老师可约时段失败: code=${body.code} msg=${body.msg ?? ''}`);
  }

  const startHhmm = startHhmms[0]!;
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
  options: { shopId: string | number; data?: DataRegistry; keep?: boolean },
): Promise<StudentAppointmentOrderItem | null> {
  const goods = await provisionPublishedAppointmentGoods(merchantApi, {
    shopId: options.shopId,
    data: options.data,
    keep: options.keep ?? true,
    price: 0,
    namePrefix: 'flow约课测试课',
  });
  if (!goods || goods.goodsType !== GOODS_TYPE_APPOINTMENT) return null;

  const { body: goodsDetail } = await merchantApi.get<{ goodsType: number }>(
    Endpoints.shopAdmin.goodsDetail(options.shopId, goods.goodsId),
  );
  if (goodsDetail.code !== SUCCESS_CODE || goodsDetail.data?.goodsType !== GOODS_TYPE_APPOINTMENT) {
    return null;
  }

  const { body } = await mobileApi.post(
    Endpoints.goods.orderCreate,
    buildCreateOrderPayload({ goodsId: goods.goodsId, skuId: goods.skuId }),
  );
  if (body.code !== SUCCESS_CODE) return null;

  const orderItemId = pickNumber(body.data, ['orderItemId', 'order_item_id']);
  if (!orderItemId) return null;

  return {
    orderItemId,
    orderId: pickNumber(body.data, ['orderId', 'order_id', 'id']),
    goodsId: goods.goodsId,
    skuId: goods.skuId,
    goodsType: goods.goodsType,
    title: goods.title,
    teacherId: goods.teacherId,
  };
}
