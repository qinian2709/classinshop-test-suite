import { test as base, request as playwrightRequest, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { env, accounts, hasApiCredential } from '../../config/index.js';
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
    const ctx: APIRequestContext = await playwrightRequest.newContext({
      baseURL: env.apiBaseURL,
      ignoreHTTPSErrors: true,
      extraHTTPHeaders: { 'Content-Type': 'application/json', ...shopHeaders() },
    });
    await use(new ApiHelper(ctx));
    await ctx.dispose();
  },

  api: async ({ token }, use) => {
    const ctx: APIRequestContext = await playwrightRequest.newContext({
      baseURL: env.apiBaseURL,
      ignoreHTTPSErrors: true,
      extraHTTPHeaders: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...shopHeaders(),
      },
    });
    await use(new ApiHelper(ctx));
    await ctx.dispose();
  },

  data: async ({}, use) => {
    const registry = new DataRegistry();
    await use(registry);
    await registry.runAll();
  },
});

export { expect, accounts, env, ApiHelper };
