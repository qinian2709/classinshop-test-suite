import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { formatReportSection, resolvePortalHomeUrl, type ReportLinks } from './wecom-notify.ts';

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
