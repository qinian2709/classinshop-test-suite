/**
 * 测试商品上架（与 goods-management.spec.ts 同口径）：
 *   - 固定课 goodsType=1：basePayload → 编辑绑定 ClassIn 班级 → 上架
 *   - 预约课 goodsType=3：basePayload + appointment + teacherIds/hoursCount → 编辑 → 上架
 *   - 录播课 goodsType=4：COS 上传视频/资料 → 转码成功 → catalog + recorded 上架
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ApiHelper } from '../fixtures/api-helper.js';
import { Endpoints } from '../api/endpoints.js';
import { INFRA_API_OPTS, withInfraApiOpts } from './infra.js';
import { SUCCESS_CODE } from '../http/types.js';
import type { DataRegistry } from './cleanup.js';
import type { SampleGoods } from './discovery.js';

const goodsCoverFile = new URL('../../tests/api/fixtures/goods-cover.png.base64', import.meta.url);

/** 普通固定课（含 ClassIn 班级绑定形态） */
export const GOODS_TYPE_FIXED = 1;
/** 预约课 */
export const GOODS_TYPE_APPOINTMENT = 3;
/** 录播课 */
export const GOODS_TYPE_RECORDED = 4;

const TRANSCODE_SUCCESS = 3;
const TRANSCODE_FAILED = 4;
const TRANSCODE_POLL_MS = 3_000;
const TRANSCODE_TIMEOUT_MS = 5 * 60_000;

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
  catalog?: Array<{
    activities?: Array<{
      files?: Array<{ id?: number; fileType?: string; transcodeJobId?: string }>;
    }>;
  }>;
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
  catalog?: CourseCatalogUnit[];
}

interface CourseCatalogFile {
  name: string;
  fileType: string;
  objectKey: string;
  playObjectKey?: string;
  transcodeJobId?: string;
  transcodeStatus?: number;
  videoSource?: number;
  duration?: number;
  fileSize?: number;
  allowDownload?: number;
}

interface CourseCatalogActivity {
  title: string;
  description?: string;
  allowPreview: number;
  files: CourseCatalogFile[];
}

