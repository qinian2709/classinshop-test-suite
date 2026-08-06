/**
 * 商家直接退款入参构造（POST /shop/:shopId/refund）。
 * 对齐 classinshop-go requests.RefundRequest / BookingRefundOption，
 * 以及商家端 BookingRefundModal 提交字段。
 */
import type { ApiHelper } from '../fixtures/api-helper.js';
import { Endpoints } from '../api/endpoints.js';
import { INFRA_API_OPTS, withInfraApiOpts } from './infra.js';
import { SUCCESS_CODE } from '../http/types.js';

/** 退款渠道：0 线上（原路退回） 1 线下 */
export const REFUND_CHANNEL_ONLINE = 0;
export const REFUND_CHANNEL_OFFLINE = 1;

/** 课程权限：0 关闭（全选关闭） 1 保留 */
export const REPO_AUTH_CLOSE = 0;
export const REPO_AUTH_KEEP = 1;

/**
 * 预约课退款模式（models.BookingRefundMode*）
 * 0 取消预约·一并退款
 * 1 保留预约·仅退多余课时
 */
export const BOOKING_REFUND_MODE_CANCEL = 0;
export const BOOKING_REFUND_MODE_KEEP = 1;

/** GET /shop/:shopId/refund/booking-preview 响应（responses.BookingRefundPreviewResponse） */
export interface BookingRefundPreview {
  orderId: number;
  orderItemId: number;
  goodsName?: string;
  orderAmount?: number;
  refundedAmount?: number;
  refundableAmount: number;
  totalHours: number;
  bookedCount: number;
  attendedCount: number;
  maxRefundHours: number;
  suggestedUnitPrice?: number;
  expireUnix?: number;
  freezeStatus?: number;
  pendingAppointments?: unknown[];
}

export interface BookingRefundOptionPayload {
  /** 预约课订单项 ID（binding required） */
  orderItemId: number;
  /** 退课节数（binding required,min=1）；关闭课程时须 = maxRefundHours */
  refundHours: number;
  /** 0 取消预约一并退款 / 1 保留预约仅退多余课时 */
  mode: number;
}

/** POST /shop/:shopId/refund 完整入参（requests.RefundRequest） */
export interface MerchantRefundPayload {
  orderId: number;
  refundAmount: number;
  remark: string;
  refundChannel: number;
  repoAuth: number;
  /** 仅 goodsType=3 预约课必填 */
  bookingRefund?: BookingRefundOptionPayload;
}

export interface BuildMerchantCloseOnlineRefundInput {
  orderId: number;
  /** 从订单/预览取的可退金额；免费单应为 0 */
  refundAmount: number;
  remark?: string;
  booking?: {
    orderItemId: number;
    refundHours: number;
    mode?: number;
  };
}

/** 从订单/退款预览对象上取可退金额（免费单回落为 0）。 */
export function pickOrderRefundAmount(source: unknown): number {
  if (!source || typeof source !== 'object') return 0;
  const o = source as Record<string, unknown>;
  for (const key of [
    'refundableAmount',
    'refundAmount',
    'orderPrice',
    'orderAmount',
    'originPrice',
    'originalPrice',
    'price',
    'payAmount',
  ]) {
    const v = o[key];
    if (typeof v === 'number' && !Number.isNaN(v)) return v;
    if (typeof v === 'string' && v !== '' && !Number.isNaN(Number(v))) return Number(v);
  }
  return 0;
}

/** 解析预约课退款预览；字段不全时返回 null。 */
export function parseBookingRefundPreview(data: unknown): BookingRefundPreview | null {
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  const orderId = Number(o.orderId ?? o.order_id);
  const orderItemId = Number(o.orderItemId ?? o.order_item_id);
  const maxRefundHours = Number(o.maxRefundHours ?? o.max_refund_hours);
  const totalHours = Number(o.totalHours ?? o.total_hours ?? 0);
  const bookedCount = Number(o.bookedCount ?? o.booked_count ?? 0);
  const attendedCount = Number(o.attendedCount ?? o.attended_count ?? 0);
  if (!orderId || !orderItemId || !Number.isFinite(maxRefundHours)) return null;
  return {
    orderId,
    orderItemId,
    goodsName: typeof o.goodsName === 'string' ? o.goodsName : undefined,
    orderAmount: typeof o.orderAmount === 'number' ? o.orderAmount : undefined,
    refundedAmount: typeof o.refundedAmount === 'number' ? o.refundedAmount : undefined,
    refundableAmount: pickOrderRefundAmount(o),
    totalHours: Number.isFinite(totalHours) ? totalHours : 0,
    bookedCount: Number.isFinite(bookedCount) ? bookedCount : 0,
    attendedCount: Number.isFinite(attendedCount) ? attendedCount : 0,
    maxRefundHours,
    suggestedUnitPrice:
      typeof o.suggestedUnitPrice === 'number' ? o.suggestedUnitPrice : undefined,
    expireUnix: typeof o.expireUnix === 'number' ? o.expireUnix : undefined,
    freezeStatus: typeof o.freezeStatus === 'number' ? o.freezeStatus : undefined,
    pendingAppointments: Array.isArray(o.pendingAppointments)
      ? o.pendingAppointments
      : undefined,
  };
}

