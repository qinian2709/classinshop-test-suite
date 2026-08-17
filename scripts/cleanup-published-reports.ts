/**
 * Clone classinshop-test-reports, delete expired report trees, prune matching index rows only.
 * Does NOT rebuild reports-index.json (preserves branch/author/summary metadata).
 *
 * Usage:
 *   pnpm exec tsx scripts/cleanup-published-reports.ts
 *   pnpm exec tsx scripts/cleanup-published-reports.ts --dry-run
 *
 * Env:
 *   REPORT_PUBLISH_GIT_REPO / REPORT_PUBLISH_GIT_TOKEN / REPORT_PUBLISH_GIT_BRANCH
 *   RETENTION_DAYS (default 7)
 *   SQUASH_GIT_HISTORY (default off) — 设为 1 时清理 push 用 orphan 压历史并 force push；
 *     日常 Schedule 清理用普通 commit 即可；squash 可能加重 GitLab 负载且 gc 前体积不降
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORTS_INDEX_FILE = 'reports-index.json';
const REPORT_DIR_PATTERN = /^([^/]+)\/([^/]+)\/([^/]+)\/enhanced$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface ReportIndexEntry {
  env: string;
  target: string;
  pipelineId: string;
  path: string;
  publishedAt?: string;
  branch?: string;
  author?: string;
  buildUrl?: string;
  ref?: string;
  summary?: Record<string, unknown>;
}

interface ReportsIndex {
  updatedAt: string;
  reports: ReportIndexEntry[];
}

function readArg(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index >= 0) return argv[index + 1];
  const prefix = `${name}=`;
  const inline = argv.find((arg) => arg.startsWith(prefix));
  return inline?.slice(prefix.length);
}

function reportKey(env: string, target: string, pipelineId: string): string {
  return `${env}/${target}/${pipelineId}`;
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env });
  if (result.error) {
    throw new Error(`${command} failed: ${result.error.message}`);
  }
  if ((result.status ?? 1) !== 0) {
    throw new Error(`${command} exited with code ${result.status ?? 1}`);
  }
}

function buildAuthenticatedGitUrl(repoUrl: string, token: string): string {
  const url = new URL(repoUrl);
  url.username = 'oauth2';
  url.password = token;
  return url.toString();
}

function gitEnv(): NodeJS.ProcessEnv {
  const name = process.env.REPORT_PUBLISH_GIT_AUTHOR_NAME || 'classinshop-test-suite';
  const email = process.env.REPORT_PUBLISH_GIT_AUTHOR_EMAIL || 'ci@classinshop.local';
  return {
    ...process.env,
    GIT_AUTHOR_NAME: name,
    GIT_AUTHOR_EMAIL: email,
    GIT_COMMITTER_NAME: name,
    GIT_COMMITTER_EMAIL: email,
  };
}

function loadReportsIndex(workDir: string): ReportsIndex {
  const indexPath = path.join(workDir, REPORTS_INDEX_FILE);
  if (!fs.existsSync(indexPath)) {
    return { updatedAt: new Date().toISOString(), reports: [] };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as ReportsIndex;
    return {
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      reports: Array.isArray(parsed.reports) ? parsed.reports : [],
    };
  } catch {
    return { updatedAt: new Date().toISOString(), reports: [] };
  }
}

function indexMap(index: ReportsIndex): Map<string, ReportIndexEntry> {
  const map = new Map<string, ReportIndexEntry>();
  for (const item of index.reports) {
    if (!item?.env || !item?.target || !item?.pipelineId) continue;
    map.set(reportKey(item.env, item.target, item.pipelineId), item);
  }
  return map;
}

function readPublishedAtFromGit(
  workDir: string,
  relativePath: string,
  env: NodeJS.ProcessEnv,
): number | undefined {
  const result = spawnSync(
    'git',
    ['log', '-1', '--format=%cI', '--', relativePath],
    { cwd: workDir, encoding: 'utf8', env },
  );
  if ((result.status ?? 1) !== 0) return undefined;
  const raw = result.stdout?.trim();
  if (!raw) return undefined;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? undefined : ms;
}

/** Never use file mtime after clone — checkout resets mtimes and makes old reports look fresh. */
function readPublishedAtMs(
  workDir: string,
  pipelineDir: string,
  entry: ReportIndexEntry | undefined,
  env: NodeJS.ProcessEnv,
): number {
  if (entry?.publishedAt) {
    const ms = Date.parse(entry.publishedAt);
    if (!Number.isNaN(ms)) return ms;
  }

  const htmlRel = path
    .relative(workDir, path.join(pipelineDir, 'enhanced', 'enhanced-report.html'))
    .split(path.sep)
    .join('/');
  const gitMs = readPublishedAtFromGit(workDir, htmlRel, env);
  if (gitMs !== undefined) return gitMs;

  const detailedPath = path.join(pipelineDir, 'enhanced', 'detailed-report.json');
  if (fs.existsSync(detailedPath)) {
    try {
      const detailed = JSON.parse(fs.readFileSync(detailedPath, 'utf8')) as {
        summary?: { endTime?: string; startTime?: string };
      };
      const stamp = detailed.summary?.endTime || detailed.summary?.startTime;
      if (stamp) {
        const ms = Date.parse(stamp);
        if (!Number.isNaN(ms)) return ms;
      }
    } catch {
      // fall through
    }
  }

  // Unknown age → treat as expired so orphan dirs without index metadata get removed.
  return 0;
}

