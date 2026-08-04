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
- 所有经 `ApiHelper` 的接口调用会自动断言响应耗时 ≤ `API_MAX_RESPONSE_MS`（项目级配置，见 `config/api.ts`）；禁止在用例里写死毫秒数。

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

## 依赖型接口测试模式

很多接口依赖「其他接口返回的数据」（如下单依赖 `goodsId/skuId`、退款依赖 `orderId`、约课依赖 `orderItemId/teacherId/时段`）。
原则：**不要硬编码 id**（跨环境/时间会失效），用下面四种模式组合。链路示例见 `tests/api/flows/`。

### 1. 数据发现（Discovery）

先查列表/详情拿真实 id，再喂给被测接口。统一封装在 `shared/data/discovery.ts`，拿不到返回 `null`：

```ts
import { pickGoods } from '@shared';
const goods = await pickGoods(api); // 列表取候选 → 详情挖 skuId；无数据返回 null
```

支持环境变量直配跳过查询：`TEST_GOODS_ID/TEST_SKU_ID`、`TEST_REFUND_ORDER_ID`、`TEST_APPT_ORDER_ITEM_ID` 等。

### 2. 依赖型 fixture（推荐复用方式）

把「拿到一个可用商品/可退订单/可领券/可约订单项」封装成 fixture，缺数据自动 `test.skip`，多个用例直接注入：

```ts
test('用真实商品算价', async ({ api, sampleGoods }) => {
  const { body } = await api.post(
    Endpoints.goods.orderCalculate,
    buildCalculatePayload({ goodsId: sampleGoods.goodsId, skuId: sampleGoods.skuId }),
  );
  expect(body.code, body.msg).toBe(SUCCESS_CODE);
});
```

可用 fixture：`sampleGoods` / `refundableOrder` / `availableCoupon` / `appointmentOrderItem`。

### 3. 链内编排（test.step + 局部变量传上下文）

短链路、强依赖、需保证清理时，在一个用例里用 `test.step` 顺序请求，上游产物用局部变量传给下游：

```ts
let orderId: number | undefined;
await test.step('下单（上游）', async () => {
  const { body } = await api.post(Endpoints.goods.orderCreate, payload);
  orderId = pickNumber(body.data, ['orderId', 'id']);
});
await test.step('订单详情（下游）', async () => {
  test.skip(!orderId, '上游未产出 orderId');
  const { body } = await api.get(Endpoints.user.orderDetail(orderId!));
  expect(body.code).toBe(SUCCESS_CODE);
});
```

### 4. 有序链 + 共享上下文

「创建→改→删」跨多个用例时，用 `test.describe.serial` + 闭包共享对象承接 id，并配 `data` 登记清理兜底。

### 约定

- 只读优先：能用「算价/校验」验证就不真支付；下单/约课等写操作默认参与 CI，结束自动清理（取消预约等）。
- 缺上游数据 → `test.skip`，CI 仍绿；不要因环境无数据判失败。
- 响应字段名做容错：用 `pickNumber(obj, [...])` 与 `asArray(data)` 兼容 camelCase/snake_case 及 `list/items` 包裹。

## 标签与筛选

- 冒烟用例在标题加 `@smoke`，可用 `pnpm test:api --grep @smoke` 只跑冒烟。
- 小程序用例加 `@miniprogram`。

## 提交前自检

```bash
pnpm typecheck && pnpm lint && pnpm format:check
```
