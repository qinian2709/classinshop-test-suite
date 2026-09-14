import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  markApiRequestsFailedBySteps,
  parseAttachStepName,
} from './mark-api-assertion-failures.ts';

describe('parseAttachStepName', () => {
  test('reads Playwright Attach step title', () => {
    assert.equal(
      parseAttachStepName('Attach "请求日志-预约课-创建草稿.json"'),
      '请求日志-预约课-创建草稿.json',
    );
  });

  test('returns undefined for non-attach titles', () => {
    assert.equal(parseAttachStepName('创建预约课草稿业务 code 应为成功码'), undefined);
    assert.equal(parseAttachStepName(undefined), undefined);
  });
});

describe('markApiRequestsFailedBySteps', () => {
  test('keeps duration-failed requests marked even when later asserts pass', () => {
    const requests = [
      { attachmentName: 'slow.json', assertionFailed: true },
      { attachmentName: 'ok.json', assertions: ['业务 code 应为成功码'] },
    ];

    markApiRequestsFailedBySteps(requests, [
      { title: 'Attach "slow.json"', status: 'passed' },
      { title: 'Attach "ok.json"', status: 'passed' },
      { title: '业务 code 应为成功码', status: 'passed' },
    ]);

    assert.equal(requests[0]?.assertionFailed, true);
    assert.equal(requests[1]?.assertionFailed, undefined);
  });

  test('does not put business-assert failure into the passed bucket', () => {
    const requests = [
      {
        attachmentName: '请求日志-预约课-COS签名.json',
        assertions: ['COS 上传签名业务 code 应为成功码'],
      },
      {
        attachmentName: '请求日志-预约课-创建草稿.json',
        assertions: ['创建预约课草稿业务 code 应为成功码', '创建草稿应返回 goodsId'],
      },
      {
        attachmentName: '请求日志-预约课-删除清理.json',
        assertions: ['删除预约课测试商品用于清理环境'],
      },
    ];

    markApiRequestsFailedBySteps(
      requests,
      [
        { title: 'Attach "请求日志-预约课-COS签名.json"', status: 'passed' },
        { title: 'COS 上传签名业务 code 应为成功码', status: 'passed' },
        { title: 'Attach "请求日志-预约课-创建草稿.json"', status: 'passed' },
        {
          title: '创建预约课草稿业务 code 应为成功码',
          status: 'failed',
          error:
            'Error: 创建预约课草稿业务 code 应为成功码\n\nexpect(received).toBe(expected)\nExpected: 0\nReceived: 500',
        },
        {
          title: 'After Hooks',
          status: 'passed',
          steps: [
            { title: 'Attach "请求日志-预约课-删除清理.json"', status: 'passed' },
          ],
        },
      ],
      'Error: 创建预约课草稿业务 code 应为成功码',
    );

    assert.equal(requests[0]?.assertionFailed, undefined);
    assert.equal(requests[1]?.assertionFailed, true);
    assert.equal(requests[2]?.assertionFailed, undefined);
  });

  test('marks only the last matching request when assertion text is reused', () => {
    const requests = [
      { attachmentName: 'one.json', assertions: ['业务 code 应为成功码'] },
      { attachmentName: 'two.json', assertions: ['业务 code 应为成功码'] },
    ];

    markApiRequestsFailedBySteps(requests, [
      { title: 'Attach "one.json"', status: 'passed' },
      { title: '业务 code 应为成功码', status: 'passed' },
      { title: 'Attach "two.json"', status: 'passed' },
      { title: '业务 code 应为成功码', status: 'failed', error: 'Expected: 0\nReceived: 500' },
    ]);

    assert.equal(requests[0]?.assertionFailed, undefined);
    assert.equal(requests[1]?.assertionFailed, true);
  });

  test('falls back to assertion text when Attach steps are missing', () => {
    const requests = [
      { assertions: ['店铺信息业务 code 应为成功码'] },
      { assertions: ['创建预约课草稿业务 code 应为成功码'] },
    ];

    markApiRequestsFailedBySteps(
      requests,
      [{ title: '创建预约课草稿业务 code 应为成功码', status: 'failed' }],
      'Error: 创建预约课草稿业务 code 应为成功码',
    );

    assert.equal(requests[0]?.assertionFailed, undefined);
    assert.equal(requests[1]?.assertionFailed, true);
  });

  test('does not mark requests when the test passed', () => {
    const requests = [
      { attachmentName: 'ok.json', assertions: ['业务 code 应为成功码'] },
    ];

    markApiRequestsFailedBySteps(requests, [
      { title: 'Attach "ok.json"', status: 'passed' },
      { title: '业务 code 应为成功码', status: 'passed' },
    ]);

    assert.equal(requests[0]?.assertionFailed, undefined);
  });

  test('does not mark the last API log when a non-API expect fails', () => {
    const requests = [
      {
        attachmentName: '请求日志-预约课-创建草稿.json',
        assertions: ['创建预约课草稿业务 code 应为成功码'],
      },
    ];

    markApiRequestsFailedBySteps(requests, [
      { title: 'Attach "请求日志-预约课-创建草稿.json"', status: 'passed' },
      { title: '创建预约课草稿业务 code 应为成功码', status: 'passed' },
      { title: '老师 id 应存在', status: 'failed', error: 'Expected: truthy\nReceived: undefined' },
    ]);

    assert.equal(requests[0]?.assertionFailed, undefined);
  });
});
