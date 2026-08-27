import { test, expect } from './fixtures/authed.js';
import { env, hasApiCredential } from '@config';
import { attachStepScreenshot } from './helpers/screenshots.js';
import {
  CANCEL_LEAD_HOURS,
  assertCancelledListHasAppointment,
  cancelAppointmentOnDetail,
  confirmBookAndOpenDetail,
  goFromLearnToConfirm,
  pickChangeApplySlot,
  submitChangeAndResolveNewAppointment,
} from './helpers/appointment-flow.js';
import { prepareBookableAppointment } from './helpers/mobile-api.js';

/**
 * H5 学生约课，按业务场景覆盖（对齐 API 约课链路）。
 *
 * 场景 1：已购预约课 → 学习页去约课 → 选可约时段 → 进入确认页（不提交）。
 * 场景 2：预约 → 改约 → 取消新约。原约停在已改约，新约最终已取消，不留待上课。
 *
 * author：qiukailiang
 */
test.describe.serial('H5 学生约课', () => {
  test.skip(!env.mobileBaseURL, '未配置 MOBILE_BASE_URL，跳过 H5 约课场景');
  test.skip(!env.shopId, '未配置 SHOP_ID，跳过需上架预约课的场景');
  test.skip(!hasApiCredential(), '未配置商家鉴权，跳过需上架预约课的场景');

  test('已购预约课可从学习页选到时段并进入确认页', async ({ authedMobilePage: page }, testInfo) => {
    test.setTimeout(180_000);
    const prepared = await prepareBookableAppointment();
    test.skip(!prepared, '无法准备可约课订单（需启用约课老师），跳过选时段场景');

    try {
      await goFromLearnToConfirm(page, testInfo, prepared!.goodsName);
      await expect(
        page.getByRole('button', { name: '确认预约' }),
        '确认页应展示确认预约按钮且本场景不提交',
      ).toBeVisible();
    } finally {
      await prepared!.cleanup();
    }
  });

  test('预约后可改约，再取消新约，原约留在已改约', async ({ authedMobilePage: page }, testInfo) => {
    test.setTimeout(180_000);
    const prepared = await prepareBookableAppointment();
    test.skip(!prepared, '无法准备可约课订单（需启用约课老师），跳过预约改约取消场景');

    try {
      await goFromLearnToConfirm(page, testInfo, prepared!.goodsName, {
        minHoursAhead: CANCEL_LEAD_HOURS,
      });
      const originalId = await confirmBookAndOpenDetail(page);
      await expect(page.getByText(prepared!.goodsName, { exact: true }), '详情应展示刚预约的课程').toBeVisible();
      await expect(page.getByText('待上课', { exact: true }), '刚预约详情应为待上课').toBeVisible();
      await attachStepScreenshot(page, testInfo, '05-待上课详情已打开刚预约记录');

      await expect(page.getByRole('button', { name: '申请改约' }), '待上课详情应展示申请改约').toBeVisible();
      await page.getByRole('button', { name: '申请改约' }).click();
      await expect(page, '申请改约应进入该预约的改约页').toHaveURL(
        new RegExp(`/appointment/my/${originalId}/change`),
      );
      await expect(page.getByText('改约', { exact: true }).first(), '改约页应展示标题').toBeVisible();
      await attachStepScreenshot(page, testInfo, '06-改约页已打开');

      await pickChangeApplySlot(page);
      await page.getByRole('button', { name: '临时有事', exact: true }).click();
      await expect(page.getByRole('button', { name: '确认改约' }), '选好时段和原因后应可提交改约').toBeEnabled();
      const newId = await submitChangeAndResolveNewAppointment(page, originalId, prepared!.goodsName);
      expect(newId, '改约后应得到新预约 ID').not.toBe(originalId);
      await expect(page.getByText('我的预约', { exact: true }), '应展示我的预约标题').toBeVisible();
      await expect(page.getByText(prepared!.goodsName, { exact: true }), '即将上课应展示改约后的新预约').toBeVisible();
      await attachStepScreenshot(page, testInfo, '07-改约后即将上课已展示新约');

      await page.getByRole('button', { name: '已改约' }).click();
      await expect(page.getByText(prepared!.goodsName, { exact: true }), '已改约列表应展示原预约').toBeVisible();
      await attachStepScreenshot(page, testInfo, '08-已改约列表已展示原预约');

      await page.goto(`/appointment/my/${newId}`, { waitUntil: 'domcontentloaded' });
      await expect(page, '应打开改约后的新预约详情').toHaveURL(
        new RegExp(`/appointment/my/${newId}(?:\\?|$)`),
      );
      await expect(page.getByText(prepared!.goodsName, { exact: true }), '新约详情应展示同一课程').toBeVisible();
      await expect(page.getByText('待上课', { exact: true }), '改约后的新约应为待上课').toBeVisible();
      await cancelAppointmentOnDetail(page, newId);
      await attachStepScreenshot(page, testInfo, '09-新约已取消');

      await assertCancelledListHasAppointment(page, newId, prepared!.goodsName);
      await attachStepScreenshot(page, testInfo, '10-已取消列表已展示刚取消的新约');
    } finally {
      await prepared!.cleanup();
    }
  });
});
