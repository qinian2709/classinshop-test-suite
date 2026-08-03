import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

interface PublishOptions {
  testEnv: string;
  target: string;
  sourceDir: string;
  pipelineId: string;
  ref: string;
}

function usage(): never {
  console.error(`
Usage:
  pnpm exec tsx scripts/publish-report.ts \\
    --env 14 --target api --source reports/latest/enhanced \\
    --pipeline-id 12345 --ref 14

Environment (CI/CD Variables):
  REPORT_PUBLISH_MODE            coolify | rsync | local（默认 auto：有 GIT_REPO 走 coolify，否则 rsync/local）
  REPORT_PUBLISH_BASE_URL          对外 URL 前缀，Coolify 如 https://classinshop-test-reports.coolify.eeo-inc.com
  REPORT_PUBLISH_GIT_REPO          Coolify 报告仓库 HTTPS URL（不含 token）
  REPORT_PUBLISH_GIT_TOKEN         GitLab Token（write_repository），CI 中 Masked
  REPORT_PUBLISH_GIT_BRANCH        默认 main
  REPORT_PUBLISH_RSYNC_TARGET      rsync 目标目录
  REPORT_PUBLISH_SSH_PRIVATE_KEY   （可选）rsync SSH 私钥
  REPORT_PUBLISH_LOCAL_DIR         （可选）本机目录拷贝

Outputs:
  reports/latest/publish.env       ENHANCED_REPORT_URL=...（供企微通知读取）
  export ENHANCED_REPORT_URL=...   # eval 后供 shell 使用
`);
  process.exit(1);
}

