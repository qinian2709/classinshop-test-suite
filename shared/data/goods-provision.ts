/**
 * 测试商品上架（与 goods-management.spec.ts 同口径）：
 *   - 固定课 goodsType=1：basePayload → 编辑绑定 ClassIn 班级 → 上架
 *   - 预约课 goodsType=3：basePayload + appointment + teacherIds/hoursCount → 编辑 → 上架
 */
import fs from 'node:fs/promises';
import type { ApiHelper } from '../fixtures/api-helper.js';
import { Endpoints } from '../api/endpoints.js';
import { SUCCESS_CODE } from '../http/types.js';
import type { DataRegistry } from './cleanup.js';
import type { SampleGoods } from './discovery.js';

const goodsCoverFile = new URL('../../tests/api/fixtures/goods-cover.png.base64', import.meta.url);

/** 普通固定课（含 ClassIn 班级绑定形态） */
export const GOODS_TYPE_FIXED = 1;
/** 预约课 */
export const GOODS_TYPE_APPOINTMENT = 3;

interface IdResult {
  id: number;
}

interface GoodsProduct {
  id: number;
  originalPrice: number;
  price: number;
  status: number;
  stock: number;
  classType: number;
  hoursCount?: number;
  classes?: unknown[];
  teachers?: unknown[];
}

interface GoodsDetail {
  id: number;
  name: string;
  summary: string;
  description: string;
  status: number;
  pic: string;
  contactQrCode?: string;
  attrsSelectType: number;
  hasPhysicalGoods: number;
  goodsType: number;
  appointment?: unknown;
  products: GoodsProduct[];
}

interface ClassInClass {
  courseId: number;
  courseName: string;
  coverImg?: string;
}

interface AppointmentTeacherList {
  list: Array<{ id: number; name?: string }>;
}

interface SaveGoodsProduct {
  id: number;
  originalPrice: number;
  price: number;
  status: number;
  stock: number;
  stockChangeType: string;
  classType: number;
  classes: Array<{
    classId: number;
    className: string;
    classCoverImg: string;
    stuLimit: number;
    sort: number;
  }>;
  attrs: unknown[];
  hoursCount?: number;
  teacherIds?: number[];
}

interface GoodsPayload {
  id?: number;
  name: string;
  summary: string;
  description: string;
  status: number;
  pic: string;
  contactQrCode: string;
  attrsSelectType: number;
  hasPhysicalGoods: number;
  goodsType: number;
  appointment?: Record<string, number>;
  products: SaveGoodsProduct[];
}

function baseProduct(overrides: Partial<SaveGoodsProduct> = {}): SaveGoodsProduct {
  return {
    id: 0,
    originalPrice: 199,
    price: 99,
    status: 1,
    stock: -1,
    stockChangeType: 'increase',
    classType: 0,
    classes: [],
    attrs: [],
    ...overrides,
  };
}

function basePayload(kind: 'fixed' | 'appointment', name: string, pic: string): GoodsPayload {
  return {
    name,
    summary: `${name} 简介`,
    description: `${name} 详情描述`,
    status: 0,
    pic,
    contactQrCode: '',
    attrsSelectType: 0,
    hasPhysicalGoods: 0,
    goodsType: kind === 'appointment' ? GOODS_TYPE_APPOINTMENT : GOODS_TYPE_FIXED,
    products: [baseProduct()],
  };
}

function appointmentConfig(): GoodsPayload['appointment'] {
  return {
    attendeesPerClass: 1,
    perUserMaxPurchase: -1,
    defaultValidityValue: 12,
    defaultValidityUnit: 1,
    advanceAppointmentMode: 1,
    advanceAppointmentValue: 0,
    appointmentDeadlineMode: 1,
    appointmentDeadlineValue: 0,
    cancelDeadlineMode: 2,
    cancelDeadlineValue: 24,
    appointmentCountLimitDays: 0,
    appointmentCountLimitMax: 0,
    enableClassinRoom: 1,
  };
}

function payloadFromDetail(detail: GoodsDetail, overrides: Partial<GoodsPayload> = {}): GoodsPayload {
  return {
    id: detail.id,
    name: detail.name,
    summary: detail.summary,
    description: detail.description,
    status: detail.status,
    pic: detail.pic,
    contactQrCode: detail.contactQrCode ?? '',
    attrsSelectType: detail.attrsSelectType,
    hasPhysicalGoods: detail.hasPhysicalGoods,
    goodsType: detail.goodsType,
    products: detail.products.map((product) =>
      baseProduct({
        id: product.id,
        originalPrice: product.originalPrice,
        price: product.price,
        status: product.status,
        stock: 0,
        classType: product.classType,
        hoursCount: product.hoursCount,
      }),
    ),
    ...overrides,
  };
}

