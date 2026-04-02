/**
 * Timeful `GET /api/events/:eventId/responses?timeMin=&timeMax=`
 */

export async function fetchTimefulResponsesJson(
  apiBase: string,
  eventId: string,
  timeMin: Date,
  timeMax: Date,
  opts: { apiKey?: string; timeoutMs?: number } = {}
): Promise<Record<string, unknown>> {
  const { apiKey, timeoutMs = 60_000 } = opts;
  const base = apiBase.replace(/\/$/, "");
  const q = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
  });
  const url = `${base}/events/${encodeURIComponent(eventId)}/responses?${q.toString()}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      "user-agent": "schedule-integration/1.0",
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    };

    const res = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`Timeful API returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
    }

    if (!res.ok) {
      const msg =
        typeof data === "object" && data && "error" in data
          ? String((data as { error: unknown }).error)
          : text.slice(0, 200);
      const err = new Error(`Timeful API ${res.status}: ${msg}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }

    if (typeof data !== "object" || !data) {
      throw new Error("Timeful API: empty or invalid JSON object");
    }

    return data as Record<string, unknown>;
  } finally {
    clearTimeout(t);
  }
}
