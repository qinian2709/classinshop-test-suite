import fs from 'node:fs';
import path from 'node:path';

export const CANONICAL_REPORT_TARGET = 'all';
export const CANONICAL_REPORT_TARGET_LABEL = '全量';

const PROJECT_LABELS: Record<string, string> = {
  api: 'API',
  'e2e-web': 'PC',
  'e2e-mobile': 'H5',
  core: CANONICAL_REPORT_TARGET_LABEL,
  all: CANONICAL_REPORT_TARGET_LABEL,
};

export interface ReportIndexEntry {
  env: string;
  target: string;
  pipelineId: string;
  publishedAt: string;
  isLatest?: boolean;
  path?: string;
}

export function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._+-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

/** Hosted reports under one env share a single category. */
export function canonicalizeReportTarget(_raw?: string): string {
  return CANONICAL_REPORT_TARGET;
}

export function formatReportTargetLabel(_raw?: string): string {
  return CANONICAL_REPORT_TARGET_LABEL;
}

export function formatReportScopeLabel(raw?: string): string {
  const parts = (raw ?? '')
    .split(/[+,]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (parts.length === 0) return CANONICAL_REPORT_TARGET_LABEL;

  const labels = [...new Set(parts.map((item) => PROJECT_LABELS[item] ?? item))];
  if (labels.every((label) => label === CANONICAL_REPORT_TARGET_LABEL)) {
    return CANONICAL_REPORT_TARGET_LABEL;
  }
  return labels.join('、');
}

export function mergeEnvReportTargets<T extends { env: string; target: string }>(
  reports: T[],
  env: string,
  target: string,
): T[] {
  return reports.map((item) => (item.env === env ? { ...item, target } : item));
}

/** Drop leftover {env}/{oldTarget}/ trees after merging to one slot. */
export function pruneSiblingTargetDirs(repoRoot: string, testEnv: string, keepTarget: string): string[] {
  const envSegment = sanitizeSegment(testEnv);
  const keepSegment = sanitizeSegment(keepTarget);
  const envDir = path.join(repoRoot, envSegment);
  if (!fs.existsSync(envDir)) return [];

  const removed: string[] = [];
  for (const entry of fs.readdirSync(envDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === keepSegment) continue;
    fs.rmSync(path.join(envDir, entry.name), { recursive: true, force: true });
    removed.push(`${envSegment}/${entry.name}`);
  }
  return removed;
}

const NESTED_HOSTED_ACTION = `        if (isHostedEntry(item)) {
          return \`<a class="link-btn primary" href="\${escapeHtml(hostedHref(item))}">在线报告 →</a>\`;
        }
        const links = [];`;

const LINKS_START = '        const links = [];';

const HOSTED_ONLINE_PUSH = `        const links = [];
        if (isHostedEntry(item)) {
          links.push(
            \`<a class="link-btn primary" href="\${escapeHtml(hostedHref(item))}">在线报告</a>\`,
          );
        }`;

export function ensurePortalListLayout(html: string): string {
  let next = html;
  next = next.replaceAll("const rowTag = hosted ? 'a' : 'div';", "const rowTag = 'div';");
  next = next.replaceAll(
    'const rowAttrs = hosted ? ` href="${escapeHtml(hostedHref(item))}"` : \'\';',
    "const rowAttrs = '';",
  );
  next = next.replaceAll(HOSTED_ONLINE_PUSH, LINKS_START);
  next = next.replaceAll(NESTED_HOSTED_ACTION, LINKS_START);
  next = next.replaceAll(
    'grid-template-columns: 190px 76px 130px minmax(180px, 1fr) 190px 110px;',
    'grid-template-columns: 236px 72px 88px minmax(140px, 1fr) 168px 110px;',
  );
  next = next.replaceAll(
    'grid-template-columns: 178px 72px 88px minmax(140px, 1fr) 168px 132px;',
    'grid-template-columns: 236px 72px 88px minmax(140px, 1fr) 168px 110px;',
  );
  next = next.replaceAll(
    `.action-links {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: flex-end;
      }`,
    `.action-links {
        display: flex;
        flex-direction: column;
        flex-wrap: nowrap;
        align-items: stretch;
        gap: 6px;
        justify-content: flex-end;
      }`,
  );
  next = next.replaceAll(
    `.link-btn {
        display: inline-flex;
        padding: 7px 11px;`,
    `.link-btn {
        display: inline-flex;
        justify-content: center;
        white-space: nowrap;
        padding: 7px 11px;`,
  );
  next = next.replaceAll(
    `.report-row {
        min-height: 76px;
        border-bottom: 1px solid #e2e8f0;`,
    `.report-row {
        min-height: 88px;
        padding-top: 10px;
        padding-bottom: 10px;
        overflow: hidden;
        border-bottom: 1px solid #e2e8f0;`,
  );
  next = next.replaceAll(
    `.time-main {
        font-size: 0.88rem;
        font-weight: 600;
      }`,
    `.time-main {
        display: inline-flex;
        align-items: center;
        flex-wrap: nowrap;
        gap: 8px;
        white-space: nowrap;
        font-size: 0.88rem;
        font-weight: 600;
      }`,
  );
  next = next.replaceAll(
    `.badge-latest {
        margin-left: 8px;`,
    `.badge-latest {
        flex-shrink: 0;
        margin-left: 0;`,
  );
  next = next.replaceAll(
    `<span>结果</span>
          <span></span>`,
    `<span>结果</span>
          <span>操作</span>`,
  );
  return next;
}

export function ensurePortalHtml(html: string): string {
  return ensurePortalListLayout(ensurePortalTargetLabels(html));
}

export function ensurePortalTargetLabels(html: string): string {
  let next = html;
  if (!next.includes('function displayTarget(')) {
    next = next.replace(
      'function hostedHref(item) {',
      "function displayTarget(value) {\n        if (!value) return '—';\n        if (value === 'all' || value === 'core') return '全量';\n        return value;\n      }\n\n      function hostedHref(item) {",
    );
  }
  next = next.replaceAll(
    '<h3>最新 · env ${escapeHtml(item.env)} · ${escapeHtml(item.target)}</h3>',
    '<h3>最新 · env ${escapeHtml(item.env)} · ${escapeHtml(displayTarget(item.target))}</h3>',
  );
  next = next.replaceAll(
    '<div><span class="target-chip">${escapeHtml(item.target)}</span></div>',
    '<div><span class="target-chip">${escapeHtml(displayTarget(item.target))}</span></div>',
  );
  next = next.replaceAll(
    'fillSelect(targetSelect, uniqueSorted(allReports.map((item) => item.target)));',
    'fillSelect(targetSelect, uniqueSorted(allReports.map((item) => item.target)), displayTarget);',
  );
  if (!next.includes('labelFn')) {
    next = next.replace(
      `function fillSelect(select, values) {
        for (const value of values) {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = value;
          select.appendChild(option);
        }
      }`,
      `function fillSelect(select, values, labelFn) {
        for (const value of values) {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = labelFn ? labelFn(value) : value;
          select.appendChild(option);
        }
      }`,
    );
  }
  return next;
}
