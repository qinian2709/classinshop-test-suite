import { env, formatAuthorizationHeader } from '../../config/index.js';

/**
 * 真实前端浏览器指纹头。被测环境前置 WAF 会拦截"非浏览器"特征的请求（返回 nginx 403），
 * 故接口请求需带上 Origin/Referer/User-Agent/Accept 等头，模拟真实 C 端/后台调用。
 * Origin/Referer 取店铺站点域名（与后端同属 *.eeo.im，命中 same-site 放行）。
 */
const DEFAULT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';

export function browserHeaders(): Record<string, string> {
  const origin = (env.shopHost || env.webBaseURL || '').replace(/\/$/, '');
  return {
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'User-Agent': process.env.TEST_USER_AGENT || DEFAULT_UA,
    ...(origin ? { Origin: origin, Referer: `${origin}/` } : {}),
  };
}

/** 鉴权头：兼容 TEST_TOKEN 为裸 JWT 或完整 Bearer 值。 */
export function authHeader(token: string): Record<string, string> {
  return token ? { Authorization: formatAuthorizationHeader(token) } : {};
}
