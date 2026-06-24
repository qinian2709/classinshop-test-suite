/**
 * 领域类型：手写最常用的核心结构，保证用例在未运行 codegen 时也能通过类型检查。
 * 完整、权威的接口类型可通过 `pnpm codegen:api` 由 swagger.json 生成到 shared/api/schema.d.ts，
 * 详见 docs/run-guide.md。
 */

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
}

export interface User {
  id: number;
  eeoUid?: number;
  nickname?: string;
  avatar?: string;
  phone?: string;
  isActive?: boolean;
}

export interface ShopInfo {
  id: number;
  orgId?: number;
  name: string;
  domain?: string;
  status?: number;
}

export interface Goods {
  id: number;
  title: string;
  price: number;
  status?: number;
  productId?: number;
}

export interface Order {
  id: number;
  orderNo?: string;
  status: number;
  amount?: number;
  goodsId?: number;
}

export interface Coupon {
  id: number;
  name?: string;
  amount?: number;
  status?: number;
}

export interface Address {
  id: number;
  receiverName: string;
  receiverPhone: string;
  province?: string;
  provinceCode?: string;
  city?: string;
  cityCode?: string;
  district?: string;
  districtCode?: string;
  detailAddress?: string;
  isDefault?: boolean;
}

export interface Appointment {
  id: number;
  status: number;
  teacherId?: number;
  startTime?: number;
  endTime?: number;
}
