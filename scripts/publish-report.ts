import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  canonicalizeReportTarget,
  mergeEnvReportTargets,
  pruneSiblingTargetDirs,
  sanitizeSegment,
  resolveReportSeries,
  normalizeReportSeries,
  buildReportSlotPrefix,
  buildLatestEnhancedDir,
} from './report-slot.js';
import { buildGitLabArtifactsBrowseUrl, buildGitLabJobUrl, buildGitLabPipelineUrl, resolvePortalHomeUrl } from './wecom-notify.js';
import { writeReportPortals } from './portal.js';
import { formatBytes, slimReportHtmlForPublish } from './slim-report-html.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LATEST_SEGMENT = 'latest';

interface PublishOptions {
  testEnv: string;
  target: string;
  series: string;
  sourceDir: string;
  pipelineId: string;
  ref: string;
}

function usage(): never {
  console.error(`
Usage:
  pnpm exec tsx scripts/publish-report.ts \\
    --env 14 --target all --series classinshop --source reports/latest/enhanced \\
    --pipeline-id 12345 --ref 14

Environment (CI/CD Variables):
  REPORT_PUBLISH_MODE            coolify | rsync | local（默认 auto：有 GIT_REPO 走 coolify，否则 rsync/local）
  REPORT_PUBLISH_BASE_URL          对外 URL 前缀，Coolify 如 https://classinshop-test-reports.coolify.eeo-inc.com
  REPORT_PUBLISH_GIT_REPO          Coolify 报告仓库 HTTPS URL（不含 token）
  REPORT_PUBLISH_GIT_TOKEN         GitLab Token（write_repository），CI 中 Masked
  REPORT_PUBLISH_GIT_BRANCH        默认 main
  REPORT_PUBLISH_SERIES            产品线目录，默认 classinshop；TI 用 teacherin
  REPORT_PUBLISH_RSYNC_TARGET      rsync 目标目录
  REPORT_PUBLISH_SSH_PRIVATE_KEY   （可选）rsync SSH 私钥
  REPORT_PUBLISH_LOCAL_DIR         （可选）本机目录拷贝
  REPORT_PUBLISH_SLIM              默认 1：托管版去掉通过用例 API body；设 0 关闭
  REPORT_INDEX_HISTORY_LIMIT       每个 env 索引保留最近 N 次（默认 30，仅元数据+外链）

发布策略:
  每个产品线+环境只保留一个分类 all（全量）：覆盖 {series}/{env}/all/latest/enhanced/；
  series 由 REPORT_PUBLISH_SERIES / --series 决定（本仓默认 classinshop）。
  删除同 series+环境下 api / e2e-web 等旧分类目录，不影响其他产品线。
  历史完整报告见 GitLab Job Artifacts（索引记录 jobId / artifactUrl）。

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

function buildLatestRelativePath(options: Pick<PublishOptions, 'series' | 'testEnv' | 'target'>): string {
  return buildLatestEnhancedDir(options.series, options.testEnv, options.target);
}

function buildLatestReportHtmlPath(options: Pick<PublishOptions, 'series' | 'testEnv' | 'target'>): string {
  return `${buildLatestRelativePath(options)}/enhanced-report.html`;
}

function buildSlotPrefix(options: Pick<PublishOptions, 'series' | 'testEnv' | 'target'>): string {
  return buildReportSlotPrefix(options.series, options.testEnv, options.target);
}

const REPORTS_INDEX_FILE = 'reports-index.json';

interface ReportSummary {
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  passRate: number;
  duration: number;
}

interface ReportIndexEntry {
  series?: string;
  env: string;
  target: string;
  pipelineId: string;
  jobId?: string;
  /** 仅 isLatest 条目：托管站 enhanced-report.html 路径 */
  path?: string;
  publishedAt: string;
  branch?: string;
  author?: string;
  buildUrl?: string;
  artifactUrl?: string;
  ref?: string;
  isLatest?: boolean;
  summary?: ReportSummary;
}

interface ReportsIndex {
  updatedAt: string;
  reports: ReportIndexEntry[];
}

function resolveBuildUrl(ciBuildUrl?: string): string | undefined {
  return ciBuildUrl?.trim() || buildGitLabPipelineUrl() || undefined;
}

function resolveArtifactUrl(): string | undefined {
  return buildGitLabArtifactsBrowseUrl();
}

function resolveJobId(): string | undefined {
  return process.env.CI_JOB_ID?.trim() || undefined;
}

function readReportIndexEntry(sourceDir: string, options: PublishOptions): ReportIndexEntry {
  const series = sanitizeSegment(options.series);
  const env = sanitizeSegment(options.testEnv);
  const target = sanitizeSegment(options.target);
  const pipelineId = sanitizeSegment(options.pipelineId);

  const entry: ReportIndexEntry = {
    series,
    env,
    target,
    pipelineId,
    jobId: resolveJobId(),
    path: buildLatestReportHtmlPath(options),
    publishedAt: new Date().toISOString(),
    ref: options.ref || undefined,
    isLatest: true,
    artifactUrl: resolveArtifactUrl(),
    buildUrl: resolveBuildUrl(),
  };

  const detailedPath = path.join(sourceDir, 'detailed-report.json');
  if (!fs.existsSync(detailedPath)) {
    return entry;
  }

  try {
    const detailed = JSON.parse(fs.readFileSync(detailedPath, 'utf8')) as {
      summary?: {
        totalTests?: number;
        passed?: number;
        failed?: number;
        skipped?: number;
        passRate?: number;
        duration?: number;
        startTime?: string;
        endTime?: string;
        ciInfo?: {
          branch?: string;
          author?: string;
          buildUrl?: string;
        };
      };
    };

    const summary = detailed.summary;
    if (!summary) {
      return entry;
    }

    entry.publishedAt = summary.endTime || summary.startTime || entry.publishedAt;
    entry.branch = summary.ciInfo?.branch;
    entry.author = summary.ciInfo?.author;
    entry.buildUrl = resolveBuildUrl(summary.ciInfo?.buildUrl);
    entry.ref = summary.ciInfo?.branch || entry.ref;
    entry.summary = {
      totalTests: summary.totalTests ?? 0,
      passed: summary.passed ?? 0,
      failed: summary.failed ?? 0,
      skipped: summary.skipped ?? 0,
      passRate: summary.passRate ?? 0,
      duration: summary.duration ?? 0,
    };
  } catch {
    // Keep minimal entry when detailed-report.json is malformed.
  }

  return entry;
}

function readHistoryLimit(): number {
  const raw = Number(process.env.REPORT_INDEX_HISTORY_LIMIT ?? '30');
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 30;
}

function stripHostedPath(item: ReportIndexEntry): ReportIndexEntry {
  const { path: _path, isLatest: _isLatest, ...rest } = item;
  return { ...rest, isLatest: false };
}

function capHistoryPerSlot(reports: ReportIndexEntry[], limit: number): ReportIndexEntry[] {
  const groups = new Map<string, ReportIndexEntry[]>();

  for (const report of reports) {
    const key = `${normalizeReportSeries(report.series)}/${report.env}/${report.target}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(report);
    groups.set(key, bucket);
  }

  const capped: ReportIndexEntry[] = [];
  for (const bucket of groups.values()) {
    bucket.sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    );
    capped.push(...bucket.slice(0, limit));
  }

  capped.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  return capped;
}

