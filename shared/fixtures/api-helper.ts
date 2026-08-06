import { test } from '@playwright/test';
import { assertApiResponseDuration, resolveMaxApiResponseMs } from '../http/duration.js';
import type { ApiResponse } from '../http/types.js';
import { SUCCESS_CODE } from '../http/types.js';

export interface CallOptions {
  query?: Record<string, string | number | boolean | undefined>;
  data?: unknown;
  headers?: Record<string, string>;
  /**
   * 本次请求耗时上限（ms）。
   * - 未传：使用 ApiHelper 构造时的 maxResponseMs（通常来自 config/api.ts 的 API_MAX_RESPONSE_MS）
   * - 传 0：跳过本次耗时断言
   */
  maxDurationMs?: number;
  /**
   * 是否包一层 Playwright `test.step`（默认 true）。
   * `logged*` 外层已建 step 时传 false，避免同名嵌套。
   */
  step?: boolean;
}

export type HttpMethod = 'get' | 'post' | 'put' | 'delete';

export interface ApiCallResult<T = unknown> {
  status: number;
  body: ApiResponse<T>;
  /** 端到端耗时（ms）：发请求 → 读完响应体 */
  durationMs: number;
  /** 实际发出的请求头（含默认鉴权头） */
  requestHeaders: Record<string, string>;
  /** 响应头 */
  responseHeaders: Record<string, string>;
}

/** raw() 的返回适配器，兼容此前基于 Playwright APIResponse 的用法（status() / json() / text()）。 */
export interface RawResponse {
  status: () => number;
  // 默认 any，便于在只读断言里直接访问 .code 等字段（与此前 Playwright APIResponse 用法一致）。
  json: <T = any>() => Promise<T>;
  text: () => Promise<string>;
  /** 端到端耗时（ms） */
  durationMs: () => number;
  requestHeaders: () => Record<string, string>;
  responseHeaders: () => Record<string, string>;
}

function headersToRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

export interface ApiHelperInitOptions {
  /**
   * 默认单次响应耗时上限（ms）。
   * 0 表示默认不断言；单次请求仍可用 CallOptions.maxDurationMs 覆盖。
   */
  maxResponseMs?: number;
}

/**
 * 基于 Node 原生 fetch（undici）的接口助手：默认 keep-alive 复用连接，避免被测环境 WAF
 * 对"高频新建连接"的拦截（Playwright APIRequestContext 在 test runner 下会每请求新建连接，
 * 触发 403）。自动解析统一信封 {code,msg,data}，提供原始响应与业务断言两种粒度。
 *
 * 所有 get/post/put/delete/raw/expectData 均会按 maxResponseMs 做响应耗时断言（可配置）。
 */
export class ApiHelper {
  private readonly maxResponseMs: number;

  constructor(
    private readonly baseURL: string,
    private readonly defaultHeaders: Record<string, string> = {},
    options: ApiHelperInitOptions = {},
  ) {
    this.maxResponseMs = options.maxResponseMs ?? 0;
  }

