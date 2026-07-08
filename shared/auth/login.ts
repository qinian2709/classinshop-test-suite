import { accounts } from '../../config/index.js';
import type { WhiteUserCredential } from '../../config/accounts.js';
import { ApiClient } from '../http/client.js';
import { SUCCESS_CODE } from '../http/types.js';
import { Endpoints } from '../api/endpoints.js';
import type { LoginResult } from '../api/types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('auth');

let resolvePromise: Promise<void> | null = null;

function envHas(key: string): boolean {
  return Boolean((process.env[key] ?? '').trim());
}

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
 * 通过白名单手机号登录获取 accessToken（POST /api/v1/user/loginbywhiteuser）。
 * 用户须在 `inspection_login` 白名单中，见 classinshop-go/scripts/init_web_config.sql。
 */
export async function whiteUserLogin(
  credential: WhiteUserCredential,
  client = new ApiClient(),
): Promise<LoginResult> {
  const resp = await client.post<LoginResult>(Endpoints.user.loginByWhiteUser, {
    phone_number: credential.phoneNumber,
    nation_code: credential.nationCode,
  });
  if (resp.code !== SUCCESS_CODE || !resp.data?.accessToken) {
    throw new Error(
      `白名单登录失败（${credential.phoneNumber}）：code=${resp.code} msg=${resp.msg}`,
    );
  }
  return resp.data;
}

async function resolveMerchantToken(client: ApiClient): Promise<void> {
  if (envHas('TEST_TOKEN')) {
    log.info('商家/教师端：使用 TEST_TOKEN');
    return;
  }

  const { phoneNumber } = accounts.whiteUser;
  if (phoneNumber) {
    const result = await whiteUserLogin(accounts.whiteUser, client);
    accounts.token = result.accessToken;
    log.info('商家/教师端：白名单手机号登录成功');
    return;
  }

  const { eeoUid, signKey, timestamp } = accounts.sign;
  if (eeoUid && signKey && timestamp) {
    const result = await signLogin(client);
    accounts.token = result.accessToken;
    log.info('商家/教师端：签名登录成功');
    return;
  }
}

async function resolveMobileToken(client: ApiClient): Promise<void> {
  if (envHas('MOBILE_TEST_TOKEN') || envHas('C_END_TEST_TOKEN')) {
    log.info('用户端：使用 MOBILE_TEST_TOKEN');
    return;
  }

  const { phoneNumber } = accounts.mobileWhiteUser;
  if (!phoneNumber) return;

  try {
    const result = await whiteUserLogin(accounts.mobileWhiteUser, client);
    accounts.mobileToken = result.accessToken;
    log.info('用户端：白名单手机号登录成功');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn(`用户端：白名单登录跳过（${message}）；依赖 MOBILE_TEST_TOKEN 的用例将自动 skip`);
  }
}

function applyMiniprogramTokenFallbacks(): void {
  if (!envHas('MINIPROGRAM_TEACHER_TEST_TOKEN') && accounts.token) {
    accounts.miniprogram.teacherToken = accounts.token;
  }
  if (!envHas('MINIPROGRAM_USER_TEST_TOKEN') && accounts.mobileToken) {
    accounts.miniprogram.userToken = accounts.mobileToken;
  }
}

/**
 * 解析商家/教师端与用户端 token（各最多登录 1 次），并写回 accounts 供全项目复用。
 * - 商家/教师：TEST_TOKEN → TEST_PHONE_NUMBER → 签名登录
 * - 用户/C 端：MOBILE_TEST_TOKEN → MOBILE_TEST_PHONE_NUMBER
 * - 小程序 token 未显式配置时，分别回落到同侧 token
 */
export async function resolveAuthTokens(forceRefresh = false): Promise<void> {
  if (forceRefresh) {
    resolvePromise = null;
  }
  if (resolvePromise) {
    await resolvePromise;
    return;
  }

  resolvePromise = (async () => {
    const client = new ApiClient();
    await Promise.all([resolveMerchantToken(client), resolveMobileToken(client)]);
    applyMiniprogramTokenFallbacks();
  })();

  await resolvePromise;
}

/**
 * 解析商家/教师端 accessToken（会先执行 resolveAuthTokens）。
 */
export async function getAccessToken(forceRefresh = false): Promise<string> {
  await resolveAuthTokens(forceRefresh);

  if (accounts.token) return accounts.token;

  throw new Error(
    '未配置商家/教师端鉴权凭据：请设置 TEST_TOKEN，或 TEST_PHONE_NUMBER/TEST_NATION_CODE，或 TEST_EEO_UID/TEST_SIGN_KEY/TEST_SIGN_TIMESTAMP',
  );
}

/**
 * 解析用户/C 端 accessToken（会先执行 resolveAuthTokens）。
 */
export async function getMobileAccessToken(forceRefresh = false): Promise<string> {
  await resolveAuthTokens(forceRefresh);

  if (accounts.mobileToken) return accounts.mobileToken;

  throw new Error(
    '未配置用户端鉴权凭据：请设置 MOBILE_TEST_TOKEN，或 MOBILE_TEST_PHONE_NUMBER/MOBILE_TEST_NATION_CODE',
  );
}

/** 返回一个已注入 token 的 ApiClient（供数据准备/清理使用）。 */
export async function createAuthedClient(): Promise<ApiClient> {
  const token = await getAccessToken();
  return new ApiClient({ token });
}

export function resetTokenCache(): void {
  resolvePromise = null;
}
