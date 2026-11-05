import type { Locator, Page, TestInfo } from '@playwright/test';
import { expect } from '@playwright/test';
import {
  RECORDED_DOC_ACTIVITY_TITLE,
  RECORDED_VIDEO_ACTIVITY_TITLE,
} from '@shared';
import { attachStepScreenshot } from './screenshots.js';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function scrollSectionIntoView(locator: Locator): Promise<void> {
  await expect(locator).toBeAttached({ timeout: 15_000 });
  await locator.evaluate((el) => {
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
  });
}

async function waitReady(page: Page): Promise<void> {
  await page.locator('#root').waitFor({ state: 'attached', timeout: 15_000 });
}

export async function openRecordedGoodsDetail(
  page: Page,
  testInfo: TestInfo,
  goods: { id: number; name: string },
): Promise<void> {
  await page.goto(`/search?keyword=${encodeURIComponent(goods.name)}`, {
    waitUntil: 'domcontentloaded',
  });
  await waitReady(page);
  await expect(page.getByPlaceholder('搜索商品名称'), '搜索页应展示商品搜索框').toBeVisible();

  await expect(page.locator('#root'), '搜索页应展示搜索结果摘要').toContainText(
    `与“${goods.name}”相关的商品`,
  );
  const goodsCard = page.getByRole('button', { name: new RegExp(escapeRegExp(goods.name)) });
  await expect(goodsCard, '搜索结果应包含刚上架的录播课').toBeVisible();
  await goodsCard.click();

  await expect(page, '应进入录播课商品详情').toHaveURL(new RegExp(`/goods/${goods.id}(?:\\?|$)`));
  await expect(page.getByRole('heading', { name: goods.name }), '详情页应展示录播课标题').toBeVisible();
  await attachStepScreenshot(page, testInfo, '01-录播课商品详情已打开');
}

export async function openCourseCatalogTab(page: Page): Promise<void> {
  // 详情 Tab 文案是「目录」，区块标题才是「课程目录」，二者都在商品页上。
  const catalogHeading = page.getByText('课程目录', { exact: true });
  await scrollSectionIntoView(catalogHeading);
  await expect(catalogHeading, '录播课详情应展示课程目录').toBeVisible();
  await expect(page.getByText('试听').first(), '目录应标记可试看活动').toBeVisible();
}

export async function openCatalogActivity(page: Page, title: string): Promise<void> {
  const activity = page.getByRole('button', { name: new RegExp(escapeRegExp(title)) });
  await scrollSectionIntoView(activity);
  await expect(activity, `目录应展示活动「${title}」`).toBeVisible();
  await activity.click();
}

export async function assertTrialVideoPlayer(page: Page, goodsName: string): Promise<void> {
  await expect(page, '试看视频应打开播放页').toHaveURL(/\/recorded\/player/);
  await expect(page, '未购试看 URL 应带 productId 而非订单').toHaveURL(/productId=/);
  await expect(page.getByText('⏵ 试看', { exact: true }), '试看播放页应展示试看标记').toBeVisible();
  await expect(page.getByText('请前往小程序观看'), '试看不应被手机页门闸拦截').toHaveCount(0);
  await expect(
    page.getByText('购买课程学习全部内容'),
    '试看播放页应展示底部购买栏',
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '立即购买' }), '试看购买栏应可下单').toBeVisible();
  await expect(page.getByText(`来自《${goodsName}》`), '试看页应回显课程来源').toBeVisible();
  await expect(page.getByText(/\d{2}:\d{2}/).first(), '试看播放页应展示视频时长').toBeVisible();
  await playRecordedVideo(page);
}

export async function assertTrialMaterialPreview(page: Page): Promise<void> {
  await expect(page, '试看资料应打开资料预览页').toHaveURL(/\/recorded\/material/);
  await expect(page, '未购试看资料 URL 应带 productId').toHaveURL(/productId=/);
  await expect(page.getByText('请前往小程序观看'), '试看资料不应被手机页门闸拦截').toHaveCount(0);
  await expect(
    page.getByText(/试看仅展示前\s*\d+\s*页/),
    '资料试看应提示仅展示首页',
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByText('购买课程学习全部内容'),
    '试看资料页应展示底部购买栏',
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '立即购买' }), '试看资料购买栏应可下单').toBeVisible();
}

export async function playRecordedVideo(page: Page): Promise<void> {
  await expect(page.getByText('视频转码中，请稍后再试'), '进入播放页后转码应结束').toBeHidden({
    timeout: 60_000,
  });
  // 暂停时中央大按钮和底栏按钮都叫「播放视频」，严格模式会命中两个。
  const playButton = page.getByRole('button', { name: '播放视频' }).first();
  const pauseButton = page.getByRole('button', { name: '暂停视频' }).first();
  if (await pauseButton.isVisible().catch(() => false)) {
    return;
  }
  await expect(playButton, '播放器应展示可点击的播放按钮').toBeVisible({ timeout: 20_000 });
  await playButton.click();
  await expect(pauseButton, '点击播放后视频应进入播放中').toBeVisible({ timeout: 20_000 });
}

