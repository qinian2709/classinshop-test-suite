import { test, expect } from '@shared';
import { Endpoints, SUCCESS_CODE } from '@shared';

/**
 * 约课（需登录）：学员端"我的预约"列表与详情。
 * 列表为读接口，CI 友好；预约/取消等写操作需要真实可约课节，作为选配。
 */
test.describe('学员约课', () => {
  test('GET /student/appointment 返回我的预约列表', async ({ api }) => {
    const { body } = await api.get(Endpoints.appointment.studentList, {
      query: { page: 1, limit: 10 },
    });
    expect(body.code).toBe(SUCCESS_CODE);
  });

  test('GET /student/appointment/:id 不存在的预约应失败', async ({ api }) => {
    const { body } = await api.get(Endpoints.appointment.studentDetail(999999999));
    expect(body.code).not.toBe(SUCCESS_CODE);
  });

  test('取消不存在的预约应失败', async ({ api }) => {
    const { body } = await api.post(Endpoints.appointment.studentCancel(999999999), {});
    expect(body.code).not.toBe(SUCCESS_CODE);
  });
});
