import { test as base, expect } from '@playwright/test';
import { env, accounts, hasApiCredential, hasMobileCredential } from '../../config/index.js';
import { resolveAuthTokens } from '../auth/login.js';
import { DataRegistry } from '../data/cleanup.js';
import {
  pickGoods,
  pickRefundableOrder,
  pickAvailableCoupon,
  pickReceivableCoupon,
  pickAppointmentOrderItem,
} from '../data/discovery.js';
import { provisionPublishedFixedGoods } from '../data/goods-provision.js';
import { provisionStudentAppointmentOrderItem } from '../data/appointment-provision.js';
import type { StudentAppointmentOrderItem } from '../data/appointment-provision.js';
import type {
  SampleGoods,
  RefundableOrder,
  AvailableCoupon,
  AppointmentOrderItem,
} from '../data/discovery.js';
import { browserHeaders, authHeader } from '../http/browser-headers.js';
import { Endpoints } from '../api/endpoints.js';
import { SUCCESS_CODE } from '../http/types.js';
import { ApiHelper } from './api-helper.js';

export interface ApiWorkerFixtures {
  /** 已登录 token（worker 级，避免每个用例重复登录） */
  workerToken: string;
  /** C 端用户 accessToken（worker 级） */
  workerMobileToken: string;
  /** worker 启动时自动解析双端 token（auto fixture） */
  bootstrapAuth: void;
}

export interface ApiFixtures {
  /** 当前被测环境信息 */
  env: typeof env;
  /** 已登录用户的 accessToken */
  token: string;
  /** C 端用户 accessToken */
  mobileToken: string;
  /** 匿名（未鉴权）接口助手，仅注入浏览器指纹头 + X-Shop-Domain */
  anonApi: ApiHelper;
  /** 已鉴权接口助手，注入 Authorization + 浏览器指纹头 + X-Shop-Domain */
  api: ApiHelper;
  /** C 端已鉴权接口助手（学生/用户 token + X-Shop-Domain） */
  mobileApi: ApiHelper;
  /** 测试数据登记表，结束后自动清理 */
  data: DataRegistry;
  /** 依赖型 fixture：一个可用于算价/下单的真实商品（含 skuId）。无在售商品时自动跳过用例。 */
  sampleGoods: SampleGoods;
  /** 依赖型 fixture：一个可退款订单。无订单时自动跳过用例。 */
  refundableOrder: RefundableOrder;
  /** 依赖型 fixture：一张可领取优惠券（依赖店铺维度）。无可领券时自动跳过用例。 */
  availableCoupon: AvailableCoupon;
  /** 依赖型 fixture：商家上架的固定课测试商品（绑定班级 → 上架 → 结束后删除）。 */
  publishedSampleGoods: SampleGoods;
  /** 依赖型 fixture：一个可发起约课的订单项。无可约订单项时自动跳过用例。 */
  appointmentOrderItem: AppointmentOrderItem;
  /** 依赖型 fixture：零元预约课上架 + 学生下单，产出可约课 orderItemId。 */
  studentAppointmentOrderItem: StudentAppointmentOrderItem;
}

function shopHeaders(): Record<string, string> {
  return env.mobileBaseURL ? { 'X-Shop-Domain': env.mobileBaseURL } : {};
}

/**
 * 接口助手基于 Node fetch（keep-alive 复用连接）。被测环境 WAF 会拦截高频新建连接，
 * 故不使用 Playwright APIRequestContext（其在 test runner 下倾向每请求新建连接，触发 403）。
 */
