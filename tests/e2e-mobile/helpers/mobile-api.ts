import { accounts, env as configEnv, formatAuthorizationHeader } from '@config';
import {
  ApiHelper,
  DataRegistry,
  Endpoints,
  SUCCESS_CODE,
  asArray,
  authHeader,
  browserHeaders,
  buildAddressPayload,
  futureLocalDate,
  pickNumber,
  buildCreateOrderPayload,
  cleanupRefundMerchantOrder,
  provisionPublishedFixedGoods,
  provisionPublishedRecordedGoods,
  provisionStudentAppointmentOrderItem,
  provisionTeacherAvailableSlots,
  sparseTeacherSlotStarts,
} from '@shared';
import type { ApiResponse, ListData } from '@shared/http/types.js';
import type { TestInfo } from '@playwright/test';

type HttpMethod = 'GET' | 'POST';
type Query = Record<string, string | number | boolean | undefined>;

export interface MobileShopContext {
  shopId?: number;
  shopDomain: string;
}

export interface MobileGoodsSummary {
  id: number;
  name: string;
}

interface MerchantShop {
  orgId: number;
  orgName?: string;
}

interface OrgDetail {
  shopDomain: string;
}

interface CouponIdResult {
  id: number;
}

export interface UserCouponItem {
  couponId: number;
  couponCodeId: number;
  name: string;
  displayStatus: number;
}

interface UserCouponList {
  total: number;
  page: number;
  pageSize: number;
  list: UserCouponItem[];
}

export interface CreatedCoupon {
  id: number;
  name: string;
}

function buildUrl(path: string, query?: Query): string {
  const url = new URL(`${configEnv.apiBaseURL}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function originFrom(value: string): string {
  if (!value) return configEnv.shopHost;
  try {
    return new URL(value).origin;
  } catch {
    return `https://${value}`;
  }
}

function browserLikeHeaders(
  token?: string,
  headers: Record<string, string> = {},
): Record<string, string> {
  const origin = originFrom(headers['X-Shop-Domain'] ?? configEnv.mobileBaseURL ?? configEnv.shopHost);
  return {
    accept: 'application/json, text/plain, */*',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'cache-control': 'no-cache',
    origin,
    pragma: 'no-cache',
    referer: `${origin}/`,
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    'user-agent':
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    ...(token ? { authorization: formatAuthorizationHeader(token) } : {}),
    ...headers,
  };
}

export async function requestMobileJson<T>(
  testInfo: TestInfo,
  method: HttpMethod,
  path: string,
  options: {
    token?: string;
    query?: Query;
    data?: unknown;
    headers?: Record<string, string>;
    logName?: string;
    assertions?: string[];
  } = {},
): Promise<{ status: number; body: ApiResponse<T> }> {
  const url = buildUrl(path, options.query);
  const hasBody = options.data !== undefined;
  const headers = browserLikeHeaders(options.token, {
    ...(hasBody ? { 'content-type': 'application/json' } : {}),
    ...options.headers,
  });
  const response = await fetch(url, {
    method,
    headers,
    body: hasBody ? JSON.stringify(options.data) : undefined,
  });
  const status = response.status;
  const text = await response.text();

  let body: ApiResponse<T>;
  try {
    body = JSON.parse(text) as ApiResponse<T>;
  } catch {
    throw new Error(`非 JSON 响应（${method} ${path} -> HTTP ${status}）：${text.slice(0, 200)}`);
  }

  return { status, body };
}

