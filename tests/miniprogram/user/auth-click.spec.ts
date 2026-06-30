import { test, expect } from '@playwright/test';
import type MiniProgram from 'miniprogram-automator/out/MiniProgram.js';
import type Page from 'miniprogram-automator/out/Page.js';
import type Element from 'miniprogram-automator/out/Element.js';
import { accounts } from '@config';
import { canRun, launch, safeClose } from '../helpers/automator.js';
import { buildStudentAuthState, hasMiniProgramAuth, installMiniProgramAuth } from '../helpers/auth.js';
import { attachFailureScreenshot, attachStepScreenshot } from '../helpers/screenshots.js';

async function pageText(page: Page): Promise<string> {
  const elements = (await page.$$('text')) as Element[];
  const texts = await Promise.all(elements.map((element) => element.text().catch(() => '')));
  return texts.join('\n');
}

async function tapText(page: Page, text: string): Promise<void> {
  const elements = (await page.$$('text')) as Element[];
  for (const element of elements) {
    const current = await element.text().catch(() => '');
    if (current.trim() === text) {
      await element.tap();
      return;
    }
  }
  throw new Error(`未找到可点击文本：${text}`);
}

/**
 * 用户端小程序 UI：注入 C 端登录态后进入「我的」，点击「地址管理」并验证跳转。
 *
 * 运行前提：
 * 1. RUN_MP=1。
 * 2. 微信开发者工具 CLI 可用。
 * 3. classinshop-miniprogram 已编译到 MP_USER_PROJECT。
 * 4. .env.local 配置 MINIPROGRAM_USER_TEST_TOKEN。
 */
test.describe('用户端小程序登录态与点击 @miniprogram', () => {
  let mp: MiniProgram | undefined;

  test.beforeAll(() => {
    const { ok, reason } = canRun('user');
    test.skip(!ok, reason ?? '用户端小程序运行条件不满足');
    test.skip(!accounts.miniprogram.userToken, '未配置 MINIPROGRAM_USER_TEST_TOKEN，跳过用户端小程序登录态注入用例');
  });

  test.afterEach(async ({}, testInfo) => {
    await attachFailureScreenshot(mp, testInfo);
  });

  test.afterAll(async () => {
    await safeClose(mp);
  });

  test('注入登录态后可进入我的页面并点击地址管理', async ({}, testInfo) => {
    mp = await launch('user');
    await attachStepScreenshot(mp, testInfo, '01-启动用户端小程序');

    await installMiniProgramAuth(mp, buildStudentAuthState());
    expect(await hasMiniProgramAuth(mp), '应写入用户端小程序登录态 storage').toBe(true);
    await attachStepScreenshot(mp, testInfo, '02-注入登录态');

    const homePage = await mp.reLaunch('/pages/index/index');
    expect(homePage, '应能打开首页并触发真实用户信息加载').toBeTruthy();
    await homePage!.waitFor(2_000);
    await attachStepScreenshot(mp, testInfo, '03-打开首页加载真实用户信息');

    const minePage = await mp.reLaunch('/pages/mine/index');
    expect(minePage, '应能打开我的页面').toBeTruthy();
    await minePage!.waitFor(1_000);
    await attachStepScreenshot(mp, testInfo, '04-进入我的页面');

    const mineText = await pageText(minePage!);
    expect(mineText, '登录后我的页不应展示未登录入口').not.toContain('登录 / 注册');
    expect(mineText, '登录后我的页应展示购课订单入口').toContain('购课订单');
    expect(mineText, '登录后我的页应展示地址管理入口').toContain('地址管理');

    await tapText(minePage!, '地址管理');
    await minePage!.waitFor(1_000);
    await attachStepScreenshot(mp, testInfo, '05-点击地址管理');

    const currentPage = await mp.currentPage();
    expect(currentPage?.path, '点击地址管理后应跳转到地址管理页').toContain('pages/address/index');
  });
});
