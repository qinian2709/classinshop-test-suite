/**
 * Clone classinshop-test-reports and prune expired rows in reports-index.json.
 * Hosted HTML lives under {env}/{target}/latest/ and is overwritten on each publish;
 * retention only drops historical index metadata (Pipeline / Artifacts links).
 *
 * Usage:
 *   pnpm exec tsx scripts/cleanup-published-reports.ts
 *   pnpm exec tsx scripts/cleanup-published-reports.ts --dry-run
 *
 * Env:
 *   REPORT_PUBLISH_GIT_REPO / REPORT_PUBLISH_GIT_TOKEN / REPORT_PUBLISH_GIT_BRANCH
 *   RETENTION_DAYS (default 7) — index metadata retention
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORTS_INDEX_FILE = 'reports-index.json';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface ReportIndexEntry {
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

function pruneExpiredIndexEntries(
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

function main(): number {
  const dryRun = process.argv.includes('--dry-run');
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

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'classinshop-report-cleanup-'));
  const authUrl = buildAuthenticatedGitUrl(gitRepo, gitToken);
  const env = gitEnv();

  try {
    console.error(`[cleanup-reports] clone ${gitRepo} (branch ${gitBranch})`);
    runCommand('git', ['clone', '--depth', '1', '--branch', gitBranch, authUrl, workDir], ROOT, env);

    const cutoffMs = Date.now() - retentionDays * MS_PER_DAY;
    const cutoffIso = new Date(cutoffMs).toISOString();
    console.error(`[cleanup-reports] retention=${retentionDays}d cutoff=${cutoffIso}${dryRun ? ' (dry-run)' : ''}`);

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
      console.error('[cleanup-reports] dry-run complete; no push.');
      return 0;
    }

    if (indexRemoved === 0) {
      console.error('[cleanup-reports] No changes to commit.');
      return 0;
    }

    const status = spawnSync('git', ['status', '--porcelain'], { cwd: workDir, encoding: 'utf8', env });
    if ((status.status ?? 1) !== 0) {
      throw new Error('git status failed');
    }
    if (!status.stdout?.trim()) {
      console.error('[cleanup-reports] No git changes after cleanup.');
      return 0;
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