export async function resolveMobileShopContext(testInfo: TestInfo): Promise<MobileShopContext> {
  if (accounts.token) {
    const shops = await requestMobileJson<MerchantShop[]>(testInfo, 'GET', Endpoints.user.myShops, {
      token: accounts.token,
      logName: '请求日志-H5-我的店铺列表.json',
      assertions: ['商家 token 应能查询我的店铺列表'],
    });
    if (shops.body.code === SUCCESS_CODE && Array.isArray(shops.body.data) && shops.body.data.length > 0) {
      const selectedShop = configEnv.shopId
        ? shops.body.data.find((shop) => String(shop.orgId) === configEnv.shopId)
        : shops.body.data[0];
      const orgId = selectedShop?.orgId;
      if (orgId) {
        const detail = await requestMobileJson<OrgDetail>(testInfo, 'GET', Endpoints.org.detail(orgId), {
          token: accounts.token,
          logName: '请求日志-H5-组织详情.json',
          assertions: ['组织详情应返回 H5 店铺域名'],
        });
        const shopDomain = detail.body.data?.shopDomain || configEnv.mobileBaseURL;
        if (detail.body.code === SUCCESS_CODE && shopDomain) {
          return { shopId: orgId, shopDomain };
        }
      }
    }
  }

  const fallbackDomain = configEnv.mobileBaseURL;
  if (!fallbackDomain) {
    throw new Error('缺少 MOBILE_BASE_URL，无法解析 H5 店铺上下文');
  }
  return {
    shopId: configEnv.shopId ? Number(configEnv.shopId) : undefined,
    shopDomain: fallbackDomain,
  };
}

function formatTime(date = new Date()): string {
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
}

export async function createFreeCoupon(
  testInfo: TestInfo,
  shopId: number,
): Promise<CreatedCoupon> {
  if (!accounts.token) throw new Error('未配置 TEST_TOKEN，无法创建优惠券前置数据');

  const now = Math.floor(Date.now() / 1000);
  const name = `UI测试券-${formatTime()}`;
  const created = await requestMobileJson<CouponIdResult>(
    testInfo,
    'POST',
    Endpoints.shopAdmin.couponCreate(shopId),
    {
      token: accounts.token,
      data: {
        name,
        type: 1,
        discountAmount: 1,
        thresholdAmount: 0,
        discountRate: 0,
        stockTotal: 1,
        receiveLimitPerUser: 1,
        startTime: now - 60,
        endTime: now + 60 * 60 * 24,
        productIds: [],
      },
      logName: '请求日志-H5-创建优惠券.json',
      assertions: ['商家端应能创建 H5 领取测试券'],
    },
  );
  if (created.body.code !== SUCCESS_CODE || !created.body.data?.id) {
    throw new Error(`创建优惠券失败：code=${created.body.code}, msg=${created.body.msg}`);
  }
  return { id: created.body.data.id, name };
}

export async function findUserCoupon(
  testInfo: TestInfo,
  couponId: number,
  shop: Pick<MobileShopContext, 'shopDomain'>,
): Promise<UserCouponItem | undefined> {
  const list = await requestMobileJson<UserCouponList>(testInfo, 'GET', Endpoints.shop.userCouponList, {
    token: accounts.mobileToken,
    headers: { 'X-Shop-Domain': shop.shopDomain },
    query: { page: 1, limit: 100 },
    logName: '请求日志-H5-我的券包.json',
    assertions: ['H5 我的券包应包含刚领取的优惠券'],
  });
  if (list.body.code !== SUCCESS_CODE) {
    throw new Error(`查询我的券包失败：code=${list.body.code}, msg=${list.body.msg}`);
  }
  return list.body.data?.list.find((coupon) => coupon.couponId === couponId);
}

export async function voidCouponCode(
  testInfo: TestInfo,
  shopId: number,
  couponCodeId: number,
): Promise<void> {
  if (!accounts.token) return;
  await requestMobileJson<null>(testInfo, 'POST', Endpoints.shopAdmin.couponCodeVoid(shopId), {
    token: accounts.token,
    data: { codeId: couponCodeId, voidReason: 'H5 UI 自动化测试清理' },
    logName: '请求日志-H5-作废券码清理.json',
    assertions: ['作废 H5 UI 测试领取的券码'],
  });
}

export async function stopCoupon(testInfo: TestInfo, shopId: number, couponId: number): Promise<void> {
  if (!accounts.token) return;
  await requestMobileJson<null>(testInfo, 'POST', Endpoints.shopAdmin.couponStatus(shopId), {
    token: accounts.token,
    data: { id: couponId, status: 1 },
    logName: '请求日志-H5-停用优惠券清理.json',
    assertions: ['停用 H5 UI 测试券模板'],
  });
}

