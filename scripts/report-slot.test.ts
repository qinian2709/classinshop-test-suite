import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import {
  CANONICAL_REPORT_TARGET,
  canonicalizeReportTarget,
  formatReportScopeLabel,
  formatReportTargetLabel,
  mergeEnvReportTargets,
  pruneSiblingTargetDirs,
  ensurePortalTargetLabels,
  ensurePortalHtml,
  type ReportIndexEntry,
} from './report-slot.ts';

const TEMP_ROOT = path.join(os.tmpdir(), 'classinshop-report-slot-tests');

after(() => {
  fs.rmSync(TEMP_ROOT, { recursive: true, force: true });
});

describe('canonicalizeReportTarget', () => {
  test('always collapses publish/notify target to all', () => {
    assert.equal(canonicalizeReportTarget('api'), CANONICAL_REPORT_TARGET);
    assert.equal(canonicalizeReportTarget('e2e-web+e2e-mobile'), CANONICAL_REPORT_TARGET);
    assert.equal(canonicalizeReportTarget(undefined), CANONICAL_REPORT_TARGET);
  });
});

describe('formatReportTargetLabel', () => {
  test('uses 全量 for the merged slot', () => {
    assert.equal(formatReportTargetLabel('api'), '全量');
    assert.equal(formatReportTargetLabel('all'), '全量');
  });
});

describe('formatReportScopeLabel', () => {
  test('maps project list to Chinese labels', () => {
    assert.equal(formatReportScopeLabel('api'), 'API');
    assert.equal(formatReportScopeLabel('api+e2e-mobile'), 'API、H5');
    assert.equal(formatReportScopeLabel('e2e-web,e2e-mobile'), 'PC、H5');
    assert.equal(formatReportScopeLabel('all'), '全量');
  });
});

describe('mergeEnvReportTargets', () => {
  test('rewrites every row of that env onto the canonical target', () => {
    const reports: ReportIndexEntry[] = [
      { env: '14', target: 'api', pipelineId: '1', publishedAt: '2026-08-01T00:00:00.000Z' },
      { env: '14', target: 'e2e-web+e2e-mobile', pipelineId: '2', publishedAt: '2026-08-02T00:00:00.000Z' },
      { env: '13', target: 'api', pipelineId: '3', publishedAt: '2026-08-03T00:00:00.000Z' },
    ];

    const merged = mergeEnvReportTargets(reports, '14', 'all');
    assert.equal(merged[0]?.target, 'all');
    assert.equal(merged[1]?.target, 'all');
    assert.equal(merged[2]?.target, 'api');
  });
});

describe('ensurePortalTargetLabels', () => {
  test('injects 全量 label helper and is idempotent', () => {
    const html = `
      function fillSelect(select, values) {
        for (const value of values) {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = value;
          select.appendChild(option);
        }
      }
      function hostedHref(item) { return item.path; }
      <h3>最新 · env \${escapeHtml(item.env)} · \${escapeHtml(item.target)}</h3>
      <div><span class="target-chip">\${escapeHtml(item.target)}</span></div>
      fillSelect(targetSelect, uniqueSorted(allReports.map((item) => item.target)));
    `;
    const once = ensurePortalTargetLabels(html);
    const twice = ensurePortalTargetLabels(once);
    assert.match(once, /function displayTarget\(/);
    assert.match(once, /displayTarget\(item\.target\)/);
    assert.match(once, /labelFn/);
    assert.equal(once, twice);
  });
});

describe('ensurePortalHtml list layout', () => {
  const nestedRow = `
      function renderActionLinks(item) {
        if (isHostedEntry(item)) {
          return \`<a class="link-btn primary" href="\${escapeHtml(hostedHref(item))}">在线报告 →</a>\`;
        }
        const links = [];
      }
      const rowTag = hosted ? 'a' : 'div';
      const rowAttrs = hosted ? \` href="\${escapeHtml(hostedHref(item))}"\` : '';
      <\${rowTag} class="\${rowClass}"\${rowAttrs}></\${rowTag}>
      .list-head, .report-row { grid-template-columns: 190px 76px 130px minmax(180px, 1fr) 190px 110px; }
  `;

  test('stops wrapping hosted rows in nested anchors', () => {
    const patched = ensurePortalHtml(nestedRow);
    assert.match(patched, /const rowTag = 'div'/);
    assert.doesNotMatch(patched, /hosted \? 'a' : 'div'/);
    assert.doesNotMatch(patched, /在线报告/);
    assert.doesNotMatch(patched, /if \(isHostedEntry\(item\)\) \{\s*return `<a class="link-btn primary"/);
  });

  test('strips 在线报告 from history action cells', () => {
    const html = `
        const links = [];
        if (isHostedEntry(item)) {
          links.push(
            \`<a class="link-btn primary" href="\${escapeHtml(hostedHref(item))}">在线报告</a>\`,
          );
        }
      .time-main {
        font-size: 0.88rem;
        font-weight: 600;
      }
      grid-template-columns: 178px 72px 88px minmax(140px, 1fr) 168px 132px;
    `;
    const patched = ensurePortalHtml(html);
    assert.doesNotMatch(patched, /在线报告/);
    assert.match(patched, /white-space: nowrap/);
    assert.match(patched, /236px 72px 88px/);
  });

  test('is idempotent', () => {
    const once = ensurePortalHtml(nestedRow);
    const twice = ensurePortalHtml(once);
    assert.equal(once, twice);
  });
});

describe('pruneSiblingTargetDirs', () => {
  test('keeps canonical slot and removes other env categories', () => {
    fs.mkdirSync(TEMP_ROOT, { recursive: true });
    const repo = fs.mkdtempSync(path.join(TEMP_ROOT, 'repo-'));
    fs.mkdirSync(path.join(repo, '14', 'api', 'latest'), { recursive: true });
    fs.mkdirSync(path.join(repo, '14', 'e2e-web+e2e-mobile', 'latest'), { recursive: true });
    fs.mkdirSync(path.join(repo, '14', 'all', 'latest'), { recursive: true });
    fs.mkdirSync(path.join(repo, '13', 'api', 'latest'), { recursive: true });

    const removed = pruneSiblingTargetDirs(repo, '14', 'all');
    assert.deepEqual(removed.sort(), ['14/api', '14/e2e-web+e2e-mobile']);
    assert.equal(fs.existsSync(path.join(repo, '14', 'all')), true);
    assert.equal(fs.existsSync(path.join(repo, '13', 'api')), true);
  });
});
