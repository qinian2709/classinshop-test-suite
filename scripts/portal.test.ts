import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { PORTAL_PAGES, renderReportPortalHtml, writeReportPortals } from './portal.ts';

const TEMP_ROOT = path.join(os.tmpdir(), 'classinshop-portal-tests');

after(() => {
  fs.rmSync(TEMP_ROOT, { recursive: true, force: true });
});

describe('renderReportPortalHtml', () => {
  test('classinshop page stays at root and filters its own series', () => {
    const shop = PORTAL_PAGES[0];
    if (!shop) throw new Error('missing classinshop portal spec');
    const html = renderReportPortalHtml(shop);
    assert.match(html, /<title>ClassInShop 测试报告<\/title>/);
    assert.match(html, /const PORTAL_SERIES = 'classinshop'/);
    assert.match(html, /const PORTAL_INDEX_HREF = '\.\/reports-index\.json'/);
    assert.match(html, /href="\.\/teacherin\/"/);
    assert.match(html, /series-nav-link is-active" href="\.\/">ClassInShop/);
    assert.doesNotMatch(html, /\{\{PORTAL_/);
  });

  test('teacherin page reads the shared index from parent', () => {
    const ti = PORTAL_PAGES[1];
    if (!ti) throw new Error('missing teacherin portal spec');
    const html = renderReportPortalHtml(ti);
    assert.match(html, /<title>TeacherIn 测试报告<\/title>/);
    assert.match(html, /const PORTAL_SERIES = 'teacherin'/);
    assert.match(html, /const PORTAL_INDEX_HREF = '\.\.\/reports-index\.json'/);
    assert.match(html, /const PORTAL_REPORT_PREFIX = '\.\.\/'/);
    assert.match(html, /href="\.\.\/">ClassInShop/);
    assert.match(html, /body class="series-teacherin"/);
  });
});

describe('writeReportPortals', () => {
  test('writes both product pages', () => {
    fs.mkdirSync(TEMP_ROOT, { recursive: true });
    const repo = fs.mkdtempSync(path.join(TEMP_ROOT, 'repo-'));
    assert.deepEqual(writeReportPortals(repo), ['index.html', 'teacherin/index.html']);
    assert.equal(fs.existsSync(path.join(repo, 'index.html')), true);
    assert.equal(fs.existsSync(path.join(repo, 'teacherin', 'index.html')), true);
    assert.match(fs.readFileSync(path.join(repo, 'index.html'), 'utf8'), /PORTAL_SERIES = 'classinshop'/);
    assert.match(
      fs.readFileSync(path.join(repo, 'teacherin', 'index.html'), 'utf8'),
      /PORTAL_SERIES = 'teacherin'/,
    );
  });
});
