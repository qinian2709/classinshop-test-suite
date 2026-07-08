import type { TestInfo } from '@playwright/test';
import type { ApiHelper, CallOptions } from '../fixtures/api-helper.js';
import type { ApiResponse } from '../http/types.js';
import { attachApiCallLog } from './report.js';

export interface ApiLogOptions {
  testInfo: TestInfo;
  apiBaseURL: string;
  logName: string;
  assertions?: string[];
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

async function attachLog(
  log: ApiLogOptions,
  method: string,
  url: string,
  requestBody: unknown,
  status: number,
  body: unknown,
): Promise<void> {
  await attachApiCallLog({
    testInfo: log.testInfo,
    name: log.logName,
    request: { method, url, headers: {}, body: requestBody ?? null },
    response: { status, headers: {}, body },
    assertions: log.assertions,
  });
}

/** GET 请求并写入报告附件（每条 HTTP 调用一次 attachApiCallLog）。 */
export async function loggedGet<T = unknown>(
  api: ApiHelper,
  log: ApiLogOptions,
  path: string,
  options: { query?: CallOptions['query']; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: ApiResponse<T> }> {
  const url = buildApiRequestUrl(log.apiBaseURL, path, options.query);
  const result = await api.get<T>(path, options);
  await attachLog(log, 'GET', url, null, result.status, result.body);
  return result;
}

/** POST 请求并写入报告附件（每条 HTTP 调用一次 attachApiCallLog）。 */
export async function loggedPost<T = unknown>(
  api: ApiHelper,
  log: ApiLogOptions,
  path: string,
  data?: unknown,
  options: { query?: CallOptions['query']; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: ApiResponse<T> }> {
  const url = buildApiRequestUrl(log.apiBaseURL, path, options.query);
  const result = await api.post<T>(path, data, options);
  await attachLog(log, 'POST', url, data ?? null, result.status, result.body);
  return result;
}

/** raw 请求（未登录/HTTP 状态断言）并写入报告附件。 */
export async function loggedRaw(
  api: ApiHelper,
  log: ApiLogOptions,
  method: 'get' | 'post',
  path: string,
  options: { data?: unknown; query?: CallOptions['query']; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: unknown }> {
  const url = buildApiRequestUrl(log.apiBaseURL, path, options.query);
  const res = await api.raw(method, path, options);
  const status = res.status();
  let body: unknown;
  try {
    body = status === 200 ? await res.json() : await res.text();
  } catch {
    body = null;
  }
  await attachLog(log, method.toUpperCase(), url, options.data ?? null, status, body);
  return { status, body };
}
