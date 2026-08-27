import type { Locator, Page } from '@playwright/test';

/** H5 地址管理（路由 /address）与新增页（/address/modify）。 */
export class MobileAddressPage {
  readonly path = '/address';

  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto(this.path, { waitUntil: 'domcontentloaded' });
    await this.page.locator('#root').waitFor({ state: 'attached', timeout: 15_000 });
  }

  get addButton(): Locator {
    return this.page.getByRole('button', { name: '新增地址' });
  }

  get saveButton(): Locator {
    return this.page.getByRole('button', { name: '保存' });
  }

  addressCard(receiverName: string): Locator {
    return this.page
      .locator('div.rounded-xl')
      .filter({ hasText: receiverName })
      .filter({ has: this.page.getByRole('button', { name: '删除' }) })
      .first();
  }
}
