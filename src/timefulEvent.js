/**
 * Read-only calls against Timeful `GET /api/events/:eventId`
 * @see https://github.com/schej-it/timeful.app/blob/main/server/routes/events.go
 */

/** Extract short id from `https://timeful.app/e/7A9Ca` or accept `7A9Ca` / 24-char hex id. */
export function parseTimefulEventId(input) {
  const s = input.trim();
  if (!s) {
    throw new Error("timefulUrl is empty");
  }
  const fromPath = s.match(/\/e\/([^/?#]+)/i);
  if (fromPath) {
    return fromPath[1];
  }
  if (/^[a-f\d]{24}$/i.test(s)) {
    return s;
  }
  if (/^[A-Za-z0-9_-]{1,32}$/.test(s)) {
    return s;
  }
  throw new Error(
    `Could not parse Timeful event id from "${s.slice(0, 96)}${s.length > 96 ? "…" : ""}"; use /e/{shortId} URL or short id`,
  );
}

export function statsFromTimefulEventJson(data) {
  const numRaw = data.numResponses;
  const numResponses = typeof numRaw === "number" && Number.isFinite(numRaw) ? numRaw : null;

  const responses = data.responses;
  let respondentCount = 0;
  if (responses && typeof responses === "object" && !Array.isArray(responses)) {
    respondentCount = Object.keys(responses).length;
  }

  return {
    shortId: typeof data.shortId === "string" ? data.shortId : undefined,
    name: typeof data.name === "string" ? data.name : undefined,
    numResponses,
    respondentCount,
  };
}

export async function fetchTimefulEventJson(apiBase, eventId, opts = {}) {
  const { apiKey, timeoutMs = 30_000 } = opts;
  const url = `${apiBase.replace(/\/$/, "")}/events/${encodeURIComponent(eventId)}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = {
      "user-agent": "schedule-integration/1.0",
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    };

    const res = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`Timeful API returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
    }

    if (!res.ok) {
      const msg =
        typeof data === "object" && data && "error" in data ? String(data.error) : text.slice(0, 200);
      const err = new Error(`Timeful API ${res.status}: ${msg}`);
      err.status = res.status;
      throw err;
    }

    if (typeof data !== "object" || !data) {
      throw new Error("Timeful API: empty or invalid JSON object");
    }

    return data;
  } finally {
    clearTimeout(t);
  }
}

