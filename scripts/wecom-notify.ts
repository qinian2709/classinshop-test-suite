import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { resolveWeComWebhookUrl } from '../config/wecom.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

dotenv.config({ path: path.join(ROOT, '.env.local') });
dotenv.config({ path: path.join(ROOT, '.env') });

export interface JUnitSummary {
  tests: number;
  failures: number;
  skipped: number;
  errors: number;
  time: number;
}

export interface WeComNotifyInput {
  testEnv: string;
  target: string;
  exitCode: number;
  junitFile: string;
  enhancedReportUrl?: string;
  htmlReportUrl?: string;
  allureReportUrl?: string;
  allureReportGenerated?: boolean;
  pipelineUrl?: string;
  jobUrl?: string;
  projectName?: string;
  refName?: string;
  jobName?: string;
}

/** GitLab Job 页（Artifacts 入口）。 */
export function buildGitLabJobUrl(
  projectUrl = process.env.CI_PROJECT_URL?.trim(),
  jobId = process.env.CI_JOB_ID?.trim(),
): string | undefined {
  if (!projectUrl || !jobId) return undefined;
  return `${projectUrl}/-/jobs/${jobId}`;
}

/** GitLab Artifacts 浏览目录（Enhanced 报告所在文件夹）。 */
export function buildGitLabArtifactsBrowseUrl(
  projectUrl = process.env.CI_PROJECT_URL?.trim(),
  jobId = process.env.CI_JOB_ID?.trim(),
): string | undefined {
  if (!projectUrl || !jobId) return undefined;
  return `${projectUrl}/-/jobs/${jobId}/artifacts/browse/reports/latest/enhanced/`;
}

/** GitLab Job Artifacts 中的 Enhanced 报告链接（browse 目录，在 GitLab UI 内点开 HTML）。 */
export function buildGitLabEnhancedReportUrl(
  projectUrl = process.env.CI_PROJECT_URL?.trim(),
  jobId = process.env.CI_JOB_ID?.trim(),
): string | undefined {
  // 直链 html 在多数 GitLab 版本会触发下载，优先打开 Artifacts 浏览目录。
  return buildGitLabArtifactsBrowseUrl(projectUrl, jobId);
}

export interface ReportLinks {
  enhanced?: string;
  artifactsBrowse?: string;
  job?: string;
  localPath?: string;
}

function isHttpUrl(value: string | undefined): value is string {
  return !!value?.trim().startsWith('http');
}

export function resolveReportLinks(input: WeComNotifyInput): ReportLinks {
  const explicit = (input.enhancedReportUrl ?? process.env.ENHANCED_REPORT_URL)?.trim();
  const enhanced = isHttpUrl(explicit) ? explicit : buildGitLabEnhancedReportUrl();
  const artifactsBrowse = buildGitLabArtifactsBrowseUrl();
  const job = input.jobUrl?.trim() || buildGitLabJobUrl() || process.env.CI_JOB_URL?.trim();
  const localCandidate = input.enhancedReportUrl?.trim();
  const localPath =
    localCandidate && !isHttpUrl(localCandidate) && fs.existsSync(localCandidate)
      ? localCandidate
      : undefined;

  return { enhanced, artifactsBrowse, job, localPath };
}

function formatReportSection(links: ReportLinks): string[] {
  const lines: string[] = ['**测试报告**'];

  const artifactsUrl = links.enhanced ?? links.artifactsBrowse;
  const reportLabel =
    artifactsUrl && !artifactsUrl.includes('/artifacts/')
      ? '在线测试报告'
      : 'Artifacts 报告目录';

  if (artifactsUrl) {
    lines.push(`[${reportLabel}](${artifactsUrl})`);
  } else if (links.job) {
    lines.push(`[打开 Job 查看产物](${links.job})`);
  }

  if (artifactsUrl && links.job) {
    lines.push(`[Job 详情](${links.job})`);
  }

  if (!links.enhanced && !links.artifactsBrowse && !links.job) {
    if (links.localPath) {
      const relative = path.relative(ROOT, links.localPath) || links.localPath;
      lines.push(`本地路径：${colorize(relative, 'comment')}`);
    } else {
      lines.push(
        colorize('暂无在线报告链接。CI 中需 Job Artifacts；本地请 pnpm report:enhanced', 'comment'),
      );
    }
  }

  return lines;
}