export interface CreatedAddress {
  id: number;
  receiverName: string;
  detailAddress: string;
}

export interface MobileOrderSummary {
  orderItemsId: number;
  repoName: string;
}

function shopDomainHeaders(shop: Pick<MobileShopContext, 'shopDomain'>): Record<string, string> {
  return { 'X-Shop-Domain': shop.shopDomain };
}

export async function createTestAddress(
  testInfo: TestInfo,
  shop: Pick<MobileShopContext, 'shopDomain'>,
): Promise<CreatedAddress> {
  if (!accounts.mobileToken) throw new Error('未配置 MOBILE_TEST_TOKEN，无法创建地址前置数据');

  const payload = buildAddressPayload({
    receiverName: uniqueUiName('UI收货人'),
    isDefault: false,
  });
  const created = await requestMobileJson<unknown>(testInfo, 'POST', Endpoints.user.addressCreate, {
    token: accounts.mobileToken,
    headers: shopDomainHeaders(shop),
    data: payload,
    logName: '请求日志-H5-创建地址.json',
    assertions: ['C 端应能创建 H5 地址管理测试地址'],
  });
  if (created.body.code !== SUCCESS_CODE) {
    throw new Error(`创建地址失败：code=${created.body.code}, msg=${created.body.msg}`);
  }
  const id = pickNumber(created.body.data, ['id', 'addressId', 'address_id']);
  if (!id) {
    throw new Error('创建地址成功但未返回 addressId');
  }
  return { id, receiverName: payload.receiverName, detailAddress: payload.detailAddress };
}

export async function deleteTestAddress(
  testInfo: TestInfo,
  shop: Pick<MobileShopContext, 'shopDomain'>,
  addressId: number,
): Promise<void> {
  if (!accounts.mobileToken) return;
  await requestMobileJson<null>(testInfo, 'POST', Endpoints.user.addressDelete, {
    token: accounts.mobileToken,
    headers: shopDomainHeaders(shop),
    data: { id: addressId },
    logName: '请求日志-H5-删除地址清理.json',
    assertions: ['删除 H5 UI 测试地址'],
  });
}

export async function findUserOrder(
  testInfo: TestInfo,
  shop: Pick<MobileShopContext, 'shopDomain'>,
): Promise<MobileOrderSummary | undefined> {
  if (!accounts.mobileToken) return undefined;
  const list = await requestMobileJson<ListData<Record<string, unknown>>>(
    testInfo,
    'GET',
    Endpoints.user.orders,
    {
      token: accounts.mobileToken,
      headers: shopDomainHeaders(shop),
      query: { page: 1, limit: 10, orderStatus: -1, study: 0 },
      logName: '请求日志-H5-我的订单.json',
      assertions: ['H5 购课订单列表应可访问'],
    },
  );
  if (list.body.code !== SUCCESS_CODE) {
    throw new Error(`查询购课订单失败：code=${list.body.code}, msg=${list.body.msg}`);
  }

  for (const item of asArray(list.body.data)) {
    const orderItemsId = pickNumber(item, ['orderItemsId', 'order_items_id', 'id']);
    if (!orderItemsId) continue;
    const repo = item['repo'];
    const repoName =
      (typeof item['repoName'] === 'string' && item['repoName']) ||
      (repo && typeof repo === 'object' && typeof (repo as { name?: string }).name === 'string'
        ? (repo as { name: string }).name
        : '') ||
      '';
    return { orderItemsId, repoName };
  }
  return undefined;
}

function uniqueUiName(prefix: string): string {
  const stamp = formatTime();
  return `${prefix}-${stamp}`;
}

export interface UserAddressSummary {
  id: number;
  receiverName: string;
  detailAddress: string;
  isDefault: boolean;
}

