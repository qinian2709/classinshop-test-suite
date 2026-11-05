import { test, expect } from './fixtures/authed.js';
import { env, hasApiCredential } from '@config';
import { resolveAuthTokens } from '../../shared/auth/login.js';
import { attachStepScreenshot } from './helpers/screenshots.js';
import {
  preparePurchasableFixedCourse,
  type PurchasableFixedCourse,
} from './helpers/mobile-api.js';
import { openRecordedGoodsDetail, submitZeroYuanCheckout } from './helpers/recorded-flow.js';

/**
 * H5 固定课：搜索详情 → 零元下单 → 学习页进班。
 *
 * author：qiukailiang
 */
test.describe.serial('H5 固定课购买与进班', () => {
  test.skip(!env.mobileBaseURL, '未配置 MOBILE_BASE_URL，跳过 H5 固定课场景');
  test.skip(!env.shopId, '未配置 SHOP_ID，跳过需上架固定课的场景');
  test.skip(!hasApiCredential(), '未配置商家鉴权，跳过需上架固定课的场景');

  let prepared: PurchasableFixedCourse | null = null;
  let orderItemId = 0;

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    await resolveAuthTokens();
    prepared = await preparePurchasableFixedCourse();
  });

  test.afterAll(async () => {
    await prepared?.cleanup();
  });

  test('搜索固定课后可零元下单', async ({ authedMobilePage: page }, testInfo) => {
    test.setTimeout(180_000);
    test.skip(!prepared, '无法上架零元固定课（需绑定 ClassIn 班级），跳过购买场景');

    await openRecordedGoodsDetail(page, testInfo, {
      id: prepared!.goodsId,
      name: prepared!.goodsName,
    });
    await expect(page.getByRole('button', { name: '立即购买' }), '未购固定课详情应展示立即购买').toBeVisible();
    await page.getByRole('button', { name: '立即购买' }).click();
    const created = await submitZeroYuanCheckout(page);
    prepared!.attachPaidOrder(created.orderId);
    orderItemId = created.orderItemId;
    expect(created.orderId, 'UI 下单应返回订单号以便清理').toBeGreaterThan(0);
    await attachStepScreenshot(page, testInfo, '02-固定课零元单已创建');
  });

  test('学习页可找到已购固定课并进入进班页', async ({ authedMobilePage: page }, testInfo) => {
    test.skip(!prepared || !orderItemId, '上一例未买到固定课，跳过进班场景');

    await page.goto('/learn', { waitUntil: 'domcontentloaded' });
    await page.locator('#root').waitFor({ state: 'attached', timeout: 15_000 });
    await page.getByRole('button', { name: /^固定课/ }).click();
    const search = page.getByPlaceholder(/搜索课程名/);
    await expect(search, '学习页应展示课程搜索框').toBeVisible();
    await search.fill(prepared!.goodsName);
    await page.waitForTimeout(800);

    const studyButton = page.getByText('进班学习', { exact: true }).first();
    await expect(studyButton, '学习列表应展示刚购买固定课的进班学习').toBeVisible();
    await attachStepScreenshot(page, testInfo, '01-学习页已找到已购固定课');
    await studyButton.click();

    await expect(page, '进班学习应打开班级邀请页').toHaveURL(
      new RegExp(`/qrcode\\?.*orderItemsId=${orderItemId}`),
    );
    await expect(page.getByText('班级邀请已就绪！', { exact: true }), '进班页应展示邀请就绪').toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText('复制链接', { exact: true }), '进班页应展示复制链接，不自动打开教室').toBeVisible();
    await attachStepScreenshot(page, testInfo, '02-固定课进班页已打开');
  });
});
