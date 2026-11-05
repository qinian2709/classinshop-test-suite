import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/authed.js';
import {
  accounts,
  env,
  formatAuthorizationHeader,
  hasApiCredential,
  hasMobileCredential,
} from '@config';
import { resolveAuthTokens } from '../../shared/auth/login.js';
import { attachStepScreenshot } from './helpers/screenshots.js';
import { gotoShopModule } from './helpers/shop.js';
import {
  prepareBookableAppointment,
  type BookableAppointmentOrder,
} from '../e2e-mobile/helpers/mobile-api.js';
import { Endpoints, pickNumber, SUCCESS_CODE } from '@shared';

/**
 * PC 约课管理与订单操作：预约记录、调课时日志、冻结/解冻、快递导入弹层。
 *
 * author：qiukailiang
 */
test.describe.serial('PC 约课管理与订单操作', () => {
  test.skip(!env.shopId, '未配置 SHOP_ID，跳过约课/订单操作');
  test.skip(!hasApiCredential(), '未配置商家鉴权，跳过需造预约课订单的场景');

  let prepared: BookableAppointmentOrder | null = null;

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    await resolveAuthTokens();
    if (hasMobileCredential()) {
      prepared = await prepareBookableAppointment();
    }
  });

  test.afterAll(async () => {
    await prepared?.cleanup();
  });

  test('预约记录页应展示列表标题', async ({ authedShopPage: page }, testInfo) => {
    await gotoShopModule(page, '/appointment/records');
    await expect(page.getByText('预约记录').nth(0), '预约记录页应展示标题或菜单').toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator('table, .ant-table').first(), '预约记录应展示表格').toBeVisible();
    await attachStepScreenshot(page, testInfo, '01-预约记录已打开');
  });

  test('约课学员调整记录页应展示筛选与表头', async ({ authedShopPage: page }, testInfo) => {
    const studentUserId = await fetchFirstBookingStudentId();
    test.skip(!studentUserId, '当前店铺暂无约课学员，跳过调整记录页');

    await gotoShopModule(page, `/appointment/students/${studentUserId}/adjustments`);
    await expect(page.getByRole('heading', { name: '调整记录' }), '调整记录页应展示标题').toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText('赠送 / 扣减 / 退课 / 延长 / 冻结 / 解冻'), '应展示调整类型说明').toBeVisible();
    await expect(page.getByText('调整类型', { exact: true }), '表头应包含调整类型').toBeVisible();
    await attachStepScreenshot(page, testInfo, '01-学员调整记录已打开');
  });

  test('售课订单可打开冻结弹层并完成冻结再解冻', async ({ authedShopPage: page }, testInfo) => {
    test.skip(!prepared, '无法准备预约课订单（需启用约课老师与 C 端鉴权），跳过冻结');

    await gotoShopModule(page, '/transactions/orders');
    await expect(page.getByText('课程交易记录', { exact: true }), '应打开售课订单页').toBeVisible({
      timeout: 20_000,
    });

    await searchOrderByGoodsName(page, prepared!.goodsName);
    const orderRow = page.locator('tr').filter({ hasText: prepared!.goodsName }).first();
    await expect(orderRow, '订单列表应出现刚购买的预约课').toBeVisible({ timeout: 20_000 });
    await attachStepScreenshot(page, testInfo, '01-已搜到预约课订单');

    const freezeButton = orderRow.getByRole('button', { name: '冻结', exact: true });
    test.skip(!(await freezeButton.isVisible().catch(() => false)), '该预约课订单未展示冻结入口（需生效中且有权限）');

    await freezeButton.click();
    await expect(page.getByText('冻结期限 · 暂停预约课有效期计时'), '应打开冻结期限弹窗').toBeVisible();
    await expect(page.getByText('学员请假', { exact: true }), '冻结原因应默认可选学员请假').toBeVisible();
    await page.getByRole('button', { name: '确认冻结' }).click();
    await expect(page.getByText('已冻结', { exact: true }), '冻结成功应提示已冻结').toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText('冻结期限 · 暂停预约课有效期计时'), '冻结弹窗应关闭').toBeHidden();
    await attachStepScreenshot(page, testInfo, '02-预约课订单已冻结');

    const unfreezeButton = orderRow.getByRole('button', { name: '解冻', exact: true });
    await expect(unfreezeButton, '冻结后同一订单应展示解冻').toBeVisible({ timeout: 15_000 });
    await unfreezeButton.click();
    await expect(page.getByText('解冻期限 · 恢复预约课有效期计时'), '应打开解冻期限弹窗').toBeVisible();
    const leaveEnd = page.getByText('学员请假结束', { exact: true });
    if (await leaveEnd.isVisible().catch(() => false)) {
      await leaveEnd.click();
    }
    await page.getByRole('button', { name: '确认解冻' }).click();
    await expect(page.getByText('解冻期限 · 恢复预约课有效期计时'), '解冻弹窗应关闭').toBeHidden({
      timeout: 15_000,
    });
    await expect(orderRow.getByRole('button', { name: '冻结', exact: true }), '解冻后同一订单应重新展示冻结').toBeVisible({
      timeout: 15_000,
    });
    await attachStepScreenshot(page, testInfo, '03-预约课订单已解冻');
  });
});

test.describe('PC 售课订单快递导入', () => {
  test.skip(!env.shopId, '未配置 SHOP_ID，跳过快递导入弹层');

  test('售课订单可打开批量录入快递单号弹层', async ({ authedShopPage: page }, testInfo) => {
    await gotoShopModule(page, '/transactions/orders');
    await expect(page.getByText('课程交易记录', { exact: true }), '应打开售课订单页').toBeVisible({
      timeout: 20_000,
    });
    const importButton = page.getByRole('button', { name: '批量录入快递单号' });
    await importButton.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined);
    test.skip(!(await importButton.isVisible().catch(() => false)), '当前账号无批量录入快递权限，跳过导入弹层');

    await importButton.click();
    await expect(page.getByText('批量录入快递单号').nth(0), '应打开批量录入快递弹层').toBeVisible();
    await expect(
      page.getByText(/下载最新订单列表Excel|填写「快递单号」/),
      '弹层应提示先下载模板再填写快递单号',
    ).toBeVisible();
    await attachStepScreenshot(page, testInfo, '01-批量录入快递弹层已打开');
    await page.keyboard.press('Escape');
  });
});

async function searchOrderByGoodsName(page: Page, goodsName: string): Promise<void> {
  const filterToggle = page.getByText('筛选', { exact: true }).first();
  if (await filterToggle.isVisible().catch(() => false)) {
    await filterToggle.click().catch(() => undefined);
  }
  const nameInput = page.getByPlaceholder('商品名称');
  if (await nameInput.isVisible().catch(() => false)) {
    await nameInput.fill(goodsName);
    await nameInput.press('Enter');
  }
}

async function fetchFirstBookingStudentId(): Promise<number> {
  if (!accounts.token || !env.shopId) return 0;
  const response = await fetch(`${env.apiBaseURL}${Endpoints.shopAdmin.appointmentBookingStudents(env.shopId)}?page=1&limit=1`, {
    headers: {
      authorization: formatAuthorizationHeader(accounts.token),
      accept: 'application/json',
    },
  });
  const body = (await response.json()) as {
    code?: number;
    data?: { list?: Array<{ student_user_id?: number; studentUserId?: number; userId?: number; id?: number }> };
  };
  if (body.code !== SUCCESS_CODE) return 0;
  const first = body.data?.list?.[0];
  return pickNumber(first ?? {}, ['student_user_id', 'studentUserId', 'userId', 'id']) ?? 0;
}
