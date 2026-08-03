import fs from 'node:fs/promises';
import { test, expect } from '@shared';
import { attachApiCallLog, Endpoints, SUCCESS_CODE } from '@shared';
import { accounts, env as configEnv, formatAuthorizationHeader, hasApiCredential } from '@config';
import type { ApiResponse } from '@shared';
import type { TestInfo } from '@playwright/test';

type Query = Record<string, string | number | boolean | undefined>;
const keepTestGoods = process.env.KEEP_TEST_GOODS === '1';
const goodsCoverFile = new URL('./fixtures/goods-cover.png.base64', import.meta.url);

interface MerchantShop {
  orgId: number;
  orgName: string;
}

interface ClassInClass {
  courseId: number;
  courseName: string;
  coverImg?: string;
}

interface AppointmentTeacher {
  id: number;
  name: string;
}

interface AppointmentTeacherList {
  list: AppointmentTeacher[];
}

interface IdResult {
  id: number;
}

interface CosUploadSign {
  method: string;
  uploadUrl: string;
  objectKey: string;
  accessUrl: string;
  originUrl: string;
}

interface CosDownloadSign {
  downloadUrl: string;
  objectKey: string;
}

interface GoodsProduct {
  id: number;
  originalPrice: number;
  price: number;
  status: number;
  stock: number;
  classType: number;
  hoursCount?: number;
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
  products: GoodsProduct[];
}

interface GoodsListItem {
  id: number;
  name: string;
  pic: string;
  status: number;
  goodsType: number;
}

interface GoodsListData {
  total: number;
  list: GoodsListItem[];
  page: number;
  limit: number;
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
  attrs: Array<{ name: string; value: string }>;
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
  appointment?: {
    attendeesPerClass: number;
    perUserMaxPurchase: number;
    defaultValidityValue: number;
    defaultValidityUnit: number;
    advanceAppointmentMode: number;
    advanceAppointmentValue: number;
    appointmentDeadlineMode: number;
    appointmentDeadlineValue: number;
    cancelDeadlineMode: number;
    cancelDeadlineValue: number;
    appointmentCountLimitDays: number;
    appointmentCountLimitMax: number;
    enableClassinRoom: number;
  };
  products: SaveGoodsProduct[];
}