function updateReportsIndex(repoDir: string, entry: ReportIndexEntry): void {
  const indexPath = path.join(repoDir, REPORTS_INDEX_FILE);
  let index: ReportsIndex = { updatedAt: new Date().toISOString(), reports: [] };

  if (fs.existsSync(indexPath)) {
    try {
      index = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as ReportsIndex;
      if (!Array.isArray(index.reports)) {
        index.reports = [];
      }
    } catch {
      index.reports = [];
    }
  }

  const series = normalizeReportSeries(entry.series);
  index.reports = mergeEnvReportTargets(index.reports, entry.env, entry.target, series)
    .filter(
      (item) =>
        !(
          normalizeReportSeries(item.series) === series &&
          item.env === entry.env &&
          item.target === entry.target &&
          item.pipelineId === entry.pipelineId
        ),
    )
    .map((item) =>
      item.env === entry.env && normalizeReportSeries(item.series) === series
        ? stripHostedPath(item)
        : item,
    );

  index.reports.push({
    ...entry,
    series,
    isLatest: true,
    path: buildLatestReportHtmlPath({
      series,
      testEnv: entry.env,
      target: entry.target,
    }),
  });
  index.reports = capHistoryPerSlot(index.reports, readHistoryLimit());
  index.updatedAt = new Date().toISOString();

  fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
}

