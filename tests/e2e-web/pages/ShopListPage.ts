import type { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage.js';

/**
 * PC 商家后台首页（店铺列表 / 门户），对应 classinshop-web 路由 '/'（HeaderLayout）。
 * 选择器以语义优先（role/text），团队接入真实 dom 后可按需细化。
 */
export class ShopListPage extends BasePage {
  readonly path = '/';

  constructor(page: Page) {
    super(page);
  }

  /** 顶部全局头部（GlobalHeader）。 */
  get header(): Locator {
    return this.page.locator('header, [class*="header" i]').first();
  }

  /** 申请小店入口（文本可能为“申请小店”/“创建小店”）。 */
  get applyShopEntry(): Locator {
    return this.page.getByText(/申请小店|创建小店|开通小店/).first();
  }

  /** 已有店铺卡片上的进入按钮。 */
  get enterShopButton(): Locator {
    return this.page.getByText(/进入店铺/).first();
  }

  async enterShop(): Promise<void> {
    await this.enterShopButton.click();
    await this.waitForReady();
  }

  async hasRenderedAppShell(): Promise<boolean> {
    const root = this.page.locator('#root');
    const text = (await root.textContent()) ?? '';
    return text.trim().length > 0;
  }
}
