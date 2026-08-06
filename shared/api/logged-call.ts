import type { TestInfo } from '@playwright/test';
import { API_MAX_RESPONSE_MS } from '../../config/api.js';
import type { ApiHelper, CallOptions } from '../fixtures/api-helper.js';
import type { ApiResponse } from '../http/types.js';
import { attachApiCallLog } from './report.js';

/** @deprecated 请直接用 `@config` 的 `API_MAX_RESPONSE_MS`（项目级配置）。 */
export const MAX_API_RESPONSE_MS = API_MAX_RESPONSE_MS;

export interface ApiLogOptions {
  testInfo: TestInfo;
  apiBaseURL: string;
  logName: string;
  assertions?: string[];
  /**
   * 单次请求耗时上限（ms）。未传则用项目级 `API_MAX_RESPONSE_MS`（config/api.ts）。
   * 传 0 可跳过本次耗时断言（仅少数已知慢接口）。
   */
  maxDurationMs?: number;
}

export function buildApiRequestUrl(
  apiBaseURL: string,
  path: string,
  query?: CallOptions['query'],
): string {
  const url = new URL(
    `${apiBaseURL.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`,
  );
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

function resolveMaxDurationMs(log: ApiLogOptions): number {
  return log.maxDurationMs ?? API_MAX_RESPONSE_MS;
}

async function attachLog(
  log: ApiLogOptions,
  method: string,
  url: string,
  requestBody: unknown,
  status: number,
  body: unknown,
  durationMs: number,
  requestHeaders: Record<string, string> = {},
  responseHeaders: Record<string, string> = {},
): Promise<void> {
  const maxDurationMs = resolveMaxDurationMs(log);
  const durationAssertion =
    maxDurationMs > 0
      ? [`响应耗时应 ≤ ${maxDurationMs}ms（实际 ${durationMs}ms）`]
      : [`响应耗时 ${durationMs}ms（耗时断言已关闭）`];
  await attachApiCallLog({
    testInfo: log.testInfo,
    name: log.logName,
    request: { method, url, headers: requestHeaders, body: requestBody ?? null },
    response: { status, headers: responseHeaders, body },
    durationMs,
    assertions: [...(log.assertions ?? []), ...durationAssertion],
  });
}

function callOptsFromLog(
  log: ApiLogOptions,
  options: { query?: CallOptions['query']; headers?: Record<string, string> } = {},
): CallOptions {
  return {
    ...options,
    ...(log.maxDurationMs !== undefined ? { maxDurationMs: log.maxDurationMs } : {}),
  };
}

/** GET 请求并写入报告附件（每条 HTTP 调用一次 attachApiCallLog）。耗时断言由 ApiHelper 统一执行。 */
export async function loggedGet<T = unknown>(
  api: ApiHelper,
  log: ApiLogOptions,
  path: string,
  options: { query?: CallOptions['query']; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: ApiResponse<T>; durationMs: number }> {
  const url = buildApiRequestUrl(log.apiBaseURL, path, options.query);
  const result = await api.get<T>(path, callOptsFromLog(log, options));
  await attachLog(
    log,
    'GET',
    url,
    null,
    result.status,
    result.body,
    result.durationMs,
    result.requestHeaders,
    result.responseHeaders,
  );
  return result;
}

/** POST 请求并写入报告附件（每条 HTTP 调用一次 attachApiCallLog）。耗时断言由 ApiHelper 统一执行。 */
export async function loggedPost<T = unknown>(
  api: ApiHelper,
  log: ApiLogOptions,
  path: string,
  data?: unknown,
  options: { query?: CallOptions['query']; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: ApiResponse<T>; durationMs: number }> {
  const url = buildApiRequestUrl(log.apiBaseURL, path, options.query);
  const result = await api.post<T>(path, data, callOptsFromLog(log, options));
  await attachLog(
    log,
    'POST',
    url,
    data ?? null,
    result.status,
    result.body,
    result.durationMs,
    result.requestHeaders,
    result.responseHeaders,
  );
  return result;
}

/** raw 请求（未登录/HTTP 状态断言）并写入报告附件。耗时断言由 ApiHelper 统一执行。 */
export async function loggedRaw(
  api: ApiHelper,
  log: ApiLogOptions,
  method: 'get' | 'post',
  path: string,
  options: { data?: unknown; query?: CallOptions['query']; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: unknown; durationMs: number }> {
  const url = buildApiRequestUrl(log.apiBaseURL, path, options.query);
  const res = await api.raw(method, path, {
    ...options,
    ...(log.maxDurationMs !== undefined ? { maxDurationMs: log.maxDurationMs } : {}),
  });
  const status = res.status();
  const durationMs = res.durationMs();
  let body: unknown;
  try {
    body = status === 200 ? await res.json() : await res.text();
  } catch {
    body = null;
  }
  await attachLog(
    log,
    method.toUpperCase(),
    url,
    options.data ?? null,
    status,
    body,
    durationMs,
    res.requestHeaders(),
    res.responseHeaders(),
  );
  return { status, body, durationMs };
}