function colorize(value: number | string, tone: 'info' | 'comment' | 'warning'): string {
  return `<font color="${tone}">${value}</font>`;
}

function detailLine(label: string, value: string): string {
  return `>> ${label}：${value}`;
}

function formatStatus(status: '通过' | '失败' | '跳过'): string {
  if (status === '通过') return colorize(status, 'info');
  if (status === '跳过') return colorize(status, 'comment');
  return colorize(status, 'warning');
}

function formatResultBlock(summary: JUnitSummary | null, status: '通过' | '失败' | '跳过'): string {
  if (!summary) {
    return ['> **结果**', detailLine('说明', colorize('未读取到 JUnit 汇总', 'comment'))].join('\n');
  }

  const passed = Math.max(summary.tests - summary.failures - summary.errors - summary.skipped, 0);
  const lines = ['> **结果**', detailLine('状态', formatStatus(status))];

  if (summary.tests > 0) {
    lines.push(detailLine('总数', colorize(summary.tests, 'info')));
  }
  if (passed > 0) {
    lines.push(detailLine('通过', colorize(passed, 'info')));
  }
  if (summary.failures > 0) {
    lines.push(detailLine('失败', colorize(summary.failures, 'warning')));
  }
  if (summary.errors > 0) {
    lines.push(detailLine('错误', colorize(summary.errors, 'warning')));
  }
  if (summary.skipped > 0) {
    lines.push(detailLine('跳过', colorize(summary.skipped, 'comment')));
  }

  lines.push(detailLine('耗时', colorize(`${summary.time.toFixed(2)}s`, 'comment')));
  return lines.join('\n');
}

function resolvePipelineUrl(input: WeComNotifyInput): string | undefined {
  return input.pipelineUrl?.trim() || process.env.CI_PIPELINE_URL?.trim() || undefined;
}

function readNumberAttr(attrs: string, name: keyof JUnitSummary): number {
  const match = new RegExp(`${name}="([^"]*)"`).exec(attrs);
  return match ? Number(match[1]) : 0;
}

export function readJUnitSummary(junitFile: string): JUnitSummary | null {
  const file = path.isAbsolute(junitFile) ? junitFile : path.join(ROOT, junitFile);
  if (!fs.existsSync(file)) return null;

  const xml = fs.readFileSync(file, 'utf8');
  const match = /<testsuites\b([^>]*)>/.exec(xml) ?? /<testsuite\b([^>]*)>/.exec(xml);
  if (!match) return null;

  const attrs = match[1] ?? '';
  return {
    tests: readNumberAttr(attrs, 'tests'),
    failures: readNumberAttr(attrs, 'failures'),
    skipped: readNumberAttr(attrs, 'skipped'),
    errors: readNumberAttr(attrs, 'errors'),
    time: readNumberAttr(attrs, 'time'),
  };
}

export function deriveStatus(
  exitCode: number,
  summary: JUnitSummary | null,
): '通过' | '失败' | '跳过' {
  if (summary && (summary.failures > 0 || summary.errors > 0)) return '失败';
  if (exitCode !== 0) return '失败';
  if (summary && summary.tests > 0 && summary.tests === summary.skipped) return '跳过';
  return '通过';
}

