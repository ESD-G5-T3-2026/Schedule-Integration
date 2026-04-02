import Fastify from "fastify";
import cors from "@fastify/cors";
import { requestTimefulUrl } from "./timeful.js";
import { toTimefulApiCreateBody, type TimefulUrlBody } from "./timefulOfficial.js";
import { getTimefulApiBase, TIMEFUL_DEFAULT_CREATE_URL } from "./timefulDefaults.js";
import {
  fetchTimefulEventJson,
  parseTimefulEventId,
  statsFromTimefulEventJson,
} from "./timefulEvent.js";
import { fetchTimefulResponsesJson } from "./timefulResponses.js";
import {
  findBestMeetingWindows,
  timeRangeForResponsesQuery,
} from "./bestMeeting.js";
import { registerSwagger, schemas } from "./swagger.js";

/** Effective create URL; env override for self-hosted Timeful. */
const TIMEFUL_API_URL = (process.env.TIMEFUL_API_URL ?? TIMEFUL_DEFAULT_CREATE_URL).replace(/\/$/, "");
const TIMEFUL_API_KEY = process.env.TIMEFUL_API_KEY;
const TIMEFUL_API_BASE = getTimefulApiBase();

/**
 * POST body → Timeful POST /api/events → { timefulUrl }
 */
export async function buildServer() {
  const app = Fastify({
    logger: true,
    ajv: {
      customOptions: {
        /** Allow `example` / OpenAPI-only keywords on route schemas for Swagger UI. */
        strict: false,
      },
    },
  });

  await app.register(cors, {
    /** Mirror `Origin` so Swagger “Execute” works when UI is `127.0.0.1` but spec says `localhost` (or vice versa). */
    origin: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  await registerSwagger(app);

  app.get("/health", { schema: schemas.health }, async () => ({ ok: true }));

  app.post("/timeful-best-times", { schema: schemas.timefulBestTimes }, async (req, reply) => {
    const body = req.body as {
      timefulUrl?: string;
      meetingDurationHours?: number;
      maxResults?: number;
    };
    const rawUrl = body.timefulUrl;
    if (typeof rawUrl !== "string" || !rawUrl.trim()) {
      return reply.code(400).send({ error: "timefulUrl is required" });
    }
    const md = body.meetingDurationHours;
    if (typeof md !== "number" || !Number.isFinite(md) || md <= 0 || md > 168) {
      return reply.code(400).send({
        error: "meetingDurationHours must be a finite number in (0, 168]",
      });
    }
    const maxResults =
      typeof body.maxResults === "number" &&
      Number.isFinite(body.maxResults) &&
      body.maxResults >= 1 &&
      body.maxResults <= 200
        ? Math.floor(body.maxResults)
        : 40;

    let eventId: string;
    try {
      eventId = parseTimefulEventId(rawUrl);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.code(400).send({ error: msg });
    }

    let event: Record<string, unknown>;
    try {
      event = await fetchTimefulEventJson(TIMEFUL_API_BASE, eventId, {
        apiKey: TIMEFUL_API_KEY,
      });
    } catch (e) {
      const err = e as Error & { status?: number };
      const status = err.status === 404 ? 404 : 502;
      return reply.code(status).send({ error: err.message ?? String(e) });
    }

    if (event.daysOnly === true) {
      return reply.code(400).send({
        error: "Event is days-only; there is no time grid to score",
      });
    }
    if (event.blindAvailabilityEnabled === true) {
      return reply.code(403).send({
        error:
          "Blind availability: Timeful only returns full responses to the owner (signed in). This API cannot aggregate anonymous callers.",
      });
    }
    if (event.type === "dow") {
      return reply.code(400).send({
        error:
          "Days-of-week polls use a rolling calendar window; use a specific_dates event or extend the client with an explicit time range.",
      });
    }

    let timeMin: Date;
    let timeMax: Date;
    try {
      ({ timeMin, timeMax } = timeRangeForResponsesQuery(event));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.code(400).send({ error: msg });
    }

    let responsesMap: Record<string, unknown>;
    try {
      responsesMap = await fetchTimefulResponsesJson(TIMEFUL_API_BASE, eventId, timeMin, timeMax, {
        apiKey: TIMEFUL_API_KEY,
      });
    } catch (e) {
      const err = e as Error & { status?: number };
      return reply.code(502).send({ error: err.message ?? String(e) });
    }

    let result;
    try {
      result = findBestMeetingWindows(event, responsesMap, md, { maxResults });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.code(400).send({ error: msg });
    }

    const shortId = typeof event.shortId === "string" ? event.shortId : eventId;
    const name = typeof event.name === "string" ? event.name : undefined;

    const hasFullGroupForRequestedDuration = result.windows.some((w) => w.allAvailable);

    return {
      shortId,
      name,
      meetingDurationHours: md,
      timeIncrementMinutes: result.timeIncrementMinutes,
      slotsNeeded: result.slotsNeeded,
      respondentsConsidered: result.respondentsConsidered,
      hasFullGroupForRequestedDuration,
      largestFullGroupContiguous: result.largestFullGroupContiguous,
      windows: result.windows.map(({ start, end, availableCount, allAvailable }) => ({
        start,
        end,
        availableCount,
        allAvailable,
      })),
    };
  });

  app.get("/timeful-response-count", { schema: schemas.timefulResponseCount }, async (req, reply) => {
    const q = req.query as { timefulUrl?: string };
    const raw = q.timefulUrl;
    if (typeof raw !== "string" || !raw.trim()) {
      return reply.code(400).send({ error: "query parameter timefulUrl is required" });
    }
    let eventId: string;
    try {
      eventId = parseTimefulEventId(raw);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.code(400).send({ error: msg });
    }

    try {
      const json = await fetchTimefulEventJson(TIMEFUL_API_BASE, eventId, {
        apiKey: TIMEFUL_API_KEY,
      });
      const stats = statsFromTimefulEventJson(json);
      return {
        shortId: stats.shortId ?? eventId,
        name: stats.name,
        numResponses: stats.numResponses,
        respondentCount: stats.respondentCount,
      };
    } catch (e) {
      const err = e as Error & { status?: number };
      const status = err.status === 404 ? 404 : 502;
      return reply.code(status).send({
        error: err.message ?? String(e),
      });
    }
  });

  app.post("/timeful-url", { schema: schemas.timefulUrl }, async (req, reply) => {
    const body = req.body as TimefulUrlBody;
    let jsonBody: Record<string, unknown>;
    try {
      jsonBody = toTimefulApiCreateBody(body);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.code(400).send({ error: msg });
    }
    const { timefulUrl } = await requestTimefulUrl(TIMEFUL_API_URL, jsonBody, {
      apiKey: TIMEFUL_API_KEY,
    });

    return { timefulUrl };
  });

  return app;
}
