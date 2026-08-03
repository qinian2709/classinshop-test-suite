import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { sendWeComNotification } from './wecom-notify.js';

type EnvName = '13' | '14' | 'im';
type ProjectName =
  | 'api'
  | 'e2e-web'
  | 'e2e-mobile'
  | 'core'
  | 'miniprogram'
  | 'miniprogram-user'
  | 'miniprogram-teacher';

interface Options {
  env: EnvName;
  project?: ProjectName;
  file?: string;
  report: boolean;
  allure: boolean;
  enhanced: boolean;
  open: boolean;
  notify: boolean;
  passthrough: string[];
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORTS_ROOT = 'reports';
const LATEST_LINK = path.join(REPORTS_ROOT, 'latest');

interface ReportPaths {
  runId: string;
  runDir: string;
  htmlDir: string;
  htmlIndex: string;
  enhancedDir: string;
  enhancedIndex: string;
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
  pnpm test:core -- --env 14 --open
  pnpm test:e2e:web -- --env 14 --file tests/e2e-web/enter-shop.spec.ts --open
  pnpm test:e2e:web -- --env 14 --file tests/e2e-web/enter-shop.spec.ts --allure --open
  pnpm test:mp:user -- --env 14 --file tests/miniprogram/user/auth-click.spec.ts --open
  pnpm test:mp:teacher -- --env 14 --allure --open

Options:
  -e, --env <13|14|im>       被测环境，默认 13
  -p, --project <name>        项目，默认按 --file 推断；支持 api/e2e-web/e2e-mobile/core/miniprogram/miniprogram-user/miniprogram-teacher
  -f, --file <spec path>     指定用例文件；不传则按项目运行默认目录
  --report                   测试结束后打开 Playwright HTML 报告（兼容旧写法）
  --enhanced                 显式打开 Enhanced HTML 报告（也可单独使用；报告本身每次运行都会生成）
  --allure                   测试结束后生成 Allure HTML 报告
  --open                     测试结束后打开报告：默认 Enhanced；配合 --allure 打开 Allure；配合 --report 打开 Playwright HTML
  --notify                   测试结束后发送企微机器人通知（需 WECOM_WEBHOOK_URL）
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
  if (
    value === 'api' ||
    value === 'e2e-web' ||
    value === 'e2e-mobile' ||
    value === 'core' ||
    value === 'miniprogram' ||
    value === 'miniprogram-user' ||
    value === 'miniprogram-teacher'
  ) {
    return value;
  }
  console.error(
    `Invalid --project "${value}". Expected api, e2e-web, e2e-mobile, core, miniprogram, miniprogram-user, or miniprogram-teacher.`,
  );
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
    arg === '--enhanced' ||
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
    enhanced: false,
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

