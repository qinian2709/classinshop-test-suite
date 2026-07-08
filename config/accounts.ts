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

/** 白名单手机号登录凭据（对应 POST /api/v1/user/loginbywhiteuser，用于接口巡检）。 */
export interface WhiteUserCredential {
  phoneNumber: string;
  nationCode: string;
}

export interface Accounts {
  /** 商家/教师端 accessToken（TEST_TOKEN 或白名单登录后写入）。 */
  token: string;
  /** H5/C 端用户 accessToken（MOBILE_TEST_TOKEN 或白名单登录后写入）。 */
  mobileToken: string;
  /** 微信小程序 UI 自动化专用凭据，区分用户端与教师端。 */
  miniprogram: {
    userToken: string;
    teacherToken: string;
  };
  /** 签名登录凭据，token 为空时使用。 */
  sign: SignCredential;
  /** 商家/教师端白名单手机号（对应 TEST_TOKEN / MINIPROGRAM_TEACHER_TEST_TOKEN）。 */
  whiteUser: WhiteUserCredential;
  /** 用户/C 端白名单手机号（对应 MOBILE_TEST_TOKEN / MINIPROGRAM_USER_TEST_TOKEN）。 */
  mobileWhiteUser: WhiteUserCredential;
  /** E2E UI 登录账号（如站点支持账号密码）。 */
  e2e: {
    username: string;
    password: string;
  };
}

/** 运行时可被 resolveAuthTokens 回填 token，故使用可变对象。 */
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
  whiteUser: {
    phoneNumber: get('TEST_PHONE_NUMBER'),
    nationCode: get('TEST_NATION_CODE', '86'),
  },
  mobileWhiteUser: {
    phoneNumber: get('MOBILE_TEST_PHONE_NUMBER'),
    nationCode: get('MOBILE_TEST_NATION_CODE', '86'),
  },
  e2e: {
    username: get('E2E_USERNAME'),
    password: get('E2E_PASSWORD'),
  },
};

/** 是否配置了商家/教师端白名单手机号。 */
export function hasWhiteUserCredential(): boolean {
  return Boolean(accounts.whiteUser.phoneNumber);
}

/** 是否配置了用户/C 端白名单手机号。 */
export function hasMobileWhiteUserCredential(): boolean {
  return Boolean(accounts.mobileWhiteUser.phoneNumber);
}

/** 是否具备商家/教师端鉴权凭据（token、白名单手机号或完整签名）。 */
export function hasApiCredential(): boolean {
  if (accounts.token) return true;
  if (hasWhiteUserCredential()) return true;
  const { eeoUid, signKey, timestamp } = accounts.sign;
  return Boolean(eeoUid && signKey && timestamp);
}

/** 是否具备用户/C 端鉴权凭据（mobile token 或白名单手机号）。 */
export function hasMobileCredential(): boolean {
  if (accounts.mobileToken) return true;
  return hasMobileWhiteUserCredential();
}

export function formatAuthorizationHeader(token: string): string {
  return token.toLowerCase().startsWith('bearer ') ? token : `Bearer ${token}`;
}
