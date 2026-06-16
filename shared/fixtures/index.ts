import { test as base, expect } from '@playwright/test';
import { env, accounts, hasApiCredential } from '../../config/index.js';
import { getAccessToken } from '../auth/login.js';
import { DataRegistry } from '../data/cleanup.js';
import { browserHeaders, authHeader } from '../http/browser-headers.js';
import { ApiHelper } from './api-helper.js';

export interface ApiWorkerFixtures {
  /** 已登录 token（worker 级，避免每个用例重复登录） */
  workerToken: string;
}

export interface ApiFixtures {
  /** 当前被测环境信息 */
  env: typeof env;
  /** 已登录用户的 accessToken */
  token: string;
  /** 匿名（未鉴权）接口助手，仅注入浏览器指纹头 + X-Shop-Domain */
  anonApi: ApiHelper;
  /** 已鉴权接口助手，注入 Authorization + 浏览器指纹头 + X-Shop-Domain */
  api: ApiHelper;
  /** 测试数据登记表，结束后自动清理 */
  data: DataRegistry;
}

function shopHeaders(): Record<string, string> {
  return env.shopDomain ? { 'X-Shop-Domain': env.shopDomain } : {};
}

/**
 * 接口助手基于 Node fetch（keep-alive 复用连接）。被测环境 WAF 会拦截高频新建连接，
 * 故不使用 Playwright APIRequestContext（其在 test runner 下倾向每请求新建连接，触发 403）。
 */
export const test = base.extend<ApiFixtures, ApiWorkerFixtures>({
  workerToken: [
    async ({}, use) => {
      const token = hasApiCredential() ? await getAccessToken() : '';
      await use(token);
    },
    { scope: 'worker' },
  ],

  env: async ({}, use) => {
    await use(env);
  },

  token: async ({ workerToken }, use) => {
    if (!hasApiCredential()) {
      test.skip(true, '未配置鉴权凭据（TEST_TOKEN 或签名），跳过需登录用例');
    }
    await use(workerToken);
  },

  anonApi: async ({}, use) => {
    const helper = new ApiHelper(env.apiBaseURL, {
      'Content-Type': 'application/json',
      ...browserHeaders(),
      ...shopHeaders(),
    });
    await use(helper);
  },

  api: async ({ workerToken }, use) => {
    if (!hasApiCredential()) {
      test.skip(true, '未配置鉴权凭据（TEST_TOKEN 或签名），跳过需登录用例');
    }
    const helper = new ApiHelper(env.apiBaseURL, {
      'Content-Type': 'application/json',
      ...browserHeaders(),
      ...authHeader(workerToken),
      ...shopHeaders(),
    });
    await use(helper);
  },

  data: async ({}, use) => {
    const registry = new DataRegistry();
    await use(registry);
    await registry.runAll();
  },
});

export { expect, accounts, env, ApiHelper };
