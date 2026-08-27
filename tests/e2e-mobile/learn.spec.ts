import { test as authedTest, expect as authedExpect } from './fixtures/authed.js';
import { test, expect } from '@playwright/test';
import { env } from '@config';
import { attachStepScreenshot } from './helpers/screenshots.js';
import { MobileLearnPage } from './pages/MobileLearnPage.js';

/**
 * H5 学习页：未登录引导、已登录筛选 Tab。
 * author：qiukailiang
 */
test.describe('H5 学习页（未登录）@smoke', () => {
  test.skip(!env.mobileBaseURL, '未配置 MOBILE_BASE_URL，跳过 H5 学习页用例');

  test('未登录访问学习页应展示引导与登录入口', async ({ page }, testInfo) => {
    const learn = new MobileLearnPage(page);
    await learn.goto();
    await expect(learn.guestGuideBuy, '未登录学习页应展示如何购买课程').toBeVisible();
    await expect(page.getByText('如何进班学习', { exact: true }), '未登录学习页应展示如何进班学习').toBeVisible();
    await expect(learn.guestLoginHint, '未登录学习页应展示立即登录').toBeVisible();
    await attachStepScreenshot(page, testInfo, '01-未登录学习页已展示');
  });
});

authedTest.describe('H5 学习页（已登录）@smoke', () => {
  authedTest.skip(!env.mobileBaseURL, '未配置 MOBILE_BASE_URL，跳过 H5 学习页用例');

  authedTest('已登录学习页可切换商品范围与课程类型', async ({ authedMobilePage: page }, testInfo) => {
    const learn = new MobileLearnPage(page);
    await learn.goto();
    await authedExpect(learn.searchBox, '学习页应展示课程搜索框').toBeVisible();
    await authedExpect(learn.shopScope('小店商品'), '学习页应展示小店商品入口').toBeVisible();
    await authedExpect(learn.shopScope('公域商品'), '学习页应展示公域商品入口').toBeVisible();
    await authedExpect(learn.typeFilter(/^全部/), '学习页应展示全部筛选').toBeVisible();
    await authedExpect(learn.typeFilter(/^录播课/), '学习页应展示录播课筛选').toBeVisible();
    await authedExpect(learn.typeFilter(/^预约课/), '学习页应展示预约课筛选').toBeVisible();
    await authedExpect(learn.typeFilter(/^固定课/), '学习页应展示固定课筛选').toBeVisible();
    await attachStepScreenshot(page, testInfo, '01-已登录学习页已展示');

    await learn.typeFilter(/^预约课/).click();
    await authedExpect(learn.typeFilter(/^预约课/), '切换后预约课筛选应保持可见').toBeVisible();
    await attachStepScreenshot(page, testInfo, '02-已切换预约课');

    await learn.typeFilter(/^固定课/).click();
    await authedExpect(learn.typeFilter(/^固定课/), '切换后固定课筛选应保持可见').toBeVisible();
    await attachStepScreenshot(page, testInfo, '03-已切换固定课');
  });
});
