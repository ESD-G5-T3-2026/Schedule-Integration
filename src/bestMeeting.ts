const HOUR_MS = 60 * 60 * 1000;

export function parseTimefulTimestampToMs(v: unknown): number | null {
  if (v == null) {
    return null;
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    return v;
  }
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  if (typeof v === "object" && v && "$date" in (v as object)) {
    const d = (v as { $date: unknown }).$date;
    if (typeof d === "string") {
      const t = Date.parse(d);
      return Number.isNaN(t) ? null : t;
    }
    if (typeof d === "number" && Number.isFinite(d)) {
      return d;
    }
  }
  return null;
}

function asStringArray(x: unknown): unknown[] {
  return Array.isArray(x) ? x : [];
}

/** Build per-user Set of slot-start times (ms) from `availability` only. */
export function availabilitySetsFromResponses(
  responsesMap: Record<string, unknown>
): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  for (const [userId, raw] of Object.entries(responsesMap)) {
    if (typeof raw !== "object" || !raw) {
      continue;
    }
    const avail = (raw as { availability?: unknown }).availability;
    const set = new Set<number>();
    for (const item of asStringArray(avail)) {
      const ms = parseTimefulTimestampToMs(item);
      if (ms != null) {
        set.add(ms);
      }
    }
    out.set(userId, set);
  }
  return out;
}

export function timeRangeForResponsesQuery(event: Record<string, unknown>): { timeMin: Date; timeMax: Date } {
  const dates = event.dates;
  if (!Array.isArray(dates) || dates.length === 0) {
    throw new Error("Event has no dates");
  }
  const times: number[] = [];
  for (const d of dates) {
    const ms = Date.parse(String(d));
    if (!Number.isNaN(ms)) {
      times.push(ms);
    }
  }
  if (times.length === 0) {
    throw new Error("Event dates could not be parsed");
  }
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const durationH = Number(event.duration);
  const durMs = (Number.isFinite(durationH) && durationH > 0 ? durationH : 24) * HOUR_MS;
  const dayMs = 24 * HOUR_MS;
  const timeMin = new Date(minT - dayMs);
  const timeMax = new Date(maxT + durMs + dayMs);
  return { timeMin, timeMax };
}

export type BestWindow = {
  start: string;
  end: string;
  startMs: number;
  endMs: number;
  availableCount: number;
  allAvailable: boolean;
};

/** Longest run of poll slots where every respondent has that slot (matches Timeful “everyone free” shading). */
export type LargestFullGroupContiguous = {
  start: string;
  end: string;
  durationHours: number;
  slotCount: number;
};

export type BestMeetingResult = {
  slotsNeeded: number;
  timeIncrementMinutes: number;
  respondentsConsidered: number;
  windows: BestWindow[];
  /** Longest contiguous mutual availability; can exceed `meetingDurationHours` or fall short. */
  largestFullGroupContiguous: LargestFullGroupContiguous | null;
};

/**
 * Per poll-day column, longest chain of grid times where every set in `userSets` contains the slot.
 */
export function computeLargestMutualContiguous(
  userSets: Set<number>[],
  dates: unknown[],
  pollWindowMs: number,
  incMs: number
): LargestFullGroupContiguous | null {
  if (userSets.length === 0) {
    return null;
  }

  let best: { startMs: number; slotCount: number } | null = null;

  for (const d of dates) {
    const dayStart = Date.parse(String(d));
    if (Number.isNaN(dayStart)) {
      continue;
    }
    const dayEnd = dayStart + pollWindowMs;

    const mutual: number[] = [];
    for (let t = dayStart; t < dayEnd; t += incMs) {
      if (userSets.every((s) => s.has(t))) {
        mutual.push(t);
      }
    }
    if (mutual.length === 0) {
      continue;
    }

    let runStart = mutual[0];
    let runLen = 1;
    for (let i = 1; i < mutual.length; i++) {
      if (mutual[i] === mutual[i - 1] + incMs) {
        runLen++;
      } else {
        if (!best || runLen > best.slotCount || (runLen === best.slotCount && runStart < best.startMs)) {
          best = { startMs: runStart, slotCount: runLen };
        }
        runStart = mutual[i];
        runLen = 1;
      }
    }
    if (!best || runLen > best.slotCount || (runLen === best.slotCount && runStart < best.startMs)) {
      best = { startMs: runStart, slotCount: runLen };
    }
  }

  if (!best) {
    return null;
  }

  const durationMs = best.slotCount * incMs;
  return {
    start: new Date(best.startMs).toISOString(),
    end: new Date(best.startMs + durationMs).toISOString(),
    durationHours: durationMs / HOUR_MS,
    slotCount: best.slotCount,
  };
}

