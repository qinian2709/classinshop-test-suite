/** 企微机器人 Webhook；可用环境变量 WECOM_WEBHOOK_URL 覆盖。 */
export const DEFAULT_WECOM_WEBHOOK_URL =
  'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=db46d008-e9a3-4c16-ac7d-faa4c6863467';

/**
 * 测试失败时 @ 的手机号（须是该群成员在企微绑定的手机）。
 * 成功 / 跳过不 @。可用 WECOM_MENTION_MOBILES 覆盖（逗号分隔）。
 */
export const DEFAULT_WECOM_MENTION_MOBILES: string[] = ['17302212709'];

export function resolveWeComWebhookUrl(): string {
  const fromEnv = process.env.WECOM_WEBHOOK_URL?.trim();
  if (fromEnv) return fromEnv;
  return DEFAULT_WECOM_WEBHOOK_URL;
}

export function parseWeComMentionMobiles(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return [
    ...new Set(
      raw
        .split(/[,，\s]+/)
        .map((item) => item.trim())
        .filter((item) => item === '@all' || /^\d{5,20}$/.test(item)),
    ),
  ];
}

export function resolveWeComMentionMobiles(): string[] {
  const fromEnv = process.env.WECOM_MENTION_MOBILES?.trim();
  if (fromEnv) return parseWeComMentionMobiles(fromEnv);
  return parseWeComMentionMobiles(DEFAULT_WECOM_MENTION_MOBILES.join(','));
}
