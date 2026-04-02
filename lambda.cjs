'use strict';

const awsLambdaFastify = require('@fastify/aws-lambda');

// Lazily initialized (keeps cold-start cost down and reuses app between invocations).
let proxyPromise;

exports.handler = async (event, context) => {
  if (!proxyPromise) {
    proxyPromise = (async () => {
      const mod = await import('./dist/server.js');
      const { buildServer } = mod;

      const app = await buildServer();
      return awsLambdaFastify(app);
    })();
  }

  const proxy = await proxyPromise;
  return proxy(event, context);
};