interface CourseCatalogUnit {
  title: string;
  activities: CourseCatalogActivity[];
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
  recorded?: {
    validityValue: number;
    validityUnit: number;
    enableMobileWeb?: boolean;
    enableMarquee?: boolean;
  };
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

function basePayload(kind: 'fixed' | 'appointment' | 'recorded', name: string, pic: string): GoodsPayload {
  const goodsType =
    kind === 'appointment'
      ? GOODS_TYPE_APPOINTMENT
      : kind === 'recorded'
        ? GOODS_TYPE_RECORDED
        : GOODS_TYPE_FIXED;
  return {
    name,
    summary: `${name} 简介`,
    description: `${name} 详情描述`,
    status: 0,
    pic,
    contactQrCode: '',
    attrsSelectType: 0,
    hasPhysicalGoods: 0,
    goodsType,
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
    withInfraApiOpts({ query: { fileName: 'goods-cover.png', dir: 'thumbnails' } }),
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
  const { body } = await api.get<ClassInClass[]>(Endpoints.classin.classList(0), withInfraApiOpts({
    query: { orgid: shopId },
  }));
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
    INFRA_API_OPTS,
  );
  if (body.code !== SUCCESS_CODE || !Array.isArray(body.data?.list) || body.data.list.length === 0) {
    return null;
  }
  return body.data.list[0] ?? null;
}

export interface ProvisionPublishedGoodsOptions {
  shopId: string | number;
  data?: DataRegistry;
  /** 默认 false：用例结束后经 data 登记删除；仅 KEEP_TEST_GOODS=1 或 keep:true 时保留 */
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
  return process.env.KEEP_TEST_GOODS === '1';
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
  }, INFRA_API_OPTS);
  if (published.code !== SUCCESS_CODE) return null;

  const { body: finalDetail } = await api.get<GoodsDetail>(
    Endpoints.shopAdmin.goodsDetail(shopId, goodsId),
    INFRA_API_OPTS,
  );
  if (finalDetail.code !== SUCCESS_CODE || finalDetail.data?.status !== 1) return null;
  if (finalDetail.data.goodsType !== expectedGoodsType) return null;

  const product = finalDetail.data.products[0];
  if (!product) return null;

  if (expectedGoodsType === GOODS_TYPE_FIXED) {
    if (finalDetail.data.appointment) return null;
    if (!product.classes?.length) return null;
  } else if (expectedGoodsType === GOODS_TYPE_APPOINTMENT) {
    if (!finalDetail.data.appointment) return null;
    if (product.classes?.length) return null;
    if (!product.hoursCount || product.hoursCount <= 0) return null;
  } else if (expectedGoodsType === GOODS_TYPE_RECORDED) {
    if (finalDetail.data.appointment) return null;
    if (product.classes?.length) return null;
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

  const { body: created } = await api.post<IdResult>(Endpoints.shopAdmin.goodsCreate(shopId), createPayload, INFRA_API_OPTS);
  if (created.code !== SUCCESS_CODE || !created.data?.id) return null;
  const goodsId = created.data.id;

  if (!keep && data) {
    data.register(`删除 flow 固定课 ${goodsId}`, async () => {
      await api.post(Endpoints.shopAdmin.goodsDelete(shopId), { goodsId }, INFRA_API_OPTS);
    });
  }

  const { body: draftDetail } = await api.get<GoodsDetail>(Endpoints.shopAdmin.goodsDetail(shopId, goodsId), INFRA_API_OPTS);
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

  const { body: updated } = await api.post(Endpoints.shopAdmin.goodsUpdate(shopId), updatePayload, INFRA_API_OPTS);
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

  const { body: created } = await api.post<IdResult>(Endpoints.shopAdmin.goodsCreate(shopId), createPayload, INFRA_API_OPTS);
  if (created.code !== SUCCESS_CODE || !created.data?.id) return null;
  const goodsId = created.data.id;

  if (!keep && data) {
    data.register(`删除 flow 预约课 ${goodsId}`, async () => {
      await api.post(Endpoints.shopAdmin.goodsDelete(shopId), { goodsId }, INFRA_API_OPTS);
    });
  }

  const { body: draftDetail } = await api.get<GoodsDetail>(Endpoints.shopAdmin.goodsDetail(shopId, goodsId), INFRA_API_OPTS);
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

  const { body: updated } = await api.post(Endpoints.shopAdmin.goodsUpdate(shopId), updatePayload, INFRA_API_OPTS);
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

export const RECORDED_UNIT_TITLE = '自动化单元';
export const RECORDED_VIDEO_ACTIVITY_TITLE = '导学视频';
export const RECORDED_DOC_ACTIVITY_TITLE = '配套资料';

const recordedDataDir = fileURLToPath(new URL('../../tests/e2e-mobile/data/', import.meta.url));

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function findRecordedFixture(exts: string[]): Promise<{ absPath: string; fileName: string } | null> {
  const names = await fs.readdir(recordedDataDir).catch(() => [] as string[]);
  const fileName = names.find((name) => exts.some((ext) => name.toLowerCase().endsWith(ext)));
  if (!fileName) return null;
  return { absPath: path.join(recordedDataDir, fileName), fileName };
}

async function uploadCourseObject(
  api: ApiHelper,
  shopId: string | number,
  absPath: string,
  uploadName: string,
  subdir: 'video' | 'doc',
  contentType: string,
): Promise<{ objectKey: string; fileSize: number } | null> {
  const { body: sign } = await api.get<{ uploadUrl: string; objectKey: string }>(
    Endpoints.system.cosSign,
    withInfraApiOpts({
      query: {
        fileName: uploadName,
        dir: `files/origin/${shopId}/${subdir}`,
        noBaseDir: true,
      },
    }),
  );
  if (sign.code !== SUCCESS_CODE || !sign.data?.uploadUrl || !sign.data.objectKey) return null;

  const file = await fs.readFile(absPath);
  const uploadResponse = await fetch(sign.data.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': contentType },
    body: new Blob([file], { type: contentType }),
  });
  if (!uploadResponse.ok) return null;
  return { objectKey: sign.data.objectKey, fileSize: file.byteLength };
}

async function transcodeCourseVideo(
  api: ApiHelper,
  shopId: string | number,
  objectKey: string,
): Promise<{ playObjectKey: string; transcodeJobId: string; duration: number } | null> {
  const { body: submitted } = await api.post<{
    jobId?: string;
    playObjectKey?: string;
    transcodeStatus?: number;
    duration?: number;
  }>(Endpoints.shopAdmin.courseVideoTranscode(shopId), { objectKey }, INFRA_API_OPTS);
  const jobId = submitted.data?.jobId;
  if (submitted.code !== SUCCESS_CODE || !jobId) return null;

  const polled = await pollCourseVideoTranscode(api, shopId, jobId);
  if (!polled) return null;
  return { ...polled, duration: polled.duration || Number(submitted.data?.duration ?? 0) };
}

async function pollCourseVideoTranscode(
  api: ApiHelper,
  shopId: string | number,
  jobId: string,
  fileId?: number,
): Promise<{ playObjectKey: string; transcodeJobId: string; duration: number } | null> {
  const started = Date.now();
  while (Date.now() - started < TRANSCODE_TIMEOUT_MS) {
    const { body: statusBody } = await api.get<{
      playObjectKey?: string;
      transcodeStatus?: number;
      duration?: number;
      message?: string;
    }>(
      Endpoints.shopAdmin.courseVideoTranscodeStatus(shopId),
      withInfraApiOpts({ query: { jobId, fileId } }),
    );
    const status = Number(statusBody.data?.transcodeStatus);
    if (status === TRANSCODE_SUCCESS && statusBody.data?.playObjectKey) {
      return {
        playObjectKey: statusBody.data.playObjectKey,
        transcodeJobId: jobId,
        duration: Number(statusBody.data.duration ?? 0),
      };
    }
    if (status === TRANSCODE_FAILED) return null;
    await sleep(TRANSCODE_POLL_MS);
  }
  return null;
}

