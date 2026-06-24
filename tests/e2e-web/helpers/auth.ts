import type { Page } from '@playwright/test';

const TOKEN_STORAGE_KEYS = ['authorization', 'Authorization', 'token', 'accessToken'] as const;
const USER_STORAGE_KEYS = ['user', 'userInfo', 'currentUser', 'authUser', 'loginUser'] as const;

export interface AuthBootstrapResult {
  httpStatus: number | null;
  code: number | null;
  userId: string | number | null;
  wroteUser: boolean;
  error?: string;
}

function normalizeApiBaseURL(apiBaseURL: string): string {
  return apiBaseURL.replace(/\/$/, '');
}

/**
 * 在首次 page.goto 前注入 PC 后台登录态。
 *
 * 前端会从 storage 读取 token；接口请求头交给 BrowserContext 的 extraHTTPHeaders。
 */
export async function installClassInAuth(page: Page, authorization: string): Promise<void> {
  await page.context().setExtraHTTPHeaders({ authorization });
  await page.addInitScript(
    ({ token, tokenStorageKeys }) => {
      const cshopToken = JSON.stringify(
        JSON.stringify({ accessToken: token, refreshToken: '' }),
      );
      localStorage.setItem('cshop_token', cshopToken);

      for (const key of tokenStorageKeys) {
        localStorage.setItem(key, token);
        sessionStorage.setItem(key, token);
      }
    },
    { token: authorization, tokenStorageKeys: [...TOKEN_STORAGE_KEYS] },
  );
}

/**
 * 页面打开后通过 /auth/user 拉取用户信息并写入 storage。
 * 部分前端除了 token 外还依赖 user/currentUser 等字段判断登录态。
 */
export async function bootstrapClassInAuth(
  page: Page,
  authorization: string,
  apiBaseURL: string,
): Promise<AuthBootstrapResult> {
  return page.evaluate(
    async ({ token, authUserURL, tokenStorageKeys, userStorageKeys }) => {
      const writeTokenStorage = () => {
        const cshopToken = JSON.stringify(
          JSON.stringify({ accessToken: token, refreshToken: '' }),
        );
        localStorage.setItem('cshop_token', cshopToken);

        for (const key of tokenStorageKeys) {
          localStorage.setItem(key, token);
          sessionStorage.setItem(key, token);
        }
      };

      writeTokenStorage();

      try {
        const response = await fetch(authUserURL, {
          headers: { authorization: token },
          credentials: 'include',
        });
        const payload = (await response.json()) as {
          code?: number;
          data?: { id?: string | number; userId?: string | number; name?: string };
        };
        const user = payload.data;

        if (user) {
          const userText = JSON.stringify(user);
          for (const key of userStorageKeys) {
            localStorage.setItem(key, userText);
            sessionStorage.setItem(key, userText);
          }
        }

        return {
          httpStatus: response.status,
          code: payload.code ?? null,
          userId: user?.id ?? user?.userId ?? user?.name ?? null,
          wroteUser: Boolean(user),
        };
      } catch (error) {
        return {
          httpStatus: null,
          code: null,
          userId: null,
          wroteUser: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
    {
      token: authorization,
      authUserURL: `${normalizeApiBaseURL(apiBaseURL)}/auth/user`,
      tokenStorageKeys: [...TOKEN_STORAGE_KEYS],
      userStorageKeys: [...USER_STORAGE_KEYS],
    },
  );
}
