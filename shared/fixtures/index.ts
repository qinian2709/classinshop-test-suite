import { test as base, expect } from '@playwright/test';
import { env, accounts, formatAuthorizationHeader, hasApiCredential } from '../../config/index.js';
import { getAccessToken } from '../auth/login.js';
import { DataRegistry } from '../data/cleanup.js';
import { ApiHelper } from './api-helper.js';

export interface ApiFixtures {
  /** 当前被测环境信息 */
  env: typeof env;
  /** 已登录用户的 accessToken */
  token: string;
  /** 匿名（未鉴权）接口助手，仅注入 X-Shop-Domain */
  anonApi: ApiHelper;
  /** 已鉴权接口助手，注入 Authorization + X-Shop-Domain */
  api: ApiHelper;
  /** 测试数据登记表，结束后自动清理 */
  data: DataRegistry;
}

function shopHeaders(): Record<string, string> {
  return env.shopDomain ? { 'X-Shop-Domain': env.shopDomain } : {};
}

function browserLikeHeaders(): Record<string, string> {
  return {
    accept: 'application/json, text/plain, */*',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'cache-control': 'no-cache',
    origin: env.shopHost,
    pragma: 'no-cache',
    referer: `${env.shopHost}/`,
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    'user-agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  };
}

export const test = base.extend<ApiFixtures>({
  env: async ({}, use) => {
    await use(env);
  },

  token: async ({}, use) => {
    if (!hasApiCredential()) {
      // 没有任何鉴权凭据时跳过依赖 token 的用例，而非整体失败。
      test.skip(true, '未配置鉴权凭据（TEST_TOKEN 或签名），跳过需登录用例');
    }
    const token = await getAccessToken();
    await use(token);
  },

  anonApi: async ({}, use) => {
    await use(new ApiHelper(env.apiBaseURL, { ...browserLikeHeaders(), ...shopHeaders() }));
  },

  api: async ({ token }, use) => {
    await use(
      new ApiHelper(env.apiBaseURL, {
        ...browserLikeHeaders(),
        authorization: formatAuthorizationHeader(token),
        ...shopHeaders(),
      }),
    );
  },

  data: async ({}, use) => {
    const registry = new DataRegistry();
    await use(registry);
    await registry.runAll();
  },
});

export { expect, accounts, env, ApiHelper };
