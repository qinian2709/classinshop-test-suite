import { randomBytes, randomInt } from 'node:crypto';

/** 生成短随机串，便于构造唯一测试数据。 */
export function randomString(length = 8): string {
  return randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
}

/** 生成一个中国大陆手机号（13x/15x/18x 段，仅用于构造测试数据，非真实号码）。 */
export function randomPhone(): string {
  const prefixes = ['130', '131', '132', '150', '151', '152', '180', '181', '182'];
  const prefix = prefixes[randomInt(0, prefixes.length)]!;
  let tail = '';
  for (let i = 0; i < 8; i += 1) tail += randomInt(0, 10).toString();
  return `${prefix}${tail}`;
}

/** 生成带前缀与时间戳的唯一名称，便于在被测系统中快速识别测试数据。 */
export function uniqueName(prefix = 'autotest'): string {
  return `${prefix}-${Date.now()}-${randomString(4)}`;
}

export function randomEmail(domain = 'autotest.local'): string {
  return `${uniqueName('u')}@${domain}`;
}