  private buildUrl(path: string, query?: CallOptions['query']): string {
    const url = new URL(
      `${this.baseURL.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`,
    );
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  private mergeHeaders(headers?: Record<string, string>, hasBody = false): Record<string, string> {
    const merged: Record<string, string> = { ...this.defaultHeaders };
    if (hasBody) merged['content-type'] = 'application/json';

    for (const [key, value] of Object.entries(headers ?? {})) {
      const existingKey = Object.keys(merged).find(
        (candidate) => candidate.toLowerCase() === key.toLowerCase(),
      );
      if (existingKey) delete merged[existingKey];
      merged[key] = value;
    }

    return merged;
  }

  private resolveMaxDurationMs(opts: CallOptions): number {
    if (opts.maxDurationMs !== undefined) return opts.maxDurationMs;
    return resolveMaxApiResponseMs(this.maxResponseMs);
  }

  private assertDuration(
    method: HttpMethod | string,
    path: string,
    durationMs: number,
    maxDurationMs: number,
  ): void {
    assertApiResponseDuration(
      `${String(method).toUpperCase()} ${path}`,
      durationMs,
      maxDurationMs,
    );
  }

  private async send(
    method: HttpMethod,
    path: string,
    opts: CallOptions,
  ): Promise<{ res: Response; requestHeaders: Record<string, string> }> {
    const hasBody = opts.data !== undefined;
    const requestHeaders = this.mergeHeaders(opts.headers, hasBody);
    const res = await fetch(this.buildUrl(path, opts.query), {
      method: method.toUpperCase(),
      headers: requestHeaders,
      body: hasBody ? JSON.stringify(opts.data) : undefined,
    });
    return { res, requestHeaders };
  }

  private stepTitle(method: HttpMethod | string, path: string): string {
    return `${String(method).toUpperCase()} ${path}`;
  }

  private async withStep<T>(
    method: HttpMethod | string,
    path: string,
    opts: CallOptions,
    run: () => Promise<T>,
  ): Promise<T> {
    if (opts.step === false) return run();
    return test.step(this.stepTitle(method, path), run);
  }

  /** 原始响应（适配器形式），用于只关心 HTTP 状态/原文的断言。 */
  async raw(method: HttpMethod, path: string, opts: CallOptions = {}): Promise<RawResponse> {
    return this.withStep(method, path, opts, async () => {
      const maxDurationMs = this.resolveMaxDurationMs(opts);
      const started = Date.now();
      const { res, requestHeaders } = await this.send(method, path, opts);
      const text = await res.text();
      const durationMs = Date.now() - started;
      this.assertDuration(method, path, durationMs, maxDurationMs);
      const responseHeaders = headersToRecord(res.headers);

      return {
        status: () => res.status,
        json: async <T = any>() => JSON.parse(text) as T,
        text: async () => text,
        durationMs: () => durationMs,
        requestHeaders: () => requestHeaders,
        responseHeaders: () => responseHeaders,
      };
    });
  }

  async call<T = unknown>(
    method: HttpMethod,
    path: string,
    opts: CallOptions = {},
  ): Promise<ApiCallResult<T>> {
    return this.withStep(method, path, opts, async () => {
      const maxDurationMs = this.resolveMaxDurationMs(opts);
      const started = Date.now();
      const { res, requestHeaders } = await this.send(method, path, opts);
      const status = res.status;
      const text = await res.text();
      const durationMs = Date.now() - started;
      this.assertDuration(method, path, durationMs, maxDurationMs);
      const responseHeaders = headersToRecord(res.headers);

      let body: ApiResponse<T>;
      try {
        body = JSON.parse(text) as ApiResponse<T>;
      } catch {
        throw new Error(
          `非 JSON 响应（${method.toUpperCase()} ${path} -> HTTP ${status}）：${text.slice(0, 200)}`,
        );
      }
      return { status, body, durationMs, requestHeaders, responseHeaders };
    });
  }

  get<T = unknown>(path: string, opts: CallOptions = {}) {
    return this.call<T>('get', path, opts);
  }

  post<T = unknown>(path: string, data?: unknown, opts: CallOptions = {}) {
    return this.call<T>('post', path, { ...opts, data });
  }

  put<T = unknown>(path: string, data?: unknown, opts: CallOptions = {}) {
    return this.call<T>('put', path, { ...opts, data });
  }

  delete<T = unknown>(path: string, opts: CallOptions = {}) {
    return this.call<T>('delete', path, opts);
  }

  /** 请求并断言业务成功（code===0），返回 data。 */
  async expectData<T = unknown>(
    method: HttpMethod,
    path: string,
    opts: CallOptions = {},
  ): Promise<T> {
    const { body } = await this.call<T>(method, path, opts);
    if (body.code !== SUCCESS_CODE) {
      throw new Error(
        `接口业务失败 ${method.toUpperCase()} ${path}：code=${body.code} msg=${body.msg}`,
      );
    }
    return body.data;
  }
}
