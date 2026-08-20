import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  imageAttachmentsForReport,
  renderSuiteFailureScreenshotsHtml,
} from './enhanced-failure-media.ts';

describe('imageAttachmentsForReport', () => {
  test('keeps image attachments that already have a report path', () => {
    const images = imageAttachmentsForReport([
      { name: 'screenshot', contentType: 'image/png', path: 'attachments/fail.png' },
      { name: 'video', contentType: 'video/webm', path: 'attachments/fail.webm' },
      { name: 'error-context', contentType: 'text/markdown', path: 'attachments/fail.dat' },
      { name: 'missing-path', contentType: 'image/png' },
    ]);

    assert.deepEqual(images, [
      { name: 'screenshot', contentType: 'image/png', path: 'attachments/fail.png' },
    ]);
  });

  test('returns empty list for missing attachments', () => {
    assert.deepEqual(imageAttachmentsForReport(undefined), []);
    assert.deepEqual(imageAttachmentsForReport([]), []);
  });
});

describe('renderSuiteFailureScreenshotsHtml', () => {
  test('renders inline figures for failure screenshots', () => {
    const html = renderSuiteFailureScreenshotsHtml([
      { name: '失败截图.png', contentType: 'image/png', path: 'attachments/fail.png' },
    ]);

    assert.match(html, /class="test-failure-shots"/);
    assert.match(html, /src="attachments\/fail.png"/);
    assert.match(html, /alt="失败截图.png"/);
    assert.match(html, /<img /);
  });

  test('returns empty string when there is no screenshot', () => {
    assert.equal(renderSuiteFailureScreenshotsHtml([]), '');
  });
});
