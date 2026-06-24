import { accounts } from '../../config/index.js';
import { ApiClient } from '../http/client.js';
import { SUCCESS_CODE } from '../http/types.js';
import { Endpoints } from '../api/endpoints.js';
import type { LoginResult } from '../api/types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('auth');

let cachedToken: string | null = null;

/**
 * 通过签名登录获取 accessToken（POST /api/v1/user/loginbysign）。
 * 请求体见 requests.LoginBySignRequest：eeoUid / signKey / timestamp / device。
 */
export async function signLogin(client = new ApiClient()): Promise<LoginResult> {
  const { eeoUid, signKey, timestamp, device } = accounts.sign;
  const resp = await client.post<LoginResult>(Endpoints.user.loginBySign, {
    eeoUid,
    signKey,
    timestamp,
    device,
  });
  if (resp.code !== SUCCESS_CODE || !resp.data?.accessToken) {
    throw new Error(`签名登录失败：code=${resp.code} msg=${resp.msg}`);
  }
  return resp.data;
}

/**
 * 解析可用的 accessToken：
 * 1. 若 .env.local 提供 TEST_TOKEN，直接使用（CI 推荐，最稳定）；
 * 2. 否则用签名凭据走 loginbysign 换取，并缓存。
 */
export async function getAccessToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedToken) return cachedToken;

  if (accounts.token) {
    cachedToken = accounts.token;
    log.info('使用 .env.local 中的 TEST_TOKEN');
    return cachedToken;
  }

  const { eeoUid, signKey, timestamp } = accounts.sign;
  if (!eeoUid || !signKey || !timestamp) {
    throw new Error(
      '未配置鉴权凭据：请在 .env.local 设置 TEST_TOKEN，或设置 TEST_EEO_UID/TEST_SIGN_KEY/TEST_SIGN_TIMESTAMP',
    );
  }

  const result = await signLogin();
  cachedToken = result.accessToken;
  log.info('签名登录成功，已缓存 accessToken');
  return cachedToken;
}

/** 返回一个已注入 token 的 ApiClient（供数据准备/清理使用）。 */
export async function createAuthedClient(): Promise<ApiClient> {
  const token = await getAccessToken();
  return new ApiClient({ token });
}

export function resetTokenCache(): void {
  cachedToken = null;
}
