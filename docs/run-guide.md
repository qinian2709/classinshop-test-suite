# 运行手册

## 1. 前置环境

- Node.js >= 18.18（建议 20+）
- pnpm（`corepack enable` 即可）
- 浏览器（E2E）：`pnpm exec playwright install --with-deps`
- k6（性能）：`brew install k6`，详见 [perf/README.md](../perf/README.md)
- 微信开发者工具（小程序）：见下文第 6 节

## 2. 环境与凭据

环境域名已按 `TEST_ENV` 预置在 `.env.13` / `.env.14` / `.env.im`。真实账号/令牌请写入 `.env.local`（已 gitignore）：

```bash
cp .env.example .env.local
```

加载优先级（高 → 低）：shell 显式变量 > `.env.local` > `.env.<TEST_ENV>` > `.env`。

切换环境：

```bash
TEST_ENV=14 pnpm test:api
TEST_ENV=im pnpm test:e2e:web
```

### 网络可达性

`dynamic-shop1x.eeo.im` 等为内网测试环境，通常需要在公司内网 / VPN 下访问，否则网关会返回 `403 Forbidden`。
本地跑接口用例前，请确认 `curl https://dynamic-shop13.eeo.im/api/v1/system/info` 能拿到 JSON。

### WAF 与并发限制（重要）

被测环境前置 WAF 有两条限制，套件已做适配：

1. 拦截"非浏览器"请求：接口请求会自动带上 `Origin` / `Referer` / `User-Agent` / `Accept` 等浏览器指纹头
   （见 `shared/http/browser-headers.ts`，`Origin/Referer` 取 `SHOP_HOST`）。
2. 拦截并发突发请求：接口用例**串行执行**（`test:api` 默认 `--workers=1`，api project `fullyParallel:false`）。

若仍偶发 403，多为 IP 被临时封禁，等待 1-2 分钟后重试即可。

## 3. 鉴权（获取 JWT）

需要登录的接口用例依赖一个 accessToken，三种提供方式（见 `config/accounts.ts`）：

1. 直接给 token（推荐，最稳定）：在 `.env.local` 设置 `TEST_TOKEN=<accessToken>`。
2. 白名单手机号登录（推荐本地开发，无需手动复制 token）：
   - 商家/教师端：`TEST_PHONE_NUMBER`（可选 `TEST_NATION_CODE`，默认 `86`）→ 自动用于 `TEST_TOKEN`、`MINIPROGRAM_TEACHER_TEST_TOKEN`
   - 用户/C 端：`MOBILE_TEST_PHONE_NUMBER`（可选 `MOBILE_TEST_NATION_CODE`，默认 `86`）→ 自动用于 `MOBILE_TEST_TOKEN`、`MINIPROGRAM_USER_TEST_TOKEN`
   - 套件启动时各侧最多调用 1 次 `POST /api/v1/user/loginbywhiteuser`，token 缓存在内存中
   - 用户须在 `inspection_login` 白名单中（见 `classinshop-go/scripts/init_web_config.sql`）
3. 签名登录：设置 `TEST_EEO_UID` / `TEST_SIGN_KEY` / `TEST_SIGN_TIMESTAMP`，套件会调用
   `POST /api/v1/user/loginbysign` 换取 token（见 `shared/auth/login.ts`）。

> 未配置任何凭据时，依赖 `token` fixture 的用例会自动 `skip`，公开接口（如 `/system/info`）仍会执行。

获取 token 的常见方式：在浏览器登录商家后台 / H5 后，从请求头 `Authorization: Bearer ...` 复制。

## 4. 店铺维度（X-Shop-Domain）

部分 C 端接口按店铺域名识别（`GetShopByDomain` 中间件）。在对应环境的 `.env.13` / `.env.14` / `.env.im` 中配置：

```
MOBILE_BASE_URL=https://appi4rhoyxe1.shop14.eeo.im
```

该字段同时用于 H5 E2E 的 `baseURL` 和 API 的 `X-Shop-Domain`。未配置时，店铺/优惠券相关用例会自动跳过。

## 5. 接口类型代码生成（可选）

`shared/api/types.ts` 已手写常用领域类型，保证开箱即用。如需完整类型，可从后端 swagger 生成：

```bash
pnpm codegen:api   # 读取 ../classinshop-go/api/http/docs/swagger.json -> shared/api/schema.d.ts
```

