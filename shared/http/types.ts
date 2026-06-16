/** 后端统一响应信封：见 internal/middleware/context.go 的 Response{Code,Msg,Data}。 */
export interface ApiResponse<T = unknown> {
  code: number;
  msg: string;
  data: T;
}

/** 列表分页 data 结构：见 ApiContext.SuccessList。 */
export interface ListData<T = unknown> {
  total: number;
  list: T[];
  page: number;
  limit: number;
}

/** 业务成功码（pkg/errors.Success = 0）。 */
export const SUCCESS_CODE = 0;
/** 未授权（pkg/errors.ErrUnauthorized = 401）。 */
export const ERR_UNAUTHORIZED = 401;
/** 参数错误（pkg/errors.ErrSystemParam = 10004）。 */
export const ERR_SYSTEM_PARAM = 10004;

export function isSuccess<T>(resp: ApiResponse<T>): boolean {
  return resp.code === SUCCESS_CODE;
}