/** Remove per-pipeline report trees; only {series}/{env}/{target}/latest/ remains. */
export function pruneLegacyPipelineDirs(
  repoRoot: string,
  testEnv: string,
  target: string,
  series: string,
): string[] {
  const slotPrefix = buildSlotPrefix({ series, testEnv, target });
  const slotDir = path.join(repoRoot, slotPrefix);
  if (!fs.existsSync(slotDir)) {
    return [];
  }

  const removed: string[] = [];
  for (const entry of fs.readdirSync(slotDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === LATEST_SEGMENT) continue;
    const fullPath = path.join(slotDir, entry.name);
    fs.rmSync(fullPath, { recursive: true, force: true });
    removed.push(`${slotPrefix}/${entry.name}`);
  }

  return removed;
}

export const PUBLISH_ENV_FILE = path.join(ROOT, 'reports/latest/publish.env');

function writePublishEnv(publicUrl: string, series: string): void {
  const dir = path.dirname(PUBLISH_ENV_FILE);
  fs.mkdirSync(dir, { recursive: true });

  const lines = [`ENHANCED_REPORT_URL=${publicUrl}`];
  const append = (key: string, value: string | undefined) => {
    const trimmed = value?.trim();
    if (trimmed) lines.push(`${key}=${trimmed}`);
  };

  append('CI_PIPELINE_URL', buildGitLabPipelineUrl());
  append('CI_PIPELINE_ID', process.env.CI_PIPELINE_ID);
  append('CI_PIPELINE_IID', process.env.CI_PIPELINE_IID);
  append('CI_JOB_ID', process.env.CI_JOB_ID);
  append('CI_JOB_URL', process.env.CI_JOB_URL || buildGitLabJobUrl());
  append('ARTIFACT_BROWSE_URL', buildGitLabArtifactsBrowseUrl());
  append('PORTAL_HOME_URL', resolvePortalHomeUrl(process.env.REPORT_PUBLISH_BASE_URL, publicUrl, series));

  fs.writeFileSync(PUBLISH_ENV_FILE, `${lines.join('\n')}\n`, 'utf8');
}

function buildPublicUrl(baseUrl: string, relativeDir: string): string {
  return `${baseUrl.replace(/\/$/, '')}/${relativeDir}/enhanced-report.html`;
}

function isJsonApiLogAttachment(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.json');
}

function copyBinaryAttachments(attachmentsSrc: string, attachmentsDest: string): { copied: number; skipped: number } {
  let copied = 0;
  let skipped = 0;

  for (const entry of fs.readdirSync(attachmentsSrc, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (isJsonApiLogAttachment(entry.name)) {
      skipped += 1;
      continue;
    }
    if (copied === 0) {
      fs.mkdirSync(attachmentsDest, { recursive: true });
    }
    fs.copyFileSync(path.join(attachmentsSrc, entry.name), path.join(attachmentsDest, entry.name));
    copied += 1;
  }

  return { copied, skipped };
}

function isPublishSlimEnabled(): boolean {
  const raw = process.env.REPORT_PUBLISH_SLIM?.trim().toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'off' || raw === 'no') {
    return false;
  }
  return true;
}

