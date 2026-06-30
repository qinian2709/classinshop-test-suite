import path from 'node:path';
import { env } from '@config';
import type { TestInfo } from '@playwright/test';
import type MiniProgram from 'miniprogram-automator/out/MiniProgram.js';

function sanitizeName(name: string): string {
  return name.replace(/[^\w\u4e00-\u9fa5.-]+/g, '-').replace(/^-+|-+$/g, '');
}

async function attachMiniProgramScreenshot(
  mp: MiniProgram | undefined,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  if (!mp) return;

  const page = await mp.currentPage().catch(() => undefined);
  await page?.waitFor(1_000).catch(() => undefined);

  const screenshotPath = testInfo.outputPath(`${sanitizeName(name)}.png`);
  await mp.screenshot({ path: screenshotPath });
  await testInfo.attach(`${name}.png`, {
    contentType: 'image/png',
    path: screenshotPath,
  });
}

export async function attachStepScreenshot(
  mp: MiniProgram | undefined,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  if (!env.e2eStepScreenshots) return;
  await attachMiniProgramScreenshot(mp, testInfo, name);
}

export async function attachFailureScreenshot(
  mp: MiniProgram | undefined,
  testInfo: TestInfo,
): Promise<void> {
  if (testInfo.status === testInfo.expectedStatus) return;
  await attachMiniProgramScreenshot(mp, testInfo, path.basename(testInfo.titlePath.join('-')));
}
