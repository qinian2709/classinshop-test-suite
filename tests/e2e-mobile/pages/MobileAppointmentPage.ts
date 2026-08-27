import type { Locator, Page } from '@playwright/test';

/** H5 我的预约（路由 /my-appointment）。 */
export class MobileAppointmentPage {
  readonly path = '/my-appointment';

  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto(this.path, { waitUntil: 'domcontentloaded' });
    await this.page.locator('#root').waitFor({ state: 'attached', timeout: 15_000 });
  }

  get title(): Locator {
    return this.page.getByText('我的预约', { exact: true });
  }

  tab(name: string): Locator {
    return this.page.getByRole('button', { name: new RegExp(`^${name}`) });
  }
}
