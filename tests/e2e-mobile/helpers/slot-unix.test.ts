import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  CANCEL_LEAD_HOURS,
  localSlotUnix,
  parseChangeSlotParts,
  parseSelectedSlotParts,
} from './slot-unix.ts';

describe('parseChangeSlotParts', () => {
  test('reads 改约页日标题 + 时段按钮', () => {
    const parts = parseChangeSlotParts('9月7日 周一 · 老师可预约', '02:00 - 03:00\n60min');
    assert.deepEqual(parts, { month: 9, day: 7, hour: 2, minute: 0 });
  });

  test('returns null when header or slot text is incomplete', () => {
    assert.equal(parseChangeSlotParts('改约', '选择'), null);
  });
});

describe('cancel lead window', () => {
  const now = new Date(2026, 8, 6, 11, 24, 0);
  const minUnix = Math.floor(now.getTime() / 1000) + CANCEL_LEAD_HOURS * 3600;

  test('9月7日 02:00 is inside 24h cancel deadline', () => {
    const parts = parseChangeSlotParts('9月7日 周一 · 老师可预约', '02:00 - 03:00');
    assert.ok(parts);
    assert.ok(localSlotUnix(parts, now) < minUnix);
  });

  test('9月14日 10:00 is outside cancel deadline', () => {
    const parts = parseChangeSlotParts('9月14日 周一 · 老师可预约', '10:00 - 11:00');
    assert.ok(parts);
    assert.ok(localSlotUnix(parts, now) >= minUnix);
  });
});

describe('parseSelectedSlotParts', () => {
  test('reads 选时段页已选摘要', () => {
    assert.deepEqual(parseSelectedSlotParts('已选：09-14 周一 10:00-11:00'), {
      month: 9,
      day: 14,
      hour: 10,
      minute: 0,
    });
  });
});
