import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

type EnvName = '13' | '14' | 'im';

interface Options {
  env: EnvName;
  file?: string;
  report: boolean;
  passthrough: string[];
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function usage(exitCode = 1): never {
  console.error(`
Usage:
  npm run api:run -- --env 14 --file tests/api/api-demo.spec.ts
  npm run api:run -- -e 14 -f tests/api/api-demo.spec.ts --report

Options:
  -e, --env <13|14|im>       被测环境，默认 13
  -f, --file <spec path>     指定用例文件；不传则运行 tests/api
  --report                   测试结束后打开 Playwright HTML 报告
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
    env: '13',
    report: false,
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

const options = parseArgs(process.argv.slice(2));
const target = options.file ?? 'tests/api';
const testArgs = ['test', target, '--project=api', ...options.passthrough];

console.log(`[api:run] TEST_ENV=${options.env} playwright ${testArgs.join(' ')}`);

const testExitCode = runPlaywright(testArgs, options.env);

if (options.report) {
  console.log('[api:run] Opening Playwright HTML report...');
  const reportExitCode = runPlaywright(['show-report', 'reports/html'], options.env);
  process.exit(testExitCode || reportExitCode);
}

process.exit(testExitCode);
