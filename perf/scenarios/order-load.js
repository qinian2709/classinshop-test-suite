import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend } from 'k6/metrics';
import { config, headers } from '../lib/config.js';

// 负载 + 峰值：对 C 端高频只读链路（店铺信息 / 商品列表）施压。
// 需要 MOBILE_BASE_URL（命中 GetShopByDomain），可选 TOKEN。
// 运行：k6 run perf/scenarios/order-load.js -e MOBILE_BASE_URL=https://demo.shop13.eeo.im
const goodsListTrend = new Trend('goods_list_duration', true);

export const options = {
  scenarios: {
    // 阶段一：负载——逐步爬升到 50 VU 维持
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 20 },
        { duration: '1m', target: 50 },
        { duration: '30s', target: 0 },
      ],
      gracefulStop: '10s',
    },
    // 阶段二：峰值——短时冲高到 150 VU（延迟 2m30s 启动，错峰）
    spike: {
      executor: 'ramping-vus',
      startTime: '2m30s',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 150 },
        { duration: '20s', target: 150 },
        { duration: '10s', target: 0 },
      ],
      gracefulStop: '10s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<1500'],
    goods_list_duration: ['p(95)<1200'],
  },
};

export default function () {
  group('shop info', function () {
    const res = http.get(`${config.baseURL}/shop/info`, { headers: headers() });
    check(res, { 'shop info 200': (r) => r.status === 200 });
  });

  group('goods list', function () {
    const res = http.get(`${config.baseURL}/shop/goods?page=1&limit=10`, { headers: headers() });
    goodsListTrend.add(res.timings.duration);
    check(res, { 'goods list 200': (r) => r.status === 200 });
  });

  sleep(Math.random() * 2);
}
