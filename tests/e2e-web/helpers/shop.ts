import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { env } from '@config';

export function shopPath(path: string): string {
  return `/shop/${env.shopId}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function gotoShopModule(page: Page, path: string): Promise<void> {
  await page.goto(shopPath(path), { waitUntil: 'domcontentloaded' });
  await page.locator('#root').waitFor({ state: 'attached', timeout: 15_000 });
  await expect(page.getByText('暂无访问权限'), '当前账号应有该模块权限').toHaveCount(0);
}
