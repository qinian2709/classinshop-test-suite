import { test, expect } from '@shared';
import { Endpoints, SUCCESS_CODE } from '@shared';
import { buildAddressPayload } from '@shared';
import type { Address } from '@shared';

/**
 * 收货地址（需登录）：演示"创建 -> 校验 -> 自动清理"的完整数据生命周期，
 * 通过 data 登记表在用例结束后删除创建的地址，避免污染环境。
 */
test.describe('收货地址', () => {
  test('GET /user/address/list 返回地址列表', async ({ api }) => {
    const { body } = await api.get<Address[]>(Endpoints.user.addressList);
    expect(body.code).toBe(SUCCESS_CODE);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('创建地址后可在列表中查到，并在结束后清理', async ({ api, data }) => {
    const { body: beforeList } = await api.get<Address[]>(Endpoints.user.addressList);
    expect(beforeList.code).toBe(SUCCESS_CODE);
    expect(Array.isArray(beforeList.data)).toBe(true);
    test.skip(beforeList.data.length >= 20, '当前账号收货地址已达上限，跳过创建链路');

    const payload = buildAddressPayload();
    const { body: created } = await api.post<Address>(Endpoints.user.addressCreate, payload);

    // 部分环境可能限制创建，非成功时给出明确信息而非静默通过
    expect(created.code, `创建地址失败：${created.msg}`).toBe(SUCCESS_CODE);
    const addressId = created.data?.id;
    if (addressId) {
      data.register(`删除地址 ${addressId}`, async () => {
        await api.post(Endpoints.user.addressDelete, { id: addressId });
      });
    }

    const { body: list } = await api.get<Address[]>(Endpoints.user.addressList);
    expect(list.code).toBe(SUCCESS_CODE);
    expect(list.data.some((address) => address.id === addressId)).toBe(true);
  });

  test('创建地址缺少必填字段应失败', async ({ api }) => {
    const { body } = await api.post(Endpoints.user.addressCreate, { name: '' });
    expect(body.code).not.toBe(SUCCESS_CODE);
  });
});
