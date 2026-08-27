import type { Locator, Page } from '@playwright/test';

/** H5 兜底登录页（路由 /login）。不发起真实登录，只覆盖表单展示。 */
export class MobileLoginPage {
  readonly path = '/login';

  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto(this.path, { waitUntil: 'domcontentloaded' });
    await this.page.locator('#root').waitFor({ state: 'attached', timeout: 15_000 });
  }

  get title(): Locator {
    return this.page.getByText('登录', { exact: true }).first();
  }

  get codeTab(): Locator {
    return this.page.getByRole('button', { name: '验证码登录' });
  }

  get passwordTab(): Locator {
    return this.page.getByRole('button', { name: '密码登录' });
  }

  get phoneInput(): Locator {
    return this.page.getByPlaceholder('请输入手机号');
  }
}
