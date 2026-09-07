/** 商品 cancelDeadlineValue=24，选开课 25 小时以外的时段才能取消/改约。 */
export const CANCEL_LEAD_HOURS = 25;

export interface SlotWallClock {
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export function parseChangeSlotParts(dayHeader: string, slotText: string): SlotWallClock | null {
  const day = dayHeader.match(/(\d{1,2})月(\d{1,2})日/);
  const time = slotText.match(/(\d{2}):(\d{2})\s*-/);
  if (!day || !time) return null;
  return {
    month: Number(day[1]),
    day: Number(day[2]),
    hour: Number(time[1]),
    minute: Number(time[2]),
  };
}

export function parseSelectedSlotParts(summary: string): SlotWallClock | null {
  const match = summary.match(/已选：(\d{2})-(\d{2})\s+周.?\s+(\d{2}):(\d{2})/);
  if (!match) return null;
  return {
    month: Number(match[1]),
    day: Number(match[2]),
    hour: Number(match[3]),
    minute: Number(match[4]),
  };
}

/** 按本地墙钟拼 unix；跨年时若算出的时间早于现在 2 天以上，加一年。 */
export function localSlotUnix(parts: SlotWallClock, now = new Date()): number {
  const start = new Date(now.getFullYear(), parts.month - 1, parts.day, parts.hour, parts.minute, 0);
  if (start.getTime() < now.getTime() - 2 * 24 * 3600 * 1000) {
    start.setFullYear(start.getFullYear() + 1);
  }
  return Math.floor(start.getTime() / 1000);
}
