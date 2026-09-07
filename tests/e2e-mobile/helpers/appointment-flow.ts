import type { Page, TestInfo } from '@playwright/test';
import { expect } from '@playwright/test';
import { attachStepScreenshot } from './screenshots.js';

/** 商品 cancelDeadlineValue=24，选开课 25 小时以外的时段才能取消/改约。 */
export const CANCEL_LEAD_HOURS = 25;

async function waitReady(page: Page): Promise<void> {
  await page.locator('#root').waitFor({ state: 'attached', timeout: 15_000 });
}

function selectedSlotUnix(summary: string): number | null {
  const match = summary.match(/已选：(\d{2})-(\d{2})\s+周.?\s+(\d{2}):(\d{2})/);
  if (!match) return null;
  return wallClockUnix(Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4]));
}

function changeSlotUnix(dayHeader: string, slotText: string): number | null {
  const day = dayHeader.match(/(\d{1,2})月(\d{1,2})日/);
  const time = slotText.match(/(\d{2}):(\d{2})\s*-/);
  if (!day || !time) return null;
  return wallClockUnix(Number(day[1]), Number(day[2]), Number(time[1]), Number(time[2]));
}

function wallClockUnix(month: number, day: number, hour: number, minute: number, now = new Date()): number {
  const start = new Date(now.getFullYear(), month - 1, day, hour, minute, 0);
  if (start.getTime() < now.getTime() - 2 * 24 * 3600 * 1000) {
    start.setFullYear(start.getFullYear() + 1);
  }
  return Math.floor(start.getTime() / 1000);
}

async function waitChangeWeekSlots(page: Page, weekLabel: '本周' | '下周' | '下下周'): Promise<void> {
  const weekTab = page.getByRole('button', { name: weekLabel, exact: true });
  await expect(weekTab, `改约页应展示${weekLabel}`).toBeVisible();
  const slotsResp = page.waitForResponse(
    (response) =>
      response.url().includes('/appointment/order/') &&
      response.url().includes('/slots') &&
      response.request().method() === 'GET',
    { timeout: 10_000 },
  );
  await weekTab.click();
  await slotsResp.catch(() => undefined);
  await page.getByText('加载中…').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
}

/** 在周历里点可约时段；minHoursAhead 用于取消/改约，避开 24 小时截止。 */
export async function pickFirstAvailableSlot(
  page: Page,
  options?: { minHoursAhead?: number },
): Promise<void> {
  const minUnix = options?.minHoursAhead
    ? Math.floor(Date.now() / 1000) + options.minHoursAhead * 3600
    : 0;

  for (let week = 0; week < 3; week += 1) {
    const dayButtons = page.locator('div.grid.grid-cols-7 button');
    const dayCount = await dayButtons.count();
    for (let index = 0; index < dayCount; index += 1) {
      const day = dayButtons.nth(index);
      if (await day.isDisabled()) continue;
      await day.click();
      const slots = page.getByRole('button', { name: /\d{2}:\d{2}\s*-\s*\d{2}:\d{2}/ });
      try {
        await slots.first().waitFor({ state: 'visible', timeout: 3_000 });
      } catch {
        continue;
      }
      const slotCount = await slots.count();
      for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
        const slot = slots.nth(slotIndex);
        if (await slot.isDisabled()) continue;
        await slot.click();
        const summary = page.getByText(/已选：/);
        await expect(summary, '选中时段后底部应展示已选摘要').toBeVisible();
        if (!minUnix) return;
        const text = (await summary.innerText()).trim();
        const unix = selectedSlotUnix(text);
        if (unix && unix >= minUnix) return;
      }
    }
    const nextWeek = page.getByRole('button', { name: '下一周' });
    if (await nextWeek.isVisible().catch(() => false)) {
      await nextWeek.click();
    }
  }
  throw new Error(
    minUnix > 0 ? `未找到开课 ${options?.minHoursAhead} 小时以后的可约时段` : '未找到可约时段',
  );
}

