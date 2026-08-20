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
