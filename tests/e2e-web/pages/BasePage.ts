import type { Page } from '@playwright/test';

/** Page Object 基类：封装通用导航与就绪等待，子类继承后只声明业务定位器与动作。 */
export abstract class BasePage {
  constructor(protected readonly page: Page) {}

  /** 子类的相对路径（相对 baseURL），如 '/' 或 '/shop/123/dashboard' */
  abstract readonly path: string;

  async goto(): Promise<void> {
    await this.page.goto(this.path, { waitUntil: 'domcontentloaded' });
    await this.waitForReady();
  }

  /** 等待 SPA 根节点渲染出内容（React 挂载到 #root）。 */
  async waitForReady(): Promise<void> {
    await this.page.waitForLoadState('networkidle').catch(() => undefined);
    await this.page.locator('#root').waitFor({ state: 'attached', timeout: 15_000 });
  }

  async title(): Promise<string> {
    return this.page.title();
  }
}
