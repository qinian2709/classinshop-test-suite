// k6 运行时配置（k6 使用自带 JS 运行时，非 Node，故独立于 shared/）。
// 通过环境变量注入：K6_ENV(13|14|im)、TOKEN、MOBILE_BASE_URL。

const HOSTS = {
  13: 'https://dynamic-shop13.eeo.im',
  14: 'https://dynamic-shop14.eeo.im',
  im: 'https://dynamic-shop.eeo.im',
};

const envName = __ENV.K6_ENV || '13';
const apiHost = __ENV.API_HOST || HOSTS[envName] || HOSTS['13'];

export const config = {
  envName,
  apiHost,
  baseURL: `${apiHost}/api/v1`,
  token: __ENV.TOKEN || '',
  shopDomain: __ENV.MOBILE_BASE_URL || '',
};

export function headers() {
  const h = { 'Content-Type': 'application/json' };
  if (config.token) h['Authorization'] = `Bearer ${config.token}`;
  if (config.shopDomain) h['X-Shop-Domain'] = config.shopDomain;
  return h;
}