const TEST_ADDRESS_NAME = /^(?:(?:UI)?收货人-|自动化更新姓名)/;

export async function listUserAddresses(
  testInfo: TestInfo,
  shop: Pick<MobileShopContext, 'shopDomain'>,
): Promise<UserAddressSummary[]> {
  if (!accounts.mobileToken) return [];
  const list = await requestMobileJson<unknown>(testInfo, 'GET', Endpoints.user.addressList, {
    token: accounts.mobileToken,
    headers: shopDomainHeaders(shop),
    logName: '请求日志-H5-地址列表.json',
    assertions: ['H5 地址列表应可访问'],
  });
  if (list.body.code !== SUCCESS_CODE) {
    throw new Error(`查询地址列表失败：code=${list.body.code}, msg=${list.body.msg}`);
  }
  return asArray(list.body.data)
    .map((item) => {
      const id = pickNumber(item, ['id', 'addressId', 'address_id']);
      if (!id) return undefined;
      return {
        id,
        receiverName: typeof item['receiverName'] === 'string' ? item['receiverName'] : '',
        detailAddress: typeof item['detailAddress'] === 'string' ? item['detailAddress'] : '',
        isDefault: Boolean(item['isDefault']),
      };
    })
    .filter((item): item is UserAddressSummary => Boolean(item));
}

export async function pruneTestAddresses(
  testInfo: TestInfo,
  shop: Pick<MobileShopContext, 'shopDomain'>,
): Promise<void> {
  const addresses = await listUserAddresses(testInfo, shop);
  for (const address of addresses) {
    if (!TEST_ADDRESS_NAME.test(address.receiverName)) continue;
    await deleteTestAddress(testInfo, shop, address.id);
  }
}

export interface BookableAppointmentOrder {
  orderItemId: number;
  goodsName: string;
  cleanup: () => Promise<void>;
}

function createShopApis(): { merchant: ApiHelper; student: ApiHelper } {
  const shopHeaders = configEnv.mobileBaseURL ? { 'X-Shop-Domain': configEnv.mobileBaseURL } : {};
  const merchant = new ApiHelper(
    configEnv.apiBaseURL,
    {
      ...browserHeaders(),
      ...authHeader(accounts.token),
      ...shopHeaders,
    },
    { maxResponseMs: 0 },
  );
  const student = new ApiHelper(
    configEnv.apiBaseURL,
    {
      ...browserHeaders(),
      ...authHeader(accounts.mobileToken),
      ...shopHeaders,
    },
    { maxResponseMs: 0 },
  );
  return { merchant, student };
}

/**
 * 对齐 API 约课 fixture：上架零元预约课 → 学生下单 → 写入老师可约时段。
 * UI 用例把这步当前置，报告焦点仍在页面操作。
 */
export async function prepareBookableAppointment(): Promise<BookableAppointmentOrder | null> {
  if (!configEnv.shopId || !accounts.token || !accounts.mobileToken) return null;

  const data = new DataRegistry();
  const { merchant, student } = createShopApis();
  const item = await provisionStudentAppointmentOrderItem(merchant, student, {
    shopId: configEnv.shopId,
    data,
    namePrefix: 'UI预约课',
  });
  if (!item) {
    await data.runAll();
    return null;
  }

  let teacherId = item.teacherId;
  if (!teacherId) {
    const teachers = await student.get(Endpoints.appointment.orderTeachers(item.orderItemId), {
      maxDurationMs: 0,
    });
    teacherId = pickNumber(asArray(teachers.body.data)[0], ['id', 'teacherId', 'teacher_id']);
  }
  if (teacherId) {
    await provisionTeacherAvailableSlots(merchant, configEnv.shopId, teacherId, {
      dates: [futureLocalDate(2), futureLocalDate(3), futureLocalDate(8)],
      startHhmms: sparseTeacherSlotStarts(4),
      durationMin: 60,
    });
  }

  return {
    orderItemId: item.orderItemId,
    goodsName: item.title || `预约课订单 ${item.orderItemId}`,
    cleanup: () => data.runAll(),
  };
}

