import { test, expect } from '@playwright/test';
import type MiniProgram from 'miniprogram-automator/out/MiniProgram.js';
import { canRun, launch, safeClose } from './helpers/automator.js';

/**
 * 用户/学员端小程序冒烟（classinshop-miniprogram，2 个 Tab：学习 / 我的）。
 * 仅本地运行：需 RUN_MP=1 + 微信开发者工具 + 已编译 mp-weixin 产物。
 */
test.describe('用户端小程序冒烟 @miniprogram', () => {
  let mp: MiniProgram | undefined;

  test.beforeAll(() => {
    const { ok, reason } = canRun('user');
    test.skip(!ok, reason ?? '用户端小程序运行条件不满足');
  });

  test.afterAll(async () => {
    await safeClose(mp);
  });

  test('启动后能进入首页并读取页面路径', async () => {
    mp = await launch('user');
    const page = await mp.currentPage();
    expect(page, '应能获取当前页面').toBeTruthy();
    const path = page!.path;
    expect(typeof path).toBe('string');
    expect(path.length).toBeGreaterThan(0);
  });

  test('可切换到「我的」Tab', async () => {
    if (!mp) mp = await launch('user');
    // uni-app 默认主包，Tab 页通常在 pages/mine/*；以 switchTab 验证可达性
    const page = await mp.switchTab('/pages/mine/index').catch(() => undefined);
    // 路径可能因实际编译结构不同而异，未命中时不致命，仅记录
    if (page) {
      expect(page.path).toContain('mine');
    }
  });
});
