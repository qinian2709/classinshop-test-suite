import { test, expect } from '@shared';
import {
  Endpoints,
  SUCCESS_CODE,
  GOODS_TYPE_RECORDED,
  RECORDED_VIDEO_ACTIVITY_TITLE,
  RECORDED_DOC_ACTIVITY_TITLE,
  provisionPublishedRecordedGoods,
  buildCreateOrderPayload,
  pickNumber,
  asArray,
  pickOrderRefundAmount,
  cleanupRefundMerchantOrder,
  attachApiCallLog,
  loggedGet,
  loggedPost,
} from '@shared';
import { hasApiCredential, hasMobileCredential } from '@config';

/**
 * 私域录播课 API 专项测试（不含公域）：
 *   1. 售前试看、文档预览、购后访问的异常与权限边界校验
 *   2. 真实私域录播课全链路（上架 0 元录播课 → 售前试看视频/文档 → 零元购课 →
 *      学习列表 → 学习首页 → 学习数据 → 购后活动访问 → 进度上报 → 资料下载签名与文件流 → 退款与删除清理）
 */

interface RecordedCatalogFile {
  id?: number;
  fileId?: number;
  fileType?: string;
  name?: string;
}

interface RecordedCatalogActivity {
  id?: number;
  activityId?: number;
  title?: string;
  files?: RecordedCatalogFile[];
}

interface RecordedCatalogUnit {
  activities?: RecordedCatalogActivity[];
}

interface RecordedGoodsDetail {
  id: number;
  goodsType: number;
  products: Array<{
    id: number;
    catalog?: RecordedCatalogUnit[];
  }>;
}