export function buildWeComMarkdown(input: WeComNotifyInput): string {
  const summary = readJUnitSummary(input.junitFile);
  const status = deriveStatus(input.exitCode, summary);
  const icon = status === '通过' ? '✅' : status === '跳过' ? '⏭️' : '❌';
  const reportLinks = resolveReportLinks(input);
  const pipelineUrl = resolvePipelineUrl(input);

  const sections: string[] = [`## ${icon} ClassInShop 测试${status}`, '', ...formatReportSection(reportLinks)];

  const metaLines = [
    `> **环境**：${input.testEnv}`,
    `> **目标**：${input.target}`,
  ];
  if (input.jobName) metaLines.push(`> **Job**：${input.jobName}`);
  if (input.projectName) metaLines.push(`> **项目**：${input.projectName}`);
  if (input.refName) metaLines.push(`> **分支/Tag**：${input.refName}`);

  sections.push('', ...metaLines, '', formatResultBlock(summary, status));

  if (input.allureReportGenerated && input.allureReportUrl?.startsWith('http')) {
    sections.push('', `[Allure 报告](${input.allureReportUrl})`);
  }
  if (pipelineUrl) {
    sections.push('', `[流水线详情](${pipelineUrl})`);
  }

  return sections.join('\n');
}

interface WeComResponse {
  errcode?: number;
  errmsg?: string;
}

export async function sendWeComNotification(
  input: WeComNotifyInput,
  webhookUrl = resolveWeComWebhookUrl(),
): Promise<void> {
  if (!webhookUrl) {
    throw new Error('缺少企微 Webhook，请检查 config/wecom.ts 或环境变量 WECOM_WEBHOOK_URL。');
  }

  const content = buildWeComMarkdown(input);
  const reportLinks = resolveReportLinks(input);
  if (reportLinks.enhanced) {
    console.log(`[wecom] Enhanced report URL: ${reportLinks.enhanced}`);
  } else if (reportLinks.job) {
    console.log(`[wecom] Fallback job URL: ${reportLinks.job}`);
  } else if (reportLinks.localPath) {
    console.log(`[wecom] Local report path: ${reportLinks.localPath}`);
  } else {
    console.warn('[wecom] No report URL resolved; notification will omit online report link.');
  }

  const payload = {
    msgtype: 'markdown',
    markdown: { content },
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`企微 Webhook HTTP ${response.status}: ${await response.text()}`);
  }

  const body = (await response.json()) as WeComResponse;
  if (body.errcode !== 0) {
    throw new Error(`企微 Webhook 返回错误 errcode=${body.errcode} errmsg=${body.errmsg ?? 'unknown'}`);
  }

  console.log('[wecom] Notification sent successfully.');
}

function parseExitCode(raw: string | undefined): number {
  if (!raw) return 0;
  if (raw === 'success') return 0;
  if (raw === 'failed' || raw === 'canceled') return 1;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 1;
}

function readArg(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  return inline?.slice(prefix.length);
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

async function runCli(argv: string[]): Promise<number> {
  const testEnv = readArg(argv, '--env') ?? process.env.TEST_ENV ?? '13';
  const target = readArg(argv, '--target') ?? 'api';
  const exitCode = parseExitCode(readArg(argv, '--exit-code'));
  const junitFile = readArg(argv, '--junit') ?? 'reports/latest/junit.xml';

  try {
    await sendWeComNotification({
      testEnv,
      target,
      exitCode,
      junitFile,
      enhancedReportUrl: readArg(argv, '--enhanced-report-url'),
      htmlReportUrl: readArg(argv, '--html-report-url'),
      allureReportUrl: readArg(argv, '--allure-report-url'),
      allureReportGenerated: hasFlag(argv, '--allure-generated'),
      pipelineUrl: readArg(argv, '--pipeline-url'),
      jobUrl: readArg(argv, '--job-url'),
      projectName: readArg(argv, '--project-name'),
      refName: readArg(argv, '--ref-name'),
      jobName: readArg(argv, '--job-name'),
    });
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[wecom] ${message}`);
    return 1;
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  runCli(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
