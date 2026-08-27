import type { Locator, Page } from '@playwright/test';

/** H5 购课订单列表（路由 /order）。 */
export class MobileOrderPage {
  readonly path = '/order';

  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto(this.path, { waitUntil: 'domcontentloaded' });
    await this.page.locator('#root').waitFor({ state: 'attached', timeout: 15_000 });
  }

  get title(): Locator {
    return this.page.getByText('订单列表', { exact: true });
  }

  get searchBox(): Locator {
    return this.page.getByPlaceholder('搜索');
  }

  tab(name: string): Locator {
    return this.page.getByRole('tab', { name });
  }
}
