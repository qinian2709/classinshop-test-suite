/**
 * Clone classinshop-test-reports and prune expired rows in reports-index.json.
 * Hosted HTML lives under {env}/{target}/latest/ and is overwritten on each publish;
 * retention only drops historical index metadata (Pipeline / Artifacts links).
 *
 * Then squash Git history to a single orphan commit and force-with-lease push,
 * so reports-repo volume tracks the current tree instead of every publish blob.
 *
 * Usage:
 *   pnpm exec tsx scripts/cleanup-published-reports.ts
 *   pnpm exec tsx scripts/cleanup-published-reports.ts --dry-run
 *
 * Env:
 *   REPORT_PUBLISH_GIT_REPO / REPORT_PUBLISH_GIT_TOKEN / REPORT_PUBLISH_GIT_BRANCH
 *   RETENTION_DAYS (default 7) — index metadata retention
 *   SQUASH_GIT_HISTORY (default on) — set 0 to skip orphan+force push and only
 *     commit index prune when there are changes
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORTS_INDEX_FILE = 'reports-index.json';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface ReportIndexEntry {
  env: string;
  target: string;
  pipelineId: string;
  jobId?: string;
  path?: string;
  publishedAt?: string;
  branch?: string;
  author?: string;
  buildUrl?: string;
  artifactUrl?: string;
  ref?: string;
  isLatest?: boolean;
  summary?: Record<string, unknown>;
}

export interface ReportsIndex {
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

function redactSecrets(text: string): string {
  return text.replace(/oauth2:[^@\s]+@/gi, 'oauth2:***@');
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', env });
  const output = redactSecrets(`${result.stdout ?? ''}${result.stderr ?? ''}`);
  if (output) process.stderr.write(output);
  if (result.error) {
    throw new Error(`${command} failed: ${result.error.message}`);
  }
  if ((result.status ?? 1) !== 0) {
    throw new Error(`${command} exited with code ${result.status ?? 1}: ${output.trim()}`);
  }
}

function runCommandCapture(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', env });
  const output = redactSecrets(`${result.stdout ?? ''}${result.stderr ?? ''}`);
  if (result.error) {
    throw new Error(`${command} failed: ${result.error.message}`);
  }
  if ((result.status ?? 1) !== 0) {
    throw new Error(`${command} exited with code ${result.status ?? 1}: ${output.trim()}`);
  }
  return (result.stdout ?? '').trim();
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

/** Default on. Only `0` / `false` / `off` / `no` disable squash. */
export function parseSquashGitHistory(raw = process.env.SQUASH_GIT_HISTORY): boolean {
  const value = raw?.trim().toLowerCase();
  if (value === '0' || value === 'false' || value === 'off' || value === 'no') return false;
  return true;
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

export function pruneExpiredIndexEntries(
  index: ReportsIndex,
  cutoffMs: number,
  dryRun: boolean,
): { next: ReportsIndex; removed: number } {
  const before = index.reports.length;
  const nextReports = index.reports.filter((item) => {
    if (item.isLatest) return true;
    const publishedAtMs = item.publishedAt ? Date.parse(item.publishedAt) : 0;
    if (Number.isNaN(publishedAtMs)) return false;
    return publishedAtMs >= cutoffMs;
  });

  if (nextReports.length === before) {
    return { next: index, removed: 0 };
  }

  console.error(
    `[cleanup-reports] ${dryRun ? 'would prune' : 'prune'} index: ${before} -> ${nextReports.length} entries`,
  );

  for (const item of index.reports) {
    if (item.isLatest) continue;
    const publishedAtMs = item.publishedAt ? Date.parse(item.publishedAt) : 0;
    if (Number.isNaN(publishedAtMs) || publishedAtMs >= cutoffMs) continue;
    console.error(
      `[cleanup-reports] ${dryRun ? 'would remove' : 'remove'} index row ${item.env}/${item.target}/${item.pipelineId} (${item.publishedAt ?? 'no date'})`,
    );
  }

  if (dryRun) {
    return { next: index, removed: before - nextReports.length };
  }

  return {
    next: {
      updatedAt: new Date().toISOString(),
      reports: nextReports,
    },
    removed: before - nextReports.length,
  };
}

/**
 * Replace branch history with one commit of the current working tree.
 * `--force-with-lease` refuses to overwrite if origin moved (a publish raced cleanup).
 */
export function squashAndForcePush(
  workDir: string,
  gitBranch: string,
  clonedSha: string,
  env: NodeJS.ProcessEnv,
  retentionDays: number,
): void {
  console.error('[cleanup-reports] Squashing to single commit (orphan) and force-pushing...');
  runCommand('git', ['checkout', '--orphan', 'squash-snapshot'], workDir, env);
  runCommand('git', ['add', '-A'], workDir, env);
  runCommand(
    'git',
    [
      '-c',
      `user.name=${env.GIT_AUTHOR_NAME}`,
      '-c',
      `user.email=${env.GIT_AUTHOR_EMAIL}`,
      'commit',
      '-m',
      `chore: snapshot reports (retention ${retentionDays} days)`,
    ],
    workDir,
    env,
  );

  try {
    runCommand(
      'git',
      ['push', `--force-with-lease=refs/heads/${gitBranch}:${clonedSha}`, 'origin', `HEAD:${gitBranch}`],
      workDir,
      env,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // GitLab: "You are not allowed to force push code to a protected branch"
    if (/not allowed to force push|protected branch/i.test(message)) {
      throw new Error(
        `${message}\n[cleanup-reports] GitLab blocked force push. Enable "Allowed to force push" on protected branch ${gitBranch} in classinshop-test-reports (Settings → Repository → Protected branches).`,
      );
    }
    if (/failed to (update|push)|stale info|lease/i.test(message)) {
      throw new Error(
        `${message}\n[cleanup-reports] Force-with-lease failed. Origin ${gitBranch} likely moved (a publish raced this job). Re-run cleanup.`,
      );
    }
    throw error;
  }

  console.error(`[cleanup-reports] Force-pushed squashed ${gitBranch} (old history dropped on remote).`);
}

function commitIndexPrune(
  workDir: string,
  gitBranch: string,
  env: NodeJS.ProcessEnv,
  retentionDays: number,
): void {
  const status = spawnSync('git', ['status', '--porcelain'], { cwd: workDir, encoding: 'utf8', env });
  if ((status.status ?? 1) !== 0) {
    throw new Error('git status failed');
  }
  if (!status.stdout?.trim()) {
    console.error('[cleanup-reports] No git changes after cleanup.');
    return;
  }

  runCommand('git', ['add', REPORTS_INDEX_FILE], workDir, env);
  runCommand(
    'git',
    [
      '-c',
      `user.name=${env.GIT_AUTHOR_NAME}`,
      '-c',
      `user.email=${env.GIT_AUTHOR_EMAIL}`,
      'commit',
      '-m',
      `chore: prune report index metadata older than ${retentionDays} days`,
    ],
    workDir,
    env,
  );
  runCommand('git', ['push', 'origin', gitBranch], workDir, env);
  console.error(`[cleanup-reports] Pushed cleanup commit to ${gitBranch}.`);
}

export function main(): number {
  const dryRun = process.argv.includes('--dry-run');
  const squashHistory = parseSquashGitHistory();
  const gitRepo = process.env.REPORT_PUBLISH_GIT_REPO?.trim();
  const gitToken = process.env.REPORT_PUBLISH_GIT_TOKEN?.trim();
  const gitBranch = process.env.REPORT_PUBLISH_GIT_BRANCH?.trim() || 'main';
  const retentionDays = Number(readArg(process.argv.slice(2), '--days') ?? process.env.RETENTION_DAYS ?? '7');

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
  if (!/^[A-Za-z0-9._/-]+$/.test(gitBranch)) {
    console.error('[cleanup-reports] Invalid REPORT_PUBLISH_GIT_BRANCH');
    return 1;
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'classinshop-report-cleanup-'));
  const authUrl = buildAuthenticatedGitUrl(gitRepo, gitToken);
  const env = gitEnv();

  try {
    console.error(`[cleanup-reports] clone ${gitRepo} (branch ${gitBranch})`);
    runCommand('git', ['clone', '--depth', '1', '--branch', gitBranch, authUrl, workDir], ROOT, env);
    const clonedSha = runCommandCapture('git', ['rev-parse', 'HEAD'], workDir, env);

    const cutoffMs = Date.now() - retentionDays * MS_PER_DAY;
    const cutoffIso = new Date(cutoffMs).toISOString();
    console.error(
      `[cleanup-reports] retention=${retentionDays}d cutoff=${cutoffIso} squash=${squashHistory ? 'on' : 'off'}${dryRun ? ' (dry-run)' : ''}`,
    );

    const index = loadReportsIndex(workDir);
    const { next: prunedIndex, removed: indexRemoved } = pruneExpiredIndexEntries(index, cutoffMs, dryRun);

    if (indexRemoved === 0) {
      console.error('[cleanup-reports] No expired index rows.');
    } else if (!dryRun) {
      fs.writeFileSync(
        path.join(workDir, REPORTS_INDEX_FILE),
        `${JSON.stringify(prunedIndex, null, 2)}\n`,
        'utf8',
      );
    }

    if (dryRun) {
      if (squashHistory) {
        console.error('[cleanup-reports] dry-run: would squash history and force-push.');
      }
      console.error('[cleanup-reports] dry-run complete; no push.');
      return 0;
    }

    if (squashHistory) {
      squashAndForcePush(workDir, gitBranch, clonedSha, env, retentionDays);
      return 0;
    }

    if (indexRemoved === 0) {
      console.error('[cleanup-reports] No changes to commit.');
      return 0;
    }

    commitIndexPrune(workDir, gitBranch, env, retentionDays);
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