注意：后端 swagger 为 2.0 版本。若 openapi-typescript 对 2.0 兼容不佳，可参考前端项目使用的 `openapi-ts-request`，
或先用 [swagger2openapi](https://github.com/Mermade/oas-kit) 转换为 3.0 再生成。生成产物 `schema.d.ts` 已 gitignore。

## 6. 小程序自动化

小程序自动化仅本地运行：Playwright 配置只有在 `RUN_MP=1` 且非 CI 时才注册 `miniprogram-user` / `miniprogram-teacher` 项目；统一 runner 在 `CI=true` 时会直接拒绝执行小程序项目，避免进入流水线。

本地运行步骤：

1. 在微信开发者工具中开启 **设置 → 安全设置 → 服务端口（CLI/HTTP 调用）**。
2. 如需单独准备小程序产物，可在 test-suite 中执行：
   ```bash
   pnpm prepare:mp          # 用户端 + 教师端
   pnpm prepare:mp:user     # 仅用户端
   pnpm prepare:mp:teacher  # 仅教师端
   ```
   正常运行 `pnpm test:mp` 时会自动执行准备步骤，不需要手工提前编译。
3. 如安装在非默认路径，可在 `.env.local` 配置：
   ```
   WX_DEVTOOLS_CLI=/Applications/wechatwebdevtools.app/Contents/MacOS/cli
   MP_USER_PROJECT=../classinshop-miniprogram/dist/build/mp-weixin
   MP_TEACHER_PROJECT=../classinshop-teacher-miniprogram/dist/build/mp-weixin
   MINIPROGRAM_USER_TEST_TOKEN=<用户端小程序登录 token>
   MINIPROGRAM_TEACHER_TEST_TOKEN=<教师端小程序登录 token>
   ```
4. 运行：
   ```bash
   pnpm test:mp -- --env 14              # 用户端 + 教师端
   pnpm test:mp:user -- --env 14         # 仅用户端 classinshop-miniprogram
   pnpm test:mp:teacher -- --env 14      # 仅教师端 classinshop-teacher-miniprogram
   pnpm test:mp:user -- --env 14 --file tests/miniprogram/user/auth-click.spec.ts --allure --open
   ```

`pnpm test:mp` 与 API/Web/H5 的脚手架参数保持一致，支持 `--env`、`--file`、`--allure`、`--open`、`--report`、`--notify`。用户端和教师端已拆分为 `miniprogram-user` / `miniprogram-teacher`。运行时会先按目标用例自动编译用户端 / 教师端小程序产物并检查 CLI；运行条件不满足（无 CLI / 无产物）时准备阶段会直接报出原因，用例内部仍保留跳过保护。

小程序截图策略与 Web/H5 保持一致：默认仅失败时附加小程序截图；在 `.env.local` 或 shell 中设置 `E2E_STEP_SCREENSHOTS=1` 后，会在关键步骤后额外附加步骤截图。

## 7. 性能压测

见 [perf/README.md](../perf/README.md)。

## 8. 报告

所有报告与测试产物统一落在 `reports/`，不再使用根目录 `allure-results` / `playwright-report`。

结构：

```text
reports/
  latest/          # 指向最近一次运行（脚手架会更新 symlink；直跑 playwright 时直接写入此目录）
    enhanced/      # Enhanced HTML（主报告）
    html/          # Playwright HTML
    allure-results/
    allure-html/   # 加 --allure 后生成
    artifacts/     # 截图 / trace / video
    junit.xml
  runs/
    <timestamp>-<project>-<pid>/   # 脚手架每次独立快照（内容同上）
```

- 脚手架（`pnpm test:api` 等）：写入 `reports/runs/<id>/`，并更新 `reports/latest` → 该次运行。
- 直跑 `pnpm exec playwright test`：写入 `reports/latest/`。
- `--open` 默认打开 Enhanced；`--allure --open` 打开 Allure；`--report` 打开 Playwright HTML。
- 事后打开：`pnpm report:enhanced` / `pnpm report` / `pnpm report:allure:open`。

### GitLab CI 在线看报告

CI **会自动生成** Enhanced 报告（跑测试时 reporter 写入 `reports/latest/enhanced/`），并支持在线查看：

1. **Job Artifacts（每次测试 Job 都有）**  
   打开对应 Job → Browse / Download → `reports/latest/enhanced/enhanced-report.html`  
   MR 页也会出现 `Enhanced Report API` 暴露链接。

2. **GitLab Pages（pages Job）**  
   流水线 `pages` 成功后，Environment / Pages 入口打开：  
   `${CI_PAGES_URL}/enhanced-report.html`  
   （分支 `13/14/im`、schedule、MR 都会发布）

本地 `--open` 弹窗在 CI 里不可用；CI 场景用上面两种在线方式即可。

| 参数 | 打开的报告 |
| --- | --- |
| `--open` | Enhanced |
| `--enhanced` / `--enhanced --open` | Enhanced |
| `--allure --open` | Allure |
| `--report` | Playwright HTML |

## 9. CI

见 `.gitlab-ci.yml`。分支 `13/14/im` 推送或定时任务触发；
在 GitLab CI/CD Variables 配置 `TEST_TOKEN`、`MOBILE_BASE_URL` 等（建议 Masked）。
