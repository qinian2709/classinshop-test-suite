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

## API Setup In UI Specs

Mobile UI specs may use API calls to prepare or discover data, for example resolving a published `goodsId`, creating a test coupon, or cleaning up a received coupon code. Keep those calls in shared helpers and treat them as setup/teardown, not as the report focus.

Do not attach verbose request/response logs to H5 UI reports by default. UI reports should primarily show business steps, assertions, screenshots, trace, and failure artifacts. Attach API logs only when debugging a failing setup path or when the scenario is intentionally API-heavy.

## Screenshots

Playwright keeps screenshots on failure by default. `E2E_STEP_SCREENSHOTS=1` is an additional switch for attaching screenshots after each important UI step; keep it `0` for normal runs and set it to `1` when the user needs visual verification for every step.

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

When a text may appear in multiple UI regions, avoid broad `getByText` assertions. This is common in mobile H5 pages where Tab titles, course tags, coupon status labels, and card content reuse the same Chinese text. Broad text locators increase false positives and can fail in Playwright strict mode when live data changes.

Bad:

```ts
await expect(page.getByText(/^预约课/), '学习页应展示预约课 Tab').toBeVisible();
await expect(page.getByText('未使用', { exact: true }), '券包应展示未使用 Tab').toBeVisible();
```

Good:

```ts
await expect(page.getByRole('tab', { name: /^预约课/ }), '学习页应展示预约课 Tab').toBeVisible();
await expect(page.getByRole('tab', { name: '未使用' }), '券包应展示未使用 Tab').toBeVisible();
```

If the target is inside a known card, popup, or page section, first narrow the container, then assert text inside it:

```ts
const couponCard = page.locator('.adm-tabs-content').getByText(couponName).locator('..');
await expect(couponCard.getByText('免费领取', { exact: true }), '券卡应展示免费领取来源').toBeVisible();
```

Use `.first()` or `.nth()` only when the order is itself the business assertion or the list has already been narrowed by unique data. Do not use them merely to silence strict mode.

## Runner Commands

Use the shared runner shape for H5/mobile:

```bash
pnpm test:e2e:mobile -- --env 14 --file tests/e2e-mobile/mobile-auth.spec.ts --allure
```

Add `--open` only when the user wants to open the report:

```bash
pnpm test:e2e:mobile -- --env 14 --file tests/e2e-mobile/mobile-auth.spec.ts --allure --open
```

## Author Field

When first generating a new test case, include an author field in the scenario comment immediately. Resolve the value from the current Git author (`git config user.name`; fall back to the latest commit author if needed). Do not write a placeholder such as `提交人`.

```ts
/**
 * 场景说明。
 * author：qiukailiang
 */
```

## Checklist

Before finishing an E2E mobile change:

- Logged-in scenarios use `authedMobilePage`.
- Specs do not duplicate `cshop_token` injection logic.
- Environment values come from `@config`.
- Assertions include business-readable messages.
- Newly generated cases include `author：<actual author>` in the scenario comment from the first draft.
- Step screenshots are attached when `E2E_STEP_SCREENSHOTS=1`.
- Run the target spec with `pnpm test:e2e:mobile -- --env 14 --file <spec>`.
