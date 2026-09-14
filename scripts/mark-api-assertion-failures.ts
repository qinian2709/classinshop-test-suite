export interface ReportStep {
  title?: string;
  status?: string;
  error?: string;
  steps?: ReportStep[];
}

export interface ReportApiRequest {
  attachmentName?: string;
  assertions?: string[];
  assertionFailed?: boolean;
}

const ATTACH_TITLE = /^Attach ["“](.+?)["”]$/;

export function parseAttachStepName(title: string | undefined): string | undefined {
  if (!title) return undefined;
  const match = title.match(ATTACH_TITLE);
  return match?.[1];
}

function isFailedStep(step: ReportStep): boolean {
  return step.status === 'failed' || Boolean(step.error);
}

function isFailedLeaf(step: ReportStep): boolean {
  if (!isFailedStep(step)) return false;
  return !(step.steps ?? []).some(isFailedStep);
}

function assertionMatchesFailure(assertion: string, failedTexts: string[]): boolean {
  const needle = assertion.trim();
  if (!needle) return false;
  if (/[✓✔]/.test(needle) && !/[✗✘×]/.test(needle)) return false;
  return failedTexts.some((text) => {
    const hay = text.trim();
    if (!hay) return false;
    return hay.includes(needle) || needle.includes(hay);
  });
}

function markByAssertionText(apiRequests: ReportApiRequest[], failedTexts: string[]): void {
  let lastMatch: ReportApiRequest | undefined;
  for (const req of apiRequests) {
    if ((req.assertions ?? []).some((assertion) => assertionMatchesFailure(assertion, failedTexts))) {
      lastMatch = req;
    }
  }
  if (lastMatch) lastMatch.assertionFailed = true;
}

function markFailedLeaf(
  apiRequests: ReportApiRequest[],
  lastAttachName: string | undefined,
  failedTexts: string[],
): void {
  if (lastAttachName) {
    const byName = [...apiRequests].reverse().find((req) => req.attachmentName === lastAttachName);
    const assertions = byName?.assertions ?? [];
    if (
      byName &&
      (!assertions.length || assertions.some((assertion) => assertionMatchesFailure(assertion, failedTexts)))
    ) {
      byName.assertionFailed = true;
      return;
    }
  }
  markByAssertionText(apiRequests, failedTexts);
}

/**
 * 附件在业务 expect 之前写入，assertionFailed 当时只反映耗时。
 * 报告分组时用失败步骤把对应请求标出来，避免断言失败仍进「通过的请求」。
 */
export function markApiRequestsFailedBySteps(
  apiRequests: ReportApiRequest[],
  steps: ReportStep[] | undefined,
  testError?: string,
): ReportApiRequest[] {
  if (!apiRequests.length) return apiRequests;

  let lastAttachName: string | undefined;
  let markedFromLeaf = false;

  const visit = (list?: ReportStep[]): void => {
    if (!list) return;
    for (const step of list) {
      const attachName = parseAttachStepName(step.title);
      if (attachName) lastAttachName = attachName;

      if (isFailedLeaf(step)) {
        const failedTexts = [step.title, step.error].filter((text): text is string => Boolean(text));
        markFailedLeaf(apiRequests, lastAttachName, failedTexts);
        markedFromLeaf = true;
      }
      visit(step.steps);
    }
  };

  visit(steps);

  if (!markedFromLeaf && testError) {
    markByAssertionText(apiRequests, [testError]);
  }

  return apiRequests;
}
