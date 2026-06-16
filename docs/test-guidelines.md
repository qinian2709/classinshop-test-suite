# 用例编写规范

## 目录与命名

- 接口用例放 `tests/api/<域>.spec.ts`，按业务域拆分（system / auth / user / order / coupon / appointment ...）。
- E2E 用例放 `tests/e2e-web` 或 `tests/e2e-mobile`，Page Object 放各自的 `pages/`。
- 小程序用例放 `tests/miniprogram`，命名 `<端>.smoke.spec.ts`。
- 文件用 kebab-case，`describe` 用中文业务名，`test` 描述「条件 + 预期」。

## 公共能力的使用

- 统一从 `@shared` 导入 `test` / `expect` / 工具，而非直接从 `@playwright/test`（接口用例）。
- 路径常量统一用 `Endpoints`（`shared/api/endpoints.ts`），禁止在用例里硬编码路径字符串。
- 鉴权请求用 `api` fixture（自动注入 token + X-Shop-Domain）；匿名请求用 `anonApi`。
- 断言业务码：成功 `body.code === SUCCESS_CODE(0)`，失败用具体错误码或 `not.toBe(SUCCESS_CODE)`。

```ts
import { test, expect } from '@shared';
import { Endpoints, SUCCESS_CODE } from '@shared';

test('GET /user/orders 返回订单分页', async ({ api }) => {
  const { body } = await api.get(Endpoints.user.orders, { query: { page: 1, limit: 10 } });
  expect(body.code).toBe(SUCCESS_CODE);
});
```

## 测试数据

- 用 `shared/data/factory.ts` 的工厂构造入参（自带随机/唯一值）。
- 凡是创建数据的用例，必须用 `data` 登记表登记清理动作，结束后自动回收：

```ts
test('创建地址并清理', async ({ api, data }) => {
  const { body } = await api.post(Endpoints.user.addressCreate, buildAddressPayload());
  const id = body.data?.id;
  if (id) data.register(`删除地址 ${id}`, () => api.post(Endpoints.user.addressDelete, { id }));
});
```

## 稳定性原则

- 缺前置条件（凭据 / 店铺域名 / 商品 ID）时用 `test.skip(condition, reason)` 跳过，不要让 CI 因环境缺失整体失败。
- 不依赖用例间执行顺序；每个用例自带前置与清理。
- 写操作（下单支付、真实退款、真实约课）默认走异常/边界校验；正向写操作用环境变量选配（如 `TEST_GOODS_ID`），避免产生脏数据。
- E2E 选择器优先语义定位（`getByRole` / `getByText` / `getByPlaceholder`），减少与样式耦合。

## 标签与筛选

- 冒烟用例在标题加 `@smoke`，可用 `pnpm test:api --grep @smoke` 只跑冒烟。
- 小程序用例加 `@miniprogram`。

## 提交前自检

```bash
pnpm typecheck && pnpm lint && pnpm format:check
```