test.describe('录播课·私域边界与权限校验', () => {
  test('GET /shop/user/learn-list?type=recorded 返回私域录播学习列表', async ({ api, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shop.learnList}?type=recorded&page=1&pageSize=10`;
    const { status, body } = await api.get<{ list?: unknown[]; total?: number }>(
      Endpoints.shop.learnList,
      { query: { type: 'recorded', page: 1, pageSize: 10 } },
    );

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-录播学习列表-私域.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status, headers: {}, body },
      assertions: ['HTTP 状态码应为 200', '业务 code 应为成功码', 'list 应为数组'],
    });

    expect(status, 'HTTP 状态码应为 200').toBe(200);
    expect(body.code, '业务 code 应为成功码').toBe(SUCCESS_CODE);
    expect(Array.isArray(body.data?.list ?? []), '私域录播学习列表应为数组').toBe(true);
  });

  test('GET /goods/product/:productId/course/activities/:activityId/preview 不存在活动应失败', async ({
    anonApi,
    env,
  }) => {
    const path = Endpoints.goods.activityPreview(999999999, 999999999);
    const url = `${env.apiBaseURL}${path}`;
    const res = await anonApi.raw('get', path);
    const body = res.status() === 200 ? await res.json() : null;

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-录播售前试看-不存在活动.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status: res.status(), headers: {}, body },
      assertions: ['不存在活动试看应返回 4xx 或非成功业务码'],
    });

    if (res.status() === 200) {
      expect(body.code, '不存在活动试看应返回非成功业务码').not.toBe(SUCCESS_CODE);
    } else {
      expect(res.status(), '不存在活动试看应返回 4xx').toBeGreaterThanOrEqual(400);
    }
  });

  test('GET /shop/recorded/activity/:activityId/detail 不存在活动应失败', async ({
    anonApi,
    env,
  }) => {
    const path = Endpoints.shop.recordedActivityDetail(999999999);
    const url = `${env.apiBaseURL}${path}?productId=999999999`;
    const res = await anonApi.raw('get', path, { query: { productId: 999999999 } });
    const body = res.status() === 200 ? await res.json() : null;

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-录播活动详情-不存在.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status: res.status(), headers: {}, body },
      assertions: ['不存在录播活动详情应返回 4xx 或非成功业务码'],
    });

    if (res.status() === 200) {
      expect(body.code, '不存在录播活动详情应返回非成功业务码').not.toBe(SUCCESS_CODE);
    } else {
      expect(res.status(), '不存在录播活动详情应返回 4xx').toBeGreaterThanOrEqual(400);
    }
  });

  test('GET /shop/recorded/course/doc-image 缺少必填参数应失败', async ({ anonApi, env }) => {
    const url = `${env.apiBaseURL}${Endpoints.shop.recordedDocImage}`;
    const res = await anonApi.raw('get', Endpoints.shop.recordedDocImage);
    const body = res.status() === 200 ? await res.json() : null;

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-录播文档按页图-缺少参数.json',
      request: { method: 'GET', url, headers: {}, body: null },
      response: { status: res.status(), headers: {}, body },
      assertions: ['缺少参数应返回 4xx 或非成功业务码'],
    });

    if (res.status() === 200) {
      expect(body.code, '缺少参数应返回非成功业务码').not.toBe(SUCCESS_CODE);
    } else {
      expect(res.status(), '缺少参数应返回 4xx').toBeGreaterThanOrEqual(400);
    }
  });

  test('GET /shop/recorded/course/doc-weboffice 与 doc-weboffice-token 未购或缺少订单参数应拒绝', async ({
    api,
    env,
  }) => {
    const webofficeUrl = `${env.apiBaseURL}${Endpoints.shop.recordedDocWebOffice}?fileId=1&activityId=1`;
    const res1 = await api.raw('get', Endpoints.shop.recordedDocWebOffice, {
      query: { fileId: 1, activityId: 1 },
    });
    const body1 = res1.status() === 200 ? await res1.json() : null;

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-录播WebOffice-缺少订单参数.json',
      request: { method: 'GET', url: webofficeUrl, headers: {}, body: null },
      response: { status: res1.status(), headers: {}, body: body1 },
      assertions: ['缺少 orderItemId 应被拒绝'],
    });

    if (res1.status() === 200) {
      expect((body1 as { code?: number })?.code, '缺少订单参数应返回非成功码').not.toBe(SUCCESS_CODE);
    } else {
      expect(res1.status(), '缺少订单参数应返回 4xx').toBeGreaterThanOrEqual(400);
    }

    const tokenUrl = `${env.apiBaseURL}${Endpoints.shop.recordedDocWebOfficeToken}?fileId=1&activityId=1&orderItemId=999999999`;
    const res2 = await api.raw('get', Endpoints.shop.recordedDocWebOfficeToken, {
      query: { fileId: 1, activityId: 1, orderItemId: 999999999 },
    });
    const body2 = res2.status() === 200 ? await res2.json() : null;

    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-录播WebOfficeToken-不存在订单.json',
      request: { method: 'GET', url: tokenUrl, headers: {}, body: null },
      response: { status: res2.status(), headers: {}, body: body2 },
      assertions: ['不存在订单请求 WebOffice Token 应被拒绝'],
    });

    if (res2.status() === 200) {
      expect((body2 as { code?: number })?.code, '不存在订单应返回非成功码').not.toBe(SUCCESS_CODE);
    } else {
      expect(res2.status(), '不存在订单应返回 4xx').toBeGreaterThanOrEqual(400);
    }
  });

  test('私域购后首页、学习数据、进度上报、资料访问与下载：不存在订单项应拒绝', async ({
    api,
    env,
  }) => {
    const homePath = Endpoints.shop.recordedLearnHome(999999999);
    const { status: homeStatus, body: homeBody } = await api.get(homePath);
    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-私域录播首页-不存在订单项.json',
      request: { method: 'GET', url: `${env.apiBaseURL}${homePath}`, headers: {}, body: null },
      response: { status: homeStatus, headers: {}, body: homeBody },
      assertions: ['不存在订单项访问学习首页应返回非成功业务码'],
    });
    expect(homeBody.code, '不存在订单项访问学习首页应失败').not.toBe(SUCCESS_CODE);

    const studyPath = Endpoints.shop.recordedStudyData(999999999);
    const { status: studyStatus, body: studyBody } = await api.get(studyPath);
    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-私域录播学习数据-不存在订单项.json',
      request: { method: 'GET', url: `${env.apiBaseURL}${studyPath}`, headers: {}, body: null },
      response: { status: studyStatus, headers: {}, body: studyBody },
      assertions: ['不存在订单项访问学习数据应返回非成功业务码'],
    });
    expect(studyBody.code, '不存在订单项访问学习数据应失败').not.toBe(SUCCESS_CODE);

    const reportRes = await api.raw('post', Endpoints.shop.recordedStudyReport, { data: {} });
    const reportBody = reportRes.status() === 200 ? await reportRes.json() : null;
    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-录播进度上报-缺少必填.json',
      request: {
        method: 'POST',
        url: `${env.apiBaseURL}${Endpoints.shop.recordedStudyReport}`,
        headers: {},
        body: {},
      },
      response: { status: reportRes.status(), headers: {}, body: reportBody },
      assertions: ['缺少必填参数上报进度应失败'],
    });
    if (reportRes.status() === 200) {
      expect((reportBody as { code?: number })?.code, '缺少必填参数应返回非成功码').not.toBe(
        SUCCESS_CODE,
      );
    } else {
      expect(reportRes.status(), '缺少必填参数应返回 4xx').toBeGreaterThanOrEqual(400);
    }

    const accessPath = Endpoints.shop.recordedActivityAccess(999999999, 999999999);
    const { status: accessStatus, body: accessBody } = await api.get(accessPath);
    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-私域活动访问-不存在订单项.json',
      request: { method: 'GET', url: `${env.apiBaseURL}${accessPath}`, headers: {}, body: null },
      response: { status: accessStatus, headers: {}, body: accessBody },
      assertions: ['不存在订单项访问活动应返回非成功码'],
    });
    expect(accessBody.code, '不存在订单项访问活动应失败').not.toBe(SUCCESS_CODE);

    const signPath = Endpoints.shop.recordedFileDownloadSign(999999999, 999999999);
    const { status: signStatus, body: signBody } = await api.get(signPath);
    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-私域文件下载签名-不存在订单项.json',
      request: { method: 'GET', url: `${env.apiBaseURL}${signPath}`, headers: {}, body: null },
      response: { status: signStatus, headers: {}, body: signBody },
      assertions: ['不存在订单项获取下载签名应返回非成功码'],
    });
    expect(signBody.code, '不存在订单项获取下载签名应失败').not.toBe(SUCCESS_CODE);

    const streamPath = Endpoints.shop.recordedFileStream(999999999, 999999999, 999999999);
    const streamRes = await api.raw('get', streamPath);
    const streamBody = streamRes.status() === 200 ? await streamRes.json() : null;
    await attachApiCallLog({
      testInfo: test.info(),
      name: '请求日志-私域文件流-不存在订单项.json',
      request: { method: 'GET', url: `${env.apiBaseURL}${streamPath}`, headers: {}, body: null },
      response: { status: streamRes.status(), headers: {}, body: streamBody },
      assertions: ['不存在订单项拉取文件流应被拒绝'],
    });
    if (streamRes.status() === 200) {
      expect((streamBody as { code?: number })?.code, '不存在订单项文件流应返回非成功码').not.toBe(
        SUCCESS_CODE,
      );
    } else {
      expect(streamRes.status(), '不存在订单项文件流应返回 4xx').toBeGreaterThanOrEqual(400);
    }
  });
});

test.describe('录播课·私域全链路（上架 -> 售前试看 -> 零元购课 -> 学习/上报/下载 -> 退款清理）', () => {
  test.skip(({ env }) => !env.shopId, '未配置 SHOP_ID，跳过私域录播课全链路');
  test.skip(!hasApiCredential(), '未配置商家鉴权凭据，跳过私域录播课全链路');
  test.skip(!hasMobileCredential(), '未配置 C 端鉴权凭据，跳过私域录播课购课学习链路');

  test('上架零元录播课 -> 售前试看 -> 零元购课 -> 首页/学习数据/活动访问/进度上报/下载签名', async ({
    api,
    mobileApi,
    anonApi,
    env,
    data,
  }) => {
    test.setTimeout(6 * 60_000);
    const testInfo = test.info();
    const logBase = { testInfo, apiBaseURL: env.apiBaseURL };

    const provisioned = await provisionPublishedRecordedGoods(api, {
      shopId: env.shopId!,
      data,
      price: 0,
      namePrefix: 'API录播课',
    });
    test.skip(!provisioned, '未能准备可转码的录播课测试商品，跳过全链路');
    expect(provisioned!.goodsType, '商品类型应为录播课 goodsType=4').toBe(GOODS_TYPE_RECORDED);

    const { goodsId, skuId: productId } = provisioned!;
    let videoActivityId = 0;
    let videoFileId = 0;
    let docActivityId = 0;
    let docFileId = 0;

    await test.step('商家商品详情：提取视频与资料活动 ID / 文件 ID', async () => {
      const { body } = await loggedGet<RecordedGoodsDetail>(
        api,
        {
          ...logBase,
          logName: '请求日志-录播全链路-商家商品详情.json',
          assertions: ['业务 code 应为成功码', '应包含视频与资料活动'],
        },
        Endpoints.shopAdmin.goodsDetail(env.shopId!, goodsId),
      );
      expect(body.code, body.msg).toBe(SUCCESS_CODE);
      const units = body.data?.products?.[0]?.catalog ?? [];
      for (const unit of units) {
        for (const act of unit.activities ?? []) {
          const actId = Number(act.id ?? act.activityId ?? 0);
          const firstFile = act.files?.[0];
          const fId = Number(firstFile?.id ?? firstFile?.fileId ?? 0);
          if (act.title === RECORDED_VIDEO_ACTIVITY_TITLE || firstFile?.fileType === 'video') {
            videoActivityId = actId;
            videoFileId = fId;
          } else if (act.title === RECORDED_DOC_ACTIVITY_TITLE || firstFile?.fileType === 'docx') {
            docActivityId = actId;
            docFileId = fId;
          }
        }
      }
      expect(videoActivityId, '应解析出导学视频 activityId').toBeGreaterThan(0);
      expect(docActivityId, '应解析出配套资料 activityId').toBeGreaterThan(0);
    });

    await test.step('售前试看：未购状态访问视频试看与资料试看', async () => {
      const { body: videoPreview } = await loggedGet(
        anonApi,
        {
          ...logBase,
          logName: '请求日志-录播全链路-售前视频试看.json',
          assertions: ['视频售前试看业务 code 应为成功码'],
        },
        Endpoints.goods.activityPreview(productId, videoActivityId),
      );
      expect(videoPreview.code, videoPreview.msg).toBe(SUCCESS_CODE);
      expect(videoPreview.data, '视频试看应返回播放信息').toBeTruthy();

      const { body: docPreview } = await loggedGet(
        anonApi,
        {
          ...logBase,
          logName: '请求日志-录播全链路-售前资料试看.json',
          assertions: ['资料售前试看业务 code 应为成功码'],
        },
        Endpoints.goods.activityPreview(productId, docActivityId),
      );
      expect(docPreview.code, docPreview.msg).toBe(SUCCESS_CODE);
      expect(docPreview.data, '资料试看应返回预览信息').toBeTruthy();

      const { body: actDetail } = await loggedGet(
        anonApi,
        {
          ...logBase,
          logName: '请求日志-录播全链路-售前活动详情.json',
          assertions: ['售前活动详情业务 code 应为成功码'],
        },
        Endpoints.shop.recordedActivityDetail(videoActivityId),
        { query: { productId } },
      );
      expect(actDetail.code, actDetail.msg).toBe(SUCCESS_CODE);
    });

    let orderItemId = 0;
    let orderId = 0;

    await test.step('学生零元购课（自动支付）', async () => {
      const payload = buildCreateOrderPayload({ goodsId, skuId: productId });
      const { body } = await loggedPost(
        mobileApi,
        {
          ...logBase,
          logName: '请求日志-录播全链路-零元购课.json',
          assertions: ['零元购课业务 code 应为成功码', '应返回 orderItemId'],
        },
        Endpoints.goods.orderCreate,
        payload,
      );
      expect(body.code, body.msg).toBe(SUCCESS_CODE);
      orderItemId = pickNumber(body.data, ['orderItemId', 'order_item_id']) ?? 0;
      orderId = pickNumber(body.data, ['orderId', 'order_id', 'id']) ?? 0;
      const refundAmount = pickOrderRefundAmount(body.data);
      expect(orderItemId, '零元购课应返回有效 orderItemId').toBeGreaterThan(0);

      if (orderId > 0) {
        data.register(`退款清理录播课订单 ${orderId}`, async () => {
          await cleanupRefundMerchantOrder(api, env.shopId!, orderId, refundAmount);
        });
      }
    });

    await test.step('购后学习列表（type=recorded）应包含新购录播课', async () => {
      const { body } = await loggedGet(
        mobileApi,
        {
          ...logBase,
          logName: '请求日志-录播全链路-学习列表.json',
          assertions: ['业务 code 应为成功码', '学习列表应包含新购录播课'],
        },
        Endpoints.shop.learnList,
        { query: { type: 'recorded', page: 1, pageSize: 20 } },
      );
      expect(body.code, body.msg).toBe(SUCCESS_CODE);
      const list = asArray((body.data as { list?: unknown } | null)?.list ?? body.data);
      const found = list.find(
        (item) => pickNumber(item, ['orderItemId', 'order_item_id']) === orderItemId,
      );
      expect(found, '私域录播学习列表应包含新购订单项').toBeTruthy();
    });

    await test.step('购后学习首页与我的学习数据查询', async () => {
      const { body: homeBody } = await loggedGet(
        mobileApi,
        {
          ...logBase,
          logName: '请求日志-录播全链路-学习首页.json',
          assertions: ['学习首页业务 code 应为成功码'],
        },
        Endpoints.shop.recordedLearnHome(orderItemId),
      );
      expect(homeBody.code, homeBody.msg).toBe(SUCCESS_CODE);
      expect(homeBody.data, '学习首页应返回课程与章节数据').toBeTruthy();

      const { body: studyBody } = await loggedGet(
        mobileApi,
        {
          ...logBase,
          logName: '请求日志-录播全链路-我的学习数据.json',
          assertions: ['我的学习数据业务 code 应为成功码'],
        },
        Endpoints.shop.recordedStudyData(orderItemId),
      );
      expect(studyBody.code, studyBody.msg).toBe(SUCCESS_CODE);
      expect(studyBody.data, '我的学习数据应返回概览与章节进度').toBeTruthy();
    });

    await test.step('购后查看活动、上报学习进度与获取可下载资料签名', async () => {
      const { body: videoAccess } = await loggedGet(
        mobileApi,
        {
          ...logBase,
          logName: '请求日志-录播全链路-购后视频查看.json',
          assertions: ['购后视频查看业务 code 应为成功码'],
        },
        Endpoints.shop.recordedActivityAccess(orderItemId, videoActivityId),
      );
      expect(videoAccess.code, videoAccess.msg).toBe(SUCCESS_CODE);

      const { body: docAccess } = await loggedGet(
        mobileApi,
        {
          ...logBase,
          logName: '请求日志-录播全链路-购后资料查看.json',
          assertions: ['购后资料查看业务 code 应为成功码'],
        },
        Endpoints.shop.recordedActivityAccess(orderItemId, docActivityId),
      );
      expect(docAccess.code, docAccess.msg).toBe(SUCCESS_CODE);

      if (videoFileId > 0) {
        const reportPayload = {
          orderItemId,
          activityId: videoActivityId,
          fileId: videoFileId,
          positionSec: 5,
          watchedDeltaSec: 5,
          totalDurationSec: 15,
          watchCountIncr: 1,
        };
        const { body: reportBody } = await loggedPost(
          mobileApi,
          {
            ...logBase,
            logName: '请求日志-录播全链路-上报学习进度.json',
            assertions: ['上报学习进度业务 code 应为成功码'],
          },
          Endpoints.shop.recordedStudyReport,
          reportPayload,
        );
        expect(reportBody.code, reportBody.msg).toBe(SUCCESS_CODE);
      }

      if (docFileId > 0) {
        const { body: signBody } = await loggedGet<{ downloadUrl?: string }>(
          mobileApi,
          {
            ...logBase,
            logName: '请求日志-录播全链路-资料下载签名.json',
            assertions: ['资料下载签名业务 code 应为成功码', '应返回 downloadUrl'],
          },
          Endpoints.shop.recordedFileDownloadSign(orderItemId, docFileId),
        );
        expect(signBody.code, signBody.msg).toBe(SUCCESS_CODE);
        expect(signBody.data?.downloadUrl, '可下载资料应返回 downloadUrl').toBeTruthy();
      }
    });
  });
});
