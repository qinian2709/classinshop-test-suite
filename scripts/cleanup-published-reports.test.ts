import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  parseSquashGitHistory,
  pruneExpiredIndexEntries,
  squashAndForcePush,
  type ReportsIndex,
} from './cleanup-published-reports.ts';

const TEMP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../reports/.tmp-cleanup-tests');

function makeTempDir(prefix: string): string {
  fs.mkdirSync(TEMP_ROOT, { recursive: true });
  return fs.mkdtempSync(path.join(TEMP_ROOT, prefix));
}

function git(cwd: string, args: string[], extraEnv: NodeJS.ProcessEnv = {}): string {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
  });
  if ((result.status ?? 1) !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return (result.stdout ?? '').trim();
}

after(() => {
  fs.rmSync(TEMP_ROOT, { recursive: true, force: true });
});

describe('parseSquashGitHistory', () => {
  test('defaults on', () => {
    assert.equal(parseSquashGitHistory(undefined), true);
    assert.equal(parseSquashGitHistory(''), true);
  });

  test('accepts explicit on values', () => {
    assert.equal(parseSquashGitHistory('1'), true);
    assert.equal(parseSquashGitHistory('true'), true);
    assert.equal(parseSquashGitHistory('ON'), true);
  });

  test('accepts explicit off values', () => {
    assert.equal(parseSquashGitHistory('0'), false);
    assert.equal(parseSquashGitHistory('false'), false);
    assert.equal(parseSquashGitHistory('off'), false);
    assert.equal(parseSquashGitHistory('no'), false);
  });
});

describe('pruneExpiredIndexEntries', () => {
  const now = Date.parse('2026-08-20T00:00:00.000Z');
  const cutoffMs = now - 7 * 24 * 60 * 60 * 1000;

  test('keeps isLatest and recent rows, drops expired', () => {
    const index: ReportsIndex = {
      updatedAt: '2026-08-20T00:00:00.000Z',
      reports: [
        {
          env: '14',
          target: 'api',
          pipelineId: '1',
          isLatest: true,
          publishedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          env: '14',
          target: 'api',
          pipelineId: '2',
          publishedAt: '2026-08-18T00:00:00.000Z',
        },
        {
          env: '14',
          target: 'api',
          pipelineId: '3',
          publishedAt: '2026-08-01T00:00:00.000Z',
        },
      ],
    };

    const { next, removed } = pruneExpiredIndexEntries(index, cutoffMs, false);
    assert.equal(removed, 1);
    assert.deepEqual(
      next.reports.map((row) => row.pipelineId),
      ['1', '2'],
    );
  });

  test('dry-run does not mutate index', () => {
    const index: ReportsIndex = {
      updatedAt: 'old',
      reports: [{ env: '14', target: 'api', pipelineId: '3', publishedAt: '2026-08-01T00:00:00.000Z' }],
    };
    const { next, removed } = pruneExpiredIndexEntries(index, cutoffMs, true);
    assert.equal(removed, 1);
    assert.equal(next, index);
  });
});

describe('squashAndForcePush', () => {
  test('replaces remote history with one snapshot commit of current tree', () => {
    const remoteDir = makeTempDir('reports-remote-');
    const workDir = makeTempDir('reports-work-');
    git(remoteDir, ['init', '--bare', '--template=', '--initial-branch=main']);

    const seedDir = makeTempDir('reports-seed-');
    git(seedDir, ['init', '--template=', '--initial-branch=main']);
    git(seedDir, ['config', 'user.name', 'seed']);
    git(seedDir, ['config', 'user.email', 'seed@test.local']);
    fs.writeFileSync(path.join(seedDir, 'report.html'), 'version-one-unique-aaaaaaaa');
    git(seedDir, ['add', '-A']);
    git(seedDir, ['commit', '-m', 'report one']);
    fs.writeFileSync(path.join(seedDir, 'report.html'), 'version-two-unique-bbbbbbbb');
    git(seedDir, ['add', '-A']);
    git(seedDir, ['commit', '-m', 'report two']);
    git(seedDir, ['remote', 'add', 'origin', remoteDir]);
    git(seedDir, ['push', '-u', 'origin', 'main']);

    assert.equal(git(remoteDir, ['rev-list', '--count', 'main']), '2');

    git(workDir, ['clone', '--depth', '1', '--branch', 'main', remoteDir, '.']);
    const clonedSha = git(workDir, ['rev-parse', 'HEAD']);
    fs.writeFileSync(path.join(workDir, 'report.html'), 'version-latest-unique-cccccccc');
    fs.writeFileSync(path.join(workDir, 'index.json'), '{"ok":true}\n');

    squashAndForcePush(workDir, 'main', clonedSha, {
      ...process.env,
      GIT_AUTHOR_NAME: 'cleanup-bot',
      GIT_AUTHOR_EMAIL: 'ci@test.local',
      GIT_COMMITTER_NAME: 'cleanup-bot',
      GIT_COMMITTER_EMAIL: 'ci@test.local',
    }, 7);

    assert.equal(git(remoteDir, ['rev-list', '--count', 'main']), '1');
    const verifyDir = makeTempDir('reports-verify-');
    git(verifyDir, ['clone', remoteDir, '.']);
    assert.equal(fs.readFileSync(path.join(verifyDir, 'report.html'), 'utf8'), 'version-latest-unique-cccccccc');
    assert.equal(fs.readFileSync(path.join(verifyDir, 'index.json'), 'utf8'), '{"ok":true}\n');
    assert.match(git(verifyDir, ['log', '-1', '--format=%s']), /snapshot reports/);
  });
});
