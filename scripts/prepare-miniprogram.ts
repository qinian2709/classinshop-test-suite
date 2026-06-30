import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { env } from '../config/index.js';

type Target = 'user' | 'teacher';

interface TargetConfig {
  target: Target;
  name: string;
  envKey: string;
  projectDir: string;
  defaultOutput: string;
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKSPACE_ROOT = path.resolve(ROOT, '..');

const targets: TargetConfig[] = [
  {
    target: 'user',
    name: '用户端小程序',
    envKey: 'MP_USER_PROJECT',
    projectDir: path.join(WORKSPACE_ROOT, 'classinshop-miniprogram'),
    defaultOutput: path.join(WORKSPACE_ROOT, 'classinshop-miniprogram/dist/build/mp-weixin'),
  },
  {
    target: 'teacher',
    name: '教师端小程序',
    envKey: 'MP_TEACHER_PROJECT',
    projectDir: path.join(WORKSPACE_ROOT, 'classinshop-teacher-miniprogram'),
    defaultOutput: path.join(WORKSPACE_ROOT, 'classinshop-teacher-miniprogram/dist/build/mp-weixin'),
  },
];

function usage(exitCode = 1): never {
  console.error(`
Usage:
  pnpm prepare:mp
  pnpm prepare:mp:user
  pnpm prepare:mp:teacher
  tsx scripts/prepare-miniprogram.ts --target user

Options:
  --target <user|teacher|all>   编译指定小程序，默认 all
  --skip-cli-check              只编译产物，不检查微信开发者工具 CLI
`);
  process.exit(exitCode);
}

function parseTarget(value: string): Target | 'all' {
  if (value === 'user' || value === 'teacher' || value === 'all') return value;
  console.error(`Invalid --target "${value}". Expected user, teacher, or all.`);
  return usage();
}

function parseArgs(argv: string[]): { target: Target | 'all'; skipCliCheck: boolean } {
  const options = { target: 'all' as Target | 'all', skipCliCheck: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;

    if (arg === '--target') {
      const value = argv[++index];
      if (!value) return usage();
      options.target = parseTarget(value);
      continue;
    }

    if (arg.startsWith('--target=')) {
      options.target = parseTarget(arg.slice('--target='.length));
      continue;
    }

    if (arg === '--skip-cli-check') {
      options.skipCliCheck = true;
      continue;
    }

    if (arg === '-h' || arg === '--help') return usage(0);

    console.error(`Unknown option: ${arg}`);
    return usage();
  }

  return options;
}

function resolveConfiguredOutput(config: TargetConfig): string {
  const configured = (process.env[config.envKey] ?? '').trim();
  return configured ? path.resolve(ROOT, configured) : config.defaultOutput;
}

function resolveBuildScript(config: TargetConfig): string {
  const envScript = `build:mp-weixin-${env.name}`;
  const packageJsonPath = path.join(config.projectDir, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
    scripts?: Record<string, string>;
  };
  if (packageJson.scripts?.[envScript]) return envScript;
  return 'build:mp-weixin';
}

function run(command: string, args: string[], cwd: string): void {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: process.env,
    shell: false,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`命令执行失败：${command} ${args.join(' ')}`);
  }
}

function ensureDependencies(config: TargetConfig): void {
  const modulesMarker = path.join(config.projectDir, 'node_modules/.modules.yaml');
  if (fs.existsSync(modulesMarker)) return;

  console.log(`[miniprogram] 安装 ${config.name} 依赖：pnpm install`);
  run('pnpm', ['install'], config.projectDir);
}

function buildTarget(config: TargetConfig): void {
  if (!fs.existsSync(config.projectDir)) {
    throw new Error(`${config.name}项目目录不存在：${config.projectDir}`);
  }

  ensureDependencies(config);

  const output = resolveConfiguredOutput(config);
  const buildScript = resolveBuildScript(config);

  console.log(`[miniprogram] 编译 ${config.name}：pnpm ${buildScript}`);
  run('pnpm', [buildScript], config.projectDir);

  if (!fs.existsSync(output)) {
    throw new Error(
      `${config.name}编译后未找到 mp-weixin 产物：${output}\n` +
        `请检查 ${config.envKey} 是否指向实际 dist/build/mp-weixin 目录。`,
    );
  }

  patchPluginAppIds(output);

  console.log(`[miniprogram] ${config.name}产物已就绪：${path.relative(ROOT, output)}`);
}

function patchPluginAppIds(outputDir: string): void {
  const appJsonPath = path.join(outputDir, 'app.json');
  if (!fs.existsSync(appJsonPath)) return;

  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8')) as {
    plugins?: Record<string, { provider?: string; appid?: string; appId?: string }>;
  };
  let changed = false;

  for (const [name, plugin] of Object.entries(appJson.plugins ?? {})) {
    if (plugin.provider && (!plugin.appid || !plugin.appId)) {
      plugin.appid = plugin.provider;
      plugin.appId = plugin.provider;
      changed = true;
      console.log(`[miniprogram] 补齐插件 ${name} appid/appId=${plugin.provider}`);
    }
  }

  if (changed) {
    fs.writeFileSync(appJsonPath, `${JSON.stringify(appJson, null, 2)}\n`);
  }
}

function detectCliPath(): string {
  const configured = (process.env.WX_DEVTOOLS_CLI ?? '').trim();
  const candidates = [
    configured,
    '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
    '/Applications/微信开发者工具.app/Contents/MacOS/cli',
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? '';
}

function assertCliAvailable(): void {
  const cliPath = detectCliPath();
  if (!cliPath) {
    throw new Error(
      '未找到微信开发者工具 CLI。\n' +
        '请先安装微信开发者工具，并在工具内开启「设置 -> 安全设置 -> 服务端口」。\n' +
        '如安装在非默认路径，请在 .env.local 配置：\n' +
        'WX_DEVTOOLS_CLI=/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
    );
  }

  process.env.WX_DEVTOOLS_CLI = cliPath;
  console.log(`[miniprogram] 微信开发者工具 CLI 已就绪：${cliPath}`);
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const selected =
    options.target === 'all' ? targets : targets.filter((config) => config.target === options.target);

  for (const config of selected) {
    buildTarget(config);
  }

  if (!options.skipCliCheck) {
    assertCliAvailable();
  }
}

main();
