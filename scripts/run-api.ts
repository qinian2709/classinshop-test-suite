import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

type EnvName = '13' | '14' | 'im';

interface Options {
  env: EnvName;
  file?: string;
  report: boolean;
  allure: boolean;
  open: boolean;
  notify: boolean;
  passthrough: string[];
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML_REPORT_PATH = 'reports/html/index.html';
const DEFAULT_ALLURE_RESULTS_PATH = 'allure-results';
const ALLURE_RESULTS_PATH = 'reports/allure-results';
const ALLURE_HTML_PATH = 'reports/allure-html/index.html';
const JUNIT_REPORT_PATH = 'reports/junit.xml';

function usage(exitCode = 1): never {
  console.error(`
Usage:
  pnpm test:api -- --env 14 --file tests/api/api-demo.spec.ts
  pnpm test:api -- -e 14 -f tests/api/api-demo.spec.ts --allure --open

Options:
  -e, --env <13|14|im>       被测环境，默认 13
  -f, --file <spec path>     指定用例文件；不传则运行 tests/api
  --report                   测试结束后打开 Playwright HTML 报告（兼容旧写法）
  --allure                   测试结束后生成 Allure HTML 报告
  --open                     测试结束后打开报告；配合 --allure 时打开 Allure，否则打开 Playwright HTML
  --notify                   测试结束后模拟发送企微机器人通知
  --                         后面的参数原样透传给 playwright test
`);
  process.exit(exitCode);
}

function parseEnv(value: string): EnvName {
  if (value === '13' || value === '14' || value === 'im') return value;
  console.error(`Invalid --env "${value}". Expected 13, 14, or im.`);
  return usage();
}

function normalizeSpecPath(file: string): string {
  const withoutAt = file.startsWith('@') ? file.slice(1) : file;
  const marker = 'classinshop-test-suite/';
  const markerIndex = withoutAt.indexOf(marker);
  if (markerIndex >= 0) return withoutAt.slice(markerIndex + marker.length);
  if (path.isAbsolute(withoutAt)) return path.relative(ROOT, withoutAt);
  return withoutAt;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    env: parseEnv(process.env.TEST_ENV ?? '13'),
    report: false,
    allure: false,
    open: false,
    notify: false,
    passthrough: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;

    if (arg === '--') {
      options.passthrough.push(...argv.slice(index + 1));
      break;
    }

    if (arg === '-e' || arg === '--env') {
      const value = argv[index + 1];
      if (!value) usage();
      options.env = parseEnv(value);
      index += 1;
      continue;
    }

    if (arg.startsWith('--env=')) {
      options.env = parseEnv(arg.slice('--env='.length));
      continue;
    }

    if (arg === '-f' || arg === '--file') {
      const value = argv[index + 1];
      if (!value) usage();
      options.file = normalizeSpecPath(value);
      index += 1;
      continue;
    }

    if (arg.startsWith('--file=')) {
      options.file = normalizeSpecPath(arg.slice('--file='.length));
      continue;
    }

    if (arg === '--report') {
      options.report = true;
      continue;
    }

    if (arg === '--allure') {
      options.allure = true;
      continue;
    }

    if (arg === '--open') {
      options.open = true;
      continue;
    }

    if (arg === '--notify') {
      options.notify = true;
      continue;
    }

    if (arg === '-h' || arg === '--help') usage(0);

    options.passthrough.push(arg);
  }

  return options;
}

function runPlaywright(args: string[], env: EnvName): number {
  const bin = path.join(
    ROOT,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'playwright.cmd' : 'playwright',
  );

  const result = spawnSync(bin, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      TEST_ENV: env,
      PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH ?? '0',
    },
  });

  if (result.error) {
    console.error(result.error.message);
    return 1;
  }
  return result.status ?? 1;
}

interface ReportGenerationResult {
  exitCode: number;
  generated: boolean;
}

function directoryHasEntries(relativePath: string): boolean {
  const target = path.join(ROOT, relativePath);
  return fs.existsSync(target) && fs.readdirSync(target).length > 0;
}

function cleanAllureOutput(): void {
  fs.rmSync(path.join(ROOT, DEFAULT_ALLURE_RESULTS_PATH), { recursive: true, force: true });
  fs.rmSync(path.join(ROOT, ALLURE_RESULTS_PATH), { recursive: true, force: true });
  fs.rmSync(path.join(ROOT, path.dirname(ALLURE_HTML_PATH)), { recursive: true, force: true });
}

