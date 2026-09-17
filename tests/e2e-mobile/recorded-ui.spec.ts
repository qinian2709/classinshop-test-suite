import { test, expect } from './fixtures/authed.js';
import { env, hasApiCredential } from '@config';
import { resolveAuthTokens } from '../../shared/auth/login.js';
import { RECORDED_DOC_ACTIVITY_TITLE, RECORDED_VIDEO_ACTIVITY_TITLE } from '@shared';
import { attachStepScreenshot } from './helpers/screenshots.js';
import {
  preparePurchasableRecordedCourse,
  type PurchasableRecordedCourse,
} from './helpers/mobile-api.js';
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
 * H5 商品搜索、购买弹层、录播试看购后观看：共用一门未购录播课。
 * 先搜详情、打开弹层（不付款），再试看下单；afterAll 退款后删课。
 *
 * author：qiukailiang
 */
test.describe.serial('H5 录播课购买与观看', () => {
  test.skip(!env.mobileBaseURL, '未配置 MOBILE_BASE_URL，跳过 H5 录播课场景');
  test.skip(!env.shopId, '未配置 SHOP_ID，跳过需上架录播课的场景');
  test.skip(!hasApiCredential(), '未配置商家鉴权，跳过需上架录播课的场景');

  let prepared: PurchasableRecordedCourse | null = null;

  test.beforeAll(async () => {
    test.setTimeout(360_000);
    await resolveAuthTokens();
    prepared = await preparePurchasableRecordedCourse();
  });

  test.afterAll(async () => {
    await prepared?.cleanup();
  });

  test('搜索商品后可进入商品详情 @smoke', async ({ authedMobilePage: page }, testInfo) => {
    test.skip(!prepared, '无法上架可播放录播课（需 data 目录视频/资料且转码成功），跳过商品搜索详情场景');
    await openRecordedGoodsDetail(page, testInfo, {
      id: prepared!.goodsId,
      name: prepared!.goodsName,
    });
    await expect(page.getByText('商品', { exact: true }), '商品详情页应展示商品 Tab').toBeVisible();
    await expect(page.getByText('详情', { exact: true }), '商品详情页应展示详情 Tab').toBeVisible();
    await expect(page.getByRole('button', { name: '立即购买' }), '未购录播课详情应展示立即购买').toBeVisible();
    await attachStepScreenshot(page, testInfo, '02-商品详情已展示');
  });

  test('商品详情可打开购买确认弹层但不发起支付 @smoke', async ({ authedMobilePage: page }, testInfo) => {
    test.skip(!prepared, '无法上架可播放录播课（需 data 目录视频/资料且转码成功），跳过购买弹层场景');
    await openRecordedGoodsDetail(page, testInfo, {
      id: prepared!.goodsId,
      name: prepared!.goodsName,
    });
    await attachStepScreenshot(page, testInfo, '01-准备打开购买弹层');

    await page.getByRole('button', { name: '立即购买' }).click();

    await expect(page.getByText(/我已阅读并同意/), '购买弹层应展示协议勾选区').toBeVisible();
    await expect(page.getByRole('button', { name: /^立即支付 ¥/ }), '购买弹层应展示立即支付按钮').toBeVisible();
    await attachStepScreenshot(page, testInfo, '02-购买确认弹层已展示');
  });

  test('试看视频和资料后可零元下单并观看正课', async ({ authedMobilePage: page }, testInfo) => {
    test.setTimeout(360_000);
    test.skip(
      !prepared,
      '无法上架可播放录播课（需 data 目录视频/资料且转码成功），跳过购买观看场景',
    );

    await openRecordedGoodsDetail(page, testInfo, {
      id: prepared!.goodsId,
      name: prepared!.goodsName,
    });
    await openCourseCatalogTab(page);
    const videoActivity = page.getByText(RECORDED_VIDEO_ACTIVITY_TITLE);
    const docActivity = page.getByText(RECORDED_DOC_ACTIVITY_TITLE);
    await expect(videoActivity, '目录应展示可试看视频活动').toBeVisible();
    await expect(page.getByText('试听').first(), '目录视频应标记可试看').toBeVisible();
    await expect(page.getByText(/\d{2}:\d{2}/).first(), '可试看视频应展示时长').toBeVisible();
    await expect(docActivity, '目录应包含可试看资料活动').toBeAttached();
    await docActivity.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
    await expect(docActivity, '目录应展示可试看资料活动').toBeVisible();
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
  });
});
