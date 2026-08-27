import { test, expect } from '@playwright/test';
import { env } from '@config';
import type { Page, TestInfo } from '@playwright/test';
import { attachStepScreenshot } from './helpers/screenshots.js';
import {
  findPublishedMobileGoods,
  resolveMobileShopContext,
  type MobileGoodsSummary,
} from './helpers/mobile-api.js';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function openGoodsDetailFromSearch(
  page: Page,
  testInfo: TestInfo,
  goods: MobileGoodsSummary,
): Promise<void> {
  await page.goto(`/search?keyword=${encodeURIComponent(goods.name)}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByPlaceholder('搜索商品名称'), '搜索页应展示商品搜索框').toBeVisible();
  await expect(page.locator('#root'), '搜索页应展示搜索结果摘要').toContainText(`与“${goods.name}”相关的商品`);
  await attachStepScreenshot(page, testInfo, '01-商品搜索结果已展示');

  const goodsCard = page.getByRole('button', { name: new RegExp(escapeRegExp(goods.name)) });
  await expect(goodsCard, '搜索结果应包含前置商品卡片').toBeVisible();
  await goodsCard.click();

  await expect(page, '点击商品卡片后应进入商品详情页').toHaveURL(new RegExp(`/goods/${goods.id}(?:\\?|$)`));
  await expect(page.getByRole('heading', { name: goods.name }), '商品详情页应展示商品标题').toBeVisible();
}

test.describe('H5 商品搜索与购买弹层 @smoke', () => {
  test.skip(!env.mobileBaseURL, '未配置 MOBILE_BASE_URL，跳过 H5 商品 UI 用例');

  test('搜索商品后可进入商品详情', async ({ page }, testInfo) => {
    const shop = await resolveMobileShopContext(testInfo);
    const goods = await findPublishedMobileGoods(testInfo, shop);

    await openGoodsDetailFromSearch(page, testInfo, goods);
    await expect(page.getByText('商品', { exact: true }), '商品详情页应展示商品 Tab').toBeVisible();
    await expect(page.getByText('详情', { exact: true }), '商品详情页应展示详情 Tab').toBeVisible();
    await expect(page.getByRole('button', { name: '立即购买' }), '商品详情页应展示立即购买按钮').toBeVisible();
    await attachStepScreenshot(page, testInfo, '02-商品详情已展示');
  });

  test('搜索不存在的商品应展示空态', async ({ page }, testInfo) => {
    const keyword = `不存在的商品-${Date.now()}`;
    await page.goto(`/search?keyword=${encodeURIComponent(keyword)}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByPlaceholder('搜索商品名称'), '搜索页应展示商品搜索框').toBeVisible();
    await expect(page.getByText('未找到相关商品', { exact: true }), '无匹配商品时应展示空态').toBeVisible();
    await attachStepScreenshot(page, testInfo, '01-商品搜索空态已展示');
  });

  test('商品详情可打开购买确认弹层但不发起支付', async ({ page }, testInfo) => {
    const shop = await resolveMobileShopContext(testInfo);
    const goods = await findPublishedMobileGoods(testInfo, shop);

    await openGoodsDetailFromSearch(page, testInfo, goods);
    await attachStepScreenshot(page, testInfo, '01-准备打开购买弹层');

    await page.getByRole('button', { name: '立即购买' }).click();

    await expect(page.getByText('我已阅读并同意', { exact: true }), '购买弹层应展示协议勾选区').toBeVisible();
    await expect(page.getByRole('button', { name: /^立即支付 ¥/ }), '购买弹层应展示立即支付按钮').toBeVisible();
    await attachStepScreenshot(page, testInfo, '02-购买确认弹层已展示');
  });
});