    if (arg === '--enhanced') {
      options.enhanced = true;
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
  if (file?.startsWith('tests/miniprogram/')) {
    const target = inferMiniprogramTarget(file);
    if (target === 'teacher') return 'miniprogram-teacher';
    return 'miniprogram-user';
  }
  return 'api';
}

function assertLocalMiniprogram(project: ProjectName): void {
  if (!project.startsWith('miniprogram')) return;
  if (!process.env.CI) return;

  console.error(
    '[test:miniprogram] 小程序自动化依赖本机微信开发者工具，仅允许本地执行；CI 中不会运行 miniprogram 项目。',
  );
  process.exit(1);
}

function defaultTarget(project: ProjectName): string | undefined {
  switch (project) {
    case 'core':
      return undefined;
    case 'e2e-web':
      return 'tests/e2e-web';
    case 'e2e-mobile':
      return 'tests/e2e-mobile';
    case 'miniprogram':
    case 'miniprogram-user':
    case 'miniprogram-teacher':
      return 'tests/miniprogram';
    default:
      return 'tests/api';
  }
}

function inferMiniprogramTarget(file?: string, project?: ProjectName): 'user' | 'teacher' | 'all' {
  if (project === 'miniprogram-user') return 'user';
  if (project === 'miniprogram-teacher') return 'teacher';
  if (!file) return 'all';
  const normalized = file.toLowerCase();
  if (normalized.includes('tests/miniprogram/teacher/')) return 'teacher';
  if (normalized.includes('tests/miniprogram/user/')) return 'user';
  if (normalized.includes('/teacher') || normalized.includes('teacher.')) return 'teacher';
  if (normalized.includes('/user') || normalized.includes('user.')) return 'user';
  return 'all';
}

function resolvePlaywrightProjects(project: ProjectName, file?: string): string[] {
  if (project === 'core') return ['api', 'e2e-web', 'e2e-mobile'];
  if (project === 'miniprogram-user') return ['miniprogram-user'];
  if (project === 'miniprogram-teacher') return ['miniprogram-teacher'];
  if (project === 'miniprogram') {
    const target = inferMiniprogramTarget(file, project);
    if (target === 'user') return ['miniprogram-user'];
    if (target === 'teacher') return ['miniprogram-teacher'];
    return ['miniprogram-user', 'miniprogram-teacher'];
  }
  return [project];
}

function buildRunId(project: ProjectName): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${timestamp}-${project}-${process.pid}`;
}

function buildReportPaths(project: ProjectName): ReportPaths {
  const runId = buildRunId(project);
  const runDir = path.join(REPORTS_ROOT, 'runs', runId);
  const enhancedDir = path.join(runDir, 'enhanced');
  return {
    runId,
    runDir,
    htmlDir: path.join(runDir, 'html'),
    htmlIndex: path.join(runDir, 'html', 'index.html'),
    enhancedDir,
    enhancedIndex: path.join(enhancedDir, 'enhanced-report.html'),
    allureResultsDir: path.join(runDir, 'allure-results'),
    allureHtmlDir: path.join(runDir, 'allure-html'),
    allureIndex: path.join(runDir, 'allure-html', 'index.html'),
    junitFile: path.join(runDir, 'junit.xml'),
    artifactsDir: path.join(runDir, 'artifacts'),
  };
}

/** Point reports/latest at this run so package scripts and CI have a stable path. */
function updateLatestLink(reportPaths: ReportPaths): void {
  const reportsAbs = path.join(ROOT, REPORTS_ROOT);
  const latestAbs = path.join(ROOT, LATEST_LINK);
  const runAbs = path.join(ROOT, reportPaths.runDir);
  fs.mkdirSync(reportsAbs, { recursive: true });
  fs.mkdirSync(runAbs, { recursive: true });
  fs.rmSync(latestAbs, { recursive: true, force: true });
  const relativeTarget = path.relative(reportsAbs, runAbs);
  try {
    fs.symlinkSync(relativeTarget, latestAbs, 'dir');
    console.log(`[test] reports/latest -> ${relativeTarget}`);
  } catch (error) {
    // Symlink may fail on some Windows setups; fall back to copying a pointer file.
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[test] Failed to create reports/latest symlink (${message}); writing pointer file.`);
    fs.mkdirSync(latestAbs, { recursive: true });
    fs.writeFileSync(path.join(latestAbs, 'RUN_DIR.txt'), `${reportPaths.runDir}\n`, 'utf8');
  }
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