function findReportDirs(workDir: string): string[] {
  const results: string[] = [];

  function walk(dir: string): void {
    if (!fs.existsSync(dir)) return;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || entry.name === 'scripts' || entry.name === 'node_modules') {
        continue;
      }

      const fullPath = path.join(dir, entry.name);
      const relative = path.relative(workDir, fullPath).split(path.sep).join('/');
      const match = relative.match(REPORT_DIR_PATTERN);

      if (match) {
        const [, , , pipelineId] = match;
        if (pipelineId !== 'latest') {
          results.push(fullPath);
        }
        continue;
      }

      walk(fullPath);
    }
  }

  walk(workDir);
  return results;
}

function removeEmptyParents(startDir: string, root: string): void {
  let current = startDir;
  while (current.startsWith(root) && current !== root) {
    if (!fs.existsSync(current)) {
      current = path.dirname(current);
      continue;
    }
    if (fs.readdirSync(current).length > 0) break;
    fs.rmdirSync(current);
    current = path.dirname(current);
  }
}

function pruneReportsIndex(index: ReportsIndex, deletedKeys: Set<string>): ReportsIndex {
  return {
    updatedAt: new Date().toISOString(),
    reports: index.reports.filter(
      (item) => !deletedKeys.has(reportKey(item.env, item.target, item.pipelineId)),
    ),
  };
}

