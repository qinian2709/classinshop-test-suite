/**
 * Clone classinshop-test-reports, prune reports older than RETENTION_DAYS, push if changed.
 * Run from test-suite CI (reports repo has no runners).
 *
 * Usage:
 *   pnpm exec tsx scripts/cleanup-published-reports.ts
 *   pnpm exec tsx scripts/cleanup-published-reports.ts --dry-run
 *
 * Env (same as publish-report):
 *   REPORT_PUBLISH_GIT_REPO
 *   REPORT_PUBLISH_GIT_TOKEN
 *   REPORT_PUBLISH_GIT_BRANCH  (default main)
 *   RETENTION_DAYS             (default 7)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

function main(): number {
  const dryRun = process.argv.includes('--dry-run');
  const gitRepo = process.env.REPORT_PUBLISH_GIT_REPO?.trim();
  const gitToken = process.env.REPORT_PUBLISH_GIT_TOKEN?.trim();
  const gitBranch = process.env.REPORT_PUBLISH_GIT_BRANCH?.trim() || 'main';
  const retentionDays = readArg(process.argv.slice(2), '--days') ?? process.env.RETENTION_DAYS ?? '7';

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

    const cleanupScript = path.join(workDir, 'scripts/cleanup-old-reports.mjs');
    if (!fs.existsSync(cleanupScript)) {
      throw new Error(`Missing ${cleanupScript} in reports repo; pull latest classinshop-test-reports`);
    }

    const cleanupEnv = { ...env, RETENTION_DAYS: retentionDays };
    const cleanupArgs = [cleanupScript];
    if (dryRun) cleanupArgs.push('--dry-run');

    console.error(`[cleanup-reports] run cleanup (retention=${retentionDays}d${dryRun ? ', dry-run' : ''})`);
    runCommand(process.execPath, cleanupArgs, workDir, cleanupEnv);

    if (dryRun) {
      console.error('[cleanup-reports] dry-run complete; no push.');
      return 0;
    }

    const status = spawnSync('git', ['status', '--porcelain'], { cwd: workDir, encoding: 'utf8', env });
    if ((status.status ?? 1) !== 0) {
      throw new Error('git status failed');
    }
    if (!status.stdout?.trim()) {
      console.error('[cleanup-reports] No changes to commit.');
      return 0;
    }

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
        `chore: prune reports older than ${retentionDays} days`,
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
