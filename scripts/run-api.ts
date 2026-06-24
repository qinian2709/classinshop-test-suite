import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

type EnvName = '13' | '14' | 'im';
type ProjectName = 'api' | 'e2e-web' | 'e2e-mobile' | 'miniprogram';

interface Options {
  env: EnvName;
  project?: ProjectName;
  file?: string;
  report: boolean;
  allure: boolean;
  open: boolean;
  notify: boolean;
  passthrough: string[];
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_ALLURE_RESULTS_PATH = 'allure-results';

interface ReportPaths {
  runId: string;
  runDir: string;
  htmlDir: string;
  htmlIndex: string;
  allureResultsDir: string;
  allureHtmlDir: string;
  allureIndex: string;
  junitFile: string;
  artifactsDir: string;
}

function usage(exitCode = 1): never {
  console.error(`
Usage:
  pnpm test:api -- --env 14 --file tests/api/api-demo.spec.ts
  pnpm test:e2e:web -- --env 14 --file tests/e2e-web/enter-shop.spec.ts --allure --open

Options:
  -e, --env <13|14|im>       被测环境，默认 13
  -p, --project <name>        Playwright 项目，默认按 --file 推断，支持 api/e2e-web/e2e-mobile/miniprogram
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

function parseProject(value: string): ProjectName {
  if (value === 'api' || value === 'e2e-web' || value === 'e2e-mobile' || value === 'miniprogram') {
    return value;
  }
  console.error(`Invalid --project "${value}". Expected api, e2e-web, e2e-mobile, or miniprogram.`);
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

function isRunnerOption(arg: string): boolean {
  return (
    arg === '-e' ||
    arg === '--env' ||
    arg.startsWith('--env=') ||
    arg === '-p' ||
    arg === '--project' ||
    arg.startsWith('--project=') ||
    arg === '-f' ||
    arg === '--file' ||
    arg.startsWith('--file=') ||
    arg === '--report' ||
    arg === '--allure' ||
    arg === '--open' ||
    arg === '--notify' ||
    arg === '-h' ||
    arg === '--help'
  );
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    env: parseEnv(process.env.TEST_ENV ?? '13'),
    project: undefined,
    report: false,
    allure: false,
    open: false,
    notify: false,
    passthrough: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;

    if (arg === '--' && (index === 0 || argv.slice(index + 1).some(isRunnerOption))) {
      continue;
    }

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

    if (arg === '-p' || arg === '--project') {
      const value = argv[index + 1];
      if (!value) usage();
      options.project = parseProject(value);
      index += 1;
      continue;
    }

    if (arg.startsWith('--project=')) {
      options.project = parseProject(arg.slice('--project='.length));
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

function inferProject(file?: string, explicitProject?: ProjectName): ProjectName {
  if (explicitProject) return explicitProject;
  if (file?.startsWith('tests/e2e-web/')) return 'e2e-web';
  if (file?.startsWith('tests/e2e-mobile/')) return 'e2e-mobile';
  if (file?.startsWith('tests/miniprogram/')) return 'miniprogram';
  return 'api';
}

function defaultTarget(project: ProjectName): string {
  switch (project) {
    case 'e2e-web':
      return 'tests/e2e-web';
    case 'e2e-mobile':
      return 'tests/e2e-mobile';
    case 'miniprogram':
      return 'tests/miniprogram';
    default:
      return 'tests/api';
  }
}

function buildRunId(project: ProjectName): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${timestamp}-${project}-${process.pid}`;
}

function buildReportPaths(project: ProjectName): ReportPaths {
  const runId = buildRunId(project);
  const runDir = path.join('reports', 'runs', runId);
  return {
    runId,
    runDir,
    htmlDir: path.join(runDir, 'html'),
    htmlIndex: path.join(runDir, 'html', 'index.html'),
    allureResultsDir: path.join(runDir, 'allure-results'),
    allureHtmlDir: path.join(runDir, 'allure-html'),
    allureIndex: path.join(runDir, 'allure-html', 'index.html'),
    junitFile: path.join(runDir, 'junit.xml'),
    artifactsDir: path.join(runDir, 'artifacts'),
  };
}

function runPlaywright(
  args: string[],
  env: EnvName,
  envOverrides: Record<string, string> = {},
): number {
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
      PLAYWRIGHT_BROWSERS_PATH: '0',
      ...envOverrides,
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

function resolveRootPath(relativePath: string): string {
  return path.isAbsolute(relativePath) ? relativePath : path.join(ROOT, relativePath);
}

function directoryHasEntries(relativePath: string): boolean {
  const target = resolveRootPath(relativePath);
  return fs.existsSync(target) && fs.readdirSync(target).length > 0;
}

function cleanAllureOutput(reportPaths: ReportPaths): void {
  fs.rmSync(path.join(ROOT, DEFAULT_ALLURE_RESULTS_PATH), { recursive: true, force: true });
  fs.rmSync(resolveRootPath(reportPaths.allureResultsDir), { recursive: true, force: true });
  fs.rmSync(resolveRootPath(reportPaths.allureHtmlDir), { recursive: true, force: true });
}

function runAllureReport(reportPaths: ReportPaths): ReportGenerationResult {
  if (!directoryHasEntries(reportPaths.allureResultsDir)) {
    console.warn(
      `[test] Skip Allure HTML report: ${reportPaths.allureResultsDir} is empty or does not exist.`,
    );
    return { exitCode: 0, generated: false };
  }

  const bin = path.join(
    ROOT,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'allure.cmd' : 'allure',
  );
  const result = spawnSync(bin, ['generate', reportPaths.allureResultsDir, '--clean', '-o', reportPaths.allureHtmlDir], {
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

function openAllureReport(reportPaths: ReportPaths, allureReportGenerated: boolean): number {
  if (!allureReportGenerated) {
    console.warn('[test] Skip opening Allure report: no Allure HTML report was generated.');
    return 0;
  }

  const bin = path.join(
    ROOT,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'allure.cmd' : 'allure',
  );
  const child = spawn(bin, ['open', reportPaths.allureHtmlDir], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
  });

  child.on('error', (error) => {
    console.error(`[test] Failed to open Allure report: ${error.message}`);
  });
  child.unref();
  console.log(`[test] Allure report server started in background: ${path.join(ROOT, reportPaths.allureIndex)}`);
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

function readJUnitSummary(reportPaths: ReportPaths): JUnitSummary | null {
  const file = resolveRootPath(reportPaths.junitFile);
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
  reportPaths: ReportPaths,
): void {
  const summary = readJUnitSummary(reportPaths);
  const status =
    exitCode !== 0
      ? '失败'
      : summary && summary.tests > 0 && summary.tests === summary.skipped
        ? '跳过'
        : '通过';
  const reportPath = path.join(ROOT, reportPaths.htmlIndex);
  const reportUrl = process.env.REPORT_URL || reportPath;
  const allureReportUrl = process.env.ALLURE_REPORT_URL || path.join(ROOT, reportPaths.allureIndex);
  const summaryLine = summary
    ? `总数 ${summary.tests}，失败 ${summary.failures}，错误 ${summary.errors}，跳过 ${summary.skipped}，耗时 ${summary.time.toFixed(2)}s`
    : '未读取到 JUnit 汇总';
  const content = [
    `### ClassInShop 测试${status}`,
    `> 环境：${options.env}`,
    `> 目标：${target}`,
    `> 结果：${summaryLine}`,
    `> HTML Report：${reportUrl}`,
    ...(allureReportGenerated ? [`> Allure Report：${allureReportUrl}`] : []),
    `> JUnit Report：${path.join(ROOT, reportPaths.junitFile)}`,
  ].join('\n');
  const payload = {
    msgtype: 'markdown',
    markdown: { content },
  };

  console.log('[test] Simulating WeCom robot notification...');
  console.log('[test] Replace this log with POST WEWORK_WEBHOOK_URL when ready.');
  console.log(JSON.stringify(payload, null, 2));
}

const options = parseArgs(process.argv.slice(2));
const project = inferProject(options.file, options.project);
const target = options.file ?? defaultTarget(project);
const testArgs = ['test', target, `--project=${project}`, ...options.passthrough];
const logPrefix = `[test:${project}]`;
const reportPaths = buildReportPaths(project);
const playwrightReportEnv = {
  PLAYWRIGHT_HTML_REPORT_DIR: reportPaths.htmlDir,
  PLAYWRIGHT_JUNIT_REPORT_FILE: reportPaths.junitFile,
  ALLURE_RESULTS_DIR: reportPaths.allureResultsDir,
  PLAYWRIGHT_ARTIFACTS_DIR: reportPaths.artifactsDir,
};

console.log(`${logPrefix} TEST_ENV=${options.env} playwright ${testArgs.join(' ')}`);
console.log(`${logPrefix} Report run directory: ${reportPaths.runDir}`);

if (options.allure) {
  cleanAllureOutput(reportPaths);
}

const testExitCode = runPlaywright(testArgs, options.env, playwrightReportEnv);
let allureExitCode = 0;
let allureReportGenerated = false;

if (options.allure) {
  console.log(`${logPrefix} Generating Allure HTML report...`);
  const result = runAllureReport(reportPaths);
  allureExitCode = result.exitCode;
  allureReportGenerated = result.generated;
}

if (options.notify) {
  simulateWeComNotification(options, target, testExitCode, allureReportGenerated, reportPaths);
}

let openExitCode = 0;

if (options.open) {
  if (options.allure) {
    console.log(`${logPrefix} Opening Allure HTML report...`);
    openExitCode = openAllureReport(reportPaths, allureReportGenerated);
  } else {
    console.log(`${logPrefix} Opening Playwright HTML report...`);
    openExitCode = runPlaywright(['show-report', reportPaths.htmlDir], options.env);
  }
} else if (options.report) {
  console.log(`${logPrefix} Opening Playwright HTML report...`);
  openExitCode = runPlaywright(['show-report', reportPaths.htmlDir], options.env);
}

process.exit(testExitCode || allureExitCode || openExitCode);
