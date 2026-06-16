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
