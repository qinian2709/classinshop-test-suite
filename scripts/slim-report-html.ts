/**
 * Slim enhanced-report.html for hosting: drop passed API payloads, keep failed ones.
 * CI artifacts keep the full HTML; only the published copy is slimmed.
 */

const PASSED_BODY_PLACEHOLDER =
  '<p class="api-slim-placeholder" style="margin:8px;padding:8px;color:#64748b;font-size:0.85rem;border:1px dashed #cbd5e1;border-radius:6px">' +
  '通过的 API 请求/响应体未纳入托管报告（完整日志见 CI Artifact）。</p>';

const PASSED_DETAILS_PLACEHOLDER =
  '<div class="api-request-details" style="display:none">' +
  '<p class="api-slim-placeholder" style="padding:8px;color:#64748b;font-size:0.85rem">请求详情已省略（托管精简版）。</p>' +
  '</div>';

function findMatchingCloseDiv(html: string, openTagEnd: number): number {
  let depth = 1;
  let pos = openTagEnd + 1;
  while (depth > 0 && pos < html.length) {
    const nextOpen = html.indexOf('<div', pos);
    const nextClose = html.indexOf('</div>', pos);
    if (nextClose === -1) {
      return html.length;
    }
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1;
      pos = nextOpen + 4;
      continue;
    }
    depth -= 1;
    pos = nextClose + '</div>'.length;
  }
  return pos;
}

function stripApiPassedBodies(html: string): string {
  let result = '';
  let cursor = 0;
  const prefix = '<div class="api-passed-body"';

  while (cursor < html.length) {
    const start = html.indexOf(prefix, cursor);
    if (start === -1) {
      result += html.slice(cursor);
      break;
    }

    result += html.slice(cursor, start);
    const tagEnd = html.indexOf('>', start);
    if (tagEnd === -1) {
      result += html.slice(start);
      break;
    }

    const openTag = html.slice(start, tagEnd + 1);
    const closeEnd = findMatchingCloseDiv(html, tagEnd);
    result += `${openTag}${PASSED_BODY_PLACEHOLDER}</div>`;
    cursor = closeEnd;
  }

  return result;
}

function stripPassedApiRequestDetails(html: string): string {
  let result = '';
  let cursor = 0;
  const prefix = '<div class="api-request-item';

  while (cursor < html.length) {
    const start = html.indexOf(prefix, cursor);
    if (start === -1) {
      result += html.slice(cursor);
      break;
    }

    result += html.slice(cursor, start);
    const tagEnd = html.indexOf('>', start);
    if (tagEnd === -1) {
      result += html.slice(start);
      break;
    }

    const openTag = html.slice(start, tagEnd + 1);
    const closeEnd = findMatchingCloseDiv(html, tagEnd);
    let block = html.slice(start, closeEnd);

    if (!/\bapi-request-failed\b/.test(openTag)) {
      const detailsStart = block.indexOf('<div class="api-request-details"');
      if (detailsStart !== -1) {
        const detailsOpenEnd = block.indexOf('>', detailsStart);
        if (detailsOpenEnd !== -1) {
          const detailsCloseEnd = findMatchingCloseDiv(block, detailsOpenEnd);
          block =
            block.slice(0, detailsStart) + PASSED_DETAILS_PLACEHOLDER + block.slice(detailsCloseEnd);
        }
      }
    }

    result += block;
    cursor = closeEnd;
  }

  return result;
}

export function slimReportHtmlForPublish(html: string): string {
  let next = stripApiPassedBodies(html);
  next = stripPassedApiRequestDetails(next);
  return next;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}
