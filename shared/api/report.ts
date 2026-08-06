import type { TestInfo } from '@playwright/test';

type HeaderSource = Headers | Record<string, string>;

export interface ApiCallLogOptions {
  testInfo: TestInfo;
  request: {
    method: string;
    url: string;
    headers?: HeaderSource;
    body?: unknown;
  };
  response: {
    status: number;
    headers?: HeaderSource;
    body?: unknown;
  };
  /** 端到端耗时（ms），从发请求到拿到响应体 */
  durationMs?: number;
  assertions?: string[];
  /** 本条请求相关断言是否失败（如耗时超限）；供报告在 API Requests 上行内标红 */
  assertionFailed?: boolean;
  name?: string;
}

function headersToRecord(source?: HeaderSource): Record<string, string> {
  if (!source) return {};
  const result: Record<string, string> = {};

  if (source instanceof Headers) {
    source.forEach((value, key) => {
      result[key.toLowerCase()] = value;
    });
    return result;
  }

  for (const [key, value] of Object.entries(source)) {
    result[key.toLowerCase()] = value;
  }
  return result;
}

function redactHeaders(headers?: HeaderSource): Record<string, string> {
  const redacted = headersToRecord(headers);
  for (const key of ['authorization', 'cookie', 'set-cookie']) {
    if (redacted[key]) redacted[key] = '<masked>';
  }
  return redacted;
}

/** 将本次接口请求、响应和关键断言写入报告附件，便于失败排查。 */
export async function attachApiCallLog(options: ApiCallLogOptions): Promise<void> {
  await options.testInfo.attach(options.name ?? '请求日志.json', {
    contentType: 'application/json',
    body: JSON.stringify(
      {
        request: {
          ...options.request,
          headers: redactHeaders(options.request.headers),
        },
        response: {
          ...options.response,
          headers: redactHeaders(options.response.headers),
        },
        ...(typeof options.durationMs === 'number' ? { durationMs: options.durationMs } : {}),
        assertions: options.assertions ?? [],
        ...(options.assertionFailed ? { assertionFailed: true } : {}),
      },
      null,
      2,
    ),
  });
}
