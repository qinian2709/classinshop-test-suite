/**
 * 数据发现（Discovery）：依赖型接口测试的第一步。
 *
 * 很多接口需要「上游接口返回的真实 id」（goodsId/skuId/orderItemId/orderId/couponId 等）。
 * 这里统一封装「先查列表/详情拿真实数据」的逻辑，供 fixtures 与链路用例复用：
 *   - 拿不到数据时返回 null（由调用方决定 test.skip），不抛错、不判失败；
 *   - 字段名做容错（snake_case / camelCase / 不同包裹键），适配后端响应差异。
 */
import type { ApiHelper } from '../fixtures/api-helper.js';
import { Endpoints } from '../api/endpoints.js';
import { SUCCESS_CODE } from '../http/types.js';

/** 从对象的若干候选键里取第一个有效数字。 */
export function pickNumber(obj: unknown, keys: string[]): number | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const rec = obj as Record<string, unknown>;
  for (const k of keys) {
    const v = rec[k];
    const n = typeof v === 'string' ? Number(v) : v;
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

/** 把后端各种「列表响应」归一为数组（兼容直接数组或被 list/items/rows 等包裹）。 */
export function asArray(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (!data || typeof data !== 'object') return [];
  const rec = data as Record<string, unknown>;
  for (const key of ['list', 'items', 'rows', 'records', 'data', 'goods', 'orders']) {
    if (Array.isArray(rec[key])) return rec[key] as Record<string, unknown>[];
  }
  return [];
}

/** 在嵌套对象/数组里寻找第一个候选键的数字（用于从商品详情里挖 skuId）。 */
function deepFindNumber(node: unknown, keys: string[], depth = 0): number | undefined {
  if (depth > 4 || node == null) return undefined;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = deepFindNumber(item, keys, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof node !== 'object') return undefined;
  const direct = pickNumber(node, keys);
  if (direct) return direct;
  for (const v of Object.values(node as Record<string, unknown>)) {
    if (v && typeof v === 'object') {
      const found = deepFindNumber(v, keys, depth + 1);
      if (found) return found;
    }
  }
  return undefined;
}

export interface SampleGoods {
  goodsId: number;
  skuId: number;
  title?: string;
  goodsType?: number;
  hasPhysicalGoods?: number;
}

/**
 * 找一个可用于算价/下单的真实商品：商品列表取候选 → 商品详情挖 skuId（ShopGoodsProduct.id）。
 * 支持 TEST_GOODS_ID / TEST_SKU_ID 直接指定，跳过列表查询。
 */
export async function pickGoods(api: ApiHelper): Promise<SampleGoods | null> {
  const envGoodsId = process.env.TEST_GOODS_ID ? Number(process.env.TEST_GOODS_ID) : 0;
  const envSkuId = process.env.TEST_SKU_ID ? Number(process.env.TEST_SKU_ID) : 0;
  if (envGoodsId && envSkuId) {
    return { goodsId: envGoodsId, skuId: envSkuId };
  }

  const candidates: number[] = [];
  if (envGoodsId) {
    candidates.push(envGoodsId);
  } else {
    const { body } = await api.get(Endpoints.shop.goodsList, { query: { page: 1, limit: 20 } });
    if (body.code !== SUCCESS_CODE) return null;
    for (const it of asArray(body.data)) {
      const id = pickNumber(it, ['id', 'goodsId', 'goods_id']);
      if (id) candidates.push(id);
    }
  }

  for (const goodsId of candidates) {
    const detail = await api.get(Endpoints.shop.goodsDetail(goodsId));
    if (detail.body.code !== SUCCESS_CODE) continue;
    const d = detail.body.data as Record<string, unknown> | undefined;
    if (!d) continue;
    const skuId =
      envSkuId ||
      deepFindNumber(d['products'] ?? d['skus'] ?? d['productList'] ?? d['skuList'], [
        'id',
        'skuId',
        'sku_id',
        'productId',
        'product_id',
      ]) ||
      deepFindNumber(d, ['skuId', 'sku_id', 'productId', 'product_id']);
    if (!skuId) continue;
    return {
      goodsId,
      skuId,
      title: typeof d['title'] === 'string' ? (d['title'] as string) : undefined,
      goodsType: pickNumber(d, ['goodsType', 'goods_type', 'repoType', 'repo_type']),
      hasPhysicalGoods: pickNumber(d, ['hasPhysicalGoods', 'has_physical_goods']),
    };
  }
  return null;
}

export interface RefundableOrder {
  orderId: number;
  orderItemId?: number;
  status?: number;
}

/**
 * 找一个可退款订单：优先 TEST_REFUND_ORDER_ID，否则取「我的订单」第一条。
 * 同时尽量挖出 orderItemId（预约课按订单项退款需要）。
 */
export async function pickRefundableOrder(api: ApiHelper): Promise<RefundableOrder | null> {
  const envId = process.env.TEST_REFUND_ORDER_ID ? Number(process.env.TEST_REFUND_ORDER_ID) : 0;
  const { body } = await api.get(Endpoints.user.orders, { query: { page: 1, limit: 20 } });
  if (body.code !== SUCCESS_CODE) return envId ? { orderId: envId } : null;
  for (const o of asArray(body.data)) {
    const orderId = pickNumber(o, ['id', 'orderId', 'order_id']);
    if (!orderId) continue;
    if (envId && orderId !== envId) continue;
    const orderItemId =
      pickNumber(o, ['orderItemId', 'order_item_id']) ??
      deepFindNumber(o['items'] ?? o['orderItems'] ?? o['list'], [
        'orderItemId',
        'order_item_id',
        'id',
      ]);
    return { orderId, orderItemId, status: pickNumber(o, ['status']) };
  }
  return envId ? { orderId: envId } : null;
}

export interface AvailableCoupon {
  couponId: number;
  name?: string;
}

/** 找一张可领取的优惠券（依赖店铺维度，需 X-Shop-Domain）。 */
export async function pickAvailableCoupon(api: ApiHelper): Promise<AvailableCoupon | null> {
  const { body } = await api.get(Endpoints.shop.availableCoupons);
  if (body.code !== SUCCESS_CODE) return null;
  for (const c of asArray(body.data)) {
    const couponId = pickNumber(c, ['id', 'couponId', 'coupon_id']);
    if (couponId) {
      const name = c['name'];
      return { couponId, name: typeof name === 'string' ? name : undefined };
    }
  }
  return null;
}

export interface AppointmentOrderItem {
  orderItemId: number;
  teacherId?: number;
}

/**
 * 找一个可发起约课的订单项：优先 TEST_APPT_ORDER_ITEM_ID，
 * 否则从「我的预约」列表里复用已有预约的 orderItemId（说明该订单项确有约课资格）。
 */
export async function pickAppointmentOrderItem(
  api: ApiHelper,
): Promise<AppointmentOrderItem | null> {
  const envId = process.env.TEST_APPT_ORDER_ITEM_ID
    ? Number(process.env.TEST_APPT_ORDER_ITEM_ID)
    : 0;
  if (envId) {
    const envTeacher = process.env.TEST_APPT_TEACHER_ID
      ? Number(process.env.TEST_APPT_TEACHER_ID)
      : undefined;
    return { orderItemId: envId, teacherId: envTeacher };
  }
  const { body } = await api.get(Endpoints.appointment.my, { query: { page: 1, pageSize: 20 } });
  if (body.code !== SUCCESS_CODE) return null;
  for (const a of asArray(body.data)) {
    const orderItemId = pickNumber(a, ['orderItemId', 'order_item_id']);
    if (orderItemId) {
      return { orderItemId, teacherId: pickNumber(a, ['teacherId', 'teacher_id']) };
    }
  }
  return null;
}
