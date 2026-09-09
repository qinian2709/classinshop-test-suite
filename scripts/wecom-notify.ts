import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { buildSeriesPortalHomeUrl, formatReportScopeLabel, formatReportTargetLabel } from './report-slot.js';
import { resolveWeComMentionMobiles, resolveWeComWebhookUrl } from '../config/wecom.js';

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
  scope?: string;
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

/** GitLab Pipeline 页（优先用 projectUrl + pipelineId 拼，避免 CI_PIPELINE_URL 缺失或不准）。 */
export function buildGitLabPipelineUrl(
  projectUrl = process.env.CI_PROJECT_URL?.trim(),
  pipelineId = process.env.CI_PIPELINE_ID?.trim(),
): string | undefined {
  if (projectUrl && pipelineId) {
    return `${projectUrl.replace(/\/$/, '')}/-/pipelines/${pipelineId}`;
  }
  return process.env.CI_PIPELINE_URL?.trim() || undefined;
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
  portalHome?: string;
  artifactsBrowse?: string;
  job?: string;
  localPath?: string;
  pipelineId?: string;
  pipelineIid?: string;
}

interface PublishEnvContext {
  enhancedReportUrl?: string;
  portalHomeUrl?: string;
  pipelineUrl?: string;
  pipelineId?: string;
  pipelineIid?: string;
  jobId?: string;
  artifactBrowseUrl?: string;
  jobUrl?: string;
}

function isHttpUrl(value: string | undefined): value is string {
  return !!value?.trim().startsWith('http');
}

const PUBLISH_ENV_FILE = path.join(ROOT, 'reports/latest/publish.env');

export function resolvePortalHomeUrl(
  baseUrl = process.env.REPORT_PUBLISH_BASE_URL,
  enhancedUrl?: string,
  series?: string,
): string | undefined {
  const home = originHome(baseUrl) ?? originHome(enhancedUrl);
  if (!home) return undefined;
  return buildSeriesPortalHomeUrl(home, series);
}

function originHome(value?: string): string | undefined {
  const raw = value?.trim();
  if (!raw || !raw.startsWith('http')) return undefined;
  try {
    return `${new URL(raw).origin}/`;
  } catch {
    return undefined;
  }
}

function readPublishEnv(): PublishEnvContext {
  if (!fs.existsSync(PUBLISH_ENV_FILE)) return {};
  const parsed = dotenv.parse(fs.readFileSync(PUBLISH_ENV_FILE));
  const enhancedReportUrl = parsed.ENHANCED_REPORT_URL?.trim();
  const portalHomeUrl = parsed.PORTAL_HOME_URL?.trim();
  return {
    enhancedReportUrl:
      enhancedReportUrl && enhancedReportUrl.startsWith('http') ? enhancedReportUrl : undefined,
    portalHomeUrl: portalHomeUrl && portalHomeUrl.startsWith('http') ? portalHomeUrl : undefined,
    pipelineUrl: parsed.CI_PIPELINE_URL?.trim(),
    pipelineId: parsed.CI_PIPELINE_ID?.trim(),
    pipelineIid: parsed.CI_PIPELINE_IID?.trim(),
    jobId: parsed.CI_JOB_ID?.trim(),
    artifactBrowseUrl: parsed.ARTIFACT_BROWSE_URL?.trim(),
    jobUrl: parsed.CI_JOB_URL?.trim(),
  };
}