function buildUrl(path: string, query?: Query): string {
  const url = new URL(`${configEnv.apiBaseURL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function browserLikeHeaders(headers: Record<string, string> = {}): Record<string, string> {
  return {
    accept: 'application/json, text/plain, */*',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    authorization: formatAuthorizationHeader(accounts.token),
    'cache-control': 'no-cache',
    origin: configEnv.shopHost,
    pragma: 'no-cache',
    referer: `${configEnv.shopHost}/`,
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    'user-agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    ...headers,
  };
}

async function requestJson<T>(
  testInfo: TestInfo,
  method: 'GET' | 'POST',
  path: string,
  options: {
    query?: Query;
    data?: unknown;
    assertions?: string[];
    logName?: string;
  } = {},
): Promise<{ status: number; body: ApiResponse<T> }> {
  const url = buildUrl(path, options.query);
  const headers = browserLikeHeaders(
    method === 'POST' ? { 'content-type': 'application/json' } : undefined,
  );
  const response = await fetch(url, {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(options.data ?? {}) : undefined,
  });
  const status = response.status;
  const text = await response.text();
  let body: ApiResponse<T>;

  try {
    body = JSON.parse(text) as ApiResponse<T>;
  } catch {
    await attachApiCallLog({
      testInfo,
      name: options.logName ?? `请求日志-${path.replaceAll('/', '_')}.json`,
      request: { method, url, headers, body: options.data ?? null },
      response: { status, headers: response.headers, body: text },
      assertions: options.assertions ?? ['响应应为后端统一 JSON 信封'],
    });
    throw new Error(`非 JSON 响应（${method} ${path} -> HTTP ${status}）：${text.slice(0, 200)}`);
  }

  await attachApiCallLog({
    testInfo,
    name: options.logName ?? `请求日志-${path.replaceAll('/', '_')}.json`,
    request: { method, url, headers, body: options.data ?? null },
    response: { status, headers: response.headers, body },
    assertions: options.assertions ?? ['响应应为后端统一 JSON 信封'],
  });

  return { status, body };
}

function timeLabel(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

async function uploadGoodsCover(testInfo: TestInfo): Promise<string> {
  const { body: sign } = await requestJson<CosUploadSign>(
    testInfo,
    'GET',
    Endpoints.system.cosSign,
    {
      query: {
        fileName: 'goods-cover.png',
        dir: 'thumbnails',
      },
      logName: '请求日志-课程封面-COS签名.json',
      assertions: ['COS 上传签名业务 code 应为成功码', 'COS 上传签名应返回 accessUrl'],
    },
  );
  expect(sign.code, `COS 上传签名失败：${sign.msg}`).toBe(SUCCESS_CODE);
  expect(sign.data?.uploadUrl, 'COS 上传签名应返回 uploadUrl').toBeTruthy();
  expect(sign.data?.accessUrl, 'COS 上传签名应返回 accessUrl').toBeTruthy();

  const file = Buffer.from((await fs.readFile(goodsCoverFile, 'utf8')).trim(), 'base64');
  const uploadUrl = sign.data.uploadUrl;
  const maskedUploadUrl = uploadUrl.split('?')[0] ?? uploadUrl;
  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': 'image/png' },
    body: new Blob([file], { type: 'image/png' }),
  });

  await attachApiCallLog({
    testInfo,
    name: '请求日志-课程封面-COS上传.json',
    request: {
      method: 'PUT',
      url: maskedUploadUrl,
      headers: { 'content-type': 'image/png' },
      body: { fileName: 'goods-cover.png', bytes: file.byteLength },
    },
    response: {
      status: uploadResponse.status,
      headers: uploadResponse.headers,
      body: await uploadResponse.text(),
    },
    assertions: ['COS PUT 上传 HTTP 状态码应为 2xx'],
  });

  expect(uploadResponse.ok, `COS PUT 上传失败：HTTP ${uploadResponse.status}`).toBe(true);
  const { body: downloadSign } = await requestJson<CosDownloadSign>(
    testInfo,
    'GET',
    Endpoints.system.cosDownloadSign,
    {
      query: { objectKey: sign.data.objectKey },
      logName: '请求日志-课程封面-COS下载签名.json',
      assertions: ['COS 下载签名业务 code 应为成功码', 'COS 下载签名应返回 downloadUrl'],
    },
  );
  expect(downloadSign.code, `COS 下载签名失败：${downloadSign.msg}`).toBe(SUCCESS_CODE);
  expect(downloadSign.data?.downloadUrl, 'COS 下载签名应返回 downloadUrl').toBeTruthy();

  const coverProbe = await fetch(downloadSign.data.downloadUrl, { method: 'GET' });
  await attachApiCallLog({
    testInfo,
    name: '请求日志-课程封面-访问校验.json',
    request: { method: 'GET', url: downloadSign.data.downloadUrl.split('?')[0] ?? downloadSign.data.downloadUrl, headers: {}, body: null },
    response: {
      status: coverProbe.status,
      headers: coverProbe.headers,
      body: { ok: coverProbe.ok, contentType: coverProbe.headers.get('content-type') },
    },
    assertions: ['封面 accessUrl 应可访问'],
  });
  expect(coverProbe.ok, `封面下载签名 URL 不可访问：HTTP ${coverProbe.status}`).toBe(true);
  return sign.data.objectKey;
}

async function resolveShopId(testInfo: TestInfo, preferredShopId?: string): Promise<number> {
  const { body } = await requestJson<MerchantShop[]>(testInfo, 'GET', Endpoints.user.myShops, {
    logName: '请求日志-我的店铺列表.json',
    assertions: ['我的店铺列表业务 code 应为成功码', '我的店铺列表 data 应为数组'],
  });

  expect(body.code, '我的店铺列表业务 code 应为成功码').toBe(SUCCESS_CODE);
  expect(Array.isArray(body.data), '我的店铺列表 data 应为数组').toBe(true);

  const shop = preferredShopId
    ? body.data.find((item) => String(item.orgId) === preferredShopId)
    : body.data[0];
  expect(
    shop,
    preferredShopId
      ? `我的店铺列表中应存在 SHOP_ID=${preferredShopId}`
      : '我的店铺列表应至少存在一个店铺',
  ).toBeTruthy();

  return shop!.orgId;
}

async function resolveClassInClass(testInfo: TestInfo, shopId: number): Promise<ClassInClass> {
  const { body } = await requestJson<ClassInClass[]>(
    testInfo,
    'GET',
    Endpoints.classin.classList(0),
    {
      query: { orgid: shopId },
      logName: '请求日志-ClassIn班级列表.json',
      assertions: ['ClassIn 班级列表业务 code 应为成功码', 'ClassIn 班级列表应存在可绑定班级'],
    },
  );

  if (body.code !== SUCCESS_CODE || !Array.isArray(body.data) || body.data.length === 0) {
    test.skip(true, '当前店铺未绑定 ClassIn 机构或机构下无班级，跳过固定课商品链路');
    throw new Error('当前店铺未绑定 ClassIn 机构或机构下无班级');
  }

  const classInfo = body.data[0]!;
  expect(classInfo, 'ClassIn 班级列表应存在可绑定班级').toBeTruthy();
  return classInfo;
}

async function resolveAppointmentTeacher(
  testInfo: TestInfo,
  shopId: number,
): Promise<AppointmentTeacher> {
  const { body } = await requestJson<AppointmentTeacherList>(
    testInfo,
    'GET',
    Endpoints.shopAdmin.appointmentTeachers(shopId),
    {
      logName: '请求日志-预约课老师列表.json',
      assertions: ['预约课老师列表业务 code 应为成功码', '预约课老师列表应存在启用老师'],
    },
  );

  if (body.code !== SUCCESS_CODE || !Array.isArray(body.data?.list) || body.data.list.length === 0) {
    test.skip(true, '当前店铺无启用中的预约课老师，跳过预约课商品链路');
    throw new Error('当前店铺无启用中的预约课老师');
  }

  const teacher = body.data.list[0]!;
  expect(teacher, '预约课老师列表应存在启用老师').toBeTruthy();
  return teacher;
}

async function assertGoodsListPic(
  testInfo: TestInfo,
  shopId: number,
  goodsId: number,
  expectedPic: string,
  logName: string,
) {
  const { body } = await requestJson<GoodsListData>(
    testInfo,
    'GET',
    Endpoints.shopAdmin.goodsList(shopId),
    {
      query: { page: 1, limit: 10, status: 1 },
      logName,
      assertions: ['商品列表业务 code 应为成功码', '商品列表中目标商品封面应为上传后的 objectKey'],
    },
  );
  expect(body.code, '商品列表业务 code 应为成功码').toBe(SUCCESS_CODE);
  const item = body.data?.list?.find((goods) => goods.id === goodsId);
  expect(item, `商品列表中应存在 goodsId=${goodsId}`).toBeTruthy();
  expect(item?.pic, '商品列表中目标商品封面应为上传后的 objectKey').toBe(expectedPic);
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
    goodsType: kind === 'appointment' ? 3 : 1,
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

/**
 * 商品管理路径：
 * 固定课：我的店铺 -> ClassIn 班级 -> 创建草稿 -> 编辑草稿绑定班级 -> 上架 -> 详情校验 -> 删除清理。
 * 预约课：我的店铺 -> 启用老师 -> 创建草稿 -> 编辑草稿 -> 上架 -> 详情校验 ->（默认）删除清理；KEEP_TEST_GOODS=1 时保留商品。
 */
test.describe('商品管理', () => {
  test.skip(!hasApiCredential(), '未配置商家鉴权凭据，跳过需登录态商品管理链路');

  test('固定课：创建草稿 -> 编辑草稿 -> 上架商品', async ({ env, data }) => {
    const testInfo = test.info();
    const shopId = await resolveShopId(testInfo, env.shopId);
    const classInfo = await resolveClassInClass(testInfo, shopId);
    const stamp = timeLabel();
    const coverUrl = await uploadGoodsCover(testInfo);
    const createPayload = basePayload('fixed', `自动化固定课草稿-${stamp}`, coverUrl);

    const { body: created } = await requestJson<IdResult>(
      testInfo,
      'POST',
      Endpoints.shopAdmin.goodsCreate(shopId),
      {
        data: createPayload,
        logName: '请求日志-固定课-创建草稿.json',
        assertions: ['创建固定课草稿业务 code 应为成功码', '创建草稿应返回 goodsId'],
      },
    );
    expect(created.code, '创建固定课草稿业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(created.data?.id, '创建草稿应返回 goodsId').toBeTruthy();

    const goodsId = created.data.id;
    if (!keepTestGoods) {
      data.register(`删除固定课测试商品 ${goodsId}`, async () => {
        await requestJson(testInfo, 'POST', Endpoints.shopAdmin.goodsDelete(shopId), {
          data: { goodsId },
          logName: '请求日志-固定课-删除清理.json',
          assertions: ['删除固定课测试商品用于清理环境'],
        });
      });
    }

    const { body: draftDetail } = await requestJson<GoodsDetail>(
      testInfo,
      'GET',
      Endpoints.shopAdmin.goodsDetail(shopId, goodsId),
      {
        logName: '请求日志-固定课-草稿详情.json',
        assertions: ['固定课草稿详情业务 code 应为成功码', '草稿详情应返回 SKU ID'],
      },
    );
    expect(draftDetail.code, '固定课草稿详情业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(draftDetail.data?.products?.[0]?.id, '草稿详情应返回 SKU ID').toBeTruthy();
    const draftProduct = draftDetail.data.products[0]!;
    expect(draftProduct, '草稿详情应返回 SKU').toBeTruthy();

    const updatePayload = payloadFromDetail(draftDetail.data, {
      name: `自动化固定课已编辑-${stamp}`,
      summary: `自动化固定课已编辑简介-${stamp}`,
      description: `自动化固定课已编辑详情-${stamp}`,
      status: 0,
      products: [
        baseProduct({
          id: draftProduct.id,
          stock: 0,
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

    const { body: updated } = await requestJson<IdResult>(
      testInfo,
      'POST',
      Endpoints.shopAdmin.goodsUpdate(shopId),
      {
        data: updatePayload,
        logName: '请求日志-固定课-编辑草稿.json',
        assertions: ['编辑固定课草稿业务 code 应为成功码'],
      },
    );
    expect(updated.code, `编辑固定课草稿失败：${updated.msg}`).toBe(SUCCESS_CODE);

    const { body: published } = await requestJson(
      testInfo,
      'POST',
      Endpoints.shopAdmin.goodsStatus(shopId),
      {
        data: { goodsId, status: 1 },
        logName: '请求日志-固定课-上架.json',
        assertions: ['固定课上架业务 code 应为成功码'],
      },
    );
    expect(published.code, `固定课上架失败：${published.msg}`).toBe(SUCCESS_CODE);

    const { body: finalDetail } = await requestJson<GoodsDetail>(
      testInfo,
      'GET',
      Endpoints.shopAdmin.goodsDetail(shopId, goodsId),
      {
        logName: '请求日志-固定课-上架后详情.json',
        assertions: ['固定课上架后详情业务 code 应为成功码', '固定课最终状态应为上架'],
      },
    );
    expect(finalDetail.code, '固定课上架后详情业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(finalDetail.data?.status, '固定课最终状态应为上架').toBe(1);
    expect(finalDetail.data?.name, '固定课名称应为编辑后的名称').toBe(updatePayload.name);
    expect(finalDetail.data?.pic, '固定课封面应为上传后的课程封面 objectKey').toBe(coverUrl);
    await assertGoodsListPic(
      testInfo,
      shopId,
      goodsId,
      coverUrl,
      '请求日志-固定课-商品列表封面校验.json',
    );
  });

  test('预约课：创建草稿 -> 编辑草稿 -> 上架商品', async ({ env, data }) => {
    const testInfo = test.info();
    const shopId = await resolveShopId(testInfo, env.shopId);
    const teacher = await resolveAppointmentTeacher(testInfo, shopId);
    const stamp = timeLabel();
    const coverUrl = await uploadGoodsCover(testInfo);
    const createPayload = {
      ...basePayload('appointment', `自动化预约课草稿-${stamp}`, coverUrl),
      appointment: appointmentConfig(),
      products: [baseProduct({ hoursCount: 10, teacherIds: [teacher.id] })],
    };

    const { body: created } = await requestJson<IdResult>(
      testInfo,
      'POST',
      Endpoints.shopAdmin.goodsCreate(shopId),
      {
        data: createPayload,
        logName: '请求日志-预约课-创建草稿.json',
        assertions: ['创建预约课草稿业务 code 应为成功码', '创建草稿应返回 goodsId'],
      },
    );
    expect(created.code, '创建预约课草稿业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(created.data?.id, '创建草稿应返回 goodsId').toBeTruthy();

    const goodsId = created.data.id;
    if (!keepTestGoods) {
      data.register(`删除预约课测试商品 ${goodsId}`, async () => {
        await requestJson(testInfo, 'POST', Endpoints.shopAdmin.goodsDelete(shopId), {
          data: { goodsId },
          logName: '请求日志-预约课-删除清理.json',
          assertions: ['删除预约课测试商品用于清理环境'],
        });
      });
    }

    const { body: draftDetail } = await requestJson<GoodsDetail>(
      testInfo,
      'GET',
      Endpoints.shopAdmin.goodsDetail(shopId, goodsId),
      {
        logName: '请求日志-预约课-草稿详情.json',
        assertions: ['预约课草稿详情业务 code 应为成功码', '草稿详情应返回 SKU ID'],
      },
    );
    expect(draftDetail.code, '预约课草稿详情业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(draftDetail.data?.products?.[0]?.id, '草稿详情应返回 SKU ID').toBeTruthy();
    const draftProduct = draftDetail.data.products[0]!;
    expect(draftProduct, '草稿详情应返回 SKU').toBeTruthy();

    const updatePayload = payloadFromDetail(draftDetail.data, {
      name: `自动化预约课已编辑-${stamp}`,
      summary: `自动化预约课已编辑简介-${stamp}`,
      description: `自动化预约课已编辑详情-${stamp}`,
      status: 0,
      appointment: appointmentConfig(),
      products: [
        baseProduct({
          id: draftProduct.id,
          stock: 0,
          hoursCount: 12,
          teacherIds: [teacher.id],
        }),
      ],
    });

    const { body: updated } = await requestJson<IdResult>(
      testInfo,
      'POST',
      Endpoints.shopAdmin.goodsUpdate(shopId),
      {
        data: updatePayload,
        logName: '请求日志-预约课-编辑草稿.json',
        assertions: ['编辑预约课草稿业务 code 应为成功码'],
      },
    );
    expect(updated.code, `编辑预约课草稿失败：${updated.msg}`).toBe(SUCCESS_CODE);

    const { body: published } = await requestJson(
      testInfo,
      'POST',
      Endpoints.shopAdmin.goodsStatus(shopId),
      {
        data: { goodsId, status: 1 },
        logName: '请求日志-预约课-上架.json',
        assertions: ['预约课上架业务 code 应为成功码'],
      },
    );
    expect(published.code, `预约课上架失败：${published.msg}`).toBe(SUCCESS_CODE);

    const { body: finalDetail } = await requestJson<GoodsDetail>(
      testInfo,
      'GET',
      Endpoints.shopAdmin.goodsDetail(shopId, goodsId),
      {
        logName: '请求日志-预约课-上架后详情.json',
        assertions: ['预约课上架后详情业务 code 应为成功码', '预约课最终状态应为上架'],
      },
    );
    expect(finalDetail.code, '预约课上架后详情业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(finalDetail.data?.status, '预约课最终状态应为上架').toBe(1);
    expect(finalDetail.data?.name, '预约课名称应为编辑后的名称').toBe(updatePayload.name);
    expect(finalDetail.data?.pic, '预约课封面应为上传后的课程封面 objectKey').toBe(coverUrl);
    expect(finalDetail.data?.goodsType, '预约课 goodsType 应为 3').toBe(3);
    await assertGoodsListPic(
      testInfo,
      shopId,
      goodsId,
      coverUrl,
      '请求日志-预约课-商品列表封面校验.json',
    );
  });
});