function prepareMiniprogram(env: EnvName, project: ProjectName, file?: string): number {
  const bin = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
  const target = inferMiniprogramTarget(file, project);
  const args = ['scripts/prepare-miniprogram.ts', '--target', target];

  console.log(`[test:miniprogram] TEST_ENV=${env} tsx ${args.join(' ')}`);
  const result = spawnSync(bin, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      TEST_ENV: env,
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

function openFileInBrowser(filePath: string): number {
  const absolute = resolveRootPath(filePath);
  if (!fs.existsSync(absolute)) {
    console.warn(`[test] Skip opening report: ${filePath} does not exist.`);
    return 1;
  }

  const command =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', absolute] : [absolute];
  const child = spawn(command, args, {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
  });
  child.on('error', (error) => {
    console.error(`[test] Failed to open report: ${error.message}`);
  });
  child.unref();
  console.log(`[test] Opened report: ${absolute}`);
  return 0;
}

function openEnhancedReport(reportPaths: ReportPaths): number {
  return openFileInBrowser(reportPaths.enhancedIndex);
}

async function notifyWeComIfRequested(
  options: Options,
  target: string,
  exitCode: number,
  allureReportGenerated: boolean,
  reportPaths: ReportPaths,
): Promise<void> {
  if (!options.notify) return;

  const reportPath = path.join(ROOT, reportPaths.htmlIndex);
  const reportUrl = process.env.REPORT_URL || reportPath;
  const enhancedReportPath = path.join(ROOT, reportPaths.enhancedIndex);
  const enhancedReportUrl = process.env.ENHANCED_REPORT_URL?.trim() || enhancedReportPath;
  const allureReportUrl = process.env.ALLURE_REPORT_URL || path.join(ROOT, reportPaths.allureIndex);

  try {
    await sendWeComNotification({
      testEnv: options.env,
      target,
      exitCode,
      junitFile: reportPaths.junitFile,
      enhancedReportUrl,
      htmlReportUrl: reportUrl,
      allureReportUrl,
      allureReportGenerated,
      pipelineUrl: process.env.CI_PIPELINE_URL,
      jobUrl: process.env.CI_JOB_URL,
      projectName: process.env.CI_PROJECT_NAME,
      refName: process.env.CI_COMMIT_REF_NAME,
      jobName: process.env.CI_JOB_NAME,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[test] WeCom notification failed: ${message}`);
  }
}

async function main(): Promise<number> {
const options = parseArgs(process.argv.slice(2));
const project = inferProject(options.file, options.project);
assertLocalMiniprogram(project);
const target = options.file ?? defaultTarget(project);
const playwrightProjects = resolvePlaywrightProjects(project, options.file);
const testArgs = [
  'test',
  ...(target ? [target] : []),
  ...playwrightProjects.map((playwrightProject) => `--project=${playwrightProject}`),
  ...options.passthrough,
];
const logPrefix = `[test:${project}]`;
const reportPaths = buildReportPaths(project);
const playwrightReportEnv = {
  PLAYWRIGHT_HTML_REPORT_DIR: reportPaths.htmlDir,
  PLAYWRIGHT_JUNIT_REPORT_FILE: reportPaths.junitFile,
  ALLURE_RESULTS_DIR: reportPaths.allureResultsDir,
  PLAYWRIGHT_ARTIFACTS_DIR: reportPaths.artifactsDir,
  PLAYWRIGHT_ENHANCED_REPORT_DIR: reportPaths.enhancedDir,
};

console.log(`${logPrefix} TEST_ENV=${options.env} playwright ${testArgs.join(' ')}`);
console.log(`${logPrefix} Report run directory: ${reportPaths.runDir}`);
console.log(`${logPrefix} Enhanced report: ${reportPaths.enhancedIndex}`);
updateLatestLink(reportPaths);

if (options.allure) {
  cleanAllureOutput(reportPaths);
}

const prepareExitCode = project.startsWith('miniprogram')
  ? prepareMiniprogram(options.env, project, options.file)
  : 0;
const testExitCode =
  prepareExitCode === 0
    ? runPlaywright(testArgs, options.env, {
        ...playwrightReportEnv,
        ...(project.startsWith('miniprogram') ? { RUN_MP: '1' } : {}),
      })
    : prepareExitCode;
let allureExitCode = 0;
let allureReportGenerated = false;

if (options.allure) {
  console.log(`${logPrefix} Generating Allure HTML report...`);
  const result = runAllureReport(reportPaths);
  allureExitCode = result.exitCode;
  allureReportGenerated = result.generated;
}

await notifyWeComIfRequested(
  options,
  target ?? 'api + e2e-web + e2e-mobile',
  testExitCode,
  allureReportGenerated,
  reportPaths,
);

let openExitCode = 0;
const shouldOpenEnhanced =
  options.enhanced || (options.open && !options.allure && !options.report);

if (options.open || options.enhanced || options.report) {
  if (options.allure && options.open) {
    console.log(`${logPrefix} Opening Allure HTML report...`);
    openExitCode = openAllureReport(reportPaths, allureReportGenerated);
  } else if (shouldOpenEnhanced) {
    console.log(`${logPrefix} Opening Enhanced HTML report...`);
    openExitCode = openEnhancedReport(reportPaths);
  } else {
    console.log(`${logPrefix} Opening Playwright HTML report...`);
    openExitCode = runPlaywright(['show-report', reportPaths.htmlDir], options.env);
  }
}

return testExitCode || allureExitCode || openExitCode;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