/** 改约页：优先下周/下下周，只选开课 25 小时外时段。 */
export async function pickChangeApplySlot(
  page: Page,
  options?: { minHoursAhead?: number },
): Promise<void> {
  const minHoursAhead = options?.minHoursAhead ?? CANCEL_LEAD_HOURS;
  const minUnix = Math.floor(Date.now() / 1000) + minHoursAhead * 3600;

  for (const weekLabel of ['下周', '下下周', '本周'] as const) {
    await waitChangeWeekSlots(page, weekLabel);
    const availableDays = page.getByRole('button', { name: /\d+可选/ });
    const dayCount = await availableDays.count();
    for (let index = 0; index < dayCount; index += 1) {
      await availableDays.nth(index).click();
      const dayHeader = page.getByText(/\d+月\d+日\s+周/);
      await expect(dayHeader, '改约页应展示选中日标题').toBeVisible();
      const headerText = (await dayHeader.innerText()).trim();
      const slots = page.getByRole('button', { name: /\d{2}:\d{2}\s*-\s*\d{2}:\d{2}/ });
      try {
        await slots.first().waitFor({ state: 'visible', timeout: 5_000 });
      } catch {
        continue;
      }
      const slotCount = await slots.count();
      for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
        const slot = slots.nth(slotIndex);
        if (await slot.isDisabled()) continue;
        const unix = changeSlotUnix(headerText, await slot.innerText());
        if (!unix || unix < minUnix) continue;
        await slot.click();
        return;
      }
    }
  }
  throw new Error(`改约页未找到开课 ${minHoursAhead} 小时以后的可换时段`);
}

/**
 * 学习页搜到刚买的预约课 → 去约课 → 选时段 → 确认预约页。
 * 不点击提交。
 */
export async function goFromLearnToConfirm(
  page: Page,
  testInfo: TestInfo,
  goodsName: string,
  options?: { minHoursAhead?: number },
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
  await expect(page.getByText(goodsName, { exact: true }), '选时段页应展示课程名').toBeVisible();
  await attachStepScreenshot(page, testInfo, '02-选择时段页已打开');

  await pickFirstAvailableSlot(page, { minHoursAhead: options?.minHoursAhead });
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
  await expect(page.getByText(goodsName, { exact: true }), '确认页应回显课程名').toBeVisible();
  await attachStepScreenshot(page, testInfo, '04-确认预约页已展示');
}

/** 提交预约，用返回的 appointment_id 打开详情，避免列表脏数据点错卡。 */
export async function confirmBookAndOpenDetail(page: Page): Promise<number> {
  await expect(
    page.getByRole('button', { name: '确认预约' }),
    '确认页应展示可提交的确认预约按钮',
  ).toBeEnabled();
  const bookResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/shop/appointment/book') && response.request().method() === 'POST',
    { timeout: 30_000 },
  );
  await page.getByRole('button', { name: '确认预约' }).click();
  await page.getByRole('button', { name: '确认', exact: true }).click();
  const created = await bookResponse;
  const body = (await created.json()) as {
    code?: number;
    msg?: string;
    data?: { appointment_id?: number; appointmentId?: number };
  };
  const appointmentId = Number(body.data?.appointment_id ?? body.data?.appointmentId ?? 0);
  if (body.code !== 0 || appointmentId <= 0) {
    throw new Error(`约课失败 code=${body.code ?? 'nil'} msg=${body.msg ?? ''} appointmentId=${appointmentId}`);
  }
  await page.goto(`/appointment/my/${appointmentId}`, { waitUntil: 'domcontentloaded' });
  await expect(page, '应打开刚预约的详情').toHaveURL(
    new RegExp(`/appointment/my/${appointmentId}(?:\\?|$)`),
  );
  return appointmentId;
}