function writeEnhancedReportHtml(sourceDir: string, destDir: string): void {
  const srcPath = path.join(sourceDir, 'enhanced-report.html');
  const destPath = path.join(destDir, 'enhanced-report.html');

  if (!isPublishSlimEnabled()) {
    fs.copyFileSync(srcPath, destPath);
    console.error('[publish-report] Staged enhanced-report.html (slim disabled)');
    return;
  }

  const raw = fs.readFileSync(srcPath, 'utf8');
  const slimmed = slimReportHtmlForPublish(raw);
  fs.writeFileSync(destPath, slimmed, 'utf8');

  const before = Buffer.byteLength(raw, 'utf8');
  const after = Buffer.byteLength(slimmed, 'utf8');
  const saved = before > 0 ? (((before - after) / before) * 100).toFixed(1) : '0';
  console.error(
    `[publish-report] Slimmed HTML: ${formatBytes(before)} → ${formatBytes(after)} (-${saved}%)`,
  );
}

/** Publish HTML + binary attachments only; detailed-report.json stays in CI artifacts. */
function copyPublishableReport(sourceDir: string, destDir: string): void {
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });

  writeEnhancedReportHtml(sourceDir, destDir);

  const attachmentsSrc = path.join(sourceDir, 'attachments');
  if (fs.existsSync(attachmentsSrc)) {
    const { copied, skipped } = copyBinaryAttachments(
      attachmentsSrc,
      path.join(destDir, 'attachments'),
    );
    console.error(
      `[publish-report] Attachments: copied ${copied} binary, skipped ${skipped} JSON API log(s)`,
    );
  }
}

function copyDirectory(sourceDir: string, destDir: string): void {
  copyPublishableReport(sourceDir, destDir);
}

function runCommand(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env): void {
  // stdout 只留给 `export ENHANCED_REPORT_URL=...` 给 CI eval；git commit 日志进 stderr，
  // 否则 `eval "$(publish-report.ts)"` 会把 `(pipeline 123)` 当 bash 语法炸。
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.stdout) process.stderr.write(result.stdout.endsWith('\n') ? result.stdout : `${result.stdout}\n`);
  if (result.stderr) process.stderr.write(result.stderr.endsWith('\n') ? result.stderr : `${result.stderr}\n`);
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

function logLegacyRemoval(removed: string[], slotPrefix: string): void {
  if (removed.length === 0) return;
  console.error(
    `[publish-report] Removed ${removed.length} leftover dir(s) under ${slotPrefix}: ${removed.join(', ')}`,
  );
}

