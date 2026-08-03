---
name: e2e-web-testing
description: Follow ClassInShop E2E Web testing conventions for Playwright specs, Page Objects, login-state fixtures, environment variables, assertions, reports, and runner commands. Use when creating or modifying tests under tests/e2e-web or when the user mentions PC E2E, UI automation, login injection, Playwright Web tests, or enter-shop flows in this project.
---

# ClassInShop E2E Web Testing

## Scope

Use this skill for `classinshop-test-suite/tests/e2e-web/**`.

Prefer the existing Playwright + TypeScript patterns in this project. Keep UI specs small: setup belongs in fixtures/helpers, page operations belong in Page Objects, and specs should read like business scenarios.

## Login State

For tests that require a logged-in PC backend session, import the authenticated fixture:

```ts
import { test, expect } from './fixtures/authed.js';
```

Use the provided `authedShopList` fixture when the test starts from the shop list/entry page:

```ts
test('进入店铺', async ({ page, authedShopList }) => {
  await expect(authedShopList.enterShopButton, '应展示进入店铺按钮').toBeVisible({ timeout: 5_000 });
  const listUrl = page.url();
  await authedShopList.enterShop();
  await expect(page, '点击进入店铺后 URL 应变化').not.toHaveURL(listUrl);
});
```

Do not reimplement login-state injection in specs. Do not manually write `localStorage`, `sessionStorage`, `cshop_token`, `authorization`, or `/auth/user` bootstrap logic inside a test file. If login injection needs to change, update `tests/e2e-web/fixtures/authed.ts` and `tests/e2e-web/helpers/auth.ts`.

## Environment Variables

Use project config imports instead of reading `process.env` directly in specs:

```ts
import { env, accounts } from '@config';
```

Environment files are selected by `TEST_ENV` / `--env`:

- `--env 13` loads `.env.local`, `.env.13`, `.env`
- `--env 14` loads `.env.local`, `.env.14`, `.env`
- `--env im` loads `.env.local`, `.env.im`, `.env`

Use `env.shopHost`, `env.webBaseURL`, `env.apiBaseURL`, and `accounts.token` from `@config`. Do not hardcode environment domains, tokens, or hostnames in E2E specs.

## Assertions

Every important assertion should have a clear message so Allure/Playwright reports explain the business intent.

Good:

```ts
await expect(shopList.enterShopButton, '应展示进入店铺按钮').toBeVisible({ timeout: 5_000 });
await expect(page, '点击进入店铺后 URL 应变化').not.toHaveURL(listUrl);
```

Avoid:

```ts
await expect(shopList.enterShopButton).toBeVisible();
await expect(page).not.toHaveURL(listUrl);
```

Use shorter assertion timeouts for expected-fast UI state, typically `5_000`, instead of waiting for the global `expect` timeout when a missing element should fail quickly.

When a text may appear in multiple UI regions, avoid broad `getByText` assertions. This is common in Web UI pages where menu entries, table cells, tags, buttons, and dialog content reuse the same Chinese text. Broad text locators increase false positives and can fail in Playwright strict mode when live data changes.

Bad:

```ts
await expect(page.getByText('进入店铺'), '应展示进入店铺按钮').toBeVisible();
await expect(page.getByText('待上架'), '商品列表应展示待上架状态').toBeVisible();
```

Good:

```ts
await expect(page.getByRole('button', { name: '进入店铺' }), '应展示进入店铺按钮').toBeVisible();

const goodsRow = page.getByRole('row', { name: /自动化商品/ });
await expect(goodsRow.getByText('待上架', { exact: true }), '商品行应展示待上架状态').toBeVisible();
```

Use `.first()` or `.nth()` only when the order is itself the business assertion or the list has already been narrowed by unique data. Do not use them merely to silence strict mode.

## Page Objects

Put selectors and page actions in `tests/e2e-web/pages/**`.

- Reuse existing Page Objects such as `ShopListPage`.
- Add semantic locators first: `getByRole`, `getByText`, labels, accessible names.
- Keep actions on the Page Object, for example `shopList.enterShop()`.
- Keep specs focused on scenario flow and assertions.

## Waiting Strategy

Avoid adding broad waits in specs.

- Prefer waiting for specific elements or states.
- Avoid using `networkidle` as a new generic readiness condition; it can be slow on SPA pages with polling or analytics.
- If a shared readiness wait is too slow or flaky, adjust the relevant Page Object/helper rather than adding sleeps in the spec.
- Do not use arbitrary `waitForTimeout` unless debugging temporarily.

## Screenshots

Playwright keeps screenshots on failure by default. `E2E_STEP_SCREENSHOTS=1` is an additional switch for attaching screenshots after each important UI step; keep it `0` for normal runs and set it to `1` when the user needs visual verification for every step.

When attaching Web UI step screenshots, use:

```ts
import { attachStepScreenshot } from './helpers/screenshots.js';
```

Then call it after meaningful business steps:

```ts
await attachStepScreenshot(page, testInfo, '店铺列表已展示');
```

The helper waits for `#root`, waits for non-empty page text when possible, and adds a short stability wait before screenshotting.

## Reports And Attachments

Use meaningful attachment and assertion names because Allure exposes them directly.

- Login fixture already attaches `登录态注入日志.json`.
- For API request/response logs, use shared helpers rather than hand-writing attachment payloads.
- Avoid technical names like `api-call.json` when a business-readable name such as `请求日志.json` is clearer.

## Author Field

When first generating a new test case, include an author field in the scenario comment immediately. Resolve the value from the current Git author (`git config user.name`; fall back to the latest commit author if needed). Do not write a placeholder such as `提交人`.

```ts
/**
 * 场景说明。
 * author：qiukailiang
 */
```

## Runner Commands

Use the shared runner shape for E2E Web:

```bash
pnpm test:e2e:web -- --env 14 --file tests/e2e-web/enter-shop.spec.ts --allure
```

Add `--open` only when the user wants to open the report:

```bash
pnpm test:e2e:web -- --env 14 --file tests/e2e-web/enter-shop.spec.ts --allure --open
```

The same runner supports `--env`, `--file`, `--allure`, `--open`, and `--notify`.

## Checklist

Before finishing an E2E Web change:

- The spec does not duplicate login injection logic.
- Environment values come from `@config`.
- Assertions include meaningful messages.
- Newly generated cases include `author：<actual author>` in the scenario comment from the first draft.
- Step screenshots are attached when `E2E_STEP_SCREENSHOTS=1`.
- Selectors/actions are placed in Page Objects when reused or non-trivial.
- Waits are specific and not unnecessarily long.
- `npm run typecheck` passes.
- Recently edited files have no linter diagnostics.
