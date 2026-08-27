import type { Locator, Page } from '@playwright/test';

/**
 * H5 商城首页（classinshop-mobile-web 路由 '/'，tabBar 布局）。
 * 移动端用 Pixel 5 仿真（见 playwright.config 的 e2e-mobile project）。
 */
export class MobileHomePage {
  readonly path = '/';

  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto(this.path, { waitUntil: 'domcontentloaded' });
    await this.page.waitForLoadState('networkidle').catch(() => undefined);
    await this.page.locator('#root').waitFor({ state: 'attached', timeout: 15_000 });
  }

  /** 底部 TabBar（antd-mobile TabBar）。 */
  get tabBar(): Locator {
    return this.page.locator('[class*="tab-bar" i], .adm-tab-bar').first();
  }

  tabItem(name: '首页' | '学习' | '我的'): Locator {
    return this.tabBar.getByText(name, { exact: true });
  }

  async gotoTab(name: '首页' | '学习' | '我的'): Promise<void> {
    await this.tabItem(name).click();
    await this.page.locator('#root').waitFor({ state: 'attached', timeout: 15_000 });
  }

  async appShellText(): Promise<string> {
    return (await this.page.locator('#root').textContent())?.trim() ?? '';
  }
}
