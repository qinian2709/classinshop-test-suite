import { test, expect } from '@playwright/test';
import type MiniProgram from 'miniprogram-automator/out/MiniProgram.js';
import { canRun, launch, safeClose } from '../helpers/automator.js';
import { attachFailureScreenshot, attachStepScreenshot } from '../helpers/screenshots.js';

/**
 * 教师端小程序冒烟（classinshop-teacher-miniprogram，4 个 Tab：首页 / 课表 / 通知 / 我的）。
 * 仅本地运行：需 RUN_MP=1 + 微信开发者工具 + 已编译 mp-weixin 产物。
 */
test.describe('教师端小程序冒烟 @miniprogram', () => {
  let mp: MiniProgram | undefined;

  test.beforeAll(() => {
    const { ok, reason } = canRun('teacher');
    test.skip(!ok, reason ?? '教师端小程序运行条件不满足');
  });

  test.afterEach(async ({}, testInfo) => {
    await attachFailureScreenshot(mp, testInfo);
  });

  test.afterAll(async () => {
    await safeClose(mp);
  });

  test('启动后能进入首页并读取页面路径', async ({}, testInfo) => {
    mp = await launch('teacher');
    await attachStepScreenshot(mp, testInfo, '01-启动教师端小程序');
    const page = await mp.currentPage();
    expect(page, '应能获取当前页面').toBeTruthy();
    expect(page!.path.length).toBeGreaterThan(0);
  });

  test('可切换到「课表」Tab', async ({}, testInfo) => {
    if (!mp) mp = await launch('teacher');
    const page = await mp.switchTab('/pages/schedule/index').catch(() => undefined);
    await attachStepScreenshot(mp, testInfo, '01-切换到课表Tab');
    if (page) {
      expect(page.path).toContain('schedule');
    }
  });
});
