import { env } from '@config';
import type { Page, TestInfo } from '@playwright/test';

async function waitForStablePage(page: Page): Promise<void> {
  await page.locator('#root').waitFor({ state: 'attached', timeout: 15_000 }).catch(() => undefined);
  await page
    .waitForFunction(() => (document.querySelector('#root')?.textContent ?? '').trim().length > 0, null, {
      timeout: 5_000,
    })
    .catch(() => undefined);
  await page.waitForTimeout(1_000);
}

export async function attachStepScreenshot(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  if (!env.e2eStepScreenshots) return;
  if (page.isClosed()) return;

  await waitForStablePage(page);
  await testInfo.attach(`${name}.png`, {
    contentType: 'image/png',
    body: await page.screenshot({ fullPage: true }),
  });
}

export async function attachFailureScreenshot(page: Page, testInfo: TestInfo): Promise<void> {
  if (testInfo.status === testInfo.expectedStatus) return;
  if (page.isClosed()) return;

  try {
    await waitForStablePage(page);
    await testInfo.attach('失败截图.png', {
      contentType: 'image/png',
      body: await page.screenshot({ fullPage: true }),
    });
  } catch (error) {
    console.warn('[e2e] skip failure screenshot:', error instanceof Error ? error.message : error);
  }
}
