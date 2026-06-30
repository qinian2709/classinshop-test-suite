/** 测试账号与凭据集中管理。真实值通过 .env.local 注入，源码中不出现明文。 */
import './env.js';

function get(key: string, fallback = ''): string {
  return (process.env[key] ?? fallback).trim();
}

/** 签名登录凭据（对应 POST /api/v1/user/loginbysign）。 */
export interface SignCredential {
  eeoUid: string;
  signKey: string;
  timestamp: string;
  device: string;
}

export interface Accounts {
  /** 直接提供的 accessToken，优先级最高，CI 推荐。 */
  token: string;
  /** H5/C 端用户 accessToken，用于与商家后台 token 分离的场景。 */
  mobileToken: string;
  /** 微信小程序 UI 自动化专用凭据，区分用户端与教师端。 */
  miniprogram: {
    userToken: string;
    teacherToken: string;
  };
  /** 签名登录凭据，token 为空时使用。 */
  sign: SignCredential;
  /** E2E UI 登录账号（如站点支持账号密码）。 */
  e2e: {
    username: string;
    password: string;
  };
}

export const accounts: Accounts = {
  token: get('TEST_TOKEN'),
  mobileToken: get('MOBILE_TEST_TOKEN', get('C_END_TEST_TOKEN')),
  miniprogram: {
    userToken: get('MINIPROGRAM_USER_TEST_TOKEN'),
    teacherToken: get('MINIPROGRAM_TEACHER_TEST_TOKEN'),
  },
  sign: {
    eeoUid: get('TEST_EEO_UID'),
    signKey: get('TEST_SIGN_KEY'),
    timestamp: get('TEST_SIGN_TIMESTAMP'),
    device: get('TEST_DEVICE', 'test-suite'),
  },
  e2e: {
    username: get('E2E_USERNAME'),
    password: get('E2E_PASSWORD'),
  },
};

/** 是否具备可用于鉴权的凭据（token 或完整签名）。 */
export function hasApiCredential(): boolean {
  if (accounts.token) return true;
  const { eeoUid, signKey, timestamp } = accounts.sign;
  return Boolean(eeoUid && signKey && timestamp);
}

export function formatAuthorizationHeader(token: string): string {
  return token.toLowerCase().startsWith('bearer ') ? token : `Bearer ${token}`;
}
