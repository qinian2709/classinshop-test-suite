import type { ApiResponse } from '../http/types.js';
import { SUCCESS_CODE } from '../http/types.js';

export interface CallOptions {
  query?: Record<string, string | number | boolean | undefined>;
  data?: unknown;
  headers?: Record<string, string>;
}

export type HttpMethod = 'get' | 'post' | 'put' | 'delete';

/** raw() 的返回适配器，兼容此前基于 Playwright APIResponse 的用法（status() / json() / text()）。 */
export interface RawResponse {
  status: () => number;
  // 默认 any，便于在只读断言里直接访问 .code 等字段（与此前 Playwright APIResponse 用法一致）。
  json: <T = any>() => Promise<T>;
  text: () => Promise<string>;
}

/**
 * 基于 Node 原生 fetch（undici）的接口助手：默认 keep-alive 复用连接，避免被测环境 WAF
 * 对"高频新建连接"的拦截（Playwright APIRequestContext 在 test runner 下会每请求新建连接，
 * 触发 403）。自动解析统一信封 {code,msg,data}，提供原始响应与业务断言两种粒度。
 */
export class ApiHelper {
  constructor(
    private readonly baseURL: string,
    private readonly defaultHeaders: Record<string, string> = {},
  ) {}

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

  private async send(method: HttpMethod, path: string, opts: CallOptions): Promise<Response> {
    const headers: Record<string, string> = { ...this.defaultHeaders, ...opts.headers };
    const body = opts.data !== undefined ? JSON.stringify(opts.data) : undefined;
    return fetch(this.buildUrl(path, opts.query), {
      method: method.toUpperCase(),
      headers,
      body,
    });
  }

  /** 原始响应（适配器形式），用于只关心 HTTP 状态/原文的断言。 */
  async raw(method: HttpMethod, path: string, opts: CallOptions = {}): Promise<RawResponse> {
    const res = await this.send(method, path, opts);
    const text = await res.text();
    return {
      status: () => res.status,
      json: async <T = unknown>() => JSON.parse(text) as T,
      text: async () => text,
    };
  }

  async call<T = unknown>(
    method: HttpMethod,
    path: string,
    opts: CallOptions = {},
  ): Promise<{ status: number; body: ApiResponse<T> }> {
    const res = await this.send(method, path, opts);
    const status = res.status;
    const text = await res.text();
    let body: ApiResponse<T>;
    try {
      body = JSON.parse(text) as ApiResponse<T>;
    } catch {
      throw new Error(
        `非 JSON 响应（${method.toUpperCase()} ${path} -> HTTP ${status}）：${text.slice(0, 200)}`,
      );
    }
    return { status, body };
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
