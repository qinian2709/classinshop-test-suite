import type { Locator, Page } from '@playwright/test';

/**
 * H5 我的页（路由 /mine，tabBar 布局）。
 * 已登录展示菜单：购课订单 / 我的预约 / 地址管理 / 我的优惠券 / 退出登录。
 * 未登录展示登录入口。
 */
export class MobileMinePage {
  readonly path = '/mine';

  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto(this.path, { waitUntil: 'domcontentloaded' });
    await this.page.locator('#root').waitFor({ state: 'attached', timeout: 15_000 });
  }

  menu(name: string): Locator {
    return this.page.getByText(name, { exact: true });
  }

  get guestWelcome(): Locator {
    return this.page.getByText('Hi, 欢迎来到ClassIn小店', { exact: true });
  }

  get guestLoginButton(): Locator {
    return this.page.getByRole('button', { name: '登录' });
  }

  async openMenu(name: '购课订单' | '我的预约' | '地址管理' | '我的优惠券'): Promise<void> {
    await this.menu(name).click();
    await this.page.locator('#root').waitFor({ state: 'attached', timeout: 15_000 });
  }
}
