import type { CallOptions } from '../fixtures/api-helper.js';

/**
 * fixture 造数（provision）与 cleanup 用的请求选项：跳过耗时 SLA。
 * 用例正文里的 `logged*` / 裸 `api.*` 仍走 `API_MAX_RESPONSE_MS`。
 */
export const INFRA_API_OPTS: CallOptions = { maxDurationMs: 0 };

/** 合并业务 opts，强制跳过耗时断言（query/headers 等仍保留）。 */
export function withInfraApiOpts(opts: CallOptions = {}): CallOptions {
  return { ...opts, maxDurationMs: 0 };
}
