import awsLambdaFastify from "@fastify/aws-lambda";

function isHealthRequest(event) {
  const p =
    event?.rawPath ||
    event?.path ||
    event?.requestContext?.http?.path ||
    event?.requestContext?.http?.rawPath;
  return p === "/health";
}

// Lazy init: only build Fastify when the request is not `/health`.
// This prevents `/health` from dying due to cold-start/setup time.
let proxyPromise;

export const handler = async (event, context) => {
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
      return awsLambdaFastify(app);
    })();
  }

  const proxy = await proxyPromise;
  return proxy(event, context);
};

