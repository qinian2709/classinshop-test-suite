import type { Page } from '@playwright/test';

const CSHOP_TOKEN_KEY = 'cshop_token';

function buildPersistedToken(token: string): string {
  return JSON.stringify(JSON.stringify({ accessToken: token, refreshToken: '' }));
}

/**
 * 在首次 page.goto 前注入 H5 登录态。
 *
 * mobile-web 生产环境会从 localStorage.cshop_token 读取 accessToken，
 * 格式与前端 persistUserAuthToStorage 保持一致：双重 JSON 序列化。
 */
export async function installMobileAuth(page: Page, token: string): Promise<void> {
  await page.context().setExtraHTTPHeaders({ Authorization: token });
  await page.addInitScript(
    ({ storageKey, persistedToken }) => {
      localStorage.setItem(storageKey, persistedToken);
    },
    { storageKey: CSHOP_TOKEN_KEY, persistedToken: buildPersistedToken(token) },
  );
}
