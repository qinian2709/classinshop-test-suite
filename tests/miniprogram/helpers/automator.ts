import fs from 'node:fs';
import path from 'node:path';
import automator from 'miniprogram-automator';
import type MiniProgram from 'miniprogram-automator/out/MiniProgram.js';
import { createLogger } from '@shared';

const log = createLogger('miniprogram');

export type MpTarget = 'user' | 'teacher';

interface MpEnv {
  cliPath: string;
  projectPath: string;
}

function resolveEnv(target: MpTarget): MpEnv {
  const cliPath = (process.env.WX_DEVTOOLS_CLI ?? '').trim();
  const projectPath = (
    target === 'user' ? process.env.MP_USER_PROJECT : process.env.MP_TEACHER_PROJECT
  )?.trim();

  if (!cliPath) throw new Error('未配置 WX_DEVTOOLS_CLI（微信开发者工具 CLI 路径）');
  if (!projectPath) {
    throw new Error(
      `未配置 ${target === 'user' ? 'MP_USER_PROJECT' : 'MP_TEACHER_PROJECT'}（mp-weixin 编译产物目录）`,
    );
  }
  return { cliPath, projectPath: path.resolve(process.cwd(), projectPath) };
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
  log.info(`启动小程序自动化：target=${target} project=${projectPath}`);
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