function timeLabel(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

async function uploadGoodsCover(api: ApiHelper): Promise<string> {
  const { body: sign } = await api.get<{ uploadUrl: string; objectKey: string; accessUrl: string }>(
    Endpoints.system.cosSign,
    { query: { fileName: 'goods-cover.png', dir: 'thumbnails' } },
  );
  if (sign.code !== SUCCESS_CODE || !sign.data?.uploadUrl || !sign.data.objectKey) {
    throw new Error(`COS 上传签名失败：code=${sign.code} msg=${sign.msg}`);
  }

  const file = Buffer.from((await fs.readFile(goodsCoverFile, 'utf8')).trim(), 'base64');
  const uploadResponse = await fetch(sign.data.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': 'image/png' },
    body: new Blob([file], { type: 'image/png' }),
  });
  if (!uploadResponse.ok) {
    throw new Error(`COS PUT 上传失败：HTTP ${uploadResponse.status}`);
  }
  return sign.data.objectKey;
}

async function resolveClassInClass(
  api: ApiHelper,
  shopId: string | number,
): Promise<ClassInClass | null> {
  const { body } = await api.get<ClassInClass[]>(Endpoints.classin.classList(0), {
    query: { orgid: shopId },
  });
  if (body.code !== SUCCESS_CODE || !Array.isArray(body.data) || body.data.length === 0) {
    return null;
  }
  return body.data[0] ?? null;
}

async function resolveAppointmentTeacher(
  api: ApiHelper,
  shopId: string | number,
): Promise<{ id: number } | null> {
  const { body } = await api.get<AppointmentTeacherList>(
    Endpoints.shopAdmin.appointmentTeachers(shopId),
  );
  if (body.code !== SUCCESS_CODE || !Array.isArray(body.data?.list) || body.data.list.length === 0) {
    return null;
  }
  return body.data.list[0] ?? null;
}

export interface ProvisionPublishedGoodsOptions {
  shopId: string | number;
  data?: DataRegistry;
  /** 默认 true：保留测试商品便于排查；传 false 或 KEEP_TEST_GOODS=0 时注册删除 */
  keep?: boolean;
  price?: number;
  namePrefix?: string;
}

interface PublishedGoodsResult extends SampleGoods {
  teacherId?: number;
  classId?: number;
}

function shouldKeepGoods(options: ProvisionPublishedGoodsOptions): boolean {
  if (options.keep !== undefined) return options.keep;
  if (process.env.KEEP_TEST_GOODS === '0') return false;
  return process.env.KEEP_TEST_GOODS === '1' || options.price === 0;
}

async function publishAndValidate(
  api: ApiHelper,
  shopId: string | number,
  goodsId: number,
  expectedGoodsType: number,
): Promise<GoodsDetail | null> {
  const { body: published } = await api.post(Endpoints.shopAdmin.goodsStatus(shopId), {
    goodsId,
    status: 1,
  });
  if (published.code !== SUCCESS_CODE) return null;

  const { body: finalDetail } = await api.get<GoodsDetail>(
    Endpoints.shopAdmin.goodsDetail(shopId, goodsId),
  );
  if (finalDetail.code !== SUCCESS_CODE || finalDetail.data?.status !== 1) return null;
  if (finalDetail.data.goodsType !== expectedGoodsType) return null;

  const product = finalDetail.data.products[0];
  if (!product) return null;

  if (expectedGoodsType === GOODS_TYPE_FIXED) {
    if (finalDetail.data.appointment) return null;
    if (!product.classes?.length) return null;
  } else {
    if (!finalDetail.data.appointment) return null;
    if (product.classes?.length) return null;
    if (!product.hoursCount || product.hoursCount <= 0) return null;
  }

  return finalDetail.data;
}

/**
 * 固定课：创建草稿（无班级）→ 编辑绑定班级 → 上架。
 */
