import { test, expect } from '@shared';
import { Endpoints, SUCCESS_CODE, attachApiCallLog } from '@shared';
import { buildAddressPayload } from '@shared';

/**
 * 用户地址管理（需登录）。
 * 覆盖接口：
 *   GET  /user/address/list    — 地址列表
 *   POST /user/address         — 新建地址
 *   POST /user/address/update  — 更新地址
 *   POST /user/address/delete  — 删除地址
 *   POST /user/address/default — 设为默认
 *
 * author：qiukailiang
 */

interface Address {
  id: number;
  receiverName: string;
  receiverPhone: string;
  province: string;
  city: string;
  district: string;
  detailAddress: string;
  isDefault: boolean;
}

// ── 地址列表 ──────────────────────────────────────────────────────────────

test.describe('用户地址管理', () => {
  test('GET /user/address/list 返回地址列表', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.user.addressList}`;
    const { status, body } = await api.get<Address[]>(Endpoints.user.addressList);

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-地址列表.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', '地址列表应为数组'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(Array.isArray(body.data), '地址列表应为数组').toBe(true);
  });

  test('未登录访问地址列表应被拒绝', async ({ anonApi, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.user.addressList}`;
    const res = await anonApi.raw('get', Endpoints.user.addressList);
    const body = res.status() === 200 ? await res.json() : null;

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-地址列表-未登录.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status: res.status(), headers: {}, body },
      assertions: ['未登录应返回 4xx 或非成功业务码'],
    });

    if (res.status() === 200) {
      expect(body.code, '未登录应返回非成功业务码').not.toBe(SUCCESS_CODE);
    } else {
      expect(res.status(), '未登录应返回 4xx').toBeGreaterThanOrEqual(400);
    }
  });

  // ── 新建地址（异常场景）──────────────────────────────────────────────

  test('POST /user/address 缺少必填字段应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.user.addressCreate}`;
    const { status, body } = await api.post(Endpoints.user.addressCreate, { name: '' });

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-新建地址-缺少必填.json',
      request: { method: 'POST', url, headers: {}, body: { name: '' } },
      response: { status, headers: {}, body },
      assertions: ['缺少必填字段应返回非成功业务码'],
    });

    expect(body.code, '缺少必填字段应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  // test('POST /user/address 手机号格式非法应失败', async ({ api, env }) => {
  //   const payload = buildAddressPayload({ phone: '123' });
  //   const url = `${env.apiBaseURL}${Endpoints.user.addressCreate}`;
  //   const { status, body } = await api.post(Endpoints.user.addressCreate, payload);

  //   await attachApiCallLog({
  //     testInfo: test.info(),
  //     name: '请求日志-新建地址-非法手机号.json',
  //     request: { method: 'POST', url, headers: {}, body: payload },
  //     response: { status, headers: {}, body },
  //     assertions: ['非法手机号格式应返回非成功业务码'],
  //   });

  //   expect(body.code, '非法手机号格式应返回非成功业务码').not.toBe(SUCCESS_CODE);
  // });

  // ── 完整生命周期：创建 → 更新 → 设为默认 → 删除 ─────────────────────

  test('地址生命周期：创建 -> 更新 -> 设为默认 -> 删除', async ({ api, data, env }) => {
    // 先检查是否有余量
    const { body: listBody } = await api.get<Address[]>(Endpoints.user.addressList);
    expect(listBody.code, '获取地址列表应成功').toBe(SUCCESS_CODE);
    test.skip(
      Array.isArray(listBody.data) && listBody.data.length >= 20,
      '收货地址已达上限 20 条，跳过创建链路',
    );

    // 1. 创建
    const createPayload = buildAddressPayload();
    const createUrl = `${env.apiBaseURL}${Endpoints.user.addressCreate}`;
    const { body: created } = await api.post<Address>(Endpoints.user.addressCreate, createPayload);

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-地址生命周期-创建.json',
      request: { method: 'POST', url: createUrl, headers: {}, body: createPayload },
      response: { status: 200, headers: {}, body: created },
      assertions: ['创建地址业务 code 应为成功码', '应返回地址 id'],
    });

    expect(created.code, `创建地址失败：${created.msg}`).toBe(SUCCESS_CODE);
    const addressId = created.data?.id;
    expect(addressId, '应返回地址 id').toBeTruthy();

    // 注册清理
    data.register(`删除测试地址 ${addressId}`, async () => {
      await api.post(Endpoints.user.addressDelete, { id: addressId });
    });

    // 2. 验证在列表中存在
    const { body: afterCreate } = await api.get<Address[]>(Endpoints.user.addressList);
    expect(afterCreate.code, '新建后获取地址列表应成功').toBe(SUCCESS_CODE);
    expect(
      afterCreate.data.some((a) => a.id === addressId),
      '新建地址应出现在列表中',
    ).toBe(true);

    // 3. 更新地址
    const updatePayload = { id: addressId, ...createPayload, receiverName: '自动化更新姓名' };
    const updateUrl = `${env.apiBaseURL}${Endpoints.user.addressUpdate}`;
    const { body: updated } = await api.post(Endpoints.user.addressUpdate, updatePayload);

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-地址生命周期-更新.json',
      request: { method: 'POST', url: updateUrl, headers: {}, body: updatePayload },
      response: { status: 200, headers: {}, body: updated },
      assertions: ['更新地址业务 code 应为成功码'],
    });

    expect(updated.code, `更新地址失败：${updated.msg}`).toBe(SUCCESS_CODE);

    // 4. 验证更新后姓名
    const { body: afterUpdate } = await api.get<Address[]>(Endpoints.user.addressList);
    const updatedAddr = afterUpdate.data?.find((a) => a.id === addressId);
    expect(updatedAddr?.receiverName, '更新后地址姓名应为新值').toBe('自动化更新姓名');

    // 5. 设为默认
    const defaultUrl = `${env.apiBaseURL}${Endpoints.user.addressSetDefault}`;
    const { body: setDefault } = await api.post(Endpoints.user.addressSetDefault, { id: addressId });

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-地址生命周期-设为默认.json',
      request: { method: 'POST', url: defaultUrl, headers: {}, body: { id: addressId } },
      response: { status: 200, headers: {}, body: setDefault },
      assertions: ['设为默认地址业务 code 应为成功码'],
    });

    expect(setDefault.code, `设为默认地址失败：${setDefault.msg}`).toBe(SUCCESS_CODE);

    // 6. 验证默认标记
    const { body: afterDefault } = await api.get<Address[]>(Endpoints.user.addressList);
    const defaultAddr = afterDefault.data?.find((a) => a.id === addressId);
    expect(defaultAddr?.isDefault, '设为默认后 isDefault 应为 true').toBe(true);

    // 7. 删除（生命周期最后一步，data registry 也会执行，可用成功码判断幂等）
    const deleteUrl = `${env.apiBaseURL}${Endpoints.user.addressDelete}`;
    const { body: deleted } = await api.post(Endpoints.user.addressDelete, { id: addressId });

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-地址生命周期-删除.json',
      request: { method: 'POST', url: deleteUrl, headers: {}, body: { id: addressId } },
      response: { status: 200, headers: {}, body: deleted },
      assertions: ['删除地址业务 code 应为成功码'],
    });

    expect(deleted.code, `删除地址失败：${deleted.msg}`).toBe(SUCCESS_CODE);

    // 8. 验证已不在列表中
    const { body: afterDelete } = await api.get<Address[]>(Endpoints.user.addressList);
    expect(
      afterDelete.data?.some((a) => a.id === addressId),
      '删除后地址不应出现在列表中',
    ).toBe(false);
  });

  // ── 异常场景 ──────────────────────────────────────────────────────────

  test('POST /user/address/update 更新不存在地址应失败', async ({ api, env }) => {
    const payload = { id: 999999999, ...buildAddressPayload() };
    const url = `${env.apiBaseURL}${Endpoints.user.addressUpdate}`;
    const { status, body } = await api.post(Endpoints.user.addressUpdate, payload);

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-更新地址-不存在.json',
      request: { method: 'POST', url, headers: {}, body: payload },
      response: { status, headers: {}, body },
      assertions: ['更新不存在地址应返回非成功业务码'],
    });

    expect(body.code, '更新不存在地址应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  test('POST /user/address/delete 删除不存在地址应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.user.addressDelete}`;
    const { status, body } = await api.post(Endpoints.user.addressDelete, { id: 999999999 });

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-删除地址-不存在.json',
      request: { method: 'POST', url, headers: {}, body: { id: 999999999 } },
      response: { status, headers: {}, body },
      assertions: ['删除不存在地址应返回非成功业务码'],
    });

    expect(body.code, '删除不存在地址应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });

  test('POST /user/address/default 设置不存在地址为默认应失败', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.user.addressSetDefault}`;
    const { status, body } = await api.post(Endpoints.user.addressSetDefault, { id: 999999999 });

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-设为默认-不存在.json',
      request: { method: 'POST', url, headers: {}, body: { id: 999999999 } },
      response: { status, headers: {}, body },
      assertions: ['设置不存在地址为默认应返回非成功业务码'],
    });

    expect(body.code, '设置不存在地址为默认应返回非成功业务码').not.toBe(SUCCESS_CODE);
  });
});
