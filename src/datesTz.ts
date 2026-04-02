import { DateTime } from "luxon";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** True if string ends with Z or ±HH:MM offset. */
function hasExplicitOffset(iso: string): boolean {
  return /Z$/i.test(iso) || /[+-]\d{2}:\d{2}$/.test(iso);
}

/**
 * Each entry → UTC ISO instant for Timeful `dates[]`.
 * - `YYYY-MM-DD` → start of that **calendar day** in `timezone` (e.g. Singapore).
 * - Datetime **with** `Z` or `±offset` → parsed as that instant, output UTC ISO.
 * - Datetime **without** zone → interpreted in `timezone` (wall time in SG, etc.).
 */
/**
 * Like {@link normalizeDatesToUtcIso}, but each **`YYYY-MM-DD`** is anchored at **`start`** wall time in `timezone`
 * (same as Timeful’s “New event” flow: one column per day, grid runs `duration` hours from that instant).
 */
export function normalizePollDatesWithWindowStart(
  dates: string[],
  timezone: string,
  start: { hour: number; minute: number }
): string[] {
  return dates.map((raw, i) => {
    const s = raw.trim();
    if (!s) {
      throw new Error(`dates[${i}] is empty`);
    }

    if (DATE_ONLY.test(s)) {
      const dt = DateTime.fromISO(s, { zone: timezone }).set({
        hour: start.hour,
        minute: start.minute,
        second: 0,
        millisecond: 0,
      });
      if (!dt.isValid) {
        throw new Error(`dates[${i}] invalid calendar date "${s}" in ${timezone}: ${dt.invalidReason}`);
      }
      return dt.toUTC().toISO()!;
    }

    return normalizeDatesToUtcIso([s], timezone)[0]!;
  });
}

export function normalizeDatesToUtcIso(dates: string[], timezone: string): string[] {
  return dates.map((raw, i) => {
    const s = raw.trim();
    if (!s) {
      throw new Error(`dates[${i}] is empty`);
    }

    if (DATE_ONLY.test(s)) {
      const dt = DateTime.fromISO(s, { zone: timezone }).startOf("day");
      if (!dt.isValid) {
        throw new Error(`dates[${i}] invalid calendar date "${s}" in ${timezone}: ${dt.invalidReason}`);
      }
      return dt.toUTC().toISO()!;
    }

    if (hasExplicitOffset(s)) {
      const dt = DateTime.fromISO(s, { setZone: true });
      if (!dt.isValid) {
        throw new Error(`dates[${i}] invalid ISO with offset "${s}": ${dt.invalidReason}`);
      }
      return dt.toUTC().toISO()!;
    }

    const dt = DateTime.fromISO(s, { zone: timezone });
    if (!dt.isValid) {
      throw new Error(`dates[${i}] invalid datetime "${s}" in ${timezone}: ${dt.invalidReason}`);
    }
    return dt.toUTC().toISO()!;
  });
}