export const test = base.extend<ApiFixtures, ApiWorkerFixtures>({
  workerToken: [
    async ({}, use) => {
      await resolveAuthTokens();
      await use(accounts.token);
    },
    { scope: 'worker' },
  ],

  workerMobileToken: [
    async ({}, use) => {
      await resolveAuthTokens();
      await use(accounts.mobileToken);
    },
    { scope: 'worker' },
  ],

  bootstrapAuth: [
    async ({}, use) => {
      await resolveAuthTokens();
      await use(undefined);
    },
    { scope: 'worker', auto: true },
  ],

  env: async ({}, use) => {
    await use(env);
  },

  token: async ({ workerToken }, use) => {
    if (!hasApiCredential() && !workerToken) {
      test.skip(true, '未配置商家/教师端鉴权凭据（TEST_TOKEN、TEST_PHONE_NUMBER 或签名），跳过需登录用例');
    }
    await use(workerToken);
  },

  mobileToken: async ({ workerMobileToken }, use) => {
    if (!hasMobileCredential() && !workerMobileToken) {
      test.skip(true, '未配置用户/C 端鉴权凭据（MOBILE_TEST_TOKEN 或 MOBILE_TEST_PHONE_NUMBER），跳过 C 端用例');
    }
    await use(workerMobileToken);
  },

  anonApi: async ({}, use) => {
    const helper = new ApiHelper(env.apiBaseURL, {
      ...browserHeaders(),
      ...shopHeaders(),
    });
    await use(helper);
  },

  api: async ({ workerToken }, use) => {
    if (!hasApiCredential() && !workerToken) {
      test.skip(true, '未配置商家/教师端鉴权凭据（TEST_TOKEN、TEST_PHONE_NUMBER 或签名），跳过需登录用例');
    }
    const helper = new ApiHelper(env.apiBaseURL, {
      ...browserHeaders(),
      ...authHeader(workerToken),
      ...shopHeaders(),
    });
    await use(helper);
  },

  mobileApi: async ({ workerMobileToken }, use) => {
    if (!hasMobileCredential() && !workerMobileToken) {
      test.skip(true, '未配置用户/C 端鉴权凭据（MOBILE_TEST_TOKEN 或 MOBILE_TEST_PHONE_NUMBER），跳过 C 端用例');
    }
    const helper = new ApiHelper(env.apiBaseURL, {
      ...browserHeaders(),
      ...authHeader(workerMobileToken),
      ...shopHeaders(),
    });
    await use(helper);
  },

  data: async ({}, use) => {
    const registry = new DataRegistry();
    await use(registry);
    await registry.runAll();
  },

  sampleGoods: async ({ api }, use) => {
    const goods = await pickGoods(api);
    test.skip(!goods, '环境无可用在售商品（可配置 TEST_GOODS_ID/TEST_SKU_ID），跳过依赖商品的链路');
    await use(goods as SampleGoods);
  },

  refundableOrder: async ({ api }, use) => {
    const order = await pickRefundableOrder(api);
    test.skip(!order, '环境无可退款订单（可配置 TEST_REFUND_ORDER_ID），跳过依赖订单的链路');
    await use(order as RefundableOrder);
  },

  availableCoupon: async ({ api, mobileApi, data }, use) => {
    if (!env.shopId) {
      test.skip(true, '未配置 SHOP_ID，跳过依赖优惠券的链路');
    }

    let coupon = await pickReceivableCoupon(api, mobileApi, env.shopId);
    if (!coupon) {
      const now = Math.floor(Date.now() / 1000);
      const { body } = await api.post<{ id: number }>(Endpoints.shopAdmin.couponCreate(env.shopId), {
        name: `flow测试券-${now}`,
        type: 1,
        discountAmount: 1,
        thresholdAmount: 0,
        discountRate: 0,
        stockTotal: 10,
        receiveLimitPerUser: 5,
        startTime: now - 60,
        endTime: now + 60 * 60 * 24,
        productIds: [],
      });
      if (body.code === SUCCESS_CODE && body.data?.id) {
        coupon = { couponId: body.data.id, name: `flow测试券-${now}` };
        const couponId = coupon.couponId;
        data.register(`停用 flow 测试券 ${couponId}`, async () => {
          await api.post(Endpoints.shopAdmin.couponStatus(env.shopId), { id: couponId, status: 1 });
        });
      }
    }

    test.skip(!coupon, '无法准备 C 端可领取优惠券，跳过依赖优惠券的链路');
    await use(coupon as AvailableCoupon);
  },

  publishedSampleGoods: async ({ api, env }, use) => {
    if (!env.shopId) {
      test.skip(true, '未配置 SHOP_ID，跳过需上架测试商品的链路');
    }
    const goods = await provisionPublishedFixedGoods(api, {
      shopId: env.shopId,
      keep: true,
      price: 0,
      namePrefix: 'flow固定课',
    });
    test.skip(!goods, '无法上架固定课测试商品（需 ClassIn 班级），跳过固定课下单链路');
    await use(goods as SampleGoods);
  },

  appointmentOrderItem: async ({ api }, use) => {
    const item = await pickAppointmentOrderItem(api);
    test.skip(
      !item,
      '环境无可约课订单项（可配置 TEST_APPT_ORDER_ITEM_ID），跳过依赖约课订单的链路',
    );
    await use(item as AppointmentOrderItem);
  },

  studentAppointmentOrderItem: async ({ api, mobileApi, env }, use) => {
    if (!env.shopId) {
      test.skip(true, '未配置 SHOP_ID，跳过需上架零元约课商品的链路');
    }
    if (!hasMobileCredential()) {
      test.skip(true, '未配置 C 端鉴权（MOBILE_TEST_PHONE_NUMBER），跳过学生约课订单链路');
    }
    const item = await provisionStudentAppointmentOrderItem(api, mobileApi, {
      shopId: env.shopId,
      keep: true,
    });
    test.skip(!item, '无法准备学生约课订单项（需启用约课老师），跳过约课链路');
    await use(item as StudentAppointmentOrderItem);
  },
});

export { expect, accounts, env, ApiHelper };
