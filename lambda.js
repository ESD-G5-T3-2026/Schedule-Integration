import awsLambdaFastify from "@fastify/aws-lambda";

// Initialize the Fastify app during the Lambda "init" phase.
// We also log init timings because Function URL errors often come from init-time failures/timeouts.
const proxyPromise = (async () => {
  const t0 = Date.now();
  try {
    console.error("[lambda:init] importing server.js...");
    const mod = await import("./src/server.js");
    const { buildServer } = mod;
    console.error("[lambda:init] building Fastify app...");
    const app = await buildServer();
    console.error(`[lambda:init] building done in ${Date.now() - t0}ms`);
    return awsLambdaFastify(app);
  } catch (err) {
    console.error("[lambda:init] failed", err);
    throw err;
  }
})();

export const handler = async (event, context) => {
  const proxy = await proxyPromise;
  return proxy(event, context);
};

