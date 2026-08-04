/**
 * API 自动化项目级配置（非环境变量、非 CI 变量）。
 * 调整响应耗时 SLA 只改本文件即可。
 */

/**
 * 单次后端接口响应耗时上限（ms）。
 * - `ApiHelper` / `loggedGet|Post|Raw` / `assertApiResponseDuration` 共用
 * - `0` 表示关闭全局耗时断言
 * - 单次请求仍可用 `CallOptions.maxDurationMs` / `ApiLogOptions.maxDurationMs` 覆盖
 */
export const API_MAX_RESPONSE_MS = 2000;
