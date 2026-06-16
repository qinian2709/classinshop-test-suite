import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

export type EnvName = '13' | '14' | 'im';

const ROOT = process.cwd();

function loadEnvFile(file: string): void {
  const full = path.join(ROOT, file);
  if (fs.existsSync(full)) {
    // override:false → 已存在的变量不被覆盖，故 shell 显式传参 > .env.local > 环境域名文件。
    dotenv.config({ path: full, override: false });
  }
}

// 先加载 .env.local（含真实凭据，可选地设置 TEST_ENV），再据此决定环境域名文件。
loadEnvFile('.env.local');

/** 被测环境，默认 13。可用 shell 传参 TEST_ENV=14，或在 .env.local 写 TEST_ENV=14。 */
export const TEST_ENV: EnvName = ((): EnvName => {
  const raw = (process.env.TEST_ENV ?? '13').trim();
  if (raw === '13' || raw === '14' || raw === 'im') return raw;
  throw new Error(`非法 TEST_ENV=${raw}，仅支持 13 | 14 | im`);
})();

// 再加载对应环境的域名文件与通用 .env。
loadEnvFile(`.env.${TEST_ENV}`);
loadEnvFile('.env');

function get(key: string, fallback = ''): string {
  return (process.env[key] ?? fallback).trim();
}

function required(key: string): string {
  const value = get(key);
  if (!value) {
    throw new Error(`缺少必需的环境变量 ${key}（请在 .env.${TEST_ENV} 或 .env.local 中配置）`);
  }
  return value;
}

export interface EnvConfig {
  name: EnvName;
  /** 后端 API 域名，如 https://dynamic-shop13.eeo.im */
  apiHost: string;
  /** 后端 API 基础路径，如 https://dynamic-shop13.eeo.im/api/v1 */
  apiBaseURL: string;
  /** 商家后台站点域名 */
  shopHost: string;
  /** 登录中心域名 */
  loginOrigin: string;
  /** 静态资源域名 */
  staticHost: string;
  /** 被测店铺域名（X-Shop-Domain 头） */
  shopDomain: string;
  /** 被测店铺 ID（/shop/:shopId 接口） */
  shopId: string;
  /** PC 后台 E2E 基础地址 */
  webBaseURL: string;
  /** H5 E2E 基础地址 */
  mobileBaseURL: string;
}

export const env: EnvConfig = {
  name: TEST_ENV,
  apiHost: required('API_HOST'),
  apiBaseURL: `${required('API_HOST')}/api/v1`,
  shopHost: get('SHOP_HOST'),
  loginOrigin: get('LOGIN_ORIGIN'),
  staticHost: get('STATIC_HOST'),
  shopDomain: get('SHOP_DOMAIN'),
  shopId: get('SHOP_ID'),
  webBaseURL: get('WEB_BASE_URL', get('SHOP_HOST')),
  mobileBaseURL: get('MOBILE_BASE_URL', get('SHOP_DOMAIN')),
};
