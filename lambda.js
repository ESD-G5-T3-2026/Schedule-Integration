function normalizePath(p) {
  if (typeof p !== "string") return "";
  const withoutQuery = p.split("?")[0];
  // Remove trailing slashes so `/health/` matches `/health`.
  const trimmed = withoutQuery.replace(/\/+$/, "");
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function isHealthRequest(event) {
  const candidates = [
    event?.rawPath,
    event?.path,
    event?.requestContext?.http?.path,
    event?.requestContext?.http?.rawPath,
  ];
  for (const c of candidates) {
    if (normalizePath(c) === "/health") return true;
  }
  return false;
}

// Lazy init: only build Fastify when the request is not `/health`.
// This prevents `/health` from dying due to cold-start/setup time.
let proxyPromise;

export const handler = async (event, context) => {
  // Function URL event shapes vary; log the candidates so we can see why `/health` might miss.
  let cand = [];
  try {
    cand = [
      event?.rawPath,
      event?.path,
      event?.requestContext?.http?.path,
      event?.requestContext?.http?.rawPath,
    ].map((x) => (typeof x === "string" ? normalizePath(x) : x));
  } catch {
    // ignore
  }
  console.error("[lambda] path candidates:", cand);

  if (isHealthRequest(event)) {
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true }),
    };
  }

  if (!proxyPromise) {
    const t0 = Date.now();
    proxyPromise = (async () => {
      console.error("[lambda:init] importing server.js...");
      const mod = await import("./src/server.js");
      const { buildServer } = mod;
      console.error("[lambda:init] building Fastify app...");
      const app = await buildServer();
      console.error(`[lambda:init] building done in ${Date.now() - t0}ms`);
      const { default: awsLambdaFastify } = await import("@fastify/aws-lambda");
      return awsLambdaFastify(app);
    })();
  }

  const proxy = await proxyPromise;
  return proxy(event, context);
};

