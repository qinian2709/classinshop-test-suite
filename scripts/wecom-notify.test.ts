import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parseWeComMentionMobiles } from '../config/wecom.ts';
import {
  buildFailureMentionPayload,
  formatReportSection,
  resolvePortalHomeUrl,
  type ReportLinks,
} from './wecom-notify.ts';

describe('resolvePortalHomeUrl', () => {
  test('uses REPORT_PUBLISH_BASE_URL origin as the hosted portal home', () => {
    assert.equal(
      resolvePortalHomeUrl('https://classinshop-test-reports.coolify.eeo-inc.com'),
      'https://classinshop-test-reports.coolify.eeo-inc.com/',
    );
    assert.equal(
      resolvePortalHomeUrl('https://classinshop-test-reports.coolify.eeo-inc.com/14/all/latest/enhanced/'),
      'https://classinshop-test-reports.coolify.eeo-inc.com/',
    );
  });

  test('falls back to the enhanced report origin', () => {
    assert.equal(
      resolvePortalHomeUrl(
        undefined,
        'https://classinshop-test-reports.coolify.eeo-inc.com/14/all/latest/enhanced/enhanced-report.html',
      ),
      'https://classinshop-test-reports.coolify.eeo-inc.com/',
    );
  });
});

describe('formatReportSection', () => {
  test('adds 查看历史报告 pointing at the hosted portal', () => {
    const links: ReportLinks = {
      enhanced: 'https://classinshop-test-reports.coolify.eeo-inc.com/14/all/latest/enhanced/enhanced-report.html',
      portalHome: 'https://classinshop-test-reports.coolify.eeo-inc.com/',
    };
    const section = formatReportSection(links).join('\n');
    assert.match(section, /\[在线最新报告\]\(/);
    assert.match(
      section,
      /\[查看历史报告\]\(https:\/\/classinshop-test-reports\.coolify\.eeo-inc\.com\/\)/,
    );
  });
});

describe('parseWeComMentionMobiles', () => {
  test('splits comma / whitespace and keeps @all', () => {
    assert.deepEqual(parseWeComMentionMobiles('13800138000, 13900139000'), [
      '13800138000',
      '13900139000',
    ]);
    assert.deepEqual(parseWeComMentionMobiles('13800138000，@all'), ['13800138000', '@all']);
    assert.deepEqual(parseWeComMentionMobiles('not-a-phone'), []);
  });
});

describe('buildFailureMentionPayload', () => {
  test('mentions mobiles only when status is 失败', () => {
    assert.equal(buildFailureMentionPayload('通过', ['13800138000']), null);
    assert.equal(buildFailureMentionPayload('跳过', ['13800138000']), null);
    assert.equal(buildFailureMentionPayload('失败', []), null);

    const payload = buildFailureMentionPayload('失败', ['13800138000']);
    assert.deepEqual(payload, {
      msgtype: 'text',
      text: {
        content: 'ClassInShop 测试失败，请查看上方报告。',
        mentioned_mobile_list: ['13800138000'],
      },
    });
  });
});
