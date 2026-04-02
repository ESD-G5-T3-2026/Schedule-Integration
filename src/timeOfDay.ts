/** Parse `0800`, `8:00`, `08:00`, `8:00am` not supported — 24h only. */
export function parseHm(s: string): { hour: number; minute: number } {
  const t = s.trim().replace(/\s/g, "");
  if (!t) {
    throw new Error("start/end must be non-empty");
  }
  if (/^\d{3,4}$/.test(t)) {
    const p = t.padStart(4, "0");
    const hour = Number(p.slice(0, 2));
    const minute = Number(p.slice(2, 4));
    return validateHm(hour, minute, s);
  }
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    return validateHm(Number(m[1]), Number(m[2]), s);
  }
  throw new Error(
    `Invalid time "${s}"; use HHmm (0800, 2000) or H:mm / HH:mm (8:00, 20:00), 24-hour`
  );
}

function validateHm(hour: number, minute: number, raw: string): { hour: number; minute: number } {
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || !Number.isInteger(minute)) {
    throw new Error(`Invalid time "${raw}" (hour 0–23, minute 0–59)`);
  }
  return { hour, minute };
}

/** Length of the daily window in **hours** (float). If end ≤ start on the clock, end is next calendar day. */
export function durationHoursFromStartEnd(startStr: string, endStr: string): number {
  const sh = parseHm(startStr);
  const eh = parseHm(endStr);
  let startNum = sh.hour + sh.minute / 60;
  let endNum = eh.hour + eh.minute / 60;
  if (endNum <= startNum) {
    endNum += 24;
  }
  const durationHours = endNum - startNum;
  if (durationHours < 1 / 60) {
    throw new Error("start and end must differ by at least 1 minute");
  }
  return durationHours;
}
