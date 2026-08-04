import { API_MAX_RESPONSE_MS } from '../../config/api.js';

/**
 * 解析本次请求耗时上限（ms）。
 * - override 有值时优先（含 0 = 跳过）
 * - 否则用项目级配置 config/api.ts → API_MAX_RESPONSE_MS
 */
export function resolveMaxApiResponseMs(override?: number): number {
  return override ?? API_MAX_RESPONSE_MS;
}

/**
 * 断言单次接口响应耗时未超限。
 * 供 ApiHelper、以及 tests/api 内偶发的裸 fetch 统一调用——禁止在用例里写死毫秒数。
 */
export function assertApiResponseDuration(
  label: string,
  durationMs: number,
  maxDurationMs?: number,
): void {
  const max = resolveMaxApiResponseMs(maxDurationMs);
  if (max <= 0) return;
  if (durationMs > max) {
    throw new Error(
      `接口响应耗时超限 ${label}：${durationMs}ms > ${max}ms（可改 config/api.ts 的 API_MAX_RESPONSE_MS，或单次传 maxDurationMs）`,
    );
  }
}
