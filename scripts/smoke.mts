/**
 * In-process smoke: GET /health (no outbound Timeful call).
 */
const { buildServer } = await import("../src/server.js");

const app = await buildServer();
await app.listen({ port: 0, host: "127.0.0.1" });
const addr = app.server.address();
const port = typeof addr === "object" && addr ? addr.port : 8080;
const base = `http://127.0.0.1:${port}`;

try {
  const r = await fetch(`${base}/health`);
  if (!r.ok) throw new Error(`health ${r.status}: ${await r.text()}`);
  const j = (await r.json()) as { ok?: boolean };
  if (j.ok !== true) throw new Error(`unexpected body: ${JSON.stringify(j)}`);
  console.log("smoke ok", j);
} finally {
  await app.close();
}
