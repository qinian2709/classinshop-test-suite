export interface ReportAttachment {
  name?: string;
  contentType?: string;
  path?: string;
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function imageAttachmentsForReport(
  attachments: ReportAttachment[] | undefined,
): ReportAttachment[] {
  if (!attachments?.length) return [];
  return attachments.filter(
    (item) => Boolean(item.path) && String(item.contentType ?? '').startsWith('image/'),
  );
}

export function renderSuiteFailureScreenshotsHtml(
  attachments: ReportAttachment[] | undefined,
): string {
  const images = imageAttachmentsForReport(attachments);
  if (images.length === 0) return '';

  const figures = images.map((item) => {
    const src = escapeHtmlAttr(String(item.path));
    const alt = escapeHtmlAttr(String(item.name || 'screenshot'));
    return `<figure class="test-failure-shot"><img src="${src}" alt="${alt}" loading="lazy"/><figcaption>${alt}</figcaption></figure>`;
  });

  return `<div class="test-failure-shots">${figures.join('')}</div>`;
}
