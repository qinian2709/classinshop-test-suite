import { accounts, env } from '@config';
import { test, expect } from './fixtures/authed.js';
import { attachStepScreenshot } from './helpers/screenshots.js';
import {
  createFreeCoupon,
  findUserCoupon,
  resolveMobileShopContext,
  stopCoupon,
  voidCouponCode,
  type CreatedCoupon,
} from './helpers/mobile-api.js';

test.describe('H5 优惠券领取链路 @smoke', () => {
  test.skip(!env.mobileBaseURL, '未配置 MOBILE_BASE_URL，跳过 H5 优惠券 UI 用例');
  test.skip(!accounts.token, '未配置商家 TEST_TOKEN，跳过需要创建优惠券的 UI 用例');
  test.skip(!accounts.mobileToken, '未配置 MOBILE_TEST_TOKEN，跳过 H5 登录态领券用例');

  test('商家创建免费券后，C 端可领取并在我的优惠券中展示', async ({ authedMobilePage: page }, testInfo) => {
    const shop = await resolveMobileShopContext(testInfo);
    expect(shop.shopId, '优惠券 UI 链路应能解析商家 shopId').toBeTruthy();

    let coupon: CreatedCoupon | undefined;
    let couponCodeId: number | undefined;

    try {
      coupon = await createFreeCoupon(testInfo, shop.shopId!);

      await page.goto(`/coupon/share/${coupon.id}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByText('优惠券', { exact: true }), '优惠券落地页应展示标题').toBeVisible();
      await expect(page.getByText('无门槛可用'), '免费券落地页应展示无门槛文案').toBeVisible();
      await expect(page.getByRole('button', { name: '立即领取' }), '领取前应展示立即领取按钮').toBeVisible();
      await attachStepScreenshot(page, testInfo, '01-优惠券落地页可领取');

      const receiveResponse = page.waitForResponse(
        (response) =>
          response.url().includes(`/shop/coupon/${coupon!.id}/receive`) &&
          response.request().method() === 'POST',
      );
      await page.getByRole('button', { name: '立即领取' }).click();
      await receiveResponse;

      await expect(page.getByRole('button', { name: '已领取' }), '领取成功后按钮应变为已领取').toBeVisible();
      await attachStepScreenshot(page, testInfo, '02-优惠券已领取');

      await page.goto('/coupons', { waitUntil: 'domcontentloaded' });
      await expect(page.getByText('我的优惠券'), '我的优惠券页面应展示标题').toBeVisible();
      await expect(page.getByRole('tab', { name: '未使用' }), '券包应展示未使用 Tab').toBeVisible();
      await expect(page.getByText(coupon.name), '券包未使用列表应展示刚领取的测试券').toBeVisible();
      await expect(page.getByText('免费领取', { exact: true }), '券包应标识优惠券来源为免费领取').toBeVisible();
      await attachStepScreenshot(page, testInfo, '03-我的优惠券已展示测试券');

      const userCoupon = await findUserCoupon(testInfo, coupon.id, shop);
      expect(userCoupon, '接口校验：我的券包应包含刚领取的测试券').toBeTruthy();
      expect(userCoupon?.name, '接口校验：我的券包应回显测试券名称').toBe(coupon.name);
      expect(userCoupon?.displayStatus, '接口校验：测试券应处于未使用状态').toBe(1);
      couponCodeId = userCoupon?.couponCodeId;
    } finally {
      if (couponCodeId && shop.shopId) {
        await voidCouponCode(testInfo, shop.shopId, couponCodeId).catch((error: unknown) =>
          testInfo.attach('H5 优惠券券码清理失败.txt', {
            contentType: 'text/plain',
            body: String(error),
          }),
        );
      }
      if (coupon && shop.shopId) {
        await stopCoupon(testInfo, shop.shopId, coupon.id).catch((error: unknown) =>
          testInfo.attach('H5 优惠券模板清理失败.txt', {
            contentType: 'text/plain',
            body: String(error),
          }),
        );
      }
    }
  });
});
