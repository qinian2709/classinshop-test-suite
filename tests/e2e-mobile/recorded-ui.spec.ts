import { test, expect } from './fixtures/authed.js';
import { env, hasApiCredential } from '@config';
import { RECORDED_DOC_ACTIVITY_TITLE, RECORDED_VIDEO_ACTIVITY_TITLE } from '@shared';
import { attachStepScreenshot } from './helpers/screenshots.js';
import { preparePurchasableRecordedCourse } from './helpers/mobile-api.js';
import {
  assertPaidLearnHome,
  assertTrialMaterialPreview,
  assertTrialVideoPlayer,
  openCatalogActivity,
  openCourseCatalogTab,
  openLearnActivity,
  openRecordedGoodsDetail,
  payZeroYuanFromPopup,
  playRecordedVideo,
  startLearningFromHome,
} from './helpers/recorded-flow.js';

/**
 * H5 录播课：先试看（视频+资料）再 UI 零元下单，购后完整观看。
 *
 * author：qiukailiang
 */
test.describe('H5 录播课购买与观看', () => {
  test.skip(!env.mobileBaseURL, '未配置 MOBILE_BASE_URL，跳过 H5 录播课场景');
  test.skip(!env.shopId, '未配置 SHOP_ID，跳过需上架录播课的场景');
  test.skip(!hasApiCredential(), '未配置商家鉴权，跳过需上架录播课的场景');

  test('试看视频和资料后可零元下单并观看正课', async ({ authedMobilePage: page }, testInfo) => {
    test.setTimeout(360_000);
    const prepared = await preparePurchasableRecordedCourse();
    test.skip(
      !prepared,
      '无法上架可播放录播课（需 data 目录视频/资料且转码成功），跳过购买观看场景',
    );

    try {
      await openRecordedGoodsDetail(page, testInfo, {
        id: prepared!.goodsId,
        name: prepared!.goodsName,
      });
      await openCourseCatalogTab(page);
      await expect(
        page.getByRole('button', { name: new RegExp(RECORDED_VIDEO_ACTIVITY_TITLE) }),
        '目录应展示可试看视频活动',
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: new RegExp(RECORDED_DOC_ACTIVITY_TITLE) }),
        '目录应展示可试看资料活动',
      ).toBeVisible();
      await expect(page.getByText('可试看').first(), '目录活动应标记可试看').toBeVisible();
      await expect(
        page.getByRole('button', { name: new RegExp(RECORDED_VIDEO_ACTIVITY_TITLE) }).getByText(/\d{2}:\d{2}/),
        '可试看视频应展示时长',
      ).toBeVisible();
      await expect(
        page.getByText('购买后查看'),
        '本场景两个活动均可试看，目录不应出现购买后查看锁',
      ).toHaveCount(0);
      await attachStepScreenshot(page, testInfo, '02-课程目录可试看已展示');

      await openCatalogActivity(page, RECORDED_VIDEO_ACTIVITY_TITLE);
      await assertTrialVideoPlayer(page, prepared!.goodsName);
      await attachStepScreenshot(page, testInfo, '03-视频试看已可播');

      await page.goBack({ waitUntil: 'domcontentloaded' });
      await expect(page, '从试看返回应回到商品详情').toHaveURL(
        new RegExp(`/goods/${prepared!.goodsId}(?:\\?|$)`),
      );
      await openCourseCatalogTab(page);

      await openCatalogActivity(page, RECORDED_DOC_ACTIVITY_TITLE);
      await assertTrialMaterialPreview(page);
      await attachStepScreenshot(page, testInfo, '04-资料试看已展示首页');

      await page.getByRole('button', { name: '立即购买' }).click();
      const orderId = await payZeroYuanFromPopup(page);
      prepared!.attachPaidOrder(orderId);
      expect(orderId, 'UI 下单应返回订单号以便清理').toBeGreaterThan(0);

      await assertPaidLearnHome(page, prepared!.goodsName);
      await attachStepScreenshot(page, testInfo, '05-购后学习首页已打开');

      await startLearningFromHome(page);
      await expect(page, '购后应打开正课播放页').toHaveURL(/\/recorded\/player/);
      await expect(page, '购后播放 URL 应带订单项').toHaveURL(/orderItemId=/);
      await expect(page.getByText('⏵ 试看', { exact: true }), '购后播放页不应再展示试看标记').toHaveCount(
        0,
      );
      await expect(page.getByText('购买课程学习全部内容'), '购后播放页不应再展示购买栏').toHaveCount(
        0,
      );
      await playRecordedVideo(page);
      await attachStepScreenshot(page, testInfo, '06-购后视频已可播');

      await page.goBack({ waitUntil: 'domcontentloaded' });
      await expect(page, '从正课返回应回到学习首页').toHaveURL(/\/recorded\/\d+/);
      await openLearnActivity(page, RECORDED_DOC_ACTIVITY_TITLE, ['预览', '查看']);
      await expect(page, '购后应打开完整资料预览').toHaveURL(/\/recorded\/material/);
      await expect(page.getByText(/试看仅展示前\s*\d+\s*页/), '购后资料不应再截断试看').toHaveCount(0);
      await attachStepScreenshot(page, testInfo, '07-购后资料可完整预览');
    } finally {
      await prepared!.cleanup();
    }
  });
});
