import { defineConfig, devices } from '@playwright/test';
import { env } from './config/index.js';

const isCI = !!process.env.CI;
// 小程序自动化依赖本地微信开发者工具，默认不在常规/CI 跑，需 RUN_MP=1 显式开启。
const runMiniprogram = process.env.RUN_MP === '1';
const htmlReportFolder = process.env.PLAYWRIGHT_HTML_REPORT_DIR || 'reports/html';
const junitReportFile = process.env.PLAYWRIGHT_JUNIT_REPORT_FILE || 'reports/junit.xml';
const allureResultsDir = process.env.ALLURE_RESULTS_DIR || 'reports/allure-results';
const artifactsDir = process.env.PLAYWRIGHT_ARTIFACTS_DIR || 'reports/artifacts';

export default defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 4 : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: htmlReportFolder, open: 'never' }],
    ['junit', { outputFile: junitReportFile }],
    ['allure-playwright', { resultsDir: allureResultsDir, detail: true }],
  ],
  outputDir: artifactsDir,
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'api',
      testDir: 'tests/api',
      use: {
        baseURL: env.apiBaseURL,
        extraHTTPHeaders: {
          'Content-Type': 'application/json',
          ...(env.shopDomain ? { 'X-Shop-Domain': env.shopDomain } : {}),
        },
      },
    },
    {
      name: 'e2e-web',
      testDir: 'tests/e2e-web',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: env.webBaseURL,
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'e2e-mobile',
      testDir: 'tests/e2e-mobile',
      use: {
        ...devices['Pixel 5'],
        baseURL: env.mobileBaseURL,
      },
    },
    ...(runMiniprogram
      ? [
          {
            name: 'miniprogram',
            testDir: 'tests/miniprogram',
            // 小程序自动化串行执行，单独的微信工具实例。
            fullyParallel: false,
            workers: 1,
            timeout: 120_000,
          },
        ]
      : []),
  ],
});
