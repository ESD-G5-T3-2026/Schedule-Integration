/**
 * POST to Timeful create endpoint; expect { timefulUrl } or { shortId }.
 */

import { TIMEFUL_DEFAULT_PUBLIC_BASE } from "./timefulDefaults.js";

export type TimefulCreateResponse = {
  timefulUrl: string;
};

const URL_KEYS = ["timefulUrl", "url", "link", "timefulURL"] as const;

function publicPollUrlFromShortId(shortId: string): string {
  const base = (process.env.TIMEFUL_PUBLIC_BASE_URL ?? TIMEFUL_DEFAULT_PUBLIC_BASE).replace(/\/$/, "");
  return `${base}/e/${shortId}`;
}

export async function requestTimefulUrl(
  baseUrl: string,
  jsonBody: Record<string, unknown>,
  opts: { apiKey?: string; timeoutMs?: number } = {}
): Promise<TimefulCreateResponse> {
  const { apiKey, timeoutMs = 30_000 } = opts;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "user-agent": "schedule-integration/1.0",
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    };

    const res = await fetch(baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(jsonBody),
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
        typeof data === "object" && data && "message" in data
          ? String((data as { message: unknown }).message)
          : text.slice(0, 200);
      throw new Error(`Timeful API ${res.status}: ${msg}`);
    }

    if (typeof data !== "object" || !data) {
      throw new Error("Timeful API: empty or invalid JSON object");
    }

    const o = data as Record<string, unknown>;
    for (const key of URL_KEYS) {
      const v = o[key];
      if (typeof v === "string" && v.length > 0) {
        return { timefulUrl: v };
      }
    }

    const shortId = o.shortId;
    if (typeof shortId === "string" && shortId.length > 0) {
      return { timefulUrl: publicPollUrlFromShortId(shortId) };
    }

    throw new Error(
      `Timeful API: response missing timefulUrl or shortId (got keys: ${Object.keys(o).join(", ")})`
    );
  } finally {
    clearTimeout(t);
  }
}
