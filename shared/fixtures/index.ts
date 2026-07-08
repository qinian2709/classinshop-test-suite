import { test as base, expect } from '@playwright/test';
import { env, accounts, hasApiCredential } from '../../config/index.js';
import { resolveAuthTokens } from '../auth/login.js';
import { DataRegistry } from '../data/cleanup.js';
import {
  pickGoods,
  pickRefundableOrder,
  pickAvailableCoupon,
  pickAppointmentOrderItem,
} from '../data/discovery.js';
import type {
  SampleGoods,
  RefundableOrder,
  AvailableCoupon,
  AppointmentOrderItem,
} from '../data/discovery.js';
import { browserHeaders, authHeader } from '../http/browser-headers.js';
import { ApiHelper } from './api-helper.js';

export interface ApiWorkerFixtures {
  /** 已登录 token（worker 级，避免每个用例重复登录） */
  workerToken: string;
  /** worker 启动时自动解析双端 token（auto fixture） */
  bootstrapAuth: void;
}

export interface ApiFixtures {
  /** 当前被测环境信息 */
  env: typeof env;
  /** 已登录用户的 accessToken */
  token: string;
  /** 匿名（未鉴权）接口助手，仅注入浏览器指纹头 + X-Shop-Domain */
  anonApi: ApiHelper;
  /** 已鉴权接口助手，注入 Authorization + 浏览器指纹头 + X-Shop-Domain */
  api: ApiHelper;
  /** 测试数据登记表，结束后自动清理 */
  data: DataRegistry;
  /** 依赖型 fixture：一个可用于算价/下单的真实商品（含 skuId）。无在售商品时自动跳过用例。 */
  sampleGoods: SampleGoods;
  /** 依赖型 fixture：一个可退款订单。无订单时自动跳过用例。 */
  refundableOrder: RefundableOrder;
  /** 依赖型 fixture：一张可领取优惠券（依赖店铺维度）。无可领券时自动跳过用例。 */
  availableCoupon: AvailableCoupon;
  /** 依赖型 fixture：一个可发起约课的订单项。无可约订单项时自动跳过用例。 */
  appointmentOrderItem: AppointmentOrderItem;
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

  availableCoupon: async ({ api }, use) => {
    const coupon = await pickAvailableCoupon(api);
    test.skip(!coupon, '环境无可领取优惠券（需配置 MOBILE_BASE_URL），跳过依赖优惠券的链路');
    await use(coupon as AvailableCoupon);
  },

  appointmentOrderItem: async ({ api }, use) => {
    const item = await pickAppointmentOrderItem(api);
    test.skip(
      !item,
      '环境无可约课订单项（可配置 TEST_APPT_ORDER_ITEM_ID），跳过依赖约课订单的链路',
    );
    await use(item as AppointmentOrderItem);
  },
});

export { expect, accounts, env, ApiHelper };
