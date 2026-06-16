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

/** 收货地址入参（对应 CreateUserAddress）。 */
export interface AddressPayload {
  name: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  detail: string;
  isDefault?: boolean;
  [key: string]: unknown;
}

export function buildAddressPayload(overrides: Partial<AddressPayload> = {}): AddressPayload {
  return {
    name: uniqueName('收货人'),
    phone: randomPhone(),
    province: '北京市',
    city: '北京市',
    district: '海淀区',
    detail: `自动化测试地址 ${randomString(4)}`,
    isDefault: false,
    ...overrides,
  };
}

/** 下单入参（对应 CreateGoodsOrder / CalculateOrderPrice 的常用字段）。 */
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
