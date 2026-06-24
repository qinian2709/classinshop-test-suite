import type { ApiResponse } from '../http/types.js';
import { SUCCESS_CODE } from '../http/types.js';

export interface CallOptions {
  query?: Record<string, string | number | boolean | undefined>;
  data?: unknown;
  headers?: Record<string, string>;
}

interface RawApiResponse {
  status(): number;
  text(): Promise<string>;
  json<T = any>(): Promise<T>;
}

/**
 * 基于 fetch 的接口助手：自动解析统一信封 {code,msg,data}，
 * 提供原始响应与业务断言两种粒度。鉴权头在创建 context 时统一注入。
 *
 * 14 环境网关对 APIRequestContext 的请求形态较敏感，fetch 更接近前端真实请求。
 */
export class ApiHelper {
  constructor(
    private readonly baseURL: string,
    private readonly extraHTTPHeaders: Record<string, string> = {},
  ) {}

  private toParams(
    query?: CallOptions['query'],
  ): Record<string, string | number | boolean> | undefined {
    if (!query) return undefined;
    const params: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) params[k] = v;
    }
    return params;
  }

  private buildUrl(path: string, query?: CallOptions['query']): string {
    const url = new URL(`${this.baseURL}${path}`);
    const params = this.toParams(query);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private mergeHeaders(headers?: Record<string, string>, hasBody = false): Record<string, string> {
    const merged: Record<string, string> = { ...this.extraHTTPHeaders };
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

  async raw(
    method: 'get' | 'post' | 'put' | 'delete',
    path: string,
    opts: CallOptions = {},
  ): Promise<RawApiResponse> {
    const hasBody = opts.data !== undefined;
    const response = await fetch(this.buildUrl(path, opts.query), {
      method: method.toUpperCase(),
      headers: this.mergeHeaders(opts.headers, hasBody),
      body: hasBody ? JSON.stringify(opts.data) : undefined,
    });

    return {
      status: () => response.status,
      text: () => response.text(),
      json: () => response.json(),
    };
  }

  async call<T = unknown>(
    method: 'get' | 'post' | 'put' | 'delete',
    path: string,
    opts: CallOptions = {},
  ): Promise<{ status: number; body: ApiResponse<T> }> {
    const res = await this.raw(method, path, opts);
    const status = res.status();
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
    method: 'get' | 'post' | 'put' | 'delete',
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
