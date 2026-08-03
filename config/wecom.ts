/** 企微机器人 Webhook；可用环境变量 WECOM_WEBHOOK_URL 覆盖。 */
export const DEFAULT_WECOM_WEBHOOK_URL =
  'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=db46d008-e9a3-4c16-ac7d-faa4c6863467';

export function resolveWeComWebhookUrl(): string {
  const fromEnv = process.env.WECOM_WEBHOOK_URL?.trim();
  if (fromEnv) return fromEnv;
  return DEFAULT_WECOM_WEBHOOK_URL;
}
