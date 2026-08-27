import { test, expect } from './fixtures/authed.js';
import { env } from '@config';
import { attachStepScreenshot } from './helpers/screenshots.js';
import {
  createTestAddress,
  deleteTestAddress,
  listUserAddresses,
  pruneTestAddresses,
  resolveMobileShopContext,
  type CreatedAddress,
} from './helpers/mobile-api.js';
import { MobileAddressPage } from './pages/MobileAddressPage.js';

/**
 * H5 地址管理：列表/新增表单展示；接口创建测试地址后在 UI 校验并清理。
 * 地区级联选择器不稳定，不在 UI 里提交新建。
 * author：qiukailiang
 */
test.describe('H5 地址管理 @smoke', () => {
  test.skip(!env.mobileBaseURL, '未配置 MOBILE_BASE_URL，跳过 H5 地址 UI 用例');

  test('地址列表可进入新增表单', async ({ authedMobilePage: page }, testInfo) => {
    const addressPage = new MobileAddressPage(page);
    await addressPage.goto();
    await expect(addressPage.addButton, '地址管理页应展示新增地址').toBeVisible();
    await attachStepScreenshot(page, testInfo, '01-地址列表已展示');

    await addressPage.addButton.click();
    await expect(page, '点击新增地址后应进入新增页').toHaveURL(/\/address\/modify(?:\?|$)/);
    await expect(page.getByPlaceholder('请填写姓名'), '新增页应展示姓名输入').toBeVisible();
    await expect(page.getByPlaceholder('请填写手机号'), '新增页应展示手机号输入').toBeVisible();
    await expect(page.getByText('请选择地区', { exact: true }), '新增页应展示地区选择').toBeVisible();
    await expect(page.getByPlaceholder('详细地址'), '新增页应展示详细地址').toBeVisible();
    await expect(addressPage.saveButton, '新增页应展示保存按钮').toBeVisible();
    await attachStepScreenshot(page, testInfo, '02-新增地址表单已展示');
  });

  test('地址列表应展示收货人，有余量时可创建并设为默认', async ({ authedMobilePage: page }, testInfo) => {
    const shop = await resolveMobileShopContext(testInfo);
    await pruneTestAddresses(testInfo, shop);
    const existing = await listUserAddresses(testInfo, shop);
    const addressPage = new MobileAddressPage(page);

    if (existing.length >= 20) {
      await addressPage.goto();
      await expect(addressPage.addButton, '地址达上限时仍应展示新增地址').toBeVisible();
      await expect(
        page.getByRole('button', { name: '删除' }).first(),
        '地址达上限时列表应至少有一条可管理地址',
      ).toBeVisible();
      await attachStepScreenshot(page, testInfo, '01-地址已达上限，校验已有地址列表');
      return;
    }

    let address: CreatedAddress | undefined;

    try {
      address = await createTestAddress(testInfo, shop);
      await addressPage.goto();

      const card = addressPage.addressCard(address.receiverName);
      await expect(card, '地址列表应展示刚创建的测试地址').toBeVisible();
      await expect(card.getByText(address.detailAddress), '地址卡片应展示详细地址').toBeVisible();
      await attachStepScreenshot(page, testInfo, '01-测试地址已展示');

      const setDefault = card.getByText('设为默认地址', { exact: true });
      if (await setDefault.isVisible()) {
        await setDefault.click();
        await expect(card.getByText('已默认', { exact: true }), '设为默认后卡片应展示已默认').toBeVisible();
        await attachStepScreenshot(page, testInfo, '02-测试地址已设为默认');
      } else {
        await expect(card.getByText('默认', { exact: true }), '测试地址应带默认标识').toBeVisible();
        await attachStepScreenshot(page, testInfo, '02-测试地址已是默认');
      }
    } finally {
      if (address) {
        await deleteTestAddress(testInfo, shop, address.id).catch((error: unknown) =>
          testInfo.attach('H5 地址清理失败.txt', {
            contentType: 'text/plain',
            body: String(error),
          }),
        );
      }
    }
  });
});