/**
 * 商家退款：课程全选关闭 + 线上退款。
 * 预约课需附带 booking（退全部可退课时 + mode=0），否则仅固定课等非预约课退款。
 */
export function buildMerchantCloseOnlineRefundPayload(
  input: BuildMerchantCloseOnlineRefundInput,
): MerchantRefundPayload {
  const payload: MerchantRefundPayload = {
    orderId: input.orderId,
    refundAmount: input.refundAmount,
    remark: input.remark ?? '自动化测试-零元订单退款（关闭课程·线上）',
    refundChannel: REFUND_CHANNEL_ONLINE,
    repoAuth: REPO_AUTH_CLOSE,
  };
  if (input.booking) {
    return {
      ...payload,
      bookingRefund: {
        orderItemId: input.booking.orderItemId,
        refundHours: input.booking.refundHours,
        mode: input.booking.mode ?? BOOKING_REFUND_MODE_CANCEL,
      },
    };
  }
  return payload;
}

/**
 * 预约课商家退款（课程关闭·线上）：字段全部从 booking-preview 取，对齐前端 BookingRefundModal。
 *
 * 后端约束（validateBookingRefundOption）：
 * - bookingRefund.orderItemId / refundHours / mode 必填
 * - 关闭课程（repoAuth=0）要求 refundHours === maxRefundHours
 * - 存在已约未开课时 mode 必须为 0（取消预约一并退款）
 */
export function buildAppointmentCloseOnlineRefundPayload(
  preview: BookingRefundPreview,
  options?: { remark?: string },
): MerchantRefundPayload {
  if (preview.maxRefundHours <= 0) {
    throw new Error('预约课无可退课时，无法关闭课程权限退款');
  }
  return buildMerchantCloseOnlineRefundPayload({
    orderId: preview.orderId,
    refundAmount: preview.refundableAmount,
    remark: options?.remark ?? '自动化测试-预约课退款（关闭课程·线上）',
    booking: {
      orderItemId: preview.orderItemId,
      refundHours: preview.maxRefundHours,
      mode: BOOKING_REFUND_MODE_CANCEL,
    },
  });
}

/**
 * 清理用：预约课商家退款（关闭课程·线上）。
 * 已退完 / 预览失败时静默跳过，供 DataRegistry 幂等回收。
 */
export async function cleanupRefundAppointmentOrder(
  api: ApiHelper,
  shopId: string | number,
  orderId: number,
): Promise<void> {
  if (!orderId) return;
  const { body: previewBody } = await api.get(Endpoints.shopAdmin.refundBookingPreview(shopId), withInfraApiOpts({
    query: { orderId },
  }));
  if (previewBody.code !== SUCCESS_CODE) return;
  const preview = parseBookingRefundPreview(previewBody.data);
  if (!preview || preview.maxRefundHours <= 0) return;
  const payload = buildAppointmentCloseOnlineRefundPayload(preview, {
    remark: '自动化测试清理-预约课退款（关闭课程·线上）',
  });
  const { body } = await api.post(Endpoints.shopAdmin.refundCreate(shopId), payload, INFRA_API_OPTS);
  if (body.code !== SUCCESS_CODE) {
    throw new Error(`预约课清理退款失败 orderId=${orderId}: ${body.msg ?? ''}`);
  }
}

/**
 * 清理用：固定课等非预约课商家退款（关闭课程·线上）。
 * 已退款时接口失败由 DataRegistry 忽略。
 */
export async function cleanupRefundMerchantOrder(
  api: ApiHelper,
  shopId: string | number,
  orderId: number,
  refundAmount = 0,
): Promise<void> {
  if (!orderId) return;
  const payload = buildMerchantCloseOnlineRefundPayload({
    orderId,
    refundAmount,
    remark: '自动化测试清理-订单退款（关闭课程·线上）',
  });
  const { body } = await api.post(Endpoints.shopAdmin.refundCreate(shopId), payload, INFRA_API_OPTS);
  if (body.code !== SUCCESS_CODE) {
    throw new Error(`订单清理退款失败 orderId=${orderId}: ${body.msg ?? ''}`);
  }
}
