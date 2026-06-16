import type { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage.js';

/**
 * 登录页 Page Object。classinshop-web 登录由 accounts*.eeo.im 登录中心承载，
 * 真实选择器接入时按登录中心页面调整。此处提供通用动作骨架。
 */
export class LoginPage extends BasePage {
  readonly path = '/';

  constructor(page: Page) {
    super(page);
  }

  get usernameInput(): Locator {
    return this.page.getByPlaceholder(/手机号|账号|用户名/).first();
  }

  get passwordInput(): Locator {
    return this.page.getByPlaceholder(/密码/).first();
  }

  get submitButton(): Locator {
    return this.page.getByRole('button', { name: /登录|登 录|登入/ }).first();
  }

  async login(username: string, password: string): Promise<void> {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
    await this.page.waitForLoadState('networkidle').catch(() => undefined);
  }
}