export async function provisionPublishedFixedGoods(
  api: ApiHelper,
  options: ProvisionPublishedGoodsOptions,
): Promise<PublishedGoodsResult | null> {
  const {
    shopId,
    data,
    price = 99,
    namePrefix = 'flow固定课',
  } = options;
  const keep = shouldKeepGoods(options);

  const classInfo = await resolveClassInClass(api, shopId);
  if (!classInfo) return null;

  const stamp = timeLabel();
  const coverUrl = await uploadGoodsCover(api);
  const priceFields = { price, originalPrice: price > 0 ? 199 : 0 };
  const createPayload = {
    ...basePayload('fixed', `${namePrefix}-${stamp}`, coverUrl),
    products: [baseProduct(priceFields)],
  };

  const { body: created } = await api.post<IdResult>(Endpoints.shopAdmin.goodsCreate(shopId), createPayload);
  if (created.code !== SUCCESS_CODE || !created.data?.id) return null;
  const goodsId = created.data.id;

  if (!keep && data) {
    data.register(`删除 flow 固定课 ${goodsId}`, async () => {
      await api.post(Endpoints.shopAdmin.goodsDelete(shopId), { goodsId });
    });
  }

  const { body: draftDetail } = await api.get<GoodsDetail>(Endpoints.shopAdmin.goodsDetail(shopId, goodsId));
  if (draftDetail.code !== SUCCESS_CODE || !draftDetail.data?.products?.[0]?.id) return null;
  const draftProduct = draftDetail.data.products[0]!;

  const updatePayload = payloadFromDetail(draftDetail.data, {
    name: `${namePrefix}已编辑-${stamp}`,
    summary: `${namePrefix}已编辑简介-${stamp}`,
    description: `${namePrefix}已编辑详情-${stamp}`,
    status: 0,
    products: [
      baseProduct({
        id: draftProduct.id,
        stock: 0,
        ...priceFields,
        classes: [
          {
            classId: classInfo.courseId,
            className: classInfo.courseName,
            classCoverImg: classInfo.coverImg ?? '',
            stuLimit: 0,
            sort: 1,
          },
        ],
      }),
    ],
  });

  const { body: updated } = await api.post(Endpoints.shopAdmin.goodsUpdate(shopId), updatePayload);
  if (updated.code !== SUCCESS_CODE) return null;

  const finalDetail = await publishAndValidate(api, shopId, goodsId, GOODS_TYPE_FIXED);
  if (!finalDetail?.products[0]?.id) return null;

  return {
    goodsId,
    skuId: finalDetail.products[0].id,
    title: finalDetail.name,
    goodsType: finalDetail.goodsType,
    classId: classInfo.courseId,
  };
}

/**
 * 预约课：创建草稿（appointment + teacherIds + hoursCount）→ 编辑 → 上架。
 */
export async function provisionPublishedAppointmentGoods(
  api: ApiHelper,
  options: ProvisionPublishedGoodsOptions,
): Promise<PublishedGoodsResult | null> {
  const {
    shopId,
    data,
    price = 99,
    namePrefix = 'flow预约课',
  } = options;
  const keep = shouldKeepGoods(options);

  const teacher = await resolveAppointmentTeacher(api, shopId);
  if (!teacher) return null;

  const stamp = timeLabel();
  const coverUrl = await uploadGoodsCover(api);
  const priceFields = { price, originalPrice: price > 0 ? 199 : 0 };
  const createPayload = {
    ...basePayload('appointment', `${namePrefix}-${stamp}`, coverUrl),
    appointment: appointmentConfig(),
    products: [baseProduct({ hoursCount: 10, teacherIds: [teacher.id], ...priceFields })],
  };

  const { body: created } = await api.post<IdResult>(Endpoints.shopAdmin.goodsCreate(shopId), createPayload);
  if (created.code !== SUCCESS_CODE || !created.data?.id) return null;
  const goodsId = created.data.id;

  if (!keep && data) {
    data.register(`删除 flow 预约课 ${goodsId}`, async () => {
      await api.post(Endpoints.shopAdmin.goodsDelete(shopId), { goodsId });
    });
  }

  const { body: draftDetail } = await api.get<GoodsDetail>(Endpoints.shopAdmin.goodsDetail(shopId, goodsId));
  if (draftDetail.code !== SUCCESS_CODE || !draftDetail.data?.products?.[0]?.id) return null;
  const draftProduct = draftDetail.data.products[0]!;

  const updatePayload = payloadFromDetail(draftDetail.data, {
    name: `${namePrefix}已编辑-${stamp}`,
    summary: `${namePrefix}已编辑简介-${stamp}`,
    description: `${namePrefix}已编辑详情-${stamp}`,
    status: 0,
    appointment: appointmentConfig(),
    products: [
      baseProduct({
        id: draftProduct.id,
        stock: 0,
        hoursCount: 12,
        teacherIds: [teacher.id],
        ...priceFields,
      }),
    ],
  });

  const { body: updated } = await api.post(Endpoints.shopAdmin.goodsUpdate(shopId), updatePayload);
  if (updated.code !== SUCCESS_CODE) return null;

  const finalDetail = await publishAndValidate(api, shopId, goodsId, GOODS_TYPE_APPOINTMENT);
  if (!finalDetail?.products[0]?.id) return null;

  return {
    goodsId,
    skuId: finalDetail.products[0].id,
    title: finalDetail.name,
    goodsType: finalDetail.goodsType,
    teacherId: teacher.id,
  };
}
