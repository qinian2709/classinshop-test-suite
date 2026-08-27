import { test, expect } from './fixtures/authed.js';
import { env, hasApiCredential } from '@config';
import { attachStepScreenshot } from './helpers/screenshots.js';
import { goFromLearnToConfirm, pickChangeApplySlot } from './helpers/appointment-flow.js';
import { prepareBookableAppointment } from './helpers/mobile-api.js';

/**
 * H5 学生约课，按业务场景覆盖（对齐 API 约课链路）。
 *
 * 场景 1：已购预约课 → 学习页去约课 → 选可约时段 → 进入确认页（不提交）。
 * 场景 2：确认预约成功 → 我的预约「待上课」可见 → 取消后出现在「已取消」。
 * 场景 3：确认预约成功 → 申请改约选新时段并提交 → 新约即将上课、原约已改约。
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

  test('确认预约后出现在待上课，取消后出现在已取消', async ({ authedMobilePage: page }, testInfo) => {
    test.setTimeout(180_000);
    const prepared = await prepareBookableAppointment();
    test.skip(!prepared, '无法准备可约课订单（需启用约课老师），跳过预约取消场景');

    try {
      await goFromLearnToConfirm(page, testInfo, prepared!.goodsName);

      await expect(
        page.getByRole('button', { name: '确认预约' }),
        '确认页应展示可提交的确认预约按钮',
      ).toBeEnabled();
      await page.getByRole('button', { name: '确认预约' }).click();
      await page.getByRole('button', { name: '确认', exact: true }).click();

      await expect(page, '预约成功应进入我的预约').toHaveURL(/\/appointment\/my(?:\?|$)/);
      await expect(page.getByText('我的预约', { exact: true }), '应展示我的预约标题').toBeVisible();
      await expect(page.getByText(prepared!.goodsName), '待上课列表应展示刚预约的课程').toBeVisible();
      await attachStepScreenshot(page, testInfo, '05-待上课已展示新预约');

      await page.getByText(prepared!.goodsName).first().click();
      await expect(page, '应进入预约详情').toHaveURL(/\/appointment\/my\/\d+/);
      await page.getByRole('button', { name: '取消预约' }).click();
      await expect(page.getByText('确认取消本节预约课时？'), '应弹出取消确认').toBeVisible();
      await page.getByRole('button', { name: '确定', exact: true }).click();
      await expect(page.getByText('已取消', { exact: true }), '详情状态应变为已取消').toBeVisible();
      await attachStepScreenshot(page, testInfo, '06-预约已取消');

      await page.goto('/appointment/my', { waitUntil: 'domcontentloaded' });
      const cancelledTab = page.getByRole('tab', { name: '已取消' });
      if (await cancelledTab.isVisible().catch(() => false)) {
        await cancelledTab.click();
      } else {
        await page.getByText('已取消', { exact: true }).click();
      }
      await expect(page.getByText(prepared!.goodsName), '已取消列表应展示刚取消的课程').toBeVisible();
      await attachStepScreenshot(page, testInfo, '07-已取消列表已展示');
    } finally {
      await prepared!.cleanup();
    }
  });

  test('约成后可改约，新约进即将上课且原约变为已改约', async ({ authedMobilePage: page }, testInfo) => {
    test.setTimeout(180_000);
    const prepared = await prepareBookableAppointment();
    test.skip(!prepared, '无法准备可约课订单（需启用约课老师），跳过改约场景');

    try {
      await goFromLearnToConfirm(page, testInfo, prepared!.goodsName);

      await expect(
        page.getByRole('button', { name: '确认预约' }),
        '确认页应展示可提交的确认预约按钮',
      ).toBeEnabled();
      await page.getByRole('button', { name: '确认预约' }).click();
      await page.getByRole('button', { name: '确认', exact: true }).click();

      await expect(page, '预约成功应进入我的预约').toHaveURL(/\/appointment\/my(?:\?|$)/);
      await expect(page.getByText(prepared!.goodsName), '待上课列表应展示刚预约的课程').toBeVisible();
      await attachStepScreenshot(page, testInfo, '05-待上课已展示待改约课程');

      await page.getByText(prepared!.goodsName).first().click();
      await expect(page, '应进入预约详情').toHaveURL(/\/appointment\/my\/\d+/);
      await expect(page.getByRole('button', { name: '申请改约' }), '待上课详情应展示申请改约').toBeVisible();
      await page.getByRole('button', { name: '申请改约' }).click();

      await expect(page, '申请改约应进入改约页').toHaveURL(/\/appointment\/my\/\d+\/change/);
      await expect(page.getByText('改约', { exact: true }).first(), '改约页应展示标题').toBeVisible();
      await attachStepScreenshot(page, testInfo, '06-改约页已打开');

      await pickChangeApplySlot(page);
      await page.getByRole('button', { name: '临时有事', exact: true }).click();
      await expect(page.getByRole('button', { name: '确认改约' }), '选好时段和原因后应可提交改约').toBeEnabled();
      await page.getByRole('button', { name: '确认改约' }).click();

      // 改约成功落地是 /my-appointment（即将上课/已改约），不是约成后的 /appointment/my。
      await expect(page, '改约成功应进入我的预约（即将上课）').toHaveURL(/\/my-appointment(?:\?|$)/);
      await expect(page.getByText('我的预约', { exact: true }), '应展示我的预约标题').toBeVisible();
      await expect(page.getByText(prepared!.goodsName), '即将上课应展示改约后的新预约').toBeVisible();
      await attachStepScreenshot(page, testInfo, '07-改约后即将上课已展示');

      await page.getByRole('button', { name: '已改约' }).click();
      await expect(page.getByText(prepared!.goodsName), '已改约列表应展示原预约').toBeVisible();
      await attachStepScreenshot(page, testInfo, '08-已改约列表已展示原预约');
    } finally {
      await prepared!.cleanup();
    }
  });
});
