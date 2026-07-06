import { accounts, env as configEnv, formatAuthorizationHeader } from '@config';
import { Endpoints, SUCCESS_CODE } from '@shared';
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

interface MobileGoodsItem {
  id?: number;
  name?: string;
  title?: string;
  status?: number;
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

export async function findPublishedMobileGoods(
  testInfo: TestInfo,
  shop: Pick<MobileShopContext, 'shopDomain'>,
): Promise<MobileGoodsSummary> {
  const headers = { 'X-Shop-Domain': shop.shopDomain };
  const list = await requestMobileJson<ListData<MobileGoodsItem>>(testInfo, 'GET', Endpoints.shop.goodsList, {
    headers,
    query: { page: 1, limit: 20 },
    logName: '请求日志-H5-商品列表.json',
    assertions: ['H5 商品列表应返回可访问商品'],
  });
  if (list.body.code !== SUCCESS_CODE || !Array.isArray(list.body.data?.list)) {
    throw new Error(`H5 商品列表接口未成功：code=${list.body.code}, msg=${list.body.msg}`);
  }

  for (const item of list.body.data.list) {
    if (!item.id) continue;
    const detail = await requestMobileJson<MobileGoodsItem>(testInfo, 'GET', Endpoints.shop.goodsDetail(item.id), {
      headers,
      logName: `请求日志-H5-商品详情-${item.id}.json`,
      assertions: ['候选商品详情应可访问，避免并发删除导致误报'],
    });
    if (detail.body.code === SUCCESS_CODE && detail.body.data?.id) {
      const name = detail.body.data.name || detail.body.data.title || item.name || item.title;
      if (name) return { id: detail.body.data.id, name };
    }
  }

  throw new Error('当前 H5 店铺未找到可访问的上架商品，无法执行商品 UI 用例');
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
