import { test, expect } from '@shared';
import { Endpoints, SUCCESS_CODE } from '@shared';
import { accounts } from '@config';

interface ShopSummary {
  id?: number;
  name?: string;
  domain?: string;
}

interface ApiDemoResponse {
  code: number;
  msg: string;
  data: ShopSummary[];
}

function headersToRecord(source: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  source.forEach((value, key) => {
    result[key.toLowerCase()] = value;
  });
  return result;
}

function redactResponseHeaders(headers: Record<string, string>): Record<string, string> {
  const redacted = { ...headers };
  if (redacted['set-cookie']) redacted['set-cookie'] = '<masked>';
  return redacted;
}

test.describe('API Demo：14 环境我的店铺接口 @smoke', () => {
  test('GET /user/shops 返回当前账号可管理的店铺列表', async ({ env }) => {
    test.skip(env.name !== '14', `该 demo 使用 14 环境，请通过 TEST_ENV=14 运行，当前为 ${env.name}`);
    test.skip(!accounts.token, '该 demo 需要通过 TEST_TOKEN 提供登录后的 JWT');
    test.skip(!process.env.TEST_COOKIE, '该 demo 按浏览器 curl 复现，需要通过 TEST_COOKIE 提供 Cookie');

    const url = `${env.apiBaseURL}${Endpoints.user.myShops}`;
    const requestHeaders = {
      accept: 'application/json, text/plain, */*',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      authorization: '<masked>',
      'cache-control': 'no-cache',
      cookie: '<masked>',
      origin: env.shopHost,
      pragma: 'no-cache',
      referer: `${env.shopHost}/`,
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-site',
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    };
    const actualHeaders = {
      ...requestHeaders,
      authorization: accounts.token,
      cookie: process.env.TEST_COOKIE ?? '',
    };
    const response = await fetch(url, {
      method: 'GET',
      headers: actualHeaders,
    });
    const status = response.status;
    const headers = headersToRecord(response.headers);
    const body = (await response.json()) as ApiDemoResponse;

    await test.info().attach('api-call.json', {
      contentType: 'application/json',
      body: JSON.stringify(
        {
          request: {
            method: 'GET',
            url,
            headers: requestHeaders,
            body: null,
          },
          response: {
            status,
            headers: redactResponseHeaders(headers),
            body,
          },
          assertions: ['HTTP status is 200', 'business code is 0', 'data is an array'],
        },
        null,
        2,
      ),
    });

    expect(status).toBe(200);
    expect(body.code).toBe(SUCCESS_CODE);
    expect(Array.isArray(body.data)).toBe(true);

    test.info().annotations.push({
      type: 'api-demo',
      description: `GET ${env.apiBaseURL}${Endpoints.user.myShops} -> ${body.data.length} shops`,
    });
  });
});