export async function submitZeroYuanCheckout(
  page: Page,
): Promise<{ orderId: number; orderItemId: number }> {
  const payButton = page.getByRole('button', { name: /^立即支付/ });
  await expect(payButton, '购买弹层应展示立即支付').toBeVisible();
  const agree = page.getByRole('checkbox');
  if (await agree.count()) {
    await agree.first().click();
  } else {
    await page.getByText(/我已阅读并同意/).click();
  }
  const orderResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/shop/goods/order/create') && response.request().method() === 'POST',
    { timeout: 30_000 },
  );
  await payButton.click();
  const created = await orderResponse;
  const body = (await created.json()) as {
    code?: number;
    data?: { orderId?: number; order_id?: number; orderItemId?: number; orderItemsId?: number };
  };
  const orderId = Number(body.data?.orderId ?? body.data?.order_id ?? 0);
  const orderItemId = Number(body.data?.orderItemId ?? body.data?.orderItemsId ?? 0);
  if (body.code !== 0 || orderId <= 0 || orderItemId <= 0) {
    throw new Error(
      `零元下单失败 code=${body.code ?? 'nil'} orderId=${orderId} orderItemId=${orderItemId}`,
    );
  }
  return { orderId, orderItemId };
}

export async function payZeroYuanFromPopup(page: Page): Promise<number> {
  const { orderId, orderItemId } = await submitZeroYuanCheckout(page);
  await page.goto(`/recorded/${orderItemId}`, { waitUntil: 'domcontentloaded' });
  return orderId;
}

export async function openPurchasedRecordedFromLearn(
  page: Page,
  testInfo: TestInfo,
  goodsName: string,
): Promise<void> {
  await page.goto('/learn', { waitUntil: 'domcontentloaded' });
  await waitReady(page);
  await page.getByRole('button', { name: /^录播课/ }).click();
  const search = page.getByPlaceholder(/搜索课程名/);
  await expect(search, '学习页应展示课程搜索框').toBeVisible();
  await search.fill(goodsName);
  await page.waitForTimeout(800);

  const startButton = page.getByText(/开始学习|继续学习/).first();
  await expect(startButton, '学习列表应展示刚购买录播课的开始/继续学习').toBeVisible();
  await attachStepScreenshot(page, testInfo, '01-学习页已找到已购录播课');
  await startButton.click();
}

export async function openStudyDataFromHome(page: Page): Promise<void> {
  const studyData = page.getByText(/学习数据/);
  await expect(studyData, '学习首页应展示学习数据入口').toBeVisible();
  await studyData.click();
}

export async function applyZeroYuanRefundFromOrderDetail(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const applyButton = page.getByRole('button', { name: '申请退款' });
  await expect(applyButton, '已支付订单详情应展示申请退款').toBeVisible({ timeout: 15_000 });
  await applyButton.click();
  await expect(page.getByText('申请退款').last(), '应打开申请退款弹层').toBeVisible();
  await expect(
    page.getByText(/本单实付 0 元/),
    '零元单退款弹层应提示无现金原路退回',
  ).toBeVisible();
  await page.getByPlaceholder('必填').fill('UI自动化退款申请');
  await page.getByRole('button', { name: '提交申请' }).click();
  await expect(page.getByText(/提交成功|商家处理中|退款申请/), '提交后退款申请应有反馈').toBeVisible({
    timeout: 15_000,
  });
}

export async function assertPaidLearnHome(page: Page, goodsName: string): Promise<void> {
  await expect(page, '购后应进入录播学习首页').toHaveURL(/\/recorded\/\d+/);
  await expect(page.getByText('我的课程', { exact: true }), '学习首页应展示我的课程').toBeVisible();
  await expect(page.getByText(goodsName), '学习首页应展示刚购买的录播课').toBeVisible();
  await expect(page.getByText('学习进度'), '学习首页应展示学习进度').toBeVisible();
  await expect(page.getByText(`开始学习：${RECORDED_VIDEO_ACTIVITY_TITLE}`), '学习首页应提示继续学习视频').toBeVisible();
  await expect(page.getByText(RECORDED_VIDEO_ACTIVITY_TITLE, { exact: true }), '目录应展示视频活动').toBeVisible();
  await expect(page.getByText(RECORDED_DOC_ACTIVITY_TITLE, { exact: true }), '目录应展示资料活动').toBeVisible();
  await expect(page.getByText('⏵ 试看', { exact: true }), '购后目录不应再展示试看标签').toHaveCount(0);
}

export async function openLearnActivity(page: Page, title: string, actions: readonly string[]): Promise<void> {
  const row = page.locator('div[class*="activityRow"]').filter({ hasText: title }).first();
  await expect(row, `学习首页应展示可进入的「${title}」`).toBeVisible();
  const pattern = new RegExp(`^(${actions.map(escapeRegExp).join('|')})$`);
  await row.getByText(pattern).click();
}

export async function startLearningFromHome(page: Page): Promise<void> {
  const startButton = page.getByRole('button', { name: /开始学习|继续学习/ });
  await expect(startButton, '学习首页应展示开始/继续学习入口').toBeVisible();
  await startButton.click();
}
