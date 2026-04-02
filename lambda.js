import awsLambdaFastify from "@fastify/aws-lambda";

// Initialize the Fastify app during the Lambda "init" phase so the first
// request doesn't spend most of the function timeout compiling/swagger setup.
const proxyPromise = (async () => {
  const mod = await import("./src/server.js");
  const { buildServer } = mod;
  const app = await buildServer();
  return awsLambdaFastify(app);
})();

export const handler = async (event, context) => {
  const proxy = await proxyPromise;
  return proxy(event, context);
};

