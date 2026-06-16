import http from 'k6/http';
import { check, sleep } from 'k6';
import { config, headers } from '../lib/config.js';

// 基准（smoke）：低并发验证关键只读接口的基本性能与正确性。
// 运行：k6 run perf/scenarios/api-baseline.js  （可加 -e K6_ENV=14 -e TOKEN=xxx）
export const options = {
  vus: 1,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<800'],
  },
};

export default function () {
  const res = http.get(`${config.baseURL}/system/info`, { headers: headers() });
  check(res, {
    'status is 200': (r) => r.status === 200,
    '业务 code 为 0': (r) => {
      try {
        return r.json('code') === 0;
      } catch (_e) {
        return false;
      }
    },
  });
  sleep(1);
}
