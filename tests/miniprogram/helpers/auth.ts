import type MiniProgram from 'miniprogram-automator/out/MiniProgram.js';
import { accounts } from '@config';

export interface MiniProgramAuthState {
  authToken: {
    accessToken: string;
    refreshToken: string;
  };
  skipAutoLogin: boolean;
}

export function buildStudentAuthState(): MiniProgramAuthState {
  return buildMiniProgramAuthState(
    accounts.miniprogram.userToken,
    '未配置 MINIPROGRAM_USER_TEST_TOKEN，无法注入用户端小程序登录态',
  );
}

export function buildTeacherAuthState(): MiniProgramAuthState {
  return buildMiniProgramAuthState(
    accounts.miniprogram.teacherToken,
    '未配置 MINIPROGRAM_TEACHER_TEST_TOKEN，无法注入教师端小程序登录态',
  );
}

function buildMiniProgramAuthState(token: string, missingMessage: string): MiniProgramAuthState {
  if (!token) {
    throw new Error(missingMessage);
  }

  return {
    authToken: {
      accessToken: token,
      refreshToken: '',
    },
    skipAutoLogin: false,
  };
}

/** 注入 classinshop-miniprogram / teacher-miniprogram 的 Pinia unistorage 登录态。 */
export async function installMiniProgramAuth(
  mp: MiniProgram,
  state: MiniProgramAuthState,
): Promise<void> {
  await mp.evaluate((authState: MiniProgramAuthState) => {
    const storageState = {
      authToken: authState.authToken,
      skipAutoLogin: authState.skipAutoLogin,
    };
    const storage = (globalThis as unknown as { wx: unknown }).wx as {
      setStorageSync: (key: string, value: unknown) => void;
      removeStorageSync: (key: string) => void;
    };

    // 兼容 store 级和字段级持久化 key，降低插件实现差异带来的注入失败概率。
    storage.setStorageSync('__user__', storageState);
    storage.setStorageSync('__user__:authToken', authState.authToken);
    storage.setStorageSync('__user__:skipAutoLogin', authState.skipAutoLogin);
    storage.setStorageSync('__user__.authToken', authState.authToken);
    storage.setStorageSync('__user__.skipAutoLogin', authState.skipAutoLogin);
    storage.removeStorageSync('__user__:tokenInfo');
    storage.removeStorageSync('__user__.tokenInfo');

    const getMiniProgramApp = (globalThis as unknown as { getApp: () => unknown }).getApp;
    const app = getMiniProgramApp() as {
      $vm?: { $pinia?: { _s?: Map<string, unknown> } };
      $pinia?: { _s?: Map<string, unknown> };
    };
    const pinia = app.$vm?.$pinia ?? app.$pinia;
    const store = pinia?._s?.get('__user__') as
      | {
          $patch?: (value: Partial<MiniProgramAuthState>) => void;
          setAuthToken?: (value: MiniProgramAuthState['authToken']) => void;
          setTokenInfo?: (value?: unknown) => void;
          setSkipAutoLogin?: (value: boolean) => void;
        }
      | undefined;

    if (store?.$patch) {
      store.$patch(storageState);
    }
    store?.setAuthToken?.(authState.authToken);
    store?.setTokenInfo?.(undefined);
    store?.setSkipAutoLogin?.(authState.skipAutoLogin);
  }, state);
}

export async function hasMiniProgramAuth(mp: MiniProgram): Promise<boolean> {
  return mp.evaluate(() => {
    const storage = (globalThis as unknown as { wx: unknown }).wx as {
      getStorageSync: (key: string) => unknown;
    };
    const userState = storage.getStorageSync('__user__') as
      | { authToken?: { accessToken?: string } }
      | undefined;
    const authToken =
      userState?.authToken ??
      (storage.getStorageSync('__user__:authToken') as { accessToken?: string } | undefined) ??
      (storage.getStorageSync('__user__.authToken') as { accessToken?: string } | undefined);
    return Boolean(authToken?.accessToken);
  });
}