/**
 * Enumerate grid-aligned window starts (same as Timeful columns: each `dates[i]` + k * increment).
 * A window needs `slotsNeeded` consecutive slot starts spaced by `incMs`.
 */
export function findBestMeetingWindows(
  event: Record<string, unknown>,
  responsesMap: Record<string, unknown>,
  meetingDurationHours: number,
  opts: { maxResults?: number } = {}
): BestMeetingResult {
  const maxResults = opts.maxResults ?? 40;
  const dates = event.dates;
  if (!Array.isArray(dates) || dates.length === 0) {
    throw new Error("Event has no dates");
  }

  const timeIncMin = Number(event.timeIncrement ?? 15);
  const incMs = (Number.isFinite(timeIncMin) && timeIncMin > 0 ? timeIncMin : 15) * 60 * 1000;

  const durationH = Number(event.duration);
  const pollWindowMs =
    Number.isFinite(durationH) && durationH > 0 ? durationH * HOUR_MS : 24 * HOUR_MS;

  const meetingMs = meetingDurationHours * HOUR_MS;
  if (meetingMs <= 0) {
    throw new Error("meetingDurationHours must be positive");
  }

  const slotsNeeded = Math.ceil((meetingDurationHours * 60) / (incMs / 60_000));
  if (slotsNeeded > 10_000) {
    throw new Error("Meeting duration / increment produces too many slots");
  }

  const sets = availabilitySetsFromResponses(responsesMap);
  const usersWithSlots = [...sets.entries()].filter(([, s]) => s.size > 0).map(([id]) => id);
  const respondentsConsidered = usersWithSlots.length;

  const windows: BestWindow[] = [];

  if (respondentsConsidered === 0) {
    return {
      slotsNeeded,
      timeIncrementMinutes: incMs / 60_000,
      respondentsConsidered: 0,
      windows: [],
      largestFullGroupContiguous: null,
    };
  }

  const userSets = usersWithSlots.map((id) => sets.get(id)!);
  const largestFullGroupContiguous = computeLargestMutualContiguous(
    userSets,
    dates,
    pollWindowMs,
    incMs
  );

  for (const d of dates) {
    const dayStart = Date.parse(String(d));
    if (Number.isNaN(dayStart)) {
      continue;
    }
    const dayEnd = dayStart + pollWindowMs;
    if (dayEnd - dayStart < meetingMs - 1e-6) {
      continue;
    }

    for (let t = dayStart; t + meetingMs <= dayEnd + 1e-6; t += incMs) {
      const required: number[] = [];
      for (let k = 0; k < slotsNeeded; k++) {
        required.push(t + k * incMs);
      }

      let count = 0;
      for (const s of userSets) {
        if (required.every((ms) => s.has(ms))) {
          count++;
        }
      }

      if (count === 0) {
        continue;
      }

      const allAvailable = count === respondentsConsidered;
      const endMs = t + meetingMs;
      windows.push({
        start: new Date(t).toISOString(),
        end: new Date(endMs).toISOString(),
        startMs: t,
        endMs,
        availableCount: count,
        allAvailable,
      });
    }
  }

  windows.sort((a, b) => {
    if (a.allAvailable !== b.allAvailable) {
      return a.allAvailable ? -1 : 1;
    }
    if (b.availableCount !== a.availableCount) {
      return b.availableCount - a.availableCount;
    }
    return a.startMs - b.startMs;
  });

  const seen = new Set<string>();
  const unique: BestWindow[] = [];
  for (const w of windows) {
    const key = `${w.startMs}|${w.endMs}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(w);
    if (unique.length >= maxResults) {
      break;
    }
  }

  return {
    slotsNeeded,
    timeIncrementMinutes: incMs / 60_000,
    respondentsConsidered,
    windows: unique,
    largestFullGroupContiguous,
  };
}
