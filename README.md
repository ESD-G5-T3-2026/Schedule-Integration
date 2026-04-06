# schedule-integration

Small **Fastify** service that talks to [Timeful](https://timeful.app): create scheduling polls, read response stats, and score **best contiguous meeting windows** from participant availability.

Requires **Node.js ≥ 20**.

## Run locally

```bash
npm install
npm run dev    # or: npm start
```

Defaults: **`HOST=0.0.0.0`**, **`PORT=6502`**.

In-process health check (no Timeful call):

```bash
npm run smoke
```

## API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | `{ ok: true }` |
| `POST` | `/timeful-url` | Create a Timeful event → `{ timefulUrl }` |
| `GET` | `/timeful-response-count?timefulUrl=…` | `numResponses`, `respondentCount`, metadata |
| `POST` | `/timeful-best-times` | Ranked UTC windows for a requested duration |

### `POST /timeful-url`

JSON body (validated in Lambda and server):

- **`eventName`** (string, required)
- **`dates`** (non-empty array, required)
- **`type`**: `specific_dates` | `dow` | `group`
- **`start`**, **`end`** (strings, required) — daily window in **`timezone`** (24h forms like `0800`, `8:00`, `20:00`). **`duration`** sent to Timeful is the window length in hours; overnight if `end ≤ start` on the clock; `00:00`–`00:00` → 24h.
- **`timezone`** (optional IANA) — defaults to **`Asia/Singapore`**, or env **`DEFAULT_TIMEZONE`**

Payload is mapped to Timeful `POST /api/events` with **`timeIncrement`: 15** (see `src/timefulOfficial.js`).

### `POST /timeful-best-times`

```json
{
  "timefulUrl": "https://timeful.app/e/SHORTID",
  "meetingDurationHours": 1.5,
  "maxResults": 40
}
```

- **`timefulUrl`**: share URL (`/e/…`), short id, or 24-char hex id
- **`meetingDurationHours`**: finite, in `(0, 168]`
- **`maxResults`**: optional, 1–200 (default **40**)

Uses Timeful `GET /api/events/:id` and responses for that event’s time range, then returns ranked windows plus **`largestFullGroupContiguous`** (longest stretch where everyone is free).

**Rejected / limited cases:** days-only events (no time grid), **blind** availability (anonymous aggregation not possible), **`dow`** polls (needs an explicit range — see error message).

### `GET /timeful-response-count`

Query: **`timefulUrl`** — same accepted forms as above. Proxies event JSON and derives counts.

## Environment variables

| Variable | Role |
|----------|------|
| `TIMEFUL_API_KEY` | Optional `Authorization: Bearer …` for Timeful (needed when the API requires it) |
| `TIMEFUL_API_URL` | Override create URL (default `https://timeful.app/api/events`) |
| `TIMEFUL_PUBLIC_BASE_URL` | Public site base; API base becomes `{base}/api` unless `TIMEFUL_API_BASE` is set |
| `TIMEFUL_API_BASE` | Full API base for `GET …/events/…` (no trailing slash), e.g. `https://timeful.app/api` |
| `TIMEFUL_FETCH_TIMEOUT_MS` | Outbound fetch timeout (default **2500**) — keep under Lambda limits if deployed |
| `DEFAULT_TIMEZONE` | Default IANA zone when request omits `timezone` |
| `PORT`, `HOST` | Local server (`main.js`) |
| `ENABLE_SWAGGER` | Set to `true` to register **`/docs`** and interactive OpenAPI (off by default for faster cold start) |

Static OpenAPI spec: **`openapi.yaml`**.

## AWS Lambda

Entry: **`lambda.js`** → `handler` in `src/app.js`.

- **`GET /health`** and **`POST /timeful-url`** are handled without loading the full Fastify app.
- Other routes go through **`@fastify/aws-lambda`** and the same `buildServer()` as local.

Do not commit secrets; set `TIMEFUL_API_KEY` (and URL overrides) in the function environment.

## Layout

- `src/server.js` — routes and `buildServer()`
- `src/main.js` — local `listen`
- `src/app.js` — Lambda routing + lazy Fastify proxy
- `src/timeful*.js`, `src/bestMeeting.js` — Timeful HTTP clients and window scoring

## License

Private package (`package.json`); add a license file if you open-source it.
