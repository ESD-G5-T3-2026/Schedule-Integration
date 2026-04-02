/**
 * Maps to Timeful hosted API: POST /api/events
 * @see https://github.com/schej-it/timeful.app/blob/main/server/routes/events.go
 */

import { normalizePollDatesWithWindowStart } from "./datesTz.js";
import { durationHoursFromStartEnd, parseHm } from "./timeOfDay.js";

const DEFAULT_TZ = "Asia/Singapore";

/** JSON body sent to Timeful `createEvent`. */
export function toTimefulApiCreateBody(input) {
  const timezone =
    typeof input.timezone === "string" && input.timezone.trim()
      ? input.timezone.trim()
      : typeof process.env.DEFAULT_TIMEZONE === "string" && process.env.DEFAULT_TIMEZONE.trim()
        ? process.env.DEFAULT_TIMEZONE.trim()
        : DEFAULT_TZ;

  const durationHours = durationHoursFromStartEnd(input.start, input.end);
  const startHm = parseHm(input.start);

  const datesUtc =
    input.type === "dow" ? [...input.dates] : normalizePollDatesWithWindowStart(input.dates, timezone, startHm);

  return {
    name: input.eventName.trim(),
    duration: durationHours,
    dates: datesUtc,
    type: input.type,
    /** Matches Timeful UI default (15‑minute cells). */
    timeIncrement: 15,
  };
}