function parsePublishWaitSeconds(): number {
  const raw = process.env.WECOM_PUBLISH_WAIT_SECONDS?.trim();
  if (raw === '0' || raw === 'false' || raw === 'off') return 0;
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return readPublishEnv().enhancedReportUrl ? 30 : 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPublishedReport(reportUrl: string, maxWaitSeconds: number): Promise<void> {
  if (maxWaitSeconds <= 0) return;

  console.log(
    `[wecom] Waiting up to ${maxWaitSeconds}s for published report to become reachable: ${reportUrl}`,
  );

  const deadline = Date.now() + maxWaitSeconds * 1000;
  const pollIntervalMs = 5000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(reportUrl, { method: 'HEAD', redirect: 'follow' });
      if (response.ok) {
        console.log(`[wecom] Report URL reachable (HTTP ${response.status}).`);
        return;
      }
      console.log(`[wecom] Report URL not ready yet (HTTP ${response.status}).`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`[wecom] Report URL check failed: ${message}`);
    }

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    await sleep(Math.min(pollIntervalMs, remainingMs));
  }

  console.warn('[wecom] Report URL still unavailable; sending notification anyway.');
}

export function resolveReportLinks(input: WeComNotifyInput): ReportLinks {
  const publishEnv = readPublishEnv();
  const jobId = publishEnv.jobId || process.env.CI_JOB_ID?.trim();
  const pipelineId = publishEnv.pipelineId || process.env.CI_PIPELINE_ID?.trim();
  const pipelineIid = publishEnv.pipelineIid || process.env.CI_PIPELINE_IID?.trim();

  const explicit = (process.env.ENHANCED_REPORT_URL ?? input.enhancedReportUrl)?.trim();
  const enhanced =
    publishEnv.enhancedReportUrl ||
    (isHttpUrl(explicit) && !explicit.includes('/artifacts/') ? explicit : undefined);

  const artifactsBrowse =
    (publishEnv.artifactBrowseUrl && isHttpUrl(publishEnv.artifactBrowseUrl)
      ? publishEnv.artifactBrowseUrl
      : undefined) || buildGitLabArtifactsBrowseUrl(undefined, jobId);

  const job =
    input.jobUrl?.trim() ||
    publishEnv.jobUrl ||
    buildGitLabJobUrl(undefined, jobId) ||
    process.env.CI_JOB_URL?.trim();

  const localCandidate = input.enhancedReportUrl?.trim();
  const localPath =
    localCandidate && !isHttpUrl(localCandidate) && fs.existsSync(localCandidate)
      ? localCandidate
      : undefined;

  return {
    enhanced,
    portalHome:
      publishEnv.portalHomeUrl ||
      resolvePortalHomeUrl(process.env.REPORT_PUBLISH_BASE_URL, enhanced, process.env.REPORT_PUBLISH_SERIES),
    artifactsBrowse,
    job,
    localPath,
    pipelineId,
    pipelineIid,
  };
}

export function formatReportSection(links: ReportLinks): string[] {
  const lines = ['**测试报告**'];

  if (links.enhanced) {
    lines.push(`[在线最新报告](${links.enhanced})`);
  }
  if (links.portalHome) {
    lines.push(`[查看历史报告](${links.portalHome})`);
  }
  if (links.enhanced || links.portalHome) {
    return lines;
  }

  const fallback = links.artifactsBrowse ?? links.job;
  if (fallback) {
    const label = links.artifactsBrowse ? 'Artifacts 报告目录' : '打开 Job 查看产物';
    lines.push(`[${label}](${fallback})`);
    return lines;
  }

  if (links.localPath) {
    const relative = path.relative(ROOT, links.localPath) || links.localPath;
    lines.push(`本地路径：${colorize(relative, 'comment')}`);
    return lines;
  }

  lines.push(colorize('暂无在线报告链接。请先执行 publish-report 或本地 pnpm report:enhanced', 'comment'));
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
  const publishEnv = readPublishEnv();
  return (
    input.pipelineUrl?.trim() ||
    publishEnv.pipelineUrl ||
    buildGitLabPipelineUrl() ||
    undefined
  );
}