function parseSquashGitHistory(): boolean {
  const raw = process.env.SQUASH_GIT_HISTORY?.trim().toLowerCase();
  if (raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes') return true;
  return false;
}

function gitCommit(workDir: string, message: string, env: NodeJS.ProcessEnv): void {
  runCommand(
    'git',
    [
      '-c',
      `user.name=${env.GIT_AUTHOR_NAME}`,
      '-c',
      `user.email=${env.GIT_AUTHOR_EMAIL}`,
      'commit',
      '-m',
      message,
    ],
    workDir,
    env,
  );
}

/** Replace branch history with one commit containing the current tree (bounded repo size). */
function squashAndForcePush(
  workDir: string,
  gitBranch: string,
  message: string,
  env: NodeJS.ProcessEnv,
): void {
  console.error('[cleanup-reports] Squashing to single commit (orphan) and force-pushing...');
  runCommand('git', ['checkout', '--orphan', 'report-snapshot'], workDir, env);
  runCommand('git', ['add', '-A'], workDir, env);
  gitCommit(workDir, message, env);
  runCommand('git', ['branch', '-M', gitBranch], workDir, env);
  runCommand('git', ['push', '--force', 'origin', gitBranch], workDir, env);
  console.error(`[cleanup-reports] Force-pushed squashed ${gitBranch} (old history dropped on remote).`);
}

function pushCleanupCommit(
  workDir: string,
  gitBranch: string,
  retentionDays: number,
  env: NodeJS.ProcessEnv,
  squash: boolean,
): void {
  const message = `chore: prune reports older than ${retentionDays} days`;
  runCommand('git', ['add', '-A'], workDir, env);
  if (squash) {
    squashAndForcePush(workDir, gitBranch, message, env);
    return;
  }
  gitCommit(workDir, message, env);
  runCommand('git', ['push', 'origin', gitBranch], workDir, env);
  console.error(`[cleanup-reports] Pushed cleanup commit to ${gitBranch}.`);
}

function stripJsonAttachments(workDir: string, dryRun: boolean): number {
  let removed = 0;

  for (const enhancedDir of findReportDirs(workDir)) {
    const attachDir = path.join(enhancedDir, 'attachments');
    if (!fs.existsSync(attachDir)) continue;

    for (const entry of fs.readdirSync(attachDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue;
      const filePath = path.join(attachDir, entry.name);
      const relative = path.relative(workDir, filePath).split(path.sep).join('/');
      console.error(`[cleanup-reports] ${dryRun ? 'would delete' : 'delete'} ${relative}`);
      if (!dryRun) {
        fs.unlinkSync(filePath);
      }
      removed += 1;
    }

    if (!dryRun && fs.existsSync(attachDir) && fs.readdirSync(attachDir).length === 0) {
      fs.rmdirSync(attachDir);
    }
  }

  if (removed > 0) {
    console.error(
      `[cleanup-reports] ${dryRun ? 'Would remove' : 'Removed'} ${removed} JSON attachment(s) (logs are in HTML).`,
    );
  }
  return removed;
}

function pruneStaleIndexEntries(workDir: string, retentionDays: number, dryRun: boolean): number {
  const cutoffMs = Date.now() - retentionDays * MS_PER_DAY;
  const index = loadReportsIndex(workDir);
  const kept: ReportIndexEntry[] = [];
  let pruned = 0;

  for (const item of index.reports) {
    const htmlPath = path.join(workDir, item.path);
    const publishedMs = item.publishedAt ? Date.parse(item.publishedAt) : Number.NaN;
    const expired = !Number.isNaN(publishedMs) && publishedMs < cutoffMs;
    const missing = !fs.existsSync(htmlPath);

    if (expired || missing) {
      pruned += 1;
      console.error(
        `[cleanup-reports] ${dryRun ? 'would prune index' : 'prune index'} ${item.env}/${item.target}/${item.pipelineId}${missing ? ' (missing file)' : ''}`,
      );
      continue;
    }
    kept.push(item);
  }

  if (!dryRun && pruned > 0) {
    fs.writeFileSync(
      path.join(workDir, REPORTS_INDEX_FILE),
      `${JSON.stringify({ updatedAt: new Date().toISOString(), reports: kept }, null, 2)}\n`,
      'utf8',
    );
    console.error(`[cleanup-reports] Index entries: ${index.reports.length} -> ${kept.length}`);
  }

  return pruned;
}

function cleanupExpiredReports(
  workDir: string,
  retentionDays: number,
  dryRun: boolean,
  gitEnvVars: NodeJS.ProcessEnv,
): number {
  const cutoffMs = Date.now() - retentionDays * MS_PER_DAY;
  const cutoffIso = new Date(cutoffMs).toISOString();
  const index = loadReportsIndex(workDir);
  const byKey = indexMap(index);
  const reportDirs = findReportDirs(workDir);
  const deletedKeys = new Set<string>();
  const expired: Array<{ relative: string; publishedAt: string }> = [];

  console.error(`[cleanup-reports] retention=${retentionDays}d cutoff=${cutoffIso}${dryRun ? ' (dry-run)' : ''}`);

  for (const enhancedDir of reportDirs) {
    const pipelineDir = path.dirname(enhancedDir);
    const relative = path.relative(workDir, pipelineDir).split(path.sep).join('/');
    const parts = relative.split('/');
    if (parts.length < 3) continue;

    const [envName, target, pipelineId] = parts;
    if (!envName || !target || !pipelineId) continue;
    const key = reportKey(envName, target, pipelineId);
    const entry = byKey.get(key);
    const publishedAtMs = readPublishedAtMs(workDir, pipelineDir, entry, gitEnvVars);

    if (publishedAtMs >= cutoffMs) continue;

    expired.push({
      relative,
      publishedAt: new Date(publishedAtMs).toISOString(),
    });
    deletedKeys.add(key);
  }

  expired.sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));

  if (expired.length === 0) {
    console.error('[cleanup-reports] No expired report trees.');
  }

  for (const item of expired) {
    console.error(`[cleanup-reports] ${dryRun ? 'would delete' : 'delete'} ${item.relative} (${item.publishedAt})`);
    if (dryRun) continue;

    const pipelineDir = path.join(workDir, item.relative);
    fs.rmSync(pipelineDir, { recursive: true, force: true });
    removeEmptyParents(path.dirname(pipelineDir), workDir);
  }

  if (!dryRun && expired.length > 0) {
    const nextIndex = pruneReportsIndex(index, deletedKeys);
    fs.writeFileSync(
      path.join(workDir, REPORTS_INDEX_FILE),
      `${JSON.stringify(nextIndex, null, 2)}\n`,
      'utf8',
    );
    console.error(
      `[cleanup-reports] Index pruned: ${index.reports.length} -> ${nextIndex.reports.length} entries`,
    );
  }

  if (expired.length > 0) {
    console.error(`[cleanup-reports] ${dryRun ? 'Would remove' : 'Removed'} ${expired.length} report tree(s).`);
  }
  return expired.length;
}

