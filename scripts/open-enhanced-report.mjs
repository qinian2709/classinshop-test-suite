#!/usr/bin/env node

/**
 * Open the latest Enhanced HTML report.
 * Prefer reports/latest/enhanced/enhanced-report.html, then newest run, then legacy fallback.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LATEST = path.join(ROOT, 'reports', 'latest', 'enhanced', 'enhanced-report.html');
const RUNS_DIR = path.join(ROOT, 'reports', 'runs');
const LEGACY_FALLBACK = path.join(ROOT, 'reports', 'enhanced', 'enhanced-report.html');

function resolveMaybeSymlink(filePath) {
  try {
    return fs.existsSync(filePath) ? filePath : null;
  } catch {
    return null;
  }
}

function findLatestRunReport() {
  if (!fs.existsSync(RUNS_DIR)) return null;

  const candidates = [];
  for (const entry of fs.readdirSync(RUNS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const report = path.join(RUNS_DIR, entry.name, 'enhanced', 'enhanced-report.html');
    if (!fs.existsSync(report)) continue;
    candidates.push({ report, mtime: fs.statSync(report).mtimeMs });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0].report;
}

function openFile(filePath) {
  const command =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', filePath] : [filePath];
  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.unref();
  console.log(`[report:enhanced] Opened: ${filePath}`);
}

const target =
  resolveMaybeSymlink(LATEST) || findLatestRunReport() || resolveMaybeSymlink(LEGACY_FALLBACK);

if (!target) {
  console.error(
    '[report:enhanced] No enhanced report found. Run tests first, e.g.\n' +
      '  pnpm test:api -- --env 14 --open',
  );
  process.exit(1);
}

openFile(target);
