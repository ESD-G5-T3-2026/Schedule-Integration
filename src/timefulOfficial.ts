/**
 * Maps to Timeful hosted API: POST /api/events
 * @see https://github.com/schej-it/timeful.app/blob/main/server/routes/events.go
 */

import { normalizePollDatesWithWindowStart } from "./datesTz.js";
import { durationHoursFromStartEnd, parseHm } from "./timeOfDay.js";

export type TimefulUrlBody = {
  eventName: string;
  dates: string[];
  type: "specific_dates" | "dow" | "group";
  /** IANA zone for dates + start/end wall clock (default Asia/Singapore). */
  timezone?: string;
  /** Daily window start, 24h — `0800`, `8:00`, `08:00`. */
  start: string;
  /** Daily window end — `2000`, `20:00`. If ≤ start, rolls to next calendar day (overnight). */
  end: string;
};

const DEFAULT_TZ = "Asia/Singapore";

/** JSON body sent to Timeful `createEvent`. */
export function toTimefulApiCreateBody(input: TimefulUrlBody): Record<string, unknown> {
  const timezone =
    (input.timezone?.trim() ||
      process.env.DEFAULT_TIMEZONE?.trim() ||
      DEFAULT_TZ) as string;

  const durationHours = durationHoursFromStartEnd(input.start, input.end);
  const startHm = parseHm(input.start);

  const datesUtc =
    input.type === "dow"
      ? [...input.dates]
      : normalizePollDatesWithWindowStart(input.dates, timezone, startHm);

  return {
    name: input.eventName.trim(),
    duration: durationHours,
    dates: datesUtc,
    type: input.type,
    /** Matches Timeful UI default (15‑minute cells). */
    timeIncrement: 15,
  };
}
