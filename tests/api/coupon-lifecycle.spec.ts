import { test, expect } from '@shared';
import { assertApiResponseDuration, attachApiCallLog, Endpoints, SUCCESS_CODE } from '@shared';
import { accounts, env as configEnv, formatAuthorizationHeader, hasApiCredential, hasMobileCredential } from '@config';
import type { ApiResponse } from '@shared';
import type { TestInfo } from '@playwright/test';

type Query = Record<string, string | number | boolean | undefined>;
type HttpMethod = 'GET' | 'POST';

const keepTestCoupon = process.env.KEEP_TEST_COUPON === '1';

interface MerchantShop {
  orgId: number;
  orgName: string;
}

interface OrgDetail {
  shopDomain: string;
}

interface IdResult {
  id: number;
}

interface CouponRule {
  discountAmount: number;
  thresholdAmount: number;
  discountRate: number;
}

interface CouponDetail {
  id: number;
  name: string;
  type: number;
  status: number;
  displayStatus: number;
  rule: CouponRule;
  receiveLimitPerUser: number;
  stockTotal: number;
  stockIssued: number;
  stockVoided: number;
  startTime: number;
  endTime: number;
  allProductsApplicable?: boolean;
  products?: Array<{ productID: number; goodsID: number; name: string }>;
}

interface CouponLanding {
  id: number;
  name: string;
  type: number;
  status: number;
  displayStatus: number;
  rule: CouponRule;
  receiveLimitPerUser: number;
  stockTotal: number;
  stockIssued: number;
  stockVoided: number;
  alreadyReceived: boolean;
  canReceive: boolean;
}

interface CouponListData {
  total: number;
  page: number;
  pageSize: number;
  list: CouponDetail[];
}

interface ReceiveCouponResult {
  userCouponId: number;
  couponCodeId: number;
}

interface UserCoupon {
  id: number;
  couponId: number;
  couponCodeId: number;
  name: string;
  status: number;
  displayStatus: number;
  rule: CouponRule;
}

