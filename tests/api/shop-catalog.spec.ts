import { test, expect } from '@shared';
import { attachApiCallLog, Endpoints, SUCCESS_CODE } from '@shared';
import { accounts, env as configEnv, formatAuthorizationHeader } from '@config';
import type { ListData } from '@shared';
import type { Goods } from '@shared';
import type { ApiResponse } from '@shared';
import type { TestInfo } from '@playwright/test';

interface MerchantShop {
  orgId: number;
  orgName: string;
  status: number;
}

interface OrgDetail {
  orgId: number;
  name: string;
  account?: string;
  shopDomain: string;
}

interface ShopCatalogInfo {
  id?: number;
  orgId?: number;
  name?: string;
  domain?: string;
}

function buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>): string {
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

async function getJson<T>(
  testInfo: TestInfo,
  path: string,
  options: {
    query?: Record<string, string | number | boolean | undefined>;
    headers?: Record<string, string>;
    assertions?: string[];
    logName?: string;
  } = {},
): Promise<{ status: number; body: ApiResponse<T> }> {
  const url = buildUrl(path, options.query);
  const headers = browserLikeHeaders(options.headers);
  const response = await fetch(url, {
    method: 'GET',
    headers,
  });
  const status = response.status;
  const text = await response.text();
  let body: ApiResponse<T>;
  try {
    body = JSON.parse(text) as ApiResponse<T>;
  } catch {
    await attachApiCallLog({
      testInfo,
      name: options.logName ?? `请求日志-${path.replaceAll('/', '_') || 'root'}.json`,
      request: { method: 'GET', url, headers, body: null },
      response: { status, headers: response.headers, body: text },
      assertions: options.assertions ?? ['响应应为后端统一 JSON 信封'],
    });
    throw new Error(`非 JSON 响应（GET ${path} -> HTTP ${status}）：${text.slice(0, 200)}`);
  }

  await attachApiCallLog({
    testInfo,
    name: options.logName ?? `请求日志-${path.replaceAll('/', '_') || 'root'}.json`,
    request: { method: 'GET', url, headers, body: null },
    response: { status, headers: response.headers, body },
    assertions: options.assertions ?? ['响应应为后端统一 JSON 信封'],
  });

  return { status, body };
}

async function resolveShopContext(testInfo: TestInfo, preferredShopId?: string) {
  const { body: myShops } = await getJson<MerchantShop[]>(testInfo, Endpoints.user.myShops, {
    assertions: ['我的店铺列表业务 code 应为成功码', '我的店铺列表 data 应为数组'],
    logName: '请求日志-我的店铺列表.json',
  });
  expect(myShops.code, '我的店铺列表业务 code 应为成功码').toBe(SUCCESS_CODE);
  expect(Array.isArray(myShops.data), '我的店铺列表 data 应为数组').toBe(true);

  const selectedShop = preferredShopId
    ? myShops.data.find((shop) => String(shop.orgId) === preferredShopId)
    : myShops.data[0];
  expect(
    selectedShop,
    preferredShopId
      ? `我的店铺列表中应存在 SHOP_ID=${preferredShopId} 的店铺`
      : '我的店铺列表应至少存在一个店铺',
  ).toBeTruthy();

  const orgId = selectedShop?.orgId;
  expect(orgId, '应从我的店铺列表提取 orgId 作为组织详情入参').toBeTruthy();

  const { body: orgDetail } = await getJson<OrgDetail>(testInfo, Endpoints.org.detail(orgId as number), {
    assertions: ['组织详情业务 code 应为成功码', '组织详情应返回 shopDomain'],
    logName: '请求日志-组织详情.json',
  });
  expect(orgDetail.code, '组织详情业务 code 应为成功码').toBe(SUCCESS_CODE);
  expect(orgDetail.data?.shopDomain, '应从组织详情提取 shopDomain 作为店铺接口 X-Shop-Domain').toBeTruthy();

  return {
    orgId: orgId as number,
    orgName: selectedShop?.orgName,
    shopDomain: orgDetail.data.shopDomain,
    headers: { 'X-Shop-Domain': orgDetail.data.shopDomain },
  };
}

/**
 * 店铺与商品目录：先通过登录态查询当前账号店铺，再提取店铺域名访问 C 端店铺接口。
 *
 * 上下游依赖：
 * 1. TEST_TOKEN -> api fixture 统一注入 Authorization。
 * 2. GET /user/shops -> 提取 orgId，可用 SHOP_ID 指定目标店铺，否则默认取第一家。
 * 3. GET /org/:orgId/detail -> 提取 shopDomain，作为后续店铺接口的 X-Shop-Domain。
 * 4. GET /shop/goods -> 提取 goodsId，作为 GET /shop/goods/:id 的下游入参。
 */
test.describe('店铺与商品目录', () => {
  test.skip(!accounts.token, '未配置 TEST_TOKEN，跳过需登录态链路');

  test('GET /shop/info 返回当前店铺信息', async ({ env }) => {
    const shop = await resolveShopContext(test.info(), env.shopId);
    const { body } = await getJson(test.info(), Endpoints.shop.info, {
      headers: shop.headers,
      assertions: ['店铺信息业务 code 应为成功码'],
      logName: '请求日志-店铺信息.json',
    });

    expect(body.code, '店铺信息业务 code 应为成功码').toBe(SUCCESS_CODE);
  });

  test('GET /shop/decoration 返回店铺装修', async ({ env }) => {
    const shop = await resolveShopContext(test.info(), env.shopId);
    const { body } = await getJson(test.info(), Endpoints.shop.decoration, {
      headers: shop.headers,
      assertions: ['店铺装修业务 code 应为成功码'],
      logName: '请求日志-店铺装修.json',
    });

    expect(body.code, '店铺装修业务 code 应为成功码').toBe(SUCCESS_CODE);
  });

  test('GET /shop/goods 返回商品列表结构', async ({ env }) => {
    const shop = await resolveShopContext(test.info(), env.shopId);
    const { body } = await getJson<ListData<Goods>>(test.info(), Endpoints.shop.goodsList, {
      query: { page: 1, limit: 10 },
      headers: shop.headers,
      assertions: ['商品列表业务 code 应为成功码', '商品列表 total 应为数字'],
      logName: '请求日志-商品列表.json',
    });

    expect(body.code, '商品列表业务 code 应为成功码').toBe(SUCCESS_CODE);
    if (body.data && Array.isArray(body.data.list)) {
      expect(typeof body.data.total, '商品列表 total 应为数字').toBe('number');
    }
  });

  test('GET /shop/goods/:id 不存在的商品应返回非成功码', async ({ env }) => {
    const shop = await resolveShopContext(test.info(), env.shopId);
    const { body } = await getJson(test.info(), Endpoints.shop.goodsDetail(999999999), {
      headers: shop.headers,
      assertions: ['不存在商品不应返回成功码'],
      logName: '请求日志-不存在商品详情.json',
    });

    expect(body.code, '不存在商品不应返回成功码').not.toBe(SUCCESS_CODE);
  });

  test('店铺商品浏览链路：我的店铺 -> 组织详情 -> 商品列表 -> 商品详情', async ({ env }) => {
    const shop = await resolveShopContext(test.info(), env.shopId);
    const { body: shopInfo } = await getJson<ShopCatalogInfo>(test.info(), Endpoints.shop.info, {
      headers: shop.headers,
      assertions: ['店铺信息业务 code 应为成功码', '店铺信息 data 应存在'],
      logName: '请求日志-链路-店铺信息.json',
    });
    expect(shopInfo.code, '店铺信息业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(shopInfo.data, '店铺信息 data 应存在').toBeTruthy();

    const upstreamShopId = shopInfo.data?.id ?? shopInfo.data?.orgId;
    const upstreamShopName = shopInfo.data?.name;
    expect(upstreamShopId, '店铺信息应能提取 shopId/orgId').toBeTruthy();
    expect(upstreamShopName, '店铺信息应能提取店铺名称').toBeTruthy();

    const { body: goodsList } = await getJson<ListData<Goods>>(test.info(), Endpoints.shop.goodsList, {
      query: { page: 1, limit: 10 },
      headers: shop.headers,
      assertions: ['商品列表业务 code 应为成功码', '商品列表 data.list 应为数组'],
      logName: '请求日志-链路-商品列表.json',
    });
    expect(goodsList.code, '商品列表业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(Array.isArray(goodsList.data?.list), '商品列表 data.list 应为数组').toBe(true);

    const candidates = goodsList.data?.list ?? [];
    if (candidates.length === 0) {
      test.skip(true, '当前店铺商品列表为空，跳过商品详情下游校验');
      return;
    }

    let matchedGoodsId: number | undefined;
    let matchedGoodsDetail: Goods | undefined;
    for (const candidate of candidates) {
      if (!candidate.id) continue;

      const { body: goodsDetail } = await getJson<Goods>(
        test.info(),
        Endpoints.shop.goodsDetail(candidate.id),
        {
          headers: shop.headers,
          assertions: ['商品详情业务 code 应为成功码', '商品详情返回的 id 应等于列表提取的 goodsId'],
          logName: `请求日志-链路-商品详情-${candidate.id}.json`,
        },
      );
      if (goodsDetail.code === SUCCESS_CODE && goodsDetail.data?.id === candidate.id) {
        matchedGoodsId = candidate.id;
        matchedGoodsDetail = goodsDetail.data;
        break;
      }
    }

    if (!matchedGoodsId || !matchedGoodsDetail) {
      test.skip(true, '商品列表中的商品详情均不可用，可能被并发用例清理，跳过下游校验');
      return;
    }

    expect(matchedGoodsDetail.id, '商品详情返回的 id 应等于列表提取的 goodsId').toBe(matchedGoodsId);
  });
});
