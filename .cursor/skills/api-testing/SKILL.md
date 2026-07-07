---
name: api-testing
description: Follow ClassInShop API testing conventions for Playwright specs, API fixtures, auth tokens, environment variables, endpoint constants, request logs, assertions, reports, and runner commands. Use when creating or modifying tests under tests/api or when the user mentions API automation,接口用例,接口测试,请求日志,TEST_TOKEN, or Playwright API tests in this project.
---

# ClassInShop API Testing

## Scope

Use this skill for `classinshop-test-suite/tests/api/**`.

Prefer the existing Playwright API testing stack. Specs should be concise, typed where useful, and readable in Allure/Playwright reports.

## Imports And Fixtures

Use the shared project entrypoint:

```ts
import { test, expect } from '@shared';
import { Endpoints, SUCCESS_CODE, attachApiCallLog } from '@shared';
```

Use fixtures from `shared/fixtures/index.ts`:

- `env`: current environment config.
- `anonApi`: anonymous API helper, no login token.
- `api`: authenticated API helper, injects `Authorization` from `TEST_TOKEN`.
- `token`: raw access token when direct custom requests are needed.
- `data`: test data cleanup registry.

Do not create ad hoc API clients in every spec. Prefer `api` / `anonApi` unless a browser-curl reproduction requires direct `fetch`.

## Auth

For authenticated API tests, use the `api` fixture:

```ts
test('GET /auth/user 返回当前登录用户', async ({ api }) => {
  const { body } = await api.get(Endpoints.user.authUser);
  expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
});
```

The fixture reads credentials from `@config`:

- `TEST_TOKEN` is preferred.
- `TEST_TOKEN` may be either a raw JWT or a complete `Bearer xxx` value. Use `formatAuthorizationHeader()` from `@config` when building headers manually.
- `MOBILE_TEST_TOKEN` is a separate H5/C-end user token. Use it only when the API scenario explicitly exercises C-end buyer behavior such as mobile coupon receive, user coupon list, or mobile order flows. Do not mix it with merchant/admin `TEST_TOKEN`.
- Sign-login credentials are supported by `getAccessToken`.
- Missing auth credentials should skip dependent tests instead of failing the whole suite.

Do not hardcode tokens, cookies, or secrets in specs. Do not require cookies when `TEST_TOKEN` is sufficient.

## Browser-Like Gateway Requests

Some 14-env APIs are protected before they reach the Go JSON handler. If a request returns HTML `403 Forbidden` instead of the unified `{ code, msg, data }` response, compare it with `tests/api/api-demo.spec.ts` before changing assertions.

Known pitfall:

- `/user/shops` succeeds with browser-like `fetch` headers (`accept`, `origin`, `referer`, `sec-fetch-*`, `user-agent`, `Authorization`) but may be blocked when called through a bare `APIRequestContext`.
- In that case, reproduce the browser request shape first. Keep the code typed, redact credentials in attachments, and prefer extracting a reusable helper once more than one spec needs it.
- Do not treat HTML `403` as a business unauthorized response. Business auth failures should be JSON with `code=401`; HTML `403` usually means gateway/header/domain mismatch.

When manually constructing browser-like headers:

```ts
import { accounts, env, formatAuthorizationHeader } from '@config';

const headers = {
  accept: 'application/json, text/plain, */*',
  authorization: formatAuthorizationHeader(accounts.token),
  origin: env.shopHost,
  referer: `${env.shopHost}/`,
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-site',
};
```

## Environment Variables

Use `@config` / `env` instead of direct `process.env` in specs, except for rare test-specific opt-in variables.

Environment files are selected by `TEST_ENV` / `--env`:

- `--env 13` loads `.env.local`, `.env.13`, `.env`
- `--env 14` loads `.env.local`, `.env.14`, `.env`
- `--env im` loads `.env.local`, `.env.im`, `.env`

Use `env.apiBaseURL`, `env.shopHost`, `env.mobileBaseURL`, and `env.shopId` as appropriate. Avoid hardcoded hosts and raw endpoint strings.

Do not confuse `SHOP_ID` and `MOBILE_BASE_URL`:

- `SHOP_ID` is the numeric PC-admin shop ID, e.g. `18537`; use it for `/shop/:shopId/...` routes or for selecting a shop from `/user/shops`.
- `MOBILE_BASE_URL` is the C-end H5 shop URL, configured in `.env.13` / `.env.14` / `.env.im`. It is used as Playwright `baseURL` for mobile E2E and as API `X-Shop-Domain`.
- If only `SHOP_ID` is known, derive the C-end domain through upstream APIs: `GET /user/shops -> orgId`, then `GET /org/:orgId/detail -> shopDomain`, then pass that value as `X-Shop-Domain` (or align `MOBILE_BASE_URL` with it).

## Endpoints

Use `Endpoints` from `shared/api/endpoints.ts`.

Good:

```ts
await api.get(Endpoints.user.myShops);
```

Avoid:

```ts
await api.get('/user/shops');
```

Add new endpoint constants to `shared/api/endpoints.ts` when introducing a new API path that will be reused.

## Request Logs

For report-visible request/response logs, use the shared helper for **all API test cases**:

```ts
await attachApiCallLog({
  testInfo: test.info(),
  request: { method: 'GET', url, headers: requestHeaders, body: null },
  response: { status, headers: response.headers, body },
  assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码'],
});
```

