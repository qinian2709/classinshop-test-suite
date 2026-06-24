import { test, expect } from '@shared';
import { attachApiCallLog, Endpoints, SUCCESS_CODE } from '@shared';
import { accounts, formatAuthorizationHeader } from '@config';

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

test.describe('API Demo：14 环境我的店铺接口 @smoke', () => {
  test('GET /user/shops 返回当前账号可管理的店铺列表', async ({ env }) => {
    test.skip(env.name !== '14', `该 demo 使用 14 环境，请通过 TEST_ENV=14 运行，当前为 ${env.name}`);
    test.skip(!accounts.token, '该 demo 需要通过 TEST_TOKEN 提供登录后的 JWT');

    const url = `${env.apiBaseURL}${Endpoints.user.myShops}`;
    const requestHeaders = {
      accept: 'application/json, text/plain, */*',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      authorization: '<masked>',
      'cache-control': 'no-cache',
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
      authorization: formatAuthorizationHeader(accounts.token),
    };
    const response = await fetch(url, {
      method: 'GET',
      headers: actualHeaders,
    });
    const status = response.status;
    const body = (await response.json()) as ApiDemoResponse;

    await attachApiCallLog({
      testInfo: test.info(),
      request: {
        method: 'GET',
        url,
        headers: requestHeaders,
        body: null,
      },
      response: {
        status,
        headers: response.headers,
        body,
      },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', 'data 应为店铺列表数组'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(Array.isArray(body.data), 'data 应为店铺列表数组').toBe(true);

    test.info().annotations.push({
      type: 'api-demo',
      description: `GET ${env.apiBaseURL}${Endpoints.user.myShops} -> ${body.data.length} shops`,
    });
  });
});
