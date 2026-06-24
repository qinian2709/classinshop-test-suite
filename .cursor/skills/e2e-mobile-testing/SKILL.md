---
name: e2e-mobile-testing
description: Follow ClassInShop H5/mobile E2E testing conventions for Playwright specs, mobile login-state injection, MOBILE_TEST_TOKEN, MOBILE_BASE_URL, screenshots, assertions, and runner commands. Use when creating or modifying tests under tests/e2e-mobile or when the user mentions H5, mobile E2E, mobile UI automation, C端登录态, or mobile screenshots in this project.
---

# ClassInShop E2E Mobile Testing

## Scope

Use this skill for `classinshop-test-suite/tests/e2e-mobile/**`.

Keep H5 UI specs small and business-readable. Put reusable setup in fixtures/helpers, page operations in Page Objects when they are reused, and assertions in specs.

## Login State

For tests that require a logged-in H5/C-end user, import the authenticated fixture:

```ts
import { test, expect } from './fixtures/authed.js';
```

Use `authedMobilePage` instead of `page` when the scenario requires login:

```ts
test('打开我的页面', async ({ authedMobilePage: page }) => {
  await page.goto('/mine', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('我的优惠券')).toBeVisible();
});
```

Do not reimplement login-state injection in specs. Do not manually write `localStorage.cshop_token` inside a test file. If login injection needs to change, update:

- `tests/e2e-mobile/fixtures/authed.ts`
- `tests/e2e-mobile/helpers/auth.ts`

The mobile frontend reads `localStorage.cshop_token`, where the value is a double-JSON string:

```ts
JSON.stringify(JSON.stringify({ accessToken: token, refreshToken: '' }))
```

This matches `classinshop-mobile-web/src/stores/user.ts`.

## Environment Variables

Use project config imports instead of reading `process.env` directly in specs:

```ts
import { env, accounts } from '@config';
```

Required mobile values:

- `MOBILE_BASE_URL`: H5 shop URL, configured in `.env.13`, `.env.14`, or `.env.im`.
- `MOBILE_TEST_TOKEN`: C-end user token, configured in `.env.local`.

Do not use `TEST_TOKEN` for mobile C-end login unless the scenario explicitly uses the merchant/admin account as the buyer. For mobile UI tests, prefer `accounts.mobileToken`.

## Screenshots

By default, Playwright keeps screenshots only on failure via project config. Use `E2E_STEP_SCREENSHOTS=1` only while debugging or when the user needs visual verification for each important step.

When attaching screenshots:

- Wait for `#root` to be attached.
- Wait until `#root` has non-empty text when possible.
- Add a short stability wait before `page.screenshot()` to avoid blank/loading screenshots.
- Use business-readable attachment names such as `学习页面已展示.png`.

## Assertions

Every important assertion should have a clear message so Allure/Playwright reports explain the business intent.

Good:

```ts
await expect(page.getByPlaceholder('搜索课程名'), '学习页应展示课程搜索框').toBeVisible();
```

Avoid:

```ts
await expect(page.getByPlaceholder('搜索课程名')).toBeVisible();
```

Prefer semantic locators (`getByText`, `getByRole`, placeholders) over CSS selectors unless the UI lacks stable text.

## Runner Commands

Use the shared runner shape for H5/mobile:

```bash
pnpm test:e2e:mobile -- --env 14 --file tests/e2e-mobile/mobile-auth.spec.ts --allure
```

Add `--open` only when the user wants to open the report:

```bash
pnpm test:e2e:mobile -- --env 14 --file tests/e2e-mobile/mobile-auth.spec.ts --allure --open
```

## Checklist

Before finishing an E2E mobile change:

- Logged-in scenarios use `authedMobilePage`.
- Specs do not duplicate `cshop_token` injection logic.
- Environment values come from `@config`.
- Assertions include business-readable messages.
- Step screenshots are attached when `E2E_STEP_SCREENSHOTS=1`.
- Run the target spec with `pnpm test:e2e:mobile -- --env 14 --file <spec>`.
