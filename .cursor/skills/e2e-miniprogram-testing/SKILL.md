---
name: e2e-miniprogram-testing
description: Follow ClassInShop WeChat mini-program UI automation conventions for miniprogram-automator specs, local-only execution, login-state injection, screenshots, assertions, and runner commands. Use when creating or modifying tests under tests/miniprogram or when the user mentions 小程序 UI 自动化, classinshop-miniprogram, teacher-miniprogram, 微信开发者工具, or miniprogram screenshots in this project.
---

# ClassInShop E2E Miniprogram Testing

## Scope

Use this skill for `classinshop-test-suite/tests/miniprogram/**`.

The mini-program tests target:

- `tests/miniprogram/user/**`: `classinshop-miniprogram`, user/student mini-program.
- `tests/miniprogram/teacher/**`: `classinshop-teacher-miniprogram`, teacher mini-program.
- `tests/miniprogram/helpers/**`: shared launch, auth, screenshot, and utility helpers.

Keep specs business-readable. Put launch/auth/screenshot logic in helpers under `tests/miniprogram/helpers/**`; specs should describe page entry, click behavior, and assertions.

## Local-Only Execution

Mini-program automation depends on local WeChat DevTools, so it must not run in CI or regular full test runs.

The project enforces this in two places:

- `playwright.config.ts` only registers `miniprogram-user` / `miniprogram-teacher` when `RUN_MP=1` and `CI` is not set.
- `scripts/run-api.ts` rejects `miniprogram` when `CI=true`.

Do not remove these guards. Do not add mini-program tests to CI unless a dedicated local device/DevTools runner is explicitly provided.

## Runner Commands

Use the same shared runner shape as API/Web/H5:

```bash
pnpm test:mp:user -- --env 14 --file tests/miniprogram/user/auth-click.spec.ts --allure
```

Add `--open` only when the user wants to open the report:

```bash
pnpm test:mp:user -- --env 14 --file tests/miniprogram/user/auth-click.spec.ts --allure --open
```

The runner supports `--env`, `--file`, `--allure`, `--open`, `--report`, and `--notify`.

Use the split entrypoints:

- `pnpm test:mp`: aggregate user + teacher mini-program specs.
- `pnpm test:mp:user`: user/student mini-program (`classinshop-miniprogram`, Playwright project `miniprogram-user`).
- `pnpm test:mp:teacher`: teacher mini-program (`classinshop-teacher-miniprogram`, Playwright project `miniprogram-teacher`).

The runner automatically:

- Builds the required `mp-weixin` artifact for the selected environment.
- Selects user/teacher build target from the `--file` path when possible.
- Checks WeChat DevTools CLI.
- Sets `RUN_MP=1`.
- Uses the same unique report directory pattern as other projects.

## Login State

For logged-in user/student scenarios, use the existing helper:

```ts
import { buildStudentAuthState, installMiniProgramAuth } from './helpers/auth.js';
```

Then inject login state:

```ts
await installMiniProgramAuth(mp, buildStudentAuthState());
```

Do not reimplement login-state injection in specs. Do not manually write mini-program storage keys in a test file. If login injection needs to change, update `tests/miniprogram/helpers/auth.ts`.

Current injection is intentionally minimal:

- Reads `MINIPROGRAM_USER_TEST_TOKEN` / `MINIPROGRAM_TEACHER_TEST_TOKEN` through `accounts.miniprogram`.
- Writes only auth token state needed by the mini-program store.
- Does not inject username, user ID, openId, unionId, or other fake user data.
- Lets the mini-program call real backend APIs, such as `/auth/user`, to load the real user information.

Do not use `MOBILE_TEST_TOKEN` directly for mini-program login injection. Even when the token value is currently the same as H5/mobile, keep a separate mini-program variable name for maintainability.

If a future scenario needs additional mini-program identity values, add them to `.env.local` / `.env.example` first and read them via config. Do not hardcode real or fake user information in source files.

## Environment Variables

Use project config imports instead of reading `process.env` directly in specs:

```ts
import { accounts } from '@config';
```

Important values:

- `MINIPROGRAM_USER_TEST_TOKEN`: user/student mini-program login token.
- `MINIPROGRAM_TEACHER_TEST_TOKEN`: teacher mini-program login token.
- `WX_DEVTOOLS_CLI`: optional local WeChat DevTools CLI path; defaults are auto-detected.
- `MP_USER_PROJECT`: optional user mini-program compiled artifact path.
- `MP_TEACHER_PROJECT`: optional teacher mini-program compiled artifact path.
- `E2E_STEP_SCREENSHOTS`: set to `1` to attach screenshots after key steps.

## Screenshots

Default behavior: attach a mini-program screenshot only on failure.

When the user asks for every-step screenshots, run with:

```bash
E2E_STEP_SCREENSHOTS=1 pnpm test:mp:user -- --env 14 --file tests/miniprogram/user/auth-click.spec.ts --allure --open
```

Use the shared helper:

```ts
import { attachFailureScreenshot, attachStepScreenshot } from './helpers/screenshots.js';
```

Call `attachStepScreenshot(mp, testInfo, '业务步骤名称')` after meaningful steps only. The helper waits briefly before screenshotting to avoid blank loading states.

## Assertions

Every important assertion should include a clear business message:

```ts
expect(mineText, '登录后我的页应展示地址管理入口').toContain('地址管理');
```

Avoid asserting fake injected user data. For logged-in pages, prefer asserting real business UI state:

- Logged-out entry is absent.
- Logged-in menu items are present.
- Clicks navigate to the expected page path.

## Checklist

Before finishing a mini-program test change:

- The spec uses helpers from `tests/miniprogram/helpers/**`.
- Logged-in scenarios use `installMiniProgramAuth()` and do not duplicate storage writes.
- No hardcoded tokens, usernames, user IDs, openId, or unionId are introduced.
- Any required local-only values are documented in `.env.example`.
- Local-only CI guards remain intact.
- Step screenshots are attached only through the helper and only when `E2E_STEP_SCREENSHOTS=1`.
- Assertions include business-readable messages.
- Run the target spec with `pnpm test:mp:user -- --env 14 --file <spec>` or `pnpm test:mp:teacher -- --env 14 --file <spec>`.
