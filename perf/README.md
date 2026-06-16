# 性能压测（k6）

使用 [k6](https://k6.io/) 对后端关键接口做基准 / 负载 / 峰值压测。k6 使用自带 JS 运行时（非 Node），脚本独立于 `shared/`。

## 安装 k6

```bash
# macOS
brew install k6
# 其他平台见 https://grafana.com/docs/k6/latest/set-up/install-k6/
```

## 运行

```bash
# 基准（默认 13 环境）
pnpm perf:baseline
# 或显式指定环境与 token
k6 run perf/scenarios/api-baseline.js -e K6_ENV=14 -e TOKEN=<accessToken>

# 负载 + 峰值（需要店铺域名）
k6 run perf/scenarios/order-load.js -e K6_ENV=13 -e SHOP_DOMAIN=https://demo.shop13.eeo.im
```

## 环境变量

| 变量          | 说明                                            | 默认             |
| ------------- | ----------------------------------------------- | ---------------- |
| `K6_ENV`      | 环境 `13` / `14` / `im`                         | `13`             |
| `API_HOST`    | 覆盖 API 域名                                   | 由 `K6_ENV` 推导 |
| `TOKEN`       | accessToken（压受保护接口时需要）               | 空               |
| `SHOP_DOMAIN` | 店铺域名（`X-Shop-Domain`，命中按域名识别店铺） | 空               |

## 阈值（thresholds）

- `api-baseline.js`：错误率 < 1%，p95 < 800ms
- `order-load.js`：错误率 < 5%，p95 < 1500ms，商品列表 p95 < 1200ms

阈值未达标时 k6 以非零码退出，可直接作为 CI 红线。

## 输出报告

```bash
# 生成 JSON / 摘要报告（结果目录已 gitignore）
mkdir -p perf/results
k6 run --summary-export perf/results/baseline-summary.json perf/scenarios/api-baseline.js
```
