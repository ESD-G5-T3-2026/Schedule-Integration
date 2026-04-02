import { buildServer } from "./server.js";

const port = Number(process.env.PORT ?? 6502);
const host = process.env.HOST ?? "0.0.0.0";

buildServer()
  .then((app) => app.listen({ port, host }))
  .then((addr) => {
    console.error(`listening ${addr}`);
    console.error("OpenAPI UI: /docs   (spec: openapi.yaml)");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

