import { env } from '@config';
import type { Page, TestInfo } from '@playwright/test';

export async function attachStepScreenshot(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  if (!env.e2eStepScreenshots) return;

  await page.locator('#root').waitFor({ state: 'attached', timeout: 15_000 }).catch(() => undefined);
  await page
    .waitForFunction(() => (document.querySelector('#root')?.textContent ?? '').trim().length > 0, null, {
      timeout: 5_000,
    })
    .catch(() => undefined);
  await page.waitForTimeout(1_000);

  await testInfo.attach(`${name}.png`, {
    contentType: 'image/png',
    body: await page.screenshot({ fullPage: true }),
  });
}
