import { test, expect } from '@shared';
import { Endpoints, SUCCESS_CODE } from '@shared';

/**
 * 退款（需登录）：用户仅能对自己的订单提交退款申请，由商家审核。
 * 这里覆盖异常/越权场景；正向退款需要真实可退订单，由 TEST_REFUND_ORDER_ID 选配。
 */
const refundOrderId = process.env.TEST_REFUND_ORDER_ID ?? '';

test.describe('退款申请', () => {
  test('对不存在的订单申请退款应失败', async ({ api }) => {
    const { body } = await api.post(Endpoints.user.refundRequest(999999999), {
      reason: '自动化测试-不存在订单',
    });
    expect(body.code).not.toBe(SUCCESS_CODE);
  });

  test('查询不存在订单的退款申请应失败或为空', async ({ api }) => {
    const { body } = await api.get(Endpoints.user.refundRequest(999999999));
    // 既可能返回业务错误码，也可能成功但 data 为空
    if (body.code === SUCCESS_CODE) {
      expect(body.data ?? null).toBeFalsy();
    } else {
      expect(body.code).not.toBe(SUCCESS_CODE);
    }
  });

  test('提交退款缺少 reason 应失败（配置真实订单时）', async ({ api }) => {
    test.skip(!refundOrderId, '未配置 TEST_REFUND_ORDER_ID，跳过');
    const { body } = await api.post(Endpoints.user.refundRequest(refundOrderId), {});
    expect(body.code).not.toBe(SUCCESS_CODE);
  });
});
