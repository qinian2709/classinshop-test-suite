import type { APIRequestContext, APIResponse } from '@playwright/test';
import type { ApiResponse } from '../http/types.js';
import { SUCCESS_CODE } from '../http/types.js';

export interface CallOptions {
  query?: Record<string, string | number | boolean | undefined>;
  data?: unknown;
  headers?: Record<string, string>;
}

/**
 * 基于 Playwright APIRequestContext 的接口助手：自动解析统一信封 {code,msg,data}，
 * 提供原始响应与业务断言两种粒度。鉴权头在创建 context 时统一注入。
 */
export class ApiHelper {
  constructor(private readonly ctx: APIRequestContext) {}

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

  async raw(
    method: 'get' | 'post' | 'put' | 'delete',
    path: string,
    opts: CallOptions = {},
  ): Promise<APIResponse> {
    const params = this.toParams(opts.query);
    const init = { params, data: opts.data, headers: opts.headers };
    switch (method) {
      case 'get':
        return this.ctx.get(path, { params, headers: opts.headers });
      case 'delete':
        return this.ctx.delete(path, init);
      case 'put':
        return this.ctx.put(path, init);
      default:
        return this.ctx.post(path, init);
    }
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
