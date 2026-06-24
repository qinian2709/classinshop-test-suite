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

## 3. 鉴权（获取 JWT）

需要登录的接口用例依赖一个 accessToken，两种提供方式（见 `config/accounts.ts`）：

1. 直接给 token（推荐，最稳定）：在 `.env.local` 设置 `TEST_TOKEN=<accessToken>`。
2. 签名登录：设置 `TEST_EEO_UID` / `TEST_SIGN_KEY` / `TEST_SIGN_TIMESTAMP`，套件会调用
   `POST /api/v1/user/loginbysign` 换取 token（见 `shared/auth/login.ts`）。

> 未配置任何凭据时，依赖 `token` fixture 的用例会自动 `skip`，公开接口（如 `/system/info`）仍会执行。

获取 token 的常见方式：在浏览器登录商家后台 / H5 后，从请求头 `Authorization: Bearer ...` 复制。

## 4. 店铺维度（X-Shop-Domain）

部分 C 端接口按店铺域名识别（`GetShopByDomain` 中间件）。在 `.env.local` 设置：

```
SHOP_DOMAIN=https://demo.shop13.eeo.im
```

未配置时，店铺/优惠券相关用例会自动跳过。

## 5. 接口类型代码生成（可选）

`shared/api/types.ts` 已手写常用领域类型，保证开箱即用。如需完整类型，可从后端 swagger 生成：

```bash
pnpm codegen:api   # 读取 ../classinshop-go/api/http/docs/swagger.json -> shared/api/schema.d.ts
```

注意：后端 swagger 为 2.0 版本。若 openapi-typescript 对 2.0 兼容不佳，可参考前端项目使用的 `openapi-ts-request`，
或先用 [swagger2openapi](https://github.com/Mermade/oas-kit) 转换为 3.0 再生成。生成产物 `schema.d.ts` 已 gitignore。

## 6. 小程序自动化

仅本地运行，步骤：

1. 在微信开发者工具中开启 **设置 → 安全设置 → 服务端口（CLI/HTTP 调用）**。
2. 在对应小程序项目编译出 mp-weixin 产物：
   ```bash
   # 用户端
   cd ../classinshop-miniprogram && pnpm build:mp-weixin
   # 教师端
   cd ../classinshop-teacher-miniprogram && pnpm build:mp-weixin
   ```
3. 在 `.env.local` 配置：
   ```
   WX_DEVTOOLS_CLI=/Applications/wechatwebdevtools.app/Contents/MacOS/cli
   MP_USER_PROJECT=../classinshop-miniprogram/dist/build/mp-weixin
   MP_TEACHER_PROJECT=../classinshop-teacher-miniprogram/dist/build/mp-weixin
   ```
4. 运行：
   ```bash
   pnpm test:mp
   ```

运行条件不满足（无 CLI / 无产物）时用例会带原因自动跳过。

## 7. 性能压测

见 [perf/README.md](../perf/README.md)。

## 8. 报告

- 通过 `pnpm test:api`、`pnpm test:e2e:web`、`pnpm test:e2e:mobile` 运行时，每次执行都会生成独立目录：`reports/runs/<timestamp>-<project>-<pid>/`。
- 本次 HTML 报告在该目录的 `html/index.html`；加 `--open` 会打开本次报告。
- 本次 JUnit 在该目录的 `junit.xml`。
- 失败截图 / trace / video 在该目录的 `artifacts/`。
- 直接执行 `pnpm exec playwright test ...` 时仍使用 Playwright 默认配置路径：`reports/html`、`reports/junit.xml`、`reports/artifacts`。

## 9. CI

见 `.gitlab-ci.yml`。分支 `13/14/im` 推送或定时任务触发；
在 GitLab CI/CD Variables 配置 `TEST_TOKEN`、`SHOP_DOMAIN` 等（建议 Masked）。
