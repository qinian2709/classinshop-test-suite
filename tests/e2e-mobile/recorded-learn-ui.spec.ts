import { test, expect } from './fixtures/authed.js';
import { env, hasApiCredential } from '@config';
import { resolveAuthTokens } from '../../shared/auth/login.js';
import { attachStepScreenshot } from './helpers/screenshots.js';
import {
  preparePurchasedRecordedCourse,
  type PurchasedRecordedCourse,
} from './helpers/mobile-api.js';
import {
  assertPaidLearnHome,
  openPurchasedRecordedFromLearn,
  openStudyDataFromHome,
} from './helpers/recorded-flow.js';

/**
 * H5 已购录播课：学习页进课、学习数据。
 * 上架与零元下单走 API，报告焦点在页面操作。退款见 refund-ui.spec.ts。
 *
 * author：qiukailiang
 */
test.describe.serial('H5 已购录播课学习', () => {
  test.skip(!env.mobileBaseURL, '未配置 MOBILE_BASE_URL，跳过 H5 录播学习场景');
  test.skip(!env.shopId, '未配置 SHOP_ID，跳过需上架录播课的场景');
  test.skip(!hasApiCredential(), '未配置商家鉴权，跳过需上架录播课的场景');

  let prepared: PurchasedRecordedCourse | null = null;

  test.beforeAll(async () => {
    test.setTimeout(360_000);
    await resolveAuthTokens();
    prepared = await preparePurchasedRecordedCourse();
  });

  test.afterAll(async () => {
    await prepared?.cleanup();
  });

  test('学习页可搜到已购录播课并进入学习首页', async ({ authedMobilePage: page }, testInfo) => {
    test.skip(!prepared, '无法上架并购买录播课（需 data 目录视频/资料且转码成功），跳过学习页进课');

    await openPurchasedRecordedFromLearn(page, testInfo, prepared!.goodsName);
    await expect(page, '开始学习应进入录播学习首页').toHaveURL(
      new RegExp(`/recorded/${prepared!.orderItemId}(?:\\?|$)`),
    );
    await assertPaidLearnHome(page, prepared!.goodsName);
    await attachStepScreenshot(page, testInfo, '02-学习首页已从学习页打开');
  });

  test('学习首页可进入我的学习数据', async ({ authedMobilePage: page }, testInfo) => {
    test.skip(!prepared, '无法上架并购买录播课，跳过学习数据');

    await page.goto(`/recorded/${prepared!.orderItemId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('我的课程', { exact: true }), '应先打开学习首页').toBeVisible();
    await openStudyDataFromHome(page);
    await expect(page, '应进入我的学习数据页').toHaveURL(
      new RegExp(`/recorded/${prepared!.orderItemId}/study-data`),
    );
    await expect(page.getByText('我的学习数据', { exact: true }), '学习数据页应展示标题').toBeVisible();
    await expect(page.getByText(prepared!.goodsName), '学习数据应展示课程名').toBeVisible();
    await expect(page.getByText('学习概览', { exact: true }), '学习数据应展示学习概览').toBeVisible();
    await expect(page.getByText('累计学习', { exact: true }), '学习概览应展示累计学习').toBeVisible();
    await attachStepScreenshot(page, testInfo, '01-我的学习数据已打开');
  });
});