export interface PurchasableRecordedCourse {
  goodsId: number;
  goodsName: string;
  attachPaidOrder: (orderId: number) => void;
  cleanup: () => Promise<void>;
}

/**
 * 上架零元可试看录播课（data 目录视频+资料，转码成功后才返回）。
 * 给商品搜索/购买弹层/录播试看共用；调用方 afterAll 统一 cleanup。
 * 下单仍走 H5 UI，成功后用 attachPaidOrder 登记退款。
 */
export async function preparePurchasableRecordedCourse(): Promise<PurchasableRecordedCourse | null> {
  if (!configEnv.shopId || !accounts.token || !accounts.mobileToken) return null;

  const data = new DataRegistry();
  const { merchant } = createShopApis();
  const goods = await provisionPublishedRecordedGoods(merchant, {
    shopId: configEnv.shopId,
    data,
    price: 0,
    namePrefix: 'UI录播课',
  });
  if (!goods) {
    await data.runAll();
    return null;
  }

  return {
    goodsId: goods.goodsId,
    goodsName: goods.title,
    attachPaidOrder: (orderId) => {
      if (!orderId) return;
      data.register(`退款录播课订单 ${orderId}`, async () => {
        await cleanupRefundMerchantOrder(merchant, configEnv.shopId!, orderId, 0);
      });
    },
    cleanup: () => data.runAll(),
  };
}

export interface PurchasedRecordedCourse {
  goodsId: number;
  goodsName: string;
  orderId: number;
  orderItemId: number;
  cleanup: () => Promise<void>;
}

/**
 * 上架零元录播课并由 C 端 API 下单，给学习页进课 / 学习数据 / 订单退款 UI 复用。
 */
export async function preparePurchasedRecordedCourse(): Promise<PurchasedRecordedCourse | null> {
  if (!configEnv.shopId || !accounts.token || !accounts.mobileToken) return null;

  const data = new DataRegistry();
  const { merchant, student } = createShopApis();
  const goods = await provisionPublishedRecordedGoods(merchant, {
    shopId: configEnv.shopId,
    data,
    price: 0,
    namePrefix: 'UI录播学',
  });
  if (!goods) {
    await data.runAll();
    return null;
  }

  const created = await student.post(Endpoints.goods.orderCreate, buildCreateOrderPayload({
    goodsId: goods.goodsId,
    skuId: goods.skuId,
  }), { maxDurationMs: 0 });
  const orderItemId = pickNumber(created.body.data, ['orderItemId', 'order_item_id']) ?? 0;
  const orderId = pickNumber(created.body.data, ['orderId', 'order_id', 'id']) ?? 0;
  if (created.body.code !== SUCCESS_CODE || orderItemId <= 0 || orderId <= 0) {
    await data.runAll();
    return null;
  }

  data.register(`退款录播课订单 ${orderId}`, async () => {
    await cleanupRefundMerchantOrder(merchant, configEnv.shopId!, orderId, 0);
  });

  return {
    goodsId: goods.goodsId,
    goodsName: goods.title,
    orderId,
    orderItemId,
    cleanup: () => data.runAll(),
  };
}

export interface PurchasableFixedCourse {
  goodsId: number;
  goodsName: string;
  attachPaidOrder: (orderId: number) => void;
  cleanup: () => Promise<void>;
}

/**
 * 上架零元固定课（绑定 ClassIn 班级），下单仍走 H5 UI。
 */
export async function preparePurchasableFixedCourse(): Promise<PurchasableFixedCourse | null> {
  if (!configEnv.shopId || !accounts.token || !accounts.mobileToken) return null;

  const data = new DataRegistry();
  const { merchant } = createShopApis();
  const goods = await provisionPublishedFixedGoods(merchant, {
    shopId: configEnv.shopId,
    data,
    price: 0,
    namePrefix: 'UI固定课',
  });
  if (!goods) {
    await data.runAll();
    return null;
  }

  return {
    goodsId: goods.goodsId,
    goodsName: goods.title,
    attachPaidOrder: (orderId) => {
      if (!orderId) return;
      data.register(`退款固定课订单 ${orderId}`, async () => {
        await cleanupRefundMerchantOrder(merchant, configEnv.shopId!, orderId, 0);
      });
    },
    cleanup: () => data.runAll(),
  };
}