function runAllureReport(): ReportGenerationResult {
  if (!directoryHasEntries(ALLURE_RESULTS_PATH)) {
    console.warn(
      `[test:api] Skip Allure HTML report: ${ALLURE_RESULTS_PATH} is empty or does not exist.`,
    );
    return { exitCode: 0, generated: false };
  }

  const bin = path.join(
    ROOT,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'allure.cmd' : 'allure',
  );
  const outputDir = path.dirname(ALLURE_HTML_PATH);
  const result = spawnSync(bin, ['generate', ALLURE_RESULTS_PATH, '--clean', '-o', outputDir], {
    cwd: ROOT,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(result.error.message);
    return { exitCode: 1, generated: false };
  }
  const exitCode = result.status ?? 1;
  return { exitCode, generated: exitCode === 0 };
}

function openAllureReport(allureReportGenerated: boolean): number {
  if (!allureReportGenerated) {
    console.warn('[test:api] Skip opening Allure report: no Allure HTML report was generated.');
    return 0;
  }

  const bin = path.join(
    ROOT,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'allure.cmd' : 'allure',
  );
  const child = spawn(bin, ['open', path.dirname(ALLURE_HTML_PATH)], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
  });

  child.on('error', (error) => {
    console.error(`[test:api] Failed to open Allure report: ${error.message}`);
  });
  child.unref();
  console.log(`[test:api] Allure report server started in background: ${path.join(ROOT, ALLURE_HTML_PATH)}`);
  return 0;
}

interface JUnitSummary {
  tests: number;
  failures: number;
  skipped: number;
  errors: number;
  time: number;
}

function readNumberAttr(attrs: string, name: keyof JUnitSummary): number {
  const match = new RegExp(`${name}="([^"]*)"`).exec(attrs);
  return match ? Number(match[1]) : 0;
}

function readJUnitSummary(): JUnitSummary | null {
  const file = path.join(ROOT, JUNIT_REPORT_PATH);
  if (!fs.existsSync(file)) return null;

  const xml = fs.readFileSync(file, 'utf8');
  const match = /<testsuites\b([^>]*)>/.exec(xml) ?? /<testsuite\b([^>]*)>/.exec(xml);
  if (!match) return null;

  const attrs = match[1] ?? '';
  return {
    tests: readNumberAttr(attrs, 'tests'),
    failures: readNumberAttr(attrs, 'failures'),
    skipped: readNumberAttr(attrs, 'skipped'),
    errors: readNumberAttr(attrs, 'errors'),
    time: readNumberAttr(attrs, 'time'),
  };
}

function simulateWeComNotification(
  options: Options,
  target: string,
  exitCode: number,
  allureReportGenerated: boolean,
): void {
  const summary = readJUnitSummary();
  const status =
    exitCode !== 0
      ? '失败'
      : summary && summary.tests > 0 && summary.tests === summary.skipped
        ? '跳过'
        : '通过';
  const reportPath = path.join(ROOT, HTML_REPORT_PATH);
  const reportUrl = process.env.REPORT_URL || reportPath;
  const allureReportUrl = process.env.ALLURE_REPORT_URL || path.join(ROOT, ALLURE_HTML_PATH);
  const summaryLine = summary
    ? `总数 ${summary.tests}，失败 ${summary.failures}，错误 ${summary.errors}，跳过 ${summary.skipped}，耗时 ${summary.time.toFixed(2)}s`
    : '未读取到 JUnit 汇总';
  const content = [
    `### ClassInShop API 测试${status}`,
    `> 环境：${options.env}`,
    `> 目标：${target}`,
    `> 结果：${summaryLine}`,
    `> HTML Report：${reportUrl}`,
    ...(allureReportGenerated ? [`> Allure Report：${allureReportUrl}`] : []),
    `> JUnit Report：${path.join(ROOT, JUNIT_REPORT_PATH)}`,
  ].join('\n');
  const payload = {
    msgtype: 'markdown',
    markdown: { content },
  };

  console.log('[test:api] Simulating WeCom robot notification...');
  console.log('[test:api] Replace this log with POST WEWORK_WEBHOOK_URL when ready.');
  console.log(JSON.stringify(payload, null, 2));
}

const options = parseArgs(process.argv.slice(2));
const target = options.file ?? 'tests/api';
const testArgs = ['test', target, '--project=api', ...options.passthrough];

console.log(`[test:api] TEST_ENV=${options.env} playwright ${testArgs.join(' ')}`);

if (options.allure) {
  cleanAllureOutput();
}

const testExitCode = runPlaywright(testArgs, options.env);
let allureExitCode = 0;
let allureReportGenerated = false;

if (options.allure) {
  console.log('[test:api] Generating Allure HTML report...');
  const result = runAllureReport();
  allureExitCode = result.exitCode;
  allureReportGenerated = result.generated;
}

if (options.notify) {
  simulateWeComNotification(options, target, testExitCode, allureReportGenerated);
}

let openExitCode = 0;

if (options.open) {
  if (options.allure) {
    console.log('[test:api] Opening Allure HTML report...');
    openExitCode = openAllureReport(allureReportGenerated);
  } else {
    console.log('[test:api] Opening Playwright HTML report...');
    openExitCode = runPlaywright(['show-report', 'reports/html'], options.env);
  }
} else if (options.report) {
  console.log('[test:api] Opening Playwright HTML report...');
  openExitCode = runPlaywright(['show-report', 'reports/html'], options.env);
}

process.exit(testExitCode || allureExitCode || openExitCode);