/**
 * 录播课：上传 data 目录视频+资料 → 转码成功 → 创建零元商品（可试看）→ 上架。
 */
export async function provisionPublishedRecordedGoods(
  api: ApiHelper,
  options: ProvisionPublishedGoodsOptions,
): Promise<PublishedGoodsResult | null> {
  const {
    shopId,
    data,
    price = 0,
    namePrefix = 'flow录播课',
  } = options;
  const keep = shouldKeepGoods(options);

  const videoFixture = await findRecordedFixture(['.mov', '.mp4', '.m4v']);
  const docFixture = await findRecordedFixture(['.docx', '.pdf']);
  if (!videoFixture || !docFixture) return null;

  const stamp = timeLabel();
  const coverUrl = await uploadGoodsCover(api);
  const videoUpload = await uploadCourseObject(
    api,
    shopId,
    videoFixture.absPath,
    'recorded-e2e.mp4',
    'video',
    'video/mp4',
  );
  if (!videoUpload) return null;

  const transcoded = await transcodeCourseVideo(api, shopId, videoUpload.objectKey);
  if (!transcoded) return null;

  const docUpload = await uploadCourseObject(
    api,
    shopId,
    docFixture.absPath,
    docFixture.fileName.replace(/[^\w.\u4e00-\u9fa5-]+/g, '_') || 'recorded-e2e.docx',
    'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );
  if (!docUpload) return null;

  const catalog: CourseCatalogUnit[] = [
    {
      title: RECORDED_UNIT_TITLE,
      activities: [
        {
          title: RECORDED_VIDEO_ACTIVITY_TITLE,
          description: 'E2E 可试看视频',
          allowPreview: 1,
          files: [
            {
              name: videoFixture.fileName,
              fileType: 'video',
              objectKey: videoUpload.objectKey,
              playObjectKey: transcoded.playObjectKey,
              transcodeJobId: transcoded.transcodeJobId,
              transcodeStatus: TRANSCODE_SUCCESS,
              videoSource: 1,
              duration: transcoded.duration,
              fileSize: videoUpload.fileSize,
              allowDownload: 0,
            },
          ],
        },
        {
          title: RECORDED_DOC_ACTIVITY_TITLE,
          description: 'E2E 可试看资料',
          allowPreview: 1,
          files: [
            {
              name: docFixture.fileName,
              fileType: 'docx',
              objectKey: docUpload.objectKey,
              fileSize: docUpload.fileSize,
              allowDownload: 1,
            },
          ],
        },
      ],
    },
  ];

  const priceFields = { price, originalPrice: price > 0 ? 199 : 0 };
  const createPayload: GoodsPayload = {
    ...basePayload('recorded', `${namePrefix}-${stamp}`, coverUrl),
    recorded: {
      validityValue: 0,
      validityUnit: 1,
      enableMobileWeb: true,
      enableMarquee: false,
    },
    products: [baseProduct({ ...priceFields, catalog })],
  };

  const { body: created } = await api.post<IdResult>(
    Endpoints.shopAdmin.goodsCreate(shopId),
    createPayload,
    INFRA_API_OPTS,
  );
  if (created.code !== SUCCESS_CODE || !created.data?.id) return null;
  const goodsId = created.data.id;

  if (!keep && data) {
    data.register(`删除 flow 录播课 ${goodsId}`, async () => {
      await api.post(Endpoints.shopAdmin.goodsDelete(shopId), { goodsId }, INFRA_API_OPTS);
    });
  }

  const finalDetail = await publishAndValidate(api, shopId, goodsId, GOODS_TYPE_RECORDED);
  if (!finalDetail?.products[0]?.id) return null;

  // 保存目录时后端会把新建视频写成 transcode_status=已提交，需带 fileId 再同步一次才能播。
  const videoFileId = findRecordedVideoFileId(finalDetail);
  if (videoFileId) {
    const synced = await pollCourseVideoTranscode(api, shopId, transcoded.transcodeJobId, videoFileId);
    if (!synced) return null;
  }

  return {
    goodsId,
    skuId: finalDetail.products[0].id,
    title: finalDetail.name,
    goodsType: finalDetail.goodsType,
  };
}

function findRecordedVideoFileId(detail: GoodsDetail): number | null {
  for (const unit of detail.products[0]?.catalog ?? []) {
    for (const activity of unit.activities ?? []) {
      for (const file of activity.files ?? []) {
        if (file.fileType === 'video' && Number(file.id) > 0) return Number(file.id);
      }
    }
  }
  return null;
}