function hasWorkingTreeChanges(workDir: string, env: NodeJS.ProcessEnv): boolean {
  const status = spawnSync('git', ['status', '--porcelain'], { cwd: workDir, encoding: 'utf8', env });
  if ((status.status ?? 1) !== 0) {
    throw new Error('git status failed');
  }
  return Boolean(status.stdout?.trim());
}

function main(): number {
  const dryRun = process.argv.includes('--dry-run');
  const gitRepo = process.env.REPORT_PUBLISH_GIT_REPO?.trim();
  const gitToken = process.env.REPORT_PUBLISH_GIT_TOKEN?.trim();
  const gitBranch = process.env.REPORT_PUBLISH_GIT_BRANCH?.trim() || 'main';
  const retentionDays = Number(readArg(process.argv.slice(2), '--days') ?? process.env.RETENTION_DAYS ?? '7');
  const squashHistory = parseSquashGitHistory();

  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    console.error('[cleanup-reports] Invalid RETENTION_DAYS');
    return 1;
  }
  if (!gitRepo) {
    console.error('[cleanup-reports] Missing REPORT_PUBLISH_GIT_REPO');
    return 1;
  }
  if (!gitToken) {
    console.error('[cleanup-reports] Missing REPORT_PUBLISH_GIT_TOKEN');
    return 1;
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'classinshop-report-cleanup-'));
  const authUrl = buildAuthenticatedGitUrl(gitRepo, gitToken);
  const env = gitEnv();

  try {
    console.error(`[cleanup-reports] clone ${gitRepo} (branch ${gitBranch})`);
    runCommand('git', ['clone', '--depth', '1', '--branch', gitBranch, authUrl, workDir], ROOT, env);

    const deletedReports = cleanupExpiredReports(workDir, retentionDays, dryRun, env);
    const strippedJson = stripJsonAttachments(workDir, dryRun);
    const prunedIndex = pruneStaleIndexEntries(workDir, retentionDays, dryRun);

    if (dryRun) {
      console.error(
        `[cleanup-reports] dry-run summary: reports=${deletedReports} json=${strippedJson} index=${prunedIndex}`,
      );
      console.error('[cleanup-reports] dry-run complete; no push.');
      return 0;
    }

    const treeChanged = hasWorkingTreeChanges(workDir, env);

    if (!treeChanged) {
      console.error('[cleanup-reports] No changes to commit.');
      return 0;
    }

    pushCleanupCommit(workDir, gitBranch, retentionDays, env, squashHistory);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[cleanup-reports] ${message}`);
    return 1;
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  process.exit(main());
}