function readArg(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  return inline?.slice(prefix.length);
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._+-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

function resolveSourceDir(source: string): string {
  const absolute = path.isAbsolute(source) ? source : path.join(ROOT, source);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Report source directory not found: ${absolute}`);
  }
  const index = path.join(absolute, 'enhanced-report.html');
  if (!fs.existsSync(index)) {
    throw new Error(`Missing enhanced-report.html under ${absolute}`);
  }
  return absolute;
}

function buildRelativePath(options: PublishOptions): string {
  const env = sanitizeSegment(options.testEnv);
  const target = sanitizeSegment(options.target);
  const pipeline = sanitizeSegment(options.pipelineId);
  return `${env}/${target}/${pipeline}/enhanced`;
}

export const PUBLISH_ENV_FILE = path.join(ROOT, 'reports/latest/publish.env');

function writePublishEnv(publicUrl: string): void {
  const dir = path.dirname(PUBLISH_ENV_FILE);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(PUBLISH_ENV_FILE, `ENHANCED_REPORT_URL=${publicUrl}\n`, 'utf8');
}

function buildPublicUrl(baseUrl: string, relativeDir: string): string {
  return `${baseUrl.replace(/\/$/, '')}/${relativeDir}/enhanced-report.html`;
}

function copyDirectory(sourceDir: string, destDir: string): void {
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });
  fs.cpSync(sourceDir, destDir, { recursive: true });
}

function runCommand(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env): void {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env });
  if (result.error) {
    throw new Error(`${command} failed: ${result.error.message}`);
  }
  if ((result.status ?? 1) !== 0) {
    throw new Error(`${command} exited with code ${result.status ?? 1}`);
  }
}

function resolvePublishMode(): 'coolify' | 'rsync' | 'local' {
  const explicit = process.env.REPORT_PUBLISH_MODE?.trim().toLowerCase();
  if (explicit === 'coolify' || explicit === 'git') return 'coolify';
  if (explicit === 'rsync') return 'rsync';
  if (explicit === 'local') return 'local';
  if (process.env.REPORT_PUBLISH_GIT_REPO?.trim()) return 'coolify';
  if (process.env.REPORT_PUBLISH_RSYNC_TARGET?.trim()) return 'rsync';
  if (process.env.REPORT_PUBLISH_LOCAL_DIR?.trim()) return 'local';
  throw new Error('缺少发布配置：请设置 REPORT_PUBLISH_GIT_REPO（Coolify）或 RSYNC/LOCAL 目标');
}

function buildAuthenticatedGitUrl(repoUrl: string, token: string): string {
  const url = new URL(repoUrl);
  url.username = 'oauth2';
  url.password = token;
  return url.toString();
}

function publishViaGit(options: PublishOptions, baseUrl: string): string {
  const gitRepo = process.env.REPORT_PUBLISH_GIT_REPO?.trim();
  const gitToken = process.env.REPORT_PUBLISH_GIT_TOKEN?.trim();
  const gitBranch = process.env.REPORT_PUBLISH_GIT_BRANCH?.trim() || 'main';

  if (!gitRepo) {
    throw new Error('Coolify 发布缺少 REPORT_PUBLISH_GIT_REPO');
  }
  if (!gitToken) {
    throw new Error('Coolify 发布缺少 REPORT_PUBLISH_GIT_TOKEN');
  }

  const sourceDir = resolveSourceDir(options.sourceDir);
  const relativePath = buildRelativePath(options);
  const publicUrl = buildPublicUrl(baseUrl, relativePath);
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'classinshop-report-publish-'));
  const authUrl = buildAuthenticatedGitUrl(gitRepo, gitToken);

  try {
    runCommand('git', ['clone', '--depth', '1', '--branch', gitBranch, authUrl, workDir], ROOT);
    copyDirectory(sourceDir, path.join(workDir, relativePath));

    const gitEnv = {
      ...process.env,
      GIT_AUTHOR_NAME: process.env.REPORT_PUBLISH_GIT_AUTHOR_NAME || 'classinshop-test-suite',
      GIT_AUTHOR_EMAIL: process.env.REPORT_PUBLISH_GIT_AUTHOR_EMAIL || 'ci@classinshop.local',
      GIT_COMMITTER_NAME: process.env.REPORT_PUBLISH_GIT_AUTHOR_NAME || 'classinshop-test-suite',
      GIT_COMMITTER_EMAIL: process.env.REPORT_PUBLISH_GIT_AUTHOR_EMAIL || 'ci@classinshop.local',
    };

    runCommand('git', ['add', relativePath], workDir, gitEnv);
    runCommand(
      'git',
      [
        '-c',
        `user.name=${gitEnv.GIT_AUTHOR_NAME}`,
        '-c',
        `user.email=${gitEnv.GIT_AUTHOR_EMAIL}`,
        'commit',
        '-m',
        `report ${options.testEnv}/${options.target} pipeline ${options.pipelineId}`,
      ],
      workDir,
      gitEnv,
    );
    runCommand('git', ['push', 'origin', gitBranch], workDir, gitEnv);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }

  console.error(`[publish-report] Report URL: ${publicUrl}`);
  console.error('[publish-report] Coolify redeploy will start automatically after git push (~1-2 min).');
  writePublishEnv(publicUrl);
  return publicUrl;
}

function runRsync(sourceDir: string, remoteDest: string, sshPrivateKey?: string): void {
  const rsyncArgs = ['-avz', '--delete', `${sourceDir}/`, remoteDest.endsWith('/') ? remoteDest : `${remoteDest}/`];
  if (sshPrivateKey?.trim()) {
    const keyFile = path.join('/tmp', `report-publish-key-${process.pid}`);
    fs.writeFileSync(keyFile, sshPrivateKey.replace(/\\n/g, '\n'), { mode: 0o600 });
    rsyncArgs.unshift('-e', `ssh -i ${keyFile} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null`);
  }

  runCommand('rsync', rsyncArgs, ROOT);
}

function publishToRemoteRoot(sourceDir: string, remoteRoot: string, relativeDir: string, sshPrivateKey?: string): void {
  const normalizedRoot = remoteRoot.replace(/\/$/, '');
  runRsync(sourceDir, `${normalizedRoot}/${relativeDir}`, sshPrivateKey);
}

function publishViaRsyncOrLocal(options: PublishOptions, baseUrl: string): string {
  const rsyncTarget = process.env.REPORT_PUBLISH_RSYNC_TARGET?.trim();
  const localDir = process.env.REPORT_PUBLISH_LOCAL_DIR?.trim();
  const mode = resolvePublishMode();

  if (mode === 'rsync' && !rsyncTarget) {
    throw new Error('rsync 发布缺少 REPORT_PUBLISH_RSYNC_TARGET');
  }
  if (mode === 'local' && !localDir) {
    throw new Error('local 发布缺少 REPORT_PUBLISH_LOCAL_DIR');
  }

  const sourceDir = resolveSourceDir(options.sourceDir);
  const relativePath = buildRelativePath(options);
  const sshKey = process.env.REPORT_PUBLISH_SSH_PRIVATE_KEY?.trim();
  const publicUrl = buildPublicUrl(baseUrl, relativePath);

  if (rsyncTarget) {
    publishToRemoteRoot(sourceDir, rsyncTarget, relativePath, sshKey);
  } else if (localDir) {
    copyDirectory(sourceDir, path.join(localDir, relativePath));
  }

  console.error(`[publish-report] Report URL: ${publicUrl}`);
  writePublishEnv(publicUrl);
  return publicUrl;
}

function publish(options: PublishOptions): string {
  const baseUrl = process.env.REPORT_PUBLISH_BASE_URL?.trim();
  if (!baseUrl) {
    throw new Error('缺少 REPORT_PUBLISH_BASE_URL');
  }

  const mode = resolvePublishMode();
  if (mode === 'coolify') {
    return publishViaGit(options, baseUrl);
  }
  return publishViaRsyncOrLocal(options, baseUrl);
}

function parseOptions(argv: string[]): PublishOptions {
  const testEnv = readArg(argv, '--env') ?? process.env.TEST_ENV ?? '';
  const target = readArg(argv, '--target') ?? 'api';
  const sourceDir = readArg(argv, '--source') ?? 'reports/latest/enhanced';
  const pipelineId = readArg(argv, '--pipeline-id') ?? process.env.CI_PIPELINE_ID ?? '';
  const ref = readArg(argv, '--ref') ?? process.env.CI_COMMIT_REF_NAME ?? '';

  if (!testEnv) usage();
  if (!pipelineId) usage();

  return { testEnv, target, sourceDir, pipelineId, ref };
}

function main(): number {
  try {
    const options = parseOptions(process.argv.slice(2));
    const url = publish(options);
    console.log(`export ENHANCED_REPORT_URL='${url.replace(/'/g, `'\\''`)}'`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[publish-report] ${message}`);
    return 1;
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  process.exit(main());
}
