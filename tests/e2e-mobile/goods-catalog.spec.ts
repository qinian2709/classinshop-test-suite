import { test, expect } from '@playwright/test';
import { env } from '@config';
import { attachStepScreenshot } from './helpers/screenshots.js';

/**
 * H5 商品搜索空态。搜索进详情、购买弹层与录播课共用一门未购录播课，见 recorded-ui.spec.ts。
 *
 * author：qiukailiang
 */
test.describe('H5 商品搜索与购买弹层 @smoke', () => {
  test.skip(!env.mobileBaseURL, '未配置 MOBILE_BASE_URL，跳过 H5 商品 UI 用例');

  test('搜索不存在的商品应展示空态', async ({ page }, testInfo) => {
    const keyword = `不存在的商品-${Date.now()}`;
    await page.goto(`/search?keyword=${encodeURIComponent(keyword)}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByPlaceholder('搜索商品名称'), '搜索页应展示商品搜索框').toBeVisible();
    await expect(page.getByText('未找到相关商品', { exact: true }), '无匹配商品时应展示空态').toBeVisible();
    await attachStepScreenshot(page, testInfo, '01-商品搜索空态已展示');
  });
});
