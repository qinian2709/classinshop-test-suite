import { test, expect } from '@shared';
import { Endpoints, SUCCESS_CODE } from '@shared';
import type { ListData } from '@shared';
import type { Goods } from '@shared';

/**
 * 店铺与商品（C 端公开）：通过 X-Shop-Domain 命中 GetShopByDomain 中间件。
 * 需配置 SHOP_DOMAIN，否则整组跳过。
 */
test.describe('店铺与商品目录', () => {
  test.skip(({ env }) => !env.shopDomain, '未配置 SHOP_DOMAIN，跳过店铺维度用例');

  test('GET /shop/info 返回当前店铺信息', async ({ anonApi }) => {
    const { body } = await anonApi.get(Endpoints.shop.info);
    expect(body.code).toBe(SUCCESS_CODE);
  });

  test('GET /shop/decoration 返回店铺装修', async ({ anonApi }) => {
    const { body } = await anonApi.get(Endpoints.shop.decoration);
    expect(body.code).toBe(SUCCESS_CODE);
  });

  test('GET /shop/goods 返回商品列表结构', async ({ anonApi }) => {
    const { body } = await anonApi.get<ListData<Goods>>(Endpoints.shop.goodsList, {
      query: { page: 1, limit: 10 },
    });
    expect(body.code).toBe(SUCCESS_CODE);
    if (body.data && Array.isArray(body.data.list)) {
      expect(typeof body.data.total).toBe('number');
    }
  });

  test('GET /shop/goods/:id 不存在的商品应返回非成功码', async ({ anonApi }) => {
    const { body } = await anonApi.get(Endpoints.shop.goodsDetail(999999999));
    expect(body.code).not.toBe(SUCCESS_CODE);
  });
});
