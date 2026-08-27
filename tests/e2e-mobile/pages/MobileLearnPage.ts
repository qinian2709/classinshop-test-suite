import type { Locator, Page } from '@playwright/test';

/**
 * H5 学习页（路由 /learn，tabBar 布局）。
 * 已登录：SearchBar + Tabs（全部 / 预约课 / 固定课）。
 * 未登录：引导列表 + 立即登录。
 */
export class MobileLearnPage {
  readonly path = '/learn';

  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto(this.path, { waitUntil: 'domcontentloaded' });
    await this.page.locator('#root').waitFor({ state: 'attached', timeout: 15_000 });
  }

  get searchBox(): Locator {
    return this.page.getByPlaceholder(/搜索课程名/);
  }

  shopScope(name: '小店商品' | '公域商品'): Locator {
    return this.page.getByRole('button', { name });
  }

  typeFilter(name: RegExp): Locator {
    return this.page.getByRole('button', { name });
  }

  get guestLoginHint(): Locator {
    return this.page.getByText('立即登录', { exact: true });
  }

  get guestGuideBuy(): Locator {
    return this.page.getByText('如何购买课程', { exact: true });
  }
}