Do not hand-roll repeated `test.info().attach(...)` JSON blocks. The helper masks `authorization`, `cookie`, and `set-cookie`, and uses the report-friendly default attachment name `请求日志.json`.

When one test performs multiple HTTP calls, pass a distinct `name` for each `attachApiCallLog` so Allure shows every step separately.

**Always attach request logs for every API test case** to ensure complete traceability in test reports. This is required for debugging and audit purposes.

## Assertions

Every important assertion should include a clear business message:

```ts
expect(status, 'HTTP 状态码应为 200').toBe(200);
expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
expect(Array.isArray(body.data), 'data 应为店铺列表数组').toBe(true);
```

Avoid bare report output like `Expect "toBe"` with no explanation:

```ts
expect(body.code).toBe(SUCCESS_CODE);
```

Prefer asserting both transport and business behavior when relevant:

- HTTP status.
- `code === SUCCESS_CODE`.
- shape/type of important `data` fields.
- key side effects for create/update/delete flows.

## Types

Define narrow response interfaces in the spec when the shape is local to one test. Add shared API types under `shared/api/types.ts` only when reused by multiple specs.

Avoid `any`. Use `unknown`, local interfaces, or existing shared types such as `ApiResponse`, `ListData`, `User`, etc.

## Data And Cleanup

Use the `data` fixture for test-created data that needs cleanup. Do not leave created orders, addresses, coupons, or other mutable resources behind.

Prefer stable read-only smoke tests unless the scenario requires mutation.

For multi-step scenarios, write the dependency chain in the spec comment and extract fields explicitly. Example:

- `GET /user/shops` extracts `orgId`.
- `GET /org/:orgId/detail` extracts `shopDomain`.
- `GET /shop/goods` extracts `goodsId`.
- `GET /shop/goods/:goodsId` validates downstream detail data.

Do not write payment success scenarios unless a test payment sandbox or callback simulation is available. For payment-related areas, prefer read-only status checks, parameter validation, or explicitly skipped opt-in tests with documented prerequisites.

### Test Order And Shared State

API specs in this project run sequentially (`api` project: `workers: 1`, `fullyParallel: false`), but **test order still matters** when multiple cases touch the same mutable resource (notifications, addresses, coupons, etc.).

Rules:

- Put **read-only / parameter-validation** cases first.
- Put **single-item mutation** before **bulk mutation** when both need the same precondition.
- Put **cleanup-heavy or state-wiping** cases last in the file or describe block.

Bad order example:

```text
POST /notifications/read-all   # clears all unread
POST /notifications/:id/read     # may skip: no unread left
```

Good order example:

```text
POST /notifications/:id/read   # negative: fake id, no unread needed
单条已读链路                      # needs one unread notification
POST /notifications/read-all   # last: clears remaining unread
```

When order is required:

- Document the dependency in the file header comment or section comment.
- Prefer one self-contained multi-step test when steps must always run together.
- Use `test.skip(...)` only for missing env/preconditions, not to hide ordering bugs.
- For multi-step tests, call `attachApiCallLog` **once per HTTP request** and give each attachment a distinct `name` (for example `请求日志-单条已读-未读通知列表.json`, `请求日志-单条已读-标记已读.json`).

Use the `data` fixture or explicit cleanup when a mutation creates resources that later cases or reruns would break.

Use meaningful test titles and annotation/attachment names. Reports are read by humans and may be sent to WeCom later.

- Use Chinese business descriptions in test names and assertion messages.
- **Always attach request logs for all API test cases** using `attachApiCallLog`.
- Keep sensitive values masked.

## Author Field

When first generating a new test case, include an author field in the scenario comment immediately. Resolve the value from the current Git author (`git config user.name`; fall back to the latest commit author if needed). Do not write a placeholder such as `提交人`.

```ts
/**
 * 场景说明。
 * author：qiukailiang
 */
```

## Runner Commands

Use the shared runner shape:

```bash
pnpm test:api -- --env 14 --file tests/api/api-demo.spec.ts --allure
```

Add `--open` only when the user wants to open the report:

```bash
pnpm test:api -- --env 14 --file tests/api/api-demo.spec.ts --allure --open
```

Use `--notify` when simulating WeCom notification output:

```bash
pnpm test:api -- --env 14 --file tests/api/api-demo.spec.ts --allure --notify
```

## Checklist

Before finishing an API test change:

- Authenticated tests use `api`/`token` fixtures instead of duplicating auth logic.
- Manual headers use `formatAuthorizationHeader()` and never print the token.
- HTML `403` is diagnosed as gateway/header/domain mismatch before changing business assertions.
- `SHOP_ID` and `MOBILE_BASE_URL` are not mixed; derive C-end domain from upstream APIs when needed.
- Multi-step scenarios document upstream/downstream field extraction.
- Mutation cases that share state are ordered correctly (granular before bulk; read-only before write; state-wiping last).
- Multi-step cases attach one distinct request log per HTTP call (`name` per step).
- Public tests use `anonApi`.
- Environment values come from `@config`.
- Endpoints use `Endpoints`.
- **All API test cases attach request logs using `attachApiCallLog`.**
- Assertions include meaningful messages.
- Newly generated cases include `author：<actual author>` in the scenario comment from the first draft.
- No secrets are committed or printed.
- `npm run typecheck` passes.
- Recently edited files have no linter diagnostics.
