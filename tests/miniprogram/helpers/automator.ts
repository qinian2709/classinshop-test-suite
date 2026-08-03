import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import automator from 'miniprogram-automator';
import type MiniProgram from 'miniprogram-automator/out/MiniProgram.js';
import { createLogger } from '@shared';
import { env } from '@config';

const require = createRequire(import.meta.url);
const log = createLogger('miniprogram');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const WORKSPACE_ROOT = path.resolve(ROOT, '..');

export type MpTarget = 'user' | 'teacher';

interface MpEnv {
  cliPath: string;
  projectPath: string;
}

let versionCheckPatched = false;

function patchAutomatorVersionCheck(): void {
  if (versionCheckPatched) return;
  versionCheckPatched = true;

  const miniProgramModule = require('miniprogram-automator/out/MiniProgram.js') as {
    default?: { prototype?: unknown };
    prototype?: unknown;
  };
  const miniProgramClass = miniProgramModule.default ?? miniProgramModule;
  const prototype = miniProgramClass.prototype as {
    checkVersion: () => Promise<void>;
  };
  const originalCheckVersion = prototype.checkVersion;

  prototype.checkVersion = async function checkVersionCompat() {
    try {
      await originalCheckVersion.call(this);
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes("Cannot read properties of undefined (reading 'split')")) {
        log.warn('微信开发者工具版本号读取失败，跳过 miniprogram-automator 版本检查');
        return;
      }
      throw err;
    }
  };
}

function defaultProjectPath(target: MpTarget): string {
  const projectDir =
    target === 'user' ? 'classinshop-miniprogram' : 'classinshop-teacher-miniprogram';
  return path.join(WORKSPACE_ROOT, projectDir, 'dist/build/mp-weixin');
}

function defaultCliPath(): string {
  const candidates = [
    '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
    '/Applications/微信开发者工具.app/Contents/MacOS/cli',
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? '';
}

function resolvePathFromRoot(value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(ROOT, value);
}

function resolveEnv(target: MpTarget): MpEnv {
  const cliPath = (process.env.WX_DEVTOOLS_CLI ?? '').trim() || defaultCliPath();
  const projectPath = (
    target === 'user' ? process.env.MP_USER_PROJECT : process.env.MP_TEACHER_PROJECT
  )?.trim();
  const resolvedProjectPath = projectPath
    ? resolvePathFromRoot(projectPath)
    : defaultProjectPath(target);

  if (!cliPath) {
    throw new Error(
      '未找到 WX_DEVTOOLS_CLI（微信开发者工具 CLI 路径）。请先安装微信开发者工具，或在 .env.local 配置 WX_DEVTOOLS_CLI。',
    );
  }
  return { cliPath, projectPath: resolvedProjectPath };
}

/** 当前目标小程序是否具备运行条件（CLI 与编译产物均存在）。 */
export function canRun(target: MpTarget): { ok: boolean; reason?: string } {
  try {
    const { cliPath, projectPath } = resolveEnv(target);
    if (!fs.existsSync(cliPath))
      return { ok: false, reason: `微信开发者工具 CLI 不存在：${cliPath}` };
    if (!fs.existsSync(projectPath)) {
      return {
        ok: false,
        reason: `编译产物目录不存在（请先在对应项目执行 build:mp-weixin）：${projectPath}`,
      };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

/** 启动微信开发者工具并连接到目标小程序，返回 MiniProgram 实例。 */
export async function launch(target: MpTarget): Promise<MiniProgram> {
  const { cliPath, projectPath } = resolveEnv(target);
  log.info(`启动小程序自动化：env=${env.name} target=${target} project=${projectPath}`);
  patchAutomatorVersionCheck();
  const mp = await automator.launch({
    cliPath,
    projectPath,
    timeout: 60_000,
  });
  return mp;
}

export async function safeClose(mp: MiniProgram | undefined): Promise<void> {
  if (!mp) return;
  try {
    await mp.close();
  } catch (err) {
    log.warn('关闭小程序实例失败（忽略）', err);
  }
}