export async function cancelAppointmentOnDetail(page: Page, appointmentId: number): Promise<void> {
  await expect(page, '取消前应停留在该预约详情').toHaveURL(
    new RegExp(`/appointment/my/${appointmentId}(?:\\?|$)`),
  );
  await page.getByRole('button', { name: '取消预约' }).click();
  await expect(page.getByText('确认取消本节预约课时？'), '应弹出取消确认').toBeVisible();
  const cancelResponse = page.waitForResponse(
    (response) =>
      response.url().includes(`/appointment/my/${appointmentId}/cancel`) &&
      response.request().method() === 'POST',
    { timeout: 30_000 },
  );
  await page.getByRole('button', { name: '确定', exact: true }).click();
  const cancelled = await cancelResponse;
  const body = (await cancelled.json()) as { code?: number; msg?: string };
  if (body.code !== 0) {
    throw new Error(`取消失败 code=${body.code ?? 'nil'} msg=${body.msg ?? ''}`);
  }
  await expect(page.getByText('取消成功'), '取消接口应成功').toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('已取消', { exact: true }), '详情状态应变为已取消').toBeVisible();
  await expect(page, '取消后仍应是同一条预约详情').toHaveURL(
    new RegExp(`/appointment/my/${appointmentId}(?:\\?|$)`),
  );
}

type AppointmentListItem = {
  id?: number;
  goodsName?: string;
  parentAppointmentId?: number;
};

function listItemsFromBody(body: {
  data?: { items?: AppointmentListItem[] };
  items?: AppointmentListItem[];
}): AppointmentListItem[] {
  return body.data?.items ?? body.items ?? [];
}

/** 提交改约，从即将上课列表用 parentAppointmentId 找到新约 ID。 */
export async function submitChangeAndResolveNewAppointment(
  page: Page,
  originalId: number,
  goodsName: string,
): Promise<number> {
  const changeResponse = page.waitForResponse(
    (response) =>
      response.url().includes(`/appointment/my/${originalId}/change`) &&
      response.request().method() === 'POST',
    { timeout: 30_000 },
  );
  const upcomingList = page.waitForResponse(
    async (response) => {
      if (!response.url().includes('/student/appointment') || response.request().method() !== 'GET') {
        return false;
      }
      if (response.status() !== 200) return false;
      try {
        const body = (await response.json()) as {
          data?: { items?: AppointmentListItem[] };
          items?: AppointmentListItem[];
        };
        return listItemsFromBody(body).some(
          (item) =>
            Number(item.parentAppointmentId) === originalId ||
            (item.goodsName === goodsName && Number(item.id) !== originalId),
        );
      } catch {
        return false;
      }
    },
    { timeout: 30_000 },
  );
  await page.getByRole('button', { name: '确认改约' }).click();
  const changed = await changeResponse;
  const changeBody = (await changed.json()) as { code?: number; msg?: string };
  if (changeBody.code !== 0) {
    throw new Error(`改约失败 code=${changeBody.code ?? 'nil'} msg=${changeBody.msg ?? ''}`);
  }
  await expect(page, '改约成功应进入我的预约（即将上课）').toHaveURL(/\/my-appointment(?:\?|$)/);
  const listed = await upcomingList;
  const items = listItemsFromBody(
    (await listed.json()) as { data?: { items?: AppointmentListItem[] }; items?: AppointmentListItem[] },
  );
  const created =
    items.find((item) => Number(item.parentAppointmentId) === originalId) ??
    items.find((item) => item.goodsName === goodsName && Number(item.id) !== originalId);
  const newId = Number(created?.id ?? 0);
  if (newId <= 0) {
    throw new Error(`改约成功但即将上课列表未找到新预约 originalId=${originalId}`);
  }
  return newId;
}

export async function assertCancelledListHasAppointment(
  page: Page,
  appointmentId: number,
  goodsName: string,
): Promise<void> {
  await page.goto('/appointment/my', { waitUntil: 'domcontentloaded' });
  const cancelledTab = page.getByRole('tab', { name: '已取消' });
  await expect(cancelledTab, '我的预约应展示已取消 Tab').toBeVisible();
  await cancelledTab.click();
  const card = page
    .locator('div.cursor-pointer')
    .filter({ hasText: goodsName })
    .filter({ hasText: '已取消' });
  await expect(card, '已取消列表应展示刚取消的课程（状态为已取消，不是已改约）').toBeVisible();
  await card.click();
  await expect(page, '已取消列表点开的应是刚取消的那条预约').toHaveURL(
    new RegExp(`/appointment/my/${appointmentId}(?:\\?|$)`),
  );
}