interface UserCouponListData {
  total: number;
  page: number;
  pageSize: number;
  list: UserCoupon[];
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

function originFrom(value: string): string {
  if (!value) return configEnv.shopHost;
  try {
    return new URL(value).origin;
  } catch {
    return `https://${value}`;
  }
}

function browserLikeHeaders(
  token: string,
  headers: Record<string, string> = {},
): Record<string, string> {
  const origin = originFrom(headers['X-Shop-Domain'] ?? configEnv.mobileBaseURL ?? configEnv.shopHost);
  return {
    accept: 'application/json, text/plain, */*',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    authorization: formatAuthorizationHeader(token),
    'cache-control': 'no-cache',
    origin,
    pragma: 'no-cache',
    referer: `${origin}/`,
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    'user-agent':
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    ...headers,
  };
}

async function requestJson<T>(
  testInfo: TestInfo,
  method: HttpMethod,
  path: string,
  options: {
    token: string;
    query?: Query;
    data?: unknown;
    headers?: Record<string, string>;
    assertions?: string[];
    logName?: string;
  },
): Promise<{ status: number; body: ApiResponse<T> }> {
  const url = buildUrl(path, options.query);
  const hasBody = options.data !== undefined;
  const headers = browserLikeHeaders(options.token, {
    ...(hasBody ? { 'content-type': 'application/json' } : {}),
    ...options.headers,
  });
  const started = Date.now();
  const response = await fetch(url, {
    method,
    headers,
    body: hasBody ? JSON.stringify(options.data) : undefined,
  });
  const status = response.status;
  const text = await response.text();
  const durationMs = Date.now() - started;
  assertApiResponseDuration(`${method} ${path}`, durationMs);
  let body: ApiResponse<T>;
  try {
    body = JSON.parse(text) as ApiResponse<T>;
  } catch {
    await attachApiCallLog({
      testInfo,
      name: options.logName ?? `请求日志-${method}-${path.replaceAll('/', '_') || 'root'}.json`,
      request: { method, url, headers, body: options.data ?? null },
      response: { status, headers: response.headers, body: text },
      durationMs,
      assertions: options.assertions ?? ['响应应为后端统一 JSON 信封'],
    });
    throw new Error(`非 JSON 响应（${method} ${path} -> HTTP ${status}）：${text.slice(0, 200)}`);
  }

  await attachApiCallLog({
    testInfo,
    name: options.logName ?? `请求日志-${method}-${path.replaceAll('/', '_') || 'root'}.json`,
    request: { method, url, headers, body: options.data ?? null },
    response: { status, headers: response.headers, body },
    durationMs,
    assertions: [
      ...(options.assertions ?? ['响应应为后端统一 JSON 信封']),
      `响应耗时应 ≤ 配置上限（实际 ${durationMs}ms）`,
    ],
  });

  return { status, body };
}

function formatTime(date = new Date()): string {
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
}

async function resolveShopContext(testInfo: TestInfo): Promise<{ shopId: number; shopDomain: string }> {
  const shops = await requestJson<MerchantShop[]>(testInfo, 'GET', Endpoints.user.myShops, {
    token: accounts.token,
    logName: '请求日志-优惠券-我的店铺列表.json',
    assertions: ['商家 token 应能查询我的店铺列表'],
  });
  expect(shops.body.code, '我的店铺列表业务 code 应为成功码').toBe(SUCCESS_CODE);
  expect(Array.isArray(shops.body.data), '我的店铺列表 data 应为数组').toBe(true);

  const selectedShop = configEnv.shopId
    ? shops.body.data.find((shop) => String(shop.orgId) === configEnv.shopId)
    : shops.body.data[0];
  expect(
    selectedShop,
    configEnv.shopId ? `我的店铺列表中应存在 SHOP_ID=${configEnv.shopId}` : '我的店铺列表应至少存在一个店铺',
  ).toBeTruthy();

  const shopId = Number(configEnv.shopId || selectedShop!.orgId);
  const orgDetail = await requestJson<OrgDetail>(testInfo, 'GET', Endpoints.org.detail(selectedShop!.orgId), {
    token: accounts.token,
    logName: '请求日志-优惠券-组织详情.json',
    assertions: ['组织详情应返回 C 端店铺域名'],
  });
  expect(orgDetail.body.code, '组织详情业务 code 应为成功码').toBe(SUCCESS_CODE);

  const shopDomain = orgDetail.body.data?.shopDomain || configEnv.mobileBaseURL;
  expect(shopDomain, '应能解析 C 端 shopDomain，用于 mobile 的 X-Shop-Domain').toBeTruthy();

  return { shopId, shopDomain };
}

async function stopCoupon(testInfo: TestInfo, shopId: number, couponId: number): Promise<void> {
  await requestJson<null>(testInfo, 'POST', Endpoints.shopAdmin.couponStatus(shopId), {
    token: accounts.token,
    data: { id: couponId, status: 1 },
    logName: '请求日志-优惠券-停用清理.json',
    assertions: ['停用优惠券模板用于清理环境'],
  });
}

async function voidCouponCode(
  testInfo: TestInfo,
  shopId: number,
  couponCodeId: number,
): Promise<void> {
  await requestJson<null>(testInfo, 'POST', Endpoints.shopAdmin.couponCodeVoid(shopId), {
    token: accounts.token,
    data: { codeId: couponCodeId, voidReason: 'API 自动化测试清理' },
    logName: '请求日志-优惠券-作废券码清理.json',
    assertions: ['作废已领取券码用于清理环境'],
  });
}

test.describe('优惠券生命周期', () => {
  test.skip(!hasApiCredential(), '未配置商家/教师端鉴权凭据（TEST_TOKEN、TEST_PHONE_NUMBER 或签名），跳过商家优惠券生命周期用例');
  test.skip(!hasMobileCredential(), '未配置用户/C 端鉴权凭据（MOBILE_TEST_TOKEN 或 MOBILE_TEST_PHONE_NUMBER），跳过 mobile 领券链路');

  test('商家创建优惠券 -> mobile 领取 -> 我的券包校验 -> 清理', async ({ data }) => {
    const testInfo = test.info();
    const { shopId, shopDomain } = await resolveShopContext(testInfo);
    const now = Math.floor(Date.now() / 1000);
    const couponName = `API测试券-${formatTime()}`;
    const createPayload = {
      name: couponName,
      type: 1,
      discountAmount: 1,
      thresholdAmount: 0,
      discountRate: 0,
      stockTotal: 1,
      receiveLimitPerUser: 1,
      startTime: now - 60,
      endTime: now + 60 * 60 * 24,
      productIds: [],
    };

    const created = await requestJson<IdResult>(
      testInfo,
      'POST',
      Endpoints.shopAdmin.couponCreate(shopId),
      {
        token: accounts.token,
        data: createPayload,
        logName: '请求日志-优惠券-创建.json',
        assertions: ['商家端应能创建无门槛全部商品快照优惠券'],
      },
    );
    expect(created.body.code, '创建优惠券业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(created.body.data?.id, '创建优惠券应返回 couponId').toBeTruthy();

    const couponId = created.body.data.id;
    if (!keepTestCoupon) {
      data.register(`停用测试优惠券 ${couponId}`, async () => {
        await stopCoupon(testInfo, shopId, couponId);
      });
    }

    const detail = await requestJson<CouponDetail>(
      testInfo,
      'GET',
      Endpoints.shopAdmin.couponDetail(shopId, couponId),
      {
        token: accounts.token,
        logName: '请求日志-优惠券-商家详情.json',
        assertions: ['商家详情应回显创建优惠券字段与适用商品快照'],
      },
    );
    expect(detail.body.code, '商家详情业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(detail.body.data?.name, '商家详情应回显优惠券名称').toBe(couponName);
    expect(detail.body.data?.type, '商家详情应回显无门槛券类型').toBe(1);
    expect(detail.body.data?.rule.discountAmount, '商家详情应回显优惠金额').toBe(1);
    expect(detail.body.data?.stockTotal, '商家详情应回显总库存').toBe(1);
    expect(detail.body.data?.receiveLimitPerUser, '商家详情应回显每人限领').toBe(1);
    expect(
      (detail.body.data?.products ?? []).length,
      '空 productIds 应快照写入创建时店铺全部上架 SKU',
    ).toBeGreaterThan(0);

    const merchantList = await requestJson<CouponListData>(
      testInfo,
      'GET',
      Endpoints.shopAdmin.couponList(shopId),
      {
        token: accounts.token,
        query: { page: 1, limit: 10, name: couponName },
        logName: '请求日志-优惠券-商家列表.json',
        assertions: ['商家列表应能按名称查到新建优惠券'],
      },
    );
    expect(merchantList.body.code, '商家列表业务 code 应为成功码').toBe(SUCCESS_CODE);
    const listCoupon = merchantList.body.data?.list.find((coupon) => coupon.id === couponId);
    expect(listCoupon, '商家列表应包含新建优惠券').toBeTruthy();
    expect(listCoupon?.stockIssued, '领取前已发放库存应为 0').toBe(0);

    const shopHeaders = { 'X-Shop-Domain': shopDomain };
    const landingBeforeReceive = await requestJson<CouponLanding>(
      testInfo,
      'GET',
      Endpoints.shop.couponDetail(couponId),
      {
        token: accounts.mobileToken,
        headers: shopHeaders,
        logName: '请求日志-优惠券-mobile落地页-领取前.json',
        assertions: ['mobile 券落地页应展示可领取状态'],
      },
    );
    expect(landingBeforeReceive.body.code, 'mobile 券落地页业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(landingBeforeReceive.body.data?.id, 'mobile 券落地页应返回目标 couponId').toBe(couponId);
    expect(landingBeforeReceive.body.data?.name, 'mobile 券落地页应展示券名称').toBe(couponName);
    expect(landingBeforeReceive.body.data?.canReceive, '领取前应可领取').toBe(true);
    expect(landingBeforeReceive.body.data?.alreadyReceived, '领取前不应已领取').toBe(false);

    const received = await requestJson<ReceiveCouponResult>(
      testInfo,
      'POST',
      Endpoints.shop.receiveCoupon(couponId),
      {
        token: accounts.mobileToken,
        headers: shopHeaders,
        logName: '请求日志-优惠券-mobile领取.json',
        assertions: ['mobile 用户应能领取商家创建的优惠券'],
      },
    );
    expect(received.body.code, 'mobile 领取优惠券业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(received.body.data?.userCouponId, '领取后应返回 userCouponId').toBeTruthy();
    expect(received.body.data?.couponCodeId, '领取后应返回 couponCodeId').toBeTruthy();

    const couponCodeId = received.body.data.couponCodeId;
    if (!keepTestCoupon) {
      data.register(`作废测试优惠券券码 ${couponCodeId}`, async () => {
        await voidCouponCode(testInfo, shopId, couponCodeId);
      });
    }

    const landingAfterReceive = await requestJson<CouponLanding>(
      testInfo,
      'GET',
      Endpoints.shop.couponDetail(couponId),
      {
        token: accounts.mobileToken,
        headers: shopHeaders,
        logName: '请求日志-优惠券-mobile落地页-领取后.json',
        assertions: ['mobile 券落地页应展示已领取状态'],
      },
    );
    expect(landingAfterReceive.body.code, '领取后 mobile 券落地页业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(landingAfterReceive.body.data?.alreadyReceived, '领取后应展示已领取').toBe(true);
    expect(landingAfterReceive.body.data?.canReceive, '达到限领后不应继续可领取').toBe(false);

    const userCoupons = await requestJson<UserCouponListData>(
      testInfo,
      'GET',
      Endpoints.shop.userCouponList,
      {
        token: accounts.mobileToken,
        headers: shopHeaders,
        query: { page: 1, limit: 100 },
        logName: '请求日志-优惠券-mobile我的券包.json',
        assertions: ['mobile 我的券包应包含刚领取的优惠券'],
      },
    );
    expect(userCoupons.body.code, 'mobile 我的券包业务 code 应为成功码').toBe(SUCCESS_CODE);
    const userCoupon = userCoupons.body.data?.list.find((coupon) => coupon.couponId === couponId);
    expect(userCoupon, 'mobile 我的券包应包含刚领取的优惠券').toBeTruthy();
    expect(userCoupon?.couponCodeId, '我的券包应返回同一个 couponCodeId').toBe(couponCodeId);
    expect(userCoupon?.name, '我的券包应展示券名称').toBe(couponName);
    expect(userCoupon?.displayStatus, '我的券包中该券应为未使用状态').toBe(1);

    const secondReceive = await requestJson<ReceiveCouponResult>(
      testInfo,
      'POST',
      Endpoints.shop.receiveCoupon(couponId),
      {
        token: accounts.mobileToken,
        headers: shopHeaders,
        logName: '请求日志-优惠券-mobile二次领取.json',
        assertions: ['每人限领 1 张时，mobile 二次领取应失败'],
      },
    );
    expect(secondReceive.body.code, '二次领取不应返回成功业务码').not.toBe(SUCCESS_CODE);
  });
});
