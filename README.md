# classinshop-test-suite

ClassIn 小店统一测试套件。以 pnpm + TypeScript + Playwright 为底座，集中承载工作区所有被测系统的测试能力：

- 接口自动化（后端 `classinshop-go` 的 `/api/v1` REST）
- Web/H5 端到端（`classinshop-web` 商家后台、`classinshop-mobile-web` H5 商城）
- 小程序自动化（`classinshop-miniprogram` 用户端、`classinshop-teacher-miniprogram` 教师端）
- 性能压测（k6，对关键接口做基准 / 负载 / 峰值）

## 能力分层

| 层           | 目录                                  | 说明                                                                            |
| ------------ | ------------------------------------- | ------------------------------------------------------------------------------- |
| 工程底座     | 根目录                                | pnpm workspace、TS、ESLint/Prettier、多环境 `.env.13/.14/.im`                   |
| 配置与环境   | `config/`                             | 环境域名、测试账号/令牌集中管理，按 `TEST_ENV` 切换                             |
| 公共能力     | `shared/`                             | HTTP 封装、登录取 JWT、接口类型/常量、数据工厂与清理、日志、Playwright fixtures |
| 接口自动化   | `tests/api/`                          | 登录、商品、下单、约课、退款、优惠券等正向/异常/边界用例                        |
| Web/H5 E2E   | `tests/e2e-web/`、`tests/e2e-mobile/` | Playwright + Page Object，桌面 / 移动仿真                                       |
| 小程序自动化 | `tests/miniprogram/`                  | miniprogram-automator 驱动微信编译产物，仅本地运行                              |
| 性能压测     | `perf/`                               | k6 脚本（独立运行时）                                                           |
| 报告与 CI    | `reports/`、`.gitlab-ci.yml`          | 统一 HTML/JUnit 报告，分环境触发 + 定时回归                                     |

详见架构图与规划：根目录之外的设计说明在 `docs/`。

## 快速开始

```bash
# 1. 安装依赖
pnpm setup
# 如已安装依赖，仅补装/更新 Playwright 浏览器驱动
pnpm install:browsers

# 2. 配置凭据（复制后填入真实值，.env.local 不会被提交）
cp .env.example .env.local

# 3. 运行接口自动化（默认 13 环境）
pnpm test:api
# 切换环境
TEST_ENV=14 pnpm test:api
# 按环境运行指定 API 用例
pnpm test:api -- --env 14 --file tests/api/api-demo.spec.ts
# 使用默认 Playwright HTML 报告并模拟发送企微通知
pnpm test:api -- --env 14 --file tests/api/api-demo.spec.ts --report --notify
# 测试结束后打开 Enhanced HTML 报告（默认主报告）
pnpm test:api -- --env 14 --file tests/api/api-demo.spec.ts --open
# 测试结束后额外生成 Allure HTML 报告
pnpm test:api -- --env 14 --file tests/api/api-demo.spec.ts --allure
# 生成 Allure HTML 报告并自动打开
pnpm test:api -- --env 14 --file tests/api/api-demo.spec.ts --allure --open
# 测试结束后模拟发送企微机器人通知
pnpm test:api -- --env 14 --file tests/api/api-demo.spec.ts --allure --notify

# 4. 运行 E2E
pnpm test:e2e:web
pnpm test:e2e:mobile
# 按环境运行指定 PC E2E 用例
pnpm test:e2e:web -- --env 14 --file tests/e2e-web/enter-shop.spec.ts --open

# 5. 查看报告
pnpm report:enhanced
pnpm report
pnpm report:allure
pnpm report:allure:open
```

更完整的运行说明（鉴权、店铺域名、小程序、k6、CI）见 [docs/run-guide.md](docs/run-guide.md)；
用例编写规范见 [docs/test-guidelines.md](docs/test-guidelines.md)。

## 常用脚本

| 命令                                           | 作用                                         |
| ---------------------------------------------- | -------------------------------------------- |
| `pnpm setup`                                   | 安装依赖并安装 Playwright 浏览器驱动         |
| `pnpm install:browsers`                        | 安装 / 更新 Playwright 浏览器驱动            |
| `pnpm test`                                    | 运行全部 Playwright 项目                     |
| `pnpm test:api`                                | 仅接口自动化                                 |
| `pnpm test:core`                               | 一次运行 API + PC Web + H5 Mobile 全量用例   |
| `pnpm test:core -- --env 14 --open`            | 14 环境跑 core 全量并打开 Enhanced 报告      |
| `pnpm test:api -- --env 14 --file tests/api/api-demo.spec.ts` | 按环境运行指定 API 用例             |
| `pnpm test:api -- --env 14 --file tests/api/api-demo.spec.ts --report --notify` | 打开默认 Playwright HTML 并模拟企微通知 |
| `pnpm test:api -- --env 14 --file tests/api/api-demo.spec.ts --open` | 打开 Enhanced HTML 报告（主报告） |
| `pnpm test:api -- --env 14 --file tests/api/api-demo.spec.ts --allure` | 测试结束后生成 Allure HTML 报告     |
| `pnpm test:api -- --env 14 --file tests/api/api-demo.spec.ts --allure --open` | 生成并打开 Allure HTML 报告 |
| `pnpm test:api -- --env 14 --file tests/api/api-demo.spec.ts --allure --notify` | 生成 Allure 后模拟企微通知 |
| `pnpm test:e2e:web` / `pnpm test:e2e:mobile`   | PC / H5 端到端，支持 `--env` / `--file` / `--open` / `--allure` |
| `pnpm test:e2e:web -- --env 14 --file tests/e2e-web/enter-shop.spec.ts --open` | 按环境运行指定 PC E2E 用例 |
| `pnpm test:mp`                                 | 小程序自动化（需 `RUN_MP=1` + 本地微信工具） |
| `pnpm report:enhanced`                         | 打开最近一次 Enhanced HTML 报告              |
| `pnpm report` / `pnpm report:allure:open`      | 打开 Playwright / Allure HTML 报告           |
| `pnpm perf:baseline` / `pnpm perf:order`       | k6 基准 / 负载压测                           |
| `pnpm codegen:api`                             | 从后端 swagger.json 生成接口类型             |
| `pnpm typecheck` / `pnpm lint` / `pnpm format` | 类型检查 / 代码检查 / 格式化                 |

## 设计原则

- 凭据零硬编码：真实账号/令牌只放 `.env.local`（已 gitignore），源码与提交物中不出现明文。
- 缺凭据自动跳过：未配置 token / 店铺域名时，相关用例 `skip` 而非整体失败，保证 CI 稳定。
- 数据自清理：用例创建的数据通过 `data` 登记表在结束后回收，避免污染被测环境。
- 单一 runner、单一报告：接口、E2E、小程序统一由 Playwright 编排，k6 因独立运行时单列。
