/**
 * API 自动化项目级配置（非环境变量、非 CI 变量）。
 * 调整响应耗时 SLA 只改本文件即可。
 */

/**
 * 单次后端接口响应耗时上限（ms）。
 * - 适用于用例正文步骤（`logged*` / 用例内裸 `api.*`）
 * - fixture 造数（provision）与 cleanup 使用 `shared/data/infra.ts` 的 `INFRA_API_OPTS`（跳过耗时）
 * - `0` 表示关闭全局耗时断言
 * - 单次请求仍可用 `CallOptions.maxDurationMs` / `ApiLogOptions.maxDurationMs` 覆盖
 */
export const API_MAX_RESPONSE_MS = 2000;

/**
 * POST /shop/appointment/book 单独 SLA（ms）。
 * 约课要锁时段、写预约记录，常慢于通用 2s；只覆盖这一条，不抬全局上限。
 */
export const API_APPOINTMENT_BOOK_MAX_RESPONSE_MS = 5000;
