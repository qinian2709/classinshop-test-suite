import { env, formatAuthorizationHeader } from '../../config/index.js';
import { createLogger } from '../utils/logger.js';
import { browserHeaders } from './browser-headers.js';
import type { ApiResponse } from './types.js';
import { SUCCESS_CODE } from './types.js';

const log = createLogger('http');

export interface ApiClientOptions {
  baseURL?: string;
  token?: string;
  shopDomain?: string;
  /** 额外默认请求头 */
  headers?: Record<string, string>;
  /** 单次请求超时（毫秒） */
  timeout?: number;
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  /** 覆盖默认 token */
  token?: string | null;
}

/**
 * 轻量 fetch 封装，供 auth 登录、数据准备/清理等非 Playwright 场景使用。
 * Playwright 用例内推荐用 @shared/fixtures 提供的 request fixture。
 */
export class ApiClient {
  private readonly baseURL: string;
  private token: string;
  private readonly shopDomain: string;
  private readonly defaultHeaders: Record<string, string>;
  private readonly timeout: number;

  constructor(options: ApiClientOptions = {}) {
    this.baseURL = (options.baseURL ?? env.apiBaseURL).replace(/\/$/, '');
    this.token = options.token ?? '';
    this.shopDomain = options.shopDomain ?? env.shopDomain;
    this.defaultHeaders = options.headers ?? {};
    this.timeout = options.timeout ?? 15_000;
  }

  setToken(token: string): void {
    this.token = token;
  }

  private buildUrl(path: string, query?: RequestOptions['query']): string {
    const url = new URL(`${this.baseURL}${path.startsWith('/') ? path : `/${path}`}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private buildHeaders(opts: RequestOptions): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...browserHeaders(),
      ...this.defaultHeaders,
      ...opts.headers,
    };
    if (this.shopDomain) headers['X-Shop-Domain'] = this.shopDomain;
    const token = opts.token === null ? '' : (opts.token ?? this.token);
    if (token) headers.Authorization = formatAuthorizationHeader(token);
    return headers;
  }

  async request<T = unknown>(
    method: string,
    path: string,
    opts: RequestOptions = {},
  ): Promise<ApiResponse<T>> {
    const url = this.buildUrl(path, opts.query);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      const res = await fetch(url, {
        method,
        headers: this.buildHeaders(opts),
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
      const text = await res.text();
      let parsed: ApiResponse<T>;
      try {
        parsed = JSON.parse(text) as ApiResponse<T>;
      } catch {
        throw new Error(
          `非 JSON 响应（${method} ${url} -> HTTP ${res.status}）：${text.slice(0, 200)}`,
        );
      }
      log.debug(`${method} ${path} -> http=${res.status} code=${parsed.code}`);
      return parsed;
    } finally {
      clearTimeout(timer);
    }
  }

  get<T = unknown>(path: string, opts: RequestOptions = {}): Promise<ApiResponse<T>> {
    return this.request<T>('GET', path, opts);
  }

  post<T = unknown>(
    path: string,
    body?: unknown,
    opts: RequestOptions = {},
  ): Promise<ApiResponse<T>> {
    return this.request<T>('POST', path, { ...opts, body });
  }

  put<T = unknown>(
    path: string,
    body?: unknown,
    opts: RequestOptions = {},
  ): Promise<ApiResponse<T>> {
    return this.request<T>('PUT', path, { ...opts, body });
  }

  delete<T = unknown>(path: string, opts: RequestOptions = {}): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', path, opts);
  }

  /** 请求并断言业务成功（code === 0），失败抛错，返回 data。 */
  async expectData<T = unknown>(
    method: string,
    path: string,
    opts: RequestOptions = {},
  ): Promise<T> {
    const resp = await this.request<T>(method, path, opts);
    if (resp.code !== SUCCESS_CODE) {
      throw new Error(`接口业务失败 ${method} ${path}：code=${resp.code} msg=${resp.msg}`);
    }
    return resp.data;
  }
}