function finalizePublishedSlot(repoRoot: string, options: PublishOptions, sourceDir: string): void {
  const slotPrefix = buildSlotPrefix(options);
  logLegacyRemoval(
    pruneLegacyPipelineDirs(repoRoot, options.testEnv, options.target, options.series),
    slotPrefix,
  );
  logLegacyRemoval(
    pruneSiblingTargetDirs(repoRoot, options.testEnv, options.target, options.series),
    `${options.series}/${sanitizeSegment(options.testEnv)}`,
  );
  updateReportsIndex(repoRoot, readReportIndexEntry(sourceDir, options));
  writeReportPortals(repoRoot);
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
  const relativePath = buildLatestRelativePath(options);
  const publicUrl = buildPublicUrl(baseUrl, relativePath);
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'classinshop-report-publish-'));
  const authUrl = buildAuthenticatedGitUrl(gitRepo, gitToken);

  try {
    runCommand('git', ['clone', '--depth', '1', '--branch', gitBranch, authUrl, workDir], ROOT);
    copyDirectory(sourceDir, path.join(workDir, relativePath));
    finalizePublishedSlot(workDir, options, sourceDir);

    const gitEnv = {
      ...process.env,
      GIT_AUTHOR_NAME: process.env.REPORT_PUBLISH_GIT_AUTHOR_NAME || 'classinshop-test-suite',
      GIT_AUTHOR_EMAIL: process.env.REPORT_PUBLISH_GIT_AUTHOR_EMAIL || 'ci@classinshop.local',
      GIT_COMMITTER_NAME: process.env.REPORT_PUBLISH_GIT_AUTHOR_NAME || 'classinshop-test-suite',
      GIT_COMMITTER_EMAIL: process.env.REPORT_PUBLISH_GIT_AUTHOR_EMAIL || 'ci@classinshop.local',
    };

    runCommand(
      'git',
      ['add', '-A', sanitizeSegment(options.series), REPORTS_INDEX_FILE, 'index.html', 'teacherin/index.html'],
      workDir,
      gitEnv,
    );
    runCommand(
      'git',
      [
        '-c',
        `user.name=${gitEnv.GIT_AUTHOR_NAME}`,
        '-c',
        `user.email=${gitEnv.GIT_AUTHOR_EMAIL}`,
        'commit',
        '-m',
        `report ${options.series}/${options.testEnv}/${options.target} latest (pipeline ${options.pipelineId})`,
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
  writePublishEnv(publicUrl, options.series);
  return publicUrl;
}

function runRsync(sourceDir: string, remoteDest: string, sshPrivateKey?: string): void {
  const rsyncArgs = [
    '-avz',
    '--delete',
    `${sourceDir}/`,
    remoteDest.endsWith('/') ? remoteDest : `${remoteDest}/`,
  ];
  if (sshPrivateKey?.trim()) {
    const keyFile = path.join('/tmp', `report-publish-key-${process.pid}`);
    fs.writeFileSync(keyFile, sshPrivateKey.replace(/\\n/g, '\n'), { mode: 0o600 });
    rsyncArgs.unshift('-e', `ssh -i ${keyFile} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null`);
  }

  runCommand('rsync', rsyncArgs, ROOT);
}

function publishToRemoteRoot(sourceDir: string, remoteRoot: string, relativeDir: string, sshPrivateKey?: string): void {
  const normalizedRoot = remoteRoot.replace(/\/$/, '');
  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'classinshop-report-rsync-'));
  try {
    copyPublishableReport(sourceDir, stagingDir);
    runRsync(stagingDir, `${normalizedRoot}/${relativeDir}`, sshPrivateKey);
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
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
  const relativePath = buildLatestRelativePath(options);
  const sshKey = process.env.REPORT_PUBLISH_SSH_PRIVATE_KEY?.trim();
  const publicUrl = buildPublicUrl(baseUrl, relativePath);

  if (rsyncTarget) {
    const remoteRoot = rsyncTarget.replace(/\/$/, '');
    publishToRemoteRoot(sourceDir, remoteRoot, relativePath, sshKey);
    finalizePublishedSlot(remoteRoot, options, sourceDir);
  } else if (localDir) {
    const localRoot = localDir.replace(/\/$/, '');
    copyDirectory(sourceDir, path.join(localRoot, relativePath));
    finalizePublishedSlot(localRoot, options, sourceDir);
  }

  console.error(`[publish-report] Report URL: ${publicUrl}`);
  writePublishEnv(publicUrl, options.series);
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
  const target = canonicalizeReportTarget(readArg(argv, '--target'));
  const series = resolveReportSeries(readArg(argv, '--series'));
  const sourceDir = readArg(argv, '--source') ?? 'reports/latest/enhanced';
  const pipelineId = readArg(argv, '--pipeline-id') ?? process.env.CI_PIPELINE_ID ?? '';
  const ref = readArg(argv, '--ref') ?? process.env.CI_COMMIT_REF_NAME ?? '';

  if (!testEnv) usage();
  if (!pipelineId) usage();

  return { testEnv, target, series, sourceDir, pipelineId, ref };
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
