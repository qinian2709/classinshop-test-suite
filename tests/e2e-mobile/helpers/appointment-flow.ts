import type { Page, TestInfo } from '@playwright/test';
import { expect } from '@playwright/test';
import { attachStepScreenshot } from './screenshots.js';

async function waitReady(page: Page): Promise<void> {
  await page.locator('#root').waitFor({ state: 'attached', timeout: 15_000 });
}

/** 在周历里点第一个未禁用日期，直到出现可约时段。 */
export async function pickFirstAvailableSlot(page: Page): Promise<void> {
  for (let week = 0; week < 3; week += 1) {
    const dayButtons = page.locator('div.grid.grid-cols-7 button');
    const dayCount = await dayButtons.count();
    for (let index = 0; index < dayCount; index += 1) {
      const day = dayButtons.nth(index);
      if (await day.isDisabled()) continue;
      await day.click();
      const slot = page.getByRole('button', { name: /\d{2}:\d{2}\s*-\s*\d{2}:\d{2}/ }).first();
      try {
        await slot.waitFor({ state: 'visible', timeout: 3_000 });
        await slot.click();
        return;
      } catch {
        /* 当天无时段，试下一天 */
      }
    }
    await page.getByRole('button', { name: '下一周' }).click();
  }
  throw new Error('未找到可约时段');
}

/** 改约页：周切换是本周/下周/下下周，排除原时段后点第一个可约。 */
export async function pickChangeApplySlot(page: Page): Promise<void> {
  for (const weekLabel of ['本周', '下周', '下下周'] as const) {
    const weekTab = page.getByRole('button', { name: weekLabel, exact: true });
    if (await weekTab.isVisible().catch(() => false)) {
      await weekTab.click();
    }
    await page.getByText('加载中…').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
    const availableDays = page.getByRole('button', { name: /\d+可选/ });
    const dayCount = await availableDays.count();
    for (let index = 0; index < dayCount; index += 1) {
      await availableDays.nth(index).click();
      const slot = page.getByRole('button', { name: /\d{2}:\d{2}\s*-\s*\d{2}:\d{2}/ }).first();
      try {
        await slot.waitFor({ state: 'visible', timeout: 5_000 });
        await slot.click();
        return;
      } catch {
        /* 当天无时段，试下一天 */
      }
    }
  }
  throw new Error('改约页未找到可换时段');
}

/**
 * 学习页搜到刚买的预约课 → 去约课 → 选时段 → 确认预约页。
 * 不点击提交。
 */
export async function goFromLearnToConfirm(
  page: Page,
  testInfo: TestInfo,
  goodsName: string,
): Promise<void> {
  await page.goto('/learn', { waitUntil: 'domcontentloaded' });
  await waitReady(page);
  const search = page.getByPlaceholder(/搜索课程名/);
  await expect(search, '学习页应展示课程搜索框').toBeVisible();
  await search.fill(goodsName);
  await page.waitForTimeout(800);

  const card = page.locator('div').filter({ hasText: goodsName }).filter({ hasText: '去约课' }).first();
  await expect(card, '学习列表应出现刚购买的预约课').toBeVisible();
  await attachStepScreenshot(page, testInfo, '01-学习页已找到可约课程');

  await card.getByText('去约课', { exact: true }).click();
  await expect(page, '去约课应进入选择时段页').toHaveURL(/\/appointment\/select-slot/);
  await expect(page.getByText('选择时段', { exact: true }), '选时段页应展示标题').toBeVisible();
  await expect(page.getByText(goodsName), '选时段页应展示课程名').toBeVisible();
  await attachStepScreenshot(page, testInfo, '02-选择时段页已打开');

  await pickFirstAvailableSlot(page);
  await expect(page.getByText(/已选：/), '选中时段后底部应展示已选摘要').toBeVisible();
  await attachStepScreenshot(page, testInfo, '03-已选可约时段');

  await page.getByRole('button', { name: '下一步' }).click();
  const teacherSheet = page.getByText('选择老师', { exact: true });
  if (await teacherSheet.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: '确定' }).click();
  }

  await expect(page, '下一步应进入确认预约页').toHaveURL(/\/appointment\/confirm/);
  await expect(page.getByText('确认预约', { exact: true }).first(), '确认页应展示标题').toBeVisible();
  await expect(page.getByText('课程', { exact: true }), '确认页应展示课程信息').toBeVisible();
  await expect(page.getByText(goodsName), '确认页应回显课程名').toBeVisible();
  await attachStepScreenshot(page, testInfo, '04-确认预约页已展示');
}
