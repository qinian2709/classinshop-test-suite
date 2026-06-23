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
import { Endpoints, SUCCESS_CODE } from '@shared';
```

Use fixtures from `shared/fixtures/index.ts`:

- `env`: current environment config.
- `anonApi`: anonymous API helper, no login token.
- `api`: authenticated API helper, injects `Authorization: Bearer <token>`.
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
- Sign-login credentials are supported by `getAccessToken`.
- Missing auth credentials should skip dependent tests instead of failing the whole suite.

Do not hardcode tokens, cookies, or secrets in specs. Do not require cookies when `TEST_TOKEN` is sufficient.

## Environment Variables

Use `@config` / `env` instead of direct `process.env` in specs, except for rare test-specific opt-in variables.

Environment files are selected by `TEST_ENV` / `--env`:

- `--env 13` loads `.env.local`, `.env.13`, `.env`
- `--env 14` loads `.env.local`, `.env.14`, `.env`
- `--env im` loads `.env.local`, `.env.im`, `.env`

Use `env.apiBaseURL`, `env.shopHost`, `env.shopDomain`, and `env.shopId` as appropriate. Avoid hardcoded hosts and raw endpoint strings.

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

For report-visible request/response logs, use the shared helper:

```ts
await attachApiCallLog({
  testInfo: test.info(),
  request: { method: 'GET', url, headers: requestHeaders, body: null },
  response: { status, headers: response.headers, body },
  assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码'],
});
```

Do not hand-roll repeated `test.info().attach(...)` JSON blocks. The helper masks `authorization`, `cookie`, and `set-cookie`, and uses the report-friendly default attachment name `请求日志.json`.

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

## Reports

Use meaningful test titles and annotation/attachment names. Reports are read by humans and may be sent to WeCom later.

- Use Chinese business descriptions in test names and assertion messages.
- Attach request logs for demo, smoke, or failure-prone custom fetch scenarios.
- Keep sensitive values masked.

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
- Public tests use `anonApi`.
- Environment values come from `@config`.
- Endpoints use `Endpoints`.
- Request logs use `attachApiCallLog` when logs are needed.
- Assertions include meaningful messages.
- No secrets are committed or printed.
- `npm run typecheck` passes.
- Recently edited files have no linter diagnostics.
