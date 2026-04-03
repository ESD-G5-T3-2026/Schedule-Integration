import { TIMEFUL_API_KEY, TIMEFUL_FETCH_TIMEOUT_MS, getTimefulCreateApiUrl } from "./config.js";
import { toTimefulApiCreateBody } from "./timefulOfficial.js";
import { requestTimefulUrl } from "./timeful.js";

function normalizePath(p) {
  if (typeof p !== "string") return "";
  const withoutQuery = p.split("?")[0];
  const trimmed = withoutQuery.replace(/\/+$/, "");
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function getPath(event) {
  const candidates = [
    event?.rawPath,
    event?.path,
    event?.requestContext?.http?.path,
    event?.requestContext?.http?.rawPath,
  ];
  for (const c of candidates) {
    const n = normalizePath(c);
    if (n) return n;
  }
  return "";
}

function getMethod(event) {
  const m = event?.requestContext?.http?.method || event?.httpMethod || event?.method;
  return typeof m === "string" ? m.toUpperCase() : "";
}

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  };
}

function parseJsonBody(event) {
  if (event?.body == null) return null;
  const raw = event.body;
  let text;
  if (typeof raw === "string") {
    if (event.isBase64Encoded) {
      text = Buffer.from(raw, "base64").toString("utf8");
    } else {
      text = raw;
    }
  } else {
    return raw;
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Request body must be valid JSON");
  }
}

let proxyPromise;

async function getProxy() {
  if (proxyPromise) return proxyPromise;
  // Only build Fastify when we need it (everything except /health and /timeful-url).
  proxyPromise = (async () => {
    console.error("[lambda:init] importing server.js...");
    const mod = await import("./server.js");
    const { buildServer } = mod;
    console.error("[lambda:init] building Fastify app...");
    const app = await buildServer();
    console.error("[lambda:init] Fastify app built");

    const { default: awsLambdaFastify } = await import("@fastify/aws-lambda");
    return awsLambdaFastify(app);
  })();
  return proxyPromise;
}

async function handleTimefulUrl(event) {
  const body = parseJsonBody(event);
  if (!body || typeof body !== "object") {
    return { statusCode: 400, payload: { error: "Request body is required" } };
  }

  const allowedTypes = new Set(["specific_dates", "dow", "group"]);
  if (typeof body.eventName !== "string" || !body.eventName.trim()) {
    return { statusCode: 400, payload: { error: "eventName is required" } };
  }
  if (!Array.isArray(body.dates) || body.dates.length === 0) {
    return { statusCode: 400, payload: { error: "dates must be a non-empty array" } };
  }
  if (!allowedTypes.has(body.type)) {
    return { statusCode: 400, payload: { error: "type must be one of specific_dates|dow|group" } };
  }
  if (typeof body.start !== "string" || !body.start.trim()) {
    return { statusCode: 400, payload: { error: "start is required" } };
  }
  if (typeof body.end !== "string" || !body.end.trim()) {
    return { statusCode: 400, payload: { error: "end is required" } };
  }

  const baseUrl = getTimefulCreateApiUrl();
  const t0 = Date.now();
  try {
    const jsonBody = toTimefulApiCreateBody(body);
    console.error(`[lambda] built Timeful create payload in ${Date.now() - t0}ms`);

    const t1 = Date.now();
    const { timefulUrl } = await requestTimefulUrl(baseUrl, jsonBody, {
      apiKey: TIMEFUL_API_KEY,
      timeoutMs: TIMEFUL_FETCH_TIMEOUT_MS,
    });
    console.error(`[lambda] Timeful create returned in ${Date.now() - t1}ms`);

    return { statusCode: 200, payload: { timefulUrl } };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    const status = err?.status && Number.isFinite(err.status) ? err.status : 502;
    const replyStatus = status >= 400 && status < 500 ? 400 : status;
    return { statusCode: replyStatus, payload: { error: err.message ?? String(err) } };
  }
}

export const handler = async (event, context) => {
  const path = getPath(event);
  const method = getMethod(event);
  console.error("[lambda] request:", { method, path });

  if (path === "/health") {
    return jsonResponse(200, { ok: true });
  }

  if (method === "POST" && path === "/timeful-url") {
    const { statusCode, payload } = await handleTimefulUrl(event);
    return jsonResponse(statusCode, payload);
  }

  const proxy = await getProxy();
  return proxy(event, context);
};

