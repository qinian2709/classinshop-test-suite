import { test, expect } from '@shared';
import { Endpoints, SUCCESS_CODE } from '@shared';
import {
  buildAddressPayload,
  buildCreateOrderPayload,
  pickGoods,
  pickNumber,
  asArray,
} from '@shared';

/**
 * 地址链路（依赖型接口示例）：创建地址 → 用返回的 addressId 设为默认 → 列表校验默认 → 清理。
 *
 * 关键点：
 *   - addressId 完全由「创建」接口返回，下游（设默认/列表/删除）都依赖它；
 *   - 用 data.register 登记删除，结束后自动清理，避免污染环境；
 *   - 下游消费方「下单」携带 deliveryRecord.addressId 默认跳过（避免脏单），
 *     需 TEST_ALLOW_ORDER_CREATE=1 才真实下单。
 */

const allowCreate = process.env.TEST_ALLOW_ORDER_CREATE === '1';

test.describe('地址链路（依赖创建返回的 addressId）', () => {
  test('创建 → 设默认 → 列表校验 → 算价/下单消费 → 清理', async ({ api, data }) => {
    let addressId: number | undefined;

    await test.step('创建地址（上游，产出 addressId）', async () => {
      const { body } = await api.post(Endpoints.user.addressCreate, buildAddressPayload());
      expect(body.code, body.msg).toBe(SUCCESS_CODE);
      addressId = pickNumber(body.data, ['id', 'addressId', 'address_id']);
      expect(addressId, '创建地址应返回 id').toBeTruthy();
      data.register(`address ${addressId}`, async () => {
        await api.post(Endpoints.user.addressDelete, { id: addressId });
      });
    });

    await test.step('设为默认（下游，依赖 addressId）', async () => {
      const { body } = await api.post(Endpoints.user.addressSetDefault, { id: addressId });
      expect(body.code, body.msg).toBe(SUCCESS_CODE);
    });

    await test.step('列表校验该地址为默认（下游，依赖 addressId）', async () => {
      const { body } = await api.get(Endpoints.user.addressList);
      expect(body.code, body.msg).toBe(SUCCESS_CODE);
      const found = asArray(body.data).find(
        (a) => pickNumber(a, ['id', 'addressId', 'address_id']) === addressId,
      );
      expect(found, '列表应包含新建地址').toBeTruthy();
      expect(Boolean(found?.['isDefault']), '新建地址应为默认').toBe(true);
    });

    // 下游消费方「带地址下单」为可选步骤：用普通条件分支而非 test.skip，
    // 避免把整条已验证的主链（创建/设默认/列表）误标为 skipped。
    if (allowCreate) {
      await test.step('选配：下单携带 deliveryRecord.addressId（下游消费方）', async () => {
        const goods = await pickGoods(api);
        if (!goods) return;
        const { body } = await api.post(
          Endpoints.goods.orderCreate,
          buildCreateOrderPayload({ goodsId: goods.goodsId, skuId: goods.skuId, addressId }),
        );
        expect(typeof body.code).toBe('number');
      });
    }
  });
});