function formatPipelineRef(
  pipelineUrl: string,
  pipelineIid?: string,
  pipelineId?: string,
): string {
  const label = pipelineIid ? `#${pipelineIid}` : pipelineId ? pipelineId : '详情';
  return `[${label}](${pipelineUrl})`;
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
  const pipelineIid = reportLinks.pipelineIid;
  const pipelineId = reportLinks.pipelineId;

  const sections: string[] = [`## ${icon} ClassInShop 测试${status}`, '', ...formatReportSection(reportLinks)];

  const metaLines = [
    `> **环境**：${input.testEnv}`,
    `> **目标**：${formatReportTargetLabel(input.target)}`,
  ];
  const scopeLabel = formatReportScopeLabel(input.scope);
  if (scopeLabel !== formatReportTargetLabel(input.target)) {
    metaLines.push(`> **范围**：${scopeLabel}`);
  }
  if (pipelineUrl) {
    metaLines.push(`> **流水线**：${formatPipelineRef(pipelineUrl, pipelineIid, pipelineId)}`);
  }
  if (input.jobName) metaLines.push(`> **Job**：${input.jobName}`);
  if (input.projectName) metaLines.push(`> **项目**：${input.projectName}`);
  if (input.refName) metaLines.push(`> **分支/Tag**：${input.refName}`);

  sections.push('', ...metaLines, '', formatResultBlock(summary, status));

  if (input.allureReportGenerated && input.allureReportUrl?.startsWith('http')) {
    sections.push('', `[Allure 报告](${input.allureReportUrl})`);
  }

  return sections.join('\n');
}

interface WeComResponse {
  errcode?: number;
  errmsg?: string;
}

export interface WeComTextMentionPayload {
  msgtype: 'text';
  text: {
    content: string;
    mentioned_mobile_list: string[];
  };
}

export function buildFailureMentionPayload(
  status: '通过' | '失败' | '跳过',
  mobiles = resolveWeComMentionMobiles(),
): WeComTextMentionPayload | null {
  if (status !== '失败' || mobiles.length === 0) return null;
  return {
    msgtype: 'text',
    text: {
      content: 'ClassInShop 测试失败，请查看上方报告。',
      mentioned_mobile_list: mobiles,
    },
  };
}

async function postWeComWebhook(webhookUrl: string, payload: unknown): Promise<void> {
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
}

export async function sendWeComNotification(
  input: WeComNotifyInput,
  webhookUrl = resolveWeComWebhookUrl(),
): Promise<void> {
  if (!webhookUrl) {
    throw new Error('缺少企微 Webhook，请检查 config/wecom.ts 或环境变量 WECOM_WEBHOOK_URL。');
  }

  const content = buildWeComMarkdown(input);
  const summary = readJUnitSummary(input.junitFile);
  const status = deriveStatus(input.exitCode, summary);
  const reportLinks = resolveReportLinks(input);
  if (reportLinks.enhanced) {
    console.log(`[wecom] Enhanced report URL: ${reportLinks.enhanced}`);
    await waitForPublishedReport(reportLinks.enhanced, parsePublishWaitSeconds());
  } else if (reportLinks.job) {
    console.log(`[wecom] Fallback job URL: ${reportLinks.job}`);
  } else if (reportLinks.localPath) {
    console.log(`[wecom] Local report path: ${reportLinks.localPath}`);
  } else {
    console.warn('[wecom] No report URL resolved; notification will omit online report link.');
  }

  await postWeComWebhook(webhookUrl, {
    msgtype: 'markdown',
    markdown: { content },
  });

  const mention = buildFailureMentionPayload(status);
  if (mention) {
    await postWeComWebhook(webhookUrl, mention);
    console.log(`[wecom] Failure mention sent: ${mention.text.mentioned_mobile_list.join(',')}`);
  } else if (status === '失败') {
    console.log('[wecom] Failure mention skipped: set WECOM_MENTION_MOBILES or config/wecom.ts DEFAULT_WECOM_MENTION_MOBILES.');
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
  const target = readArg(argv, '--target') ?? 'all';
  const scope = readArg(argv, '--scope');
  const exitCode = parseExitCode(readArg(argv, '--exit-code'));
  const junitFile = readArg(argv, '--junit') ?? 'reports/latest/junit.xml';

  try {
    await sendWeComNotification({
      testEnv,
      target,
      scope,
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