export interface RefundableCouponOrder {
  goodsName: string;
  orderId: number;
  orderItemId: number;
  cleanup: () => Promise<void>;
}

/**
 * 上架 1 元固定课 + 1 元无门槛券，领取后带券下单，实付 0 元但详情仍展示申请退款。
 */
export async function prepareRefundableCouponOrder(): Promise<RefundableCouponOrder | null> {
  if (!configEnv.shopId || !accounts.token || !accounts.mobileToken) return null;

  const data = new DataRegistry();
  const { merchant, student } = createShopApis();
  const goods = await provisionPublishedFixedGoods(merchant, {
    shopId: configEnv.shopId,
    data,
    price: 1,
    namePrefix: 'UI退款课',
  });
  if (!goods) {
    await data.runAll();
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const createdCoupon = await merchant.post<{ id: number }>(
    Endpoints.shopAdmin.couponCreate(configEnv.shopId),
    {
      name: uniqueUiName('UI退款券'),
      type: 1,
      discountAmount: 1,
      thresholdAmount: 0,
      discountRate: 0,
      stockTotal: 1,
      receiveLimitPerUser: 1,
      startTime: now - 60,
      endTime: now + 60 * 60 * 24,
      productIds: [],
    },
    { maxDurationMs: 0 },
  );
  const couponId = createdCoupon.body.data?.id ?? 0;
  if (createdCoupon.body.code !== SUCCESS_CODE || couponId <= 0) {
    await data.runAll();
    return null;
  }
  data.register(`停用退款测试券 ${couponId}`, async () => {
    await merchant.post(
      Endpoints.shopAdmin.couponStatus(configEnv.shopId!),
      { id: couponId, status: 1 },
      { maxDurationMs: 0 },
    );
  });

  const received = await student.post<{ userCouponId?: number; couponCodeId?: number }>(
    Endpoints.shop.receiveCoupon(couponId),
    {},
    { maxDurationMs: 0 },
  );
  const userCouponId = pickNumber(received.body.data ?? {}, ['userCouponId', 'user_coupon_id', 'id']) ?? 0;
  const couponCodeId = pickNumber(received.body.data ?? {}, ['couponCodeId', 'coupon_code_id']) ?? 0;
  if (received.body.code !== SUCCESS_CODE || userCouponId <= 0) {
    await data.runAll();
    return null;
  }
  if (couponCodeId > 0) {
    data.register(`作废退款测试券码 ${couponCodeId}`, async () => {
      await merchant.post(
        Endpoints.shopAdmin.couponCodeVoid(configEnv.shopId!),
        { codeId: couponCodeId, voidReason: 'H5 UI 退款测试清理' },
        { maxDurationMs: 0 },
      );
    });
  }

  const createdOrder = await student.post(
    Endpoints.goods.orderCreate,
    buildCreateOrderPayload({
      goodsId: goods.goodsId,
      skuId: goods.skuId,
      userCouponId,
    }),
    { maxDurationMs: 0 },
  );
  const orderItemId = pickNumber(createdOrder.body.data, ['orderItemId', 'order_item_id']) ?? 0;
  const orderId = pickNumber(createdOrder.body.data, ['orderId', 'order_id', 'id']) ?? 0;
  if (createdOrder.body.code !== SUCCESS_CODE || orderItemId <= 0 || orderId <= 0) {
    await data.runAll();
    return null;
  }
  data.register(`退款清理带券订单 ${orderId}`, async () => {
    await cleanupRefundMerchantOrder(merchant, configEnv.shopId!, orderId, 0);
  });

  return {
    goodsName: goods.title,
    orderId,
    orderItemId,
    cleanup: () => data.runAll(),
  };
}
