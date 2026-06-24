import { randomPhone, uniqueName, randomString } from '../utils/random.js';

/** 注册用户入参（对应 requests.SignupUserOption 的常用字段）。 */
export interface SignupPayload {
  phone: string;
  password: string;
  verificationCode?: string;
  nickname?: string;
  [key: string]: unknown;
}

export function buildSignupPayload(overrides: Partial<SignupPayload> = {}): SignupPayload {
  return {
    phone: randomPhone(),
    password: `Test@${randomString(6)}`,
    nickname: uniqueName('user'),
    ...overrides,
  };
}

/** 收货地址入参（对应 requests.CreateUserAddressReq，字段均 required）。 */
export interface AddressPayload {
  receiverName: string;
  receiverPhone: string;
  province: string;
  provinceCode: string;
  city: string;
  cityCode: string;
  district: string;
  districtCode: string;
  detailAddress: string;
  isDefault?: boolean;
  [key: string]: unknown;
}

export function buildAddressPayload(overrides: Partial<AddressPayload> = {}): AddressPayload {
  return {
    receiverName: uniqueName('收货人'),
    receiverPhone: randomPhone(),
    province: '北京市',
    provinceCode: '110000',
    city: '北京市',
    cityCode: '110100',
    district: '海淀区',
    districtCode: '110108',
    detailAddress: `自动化测试地址 ${randomString(4)}`,
    isDefault: false,
    ...overrides,
  };
}

/** 简化下单入参，仅用于「缺字段/非法值」等异常用例。正向链路请用下面的工厂。 */
export interface OrderPayload {
  goodsId: number;
  num: number;
  couponId?: number;
  addressId?: number;
  [key: string]: unknown;
}

export function buildOrderPayload(
  goodsId: number,
  overrides: Partial<OrderPayload> = {},
): OrderPayload {
  return {
    goodsId,
    num: 1,
    ...overrides,
  };
}

/** 算价商品项（对应 requests.CalculateOrderGoodsItem，goodsId/skuId/quantity 必填）。 */
export interface CalculateGoodsItem {
  goodsId: number;
  skuId: number;
  quantity: number;
  price?: number;
}

/** 算价入参（对应 requests.CalculateOrderPriceRequest）。 */
export interface CalculatePayload {
  goods: CalculateGoodsItem[];
  userCouponId?: number;
  activityId?: number;
  ruleId?: number;
  [key: string]: unknown;
}

export interface BuildCalculateInput {
  goodsId: number;
  skuId: number;
  quantity?: number;
  userCouponId?: number;
}

export function buildCalculatePayload(input: BuildCalculateInput): CalculatePayload {
  return {
    goods: [{ goodsId: input.goodsId, skuId: input.skuId, quantity: input.quantity ?? 1 }],
    ...(input.userCouponId ? { userCouponId: input.userCouponId } : {}),
  };
}

/** 下单入参（对应 requests.CreateGoodsOrderRequest，goodsId/skuId 必填）。 */
export interface CreateOrderPayload {
  goodsId: number;
  skuId: number;
  quantity: number;
  userCouponId?: number;
  payChannel?: number;
  deliveryRecord?: { addressId: number };
  [key: string]: unknown;
}

export interface BuildCreateOrderInput {
  goodsId: number;
  skuId: number;
  quantity?: number;
  userCouponId?: number;
  addressId?: number;
  payChannel?: number;
}

export function buildCreateOrderPayload(input: BuildCreateOrderInput): CreateOrderPayload {
  return {
    goodsId: input.goodsId,
    skuId: input.skuId,
    quantity: input.quantity ?? 1,
    payChannel: input.payChannel ?? 0,
    ...(input.userCouponId ? { userCouponId: input.userCouponId } : {}),
    ...(input.addressId ? { deliveryRecord: { addressId: input.addressId } } : {}),
  };
}
