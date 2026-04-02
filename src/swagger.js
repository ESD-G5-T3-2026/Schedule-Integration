import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";

const INFO_DESCRIPTION = [
  "Creates a Timeful poll via this service → **POST** to Timeful `POST /api/events` → returns `{ timefulUrl }`.",
  "",
  "### Timezone (Singapore UTC+8)",
  "Optional **`timezone`** (IANA) defaults to **`Asia/Singapore`**. You can also set env **`DEFAULT_TIMEZONE`**.",
  "For **`specific_dates`** and **`group`**:",
  "- **`YYYY-MM-DD`** → that calendar day at **`start`** wall time in `timezone`, then UTC ISO (same idea as Timeful’s own “New event” form).",
  "- **ISO with `Z` or `±HH:MM`** / **ISO without zone** → same rules as before: that wall instant, normalized to UTC (`start` does not rewrite these).",
  "For **`dow`**, `dates` are **not** converted — use Timeful’s weekday anchor dates (see Timeful PLUGIN_API / server).",
  "",
  "### Daily time window (`start` / `end`)",
  "Use **24-hour** local times in **`timezone`** (e.g. Singapore): **`0800`** or **`8:00`** / **`20:00`**. They define how long the grid runs each day.",
  "We send **`duration`** = `end − start` in **hours** (float), **`timeIncrement`: 15**, and **no** `hasSpecificTimes` / `times` — those are only for picking discrete slot timestamps in Timeful’s UI, not a from–to window.",
  "If **end ≤ start** on the clock, **end** is the **next calendar day** (overnight). **00:00–00:00** → 24h window.",
  "",
  "### Other",
  "- **Swagger Execute:** pick server **`/`** or match your browser URL. CORS is enabled.",
  "- **Env:** `TIMEFUL_API_URL`, `TIMEFUL_API_BASE`, `TIMEFUL_PUBLIC_BASE_URL`, `TIMEFUL_API_KEY`, `DEFAULT_TIMEZONE`.",
  "",
  "### Response count",
  "**`GET /timeful-response-count?timefulUrl=…`** proxies to Timeful **`GET /api/events/:id`** and returns **`numResponses`** plus **`respondentCount`** (`responses` map size). Works with share links like `https://timeful.app/e/7A9Ca`. Blind polls may omit counts for anonymous callers (Timeful behavior).",
  "",
  "### Best meeting times",
  "**`POST /timeful-best-times`** with **`timefulUrl`** and **`meetingDurationHours`** loads responses and scores windows of that length; it also returns **`largestFullGroupContiguous`** (longest stretch where **everyone** is free — same idea as Timeful’s darkest green). **Blind** and **`dow`** polls are rejected; **days-only** events have no time grid.",
].join("\n");

/**
 * OpenAPI 3.1 — register before routes so paths appear in /docs.
 */
export async function registerSwagger(app) {
  await app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "Schedule integration",
        description: INFO_DESCRIPTION,
        version: "0.1.0",
      },
      externalDocs: {
        description: "Timeful server createEvent (Go)",
        url: "https://github.com/schej-it/timeful.app/blob/main/server/routes/events.go",
      },
      tags: [
        { name: "health", description: "Liveness" },
        {
          name: "timeful",
          description: "Create a Timeful availability poll and return the shareable URL",
        },
      ],
      servers: [
        { url: "/", description: "Same host/port as this page (recommended for Try it out)" },
        { url: "http://localhost:6502", description: "localhost:6502 (default PORT)" },
        { url: "http://127.0.0.1:6502", description: "127.0.0.1:6502 — use if you open /docs with 127.0.0.1" },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
    },
  });
}

/** Route schemas — `strict: false` Ajv allows `example` for Swagger “Execute”. */
export const schemas = {
  health: {
    tags: ["health"],
    summary: "Health check",
    description: "Returns `{ ok: true }` if the process is listening.",
    response: {
      200: {
        type: "object",
        description: "Service is up",
        properties: {
          ok: { type: "boolean", example: true },
        },
        required: ["ok"],
      },
    },
  },

  timefulUrl: {
    tags: ["timeful"],
    summary: "Create Timeful poll URL",
    description: [
      "Proxies to Timeful **`POST /api/events`**: `name`, `dates`, `type`, **`duration`** (hours = `end−start`), **`timeIncrement`** (15).",
      "",
      "**400** with `{ error: string }` = invalid `dates`, `start`/`end`, or timezone parsing.",
      "**400** (other shape) = JSON body failed Ajv schema validation.",
      "**500** = Timeful unreachable or bad response.",
    ].join("\n"),
    body: {
      type: "object",
      required: ["eventName", "dates", "type", "start", "end"],
      description:
        "Singapore: `timezone: \"Asia/Singapore\"`, `dates: [\"YYYY-MM-DD\", ...]`, `start`/`end` like `0800` and `2000` (8am–8pm local).",
      example: {
        eventName: "Team practice",
        type: "specific_dates",
        timezone: "Asia/Singapore",
        start: "0800",
        end: "2000",
        dates: ["2026-04-01", "2026-04-02", "2026-04-03"],
      },
      properties: {
        eventName: {
          type: "string",
          minLength: 1,
          description: "Poll title. Sent to Timeful as **`name`**.",
          example: "Team practice",
        },
        start: {
          type: "string",
          minLength: 1,
          description:
            "Local **start** of daily availability window in **`timezone`**. Forms: `0800`, `8:00`, `08:00` (24h).",
          example: "0800",
        },
        end: {
          type: "string",
          minLength: 1,
          description:
            "Local **end** of window. If not after `start` on the same calendar day, treated as next day (overnight). `0000`/`0000` → 24h.",
          example: "2000",
        },
        timezone: {
          type: "string",
          minLength: 1,
          description:
            "**IANA** zone for interpreting **`start`** / **`end`** and for normalizing **`dates`** (`specific_dates` / `group`). **`dow`**: `dates` sent unchanged; `start`/`end` still set **`duration`** only. Default `Asia/Singapore`.",
          example: "Asia/Singapore",
        },
        dates: {
          type: "array",
          minItems: 1,
          items: {
            type: "string",
            minLength: 1,
            description:
              "`YYYY-MM-DD` → column at that day + `start` (see overview). Other ISO shapes → see overview. Not normalized when `type` is `dow`.",
            example: "2026-04-01",
          },
          description:
            "One entry per poll day. For **`specific_dates`** / **`group`**, each **`YYYY-MM-DD`** becomes that local day at **`start`**, then UTC (Timeful’s native shape).",
          example: ["2026-04-01", "2026-04-02", "2026-04-03"],
        },
        type: {
          type: "string",
          enum: ["specific_dates", "dow", "group"],
          description:
            "**`specific_dates`** — normal calendar poll; **`dates`** normalized with `timezone`. **`dow`** — days-of-week poll; pass Timeful anchor dates, no TZ conversion. **`group`** — availability group; **`dates`** normalized like `specific_dates`.",
          example: "specific_dates",
        },
      },
    },
    response: {
      200: {
        type: "object",
        description: "Shareable Timeful poll URL (`/e/{shortId}` or absolute from response).",
        properties: {
          timefulUrl: {
            type: "string",
            format: "uri",
            example: "https://timeful.app/e/abc123",
          },
        },
        required: ["timefulUrl"],
      },
      400: {
        type: "object",
        description:
          "Invalid body (schema) **or** `{ error }` from date/timezone parsing before Timeful is called.",
        properties: {
          error: {
            type: "string",
            description: "Present when date normalization throws (e.g. invalid `dates[i]`).",
            example: 'dates[0] invalid calendar date "2026-13-40" in Asia/Singapore: ...',
          },
        },
        additionalProperties: true,
      },
      500: {
        type: "object",
        description: "Timeful HTTP error, network failure, or response without `timefulUrl` / `shortId`.",
        additionalProperties: true,
      },
    },
  },

  timefulResponseCount: {
    tags: ["timeful"],
    summary: "Poll response count",
    description: [
      "Calls Timeful **`GET {TIMEFUL_API_BASE}/events/:id`** (same host as create, default `https://timeful.app/api`).",
      "Pass the **share URL** (`…/e/{shortId}`), **shortId**, or **Mongo `_id`**. Returns **`numResponses`** from Timeful and **`respondentCount`** from the `responses` object when present.",
      "",
      "**404** — unknown id. **502** — Timeful error or network failure.",
    ].join("\n"),
    querystring: {
      type: "object",
      required: ["timefulUrl"],
      properties: {
        timefulUrl: {
          type: "string",
          minLength: 1,
          description:
            "Full poll URL, e.g. `https://timeful.app/e/7A9Ca`, or raw **`shortId`** / **`_id`**.",
          example: "https://timeful.app/e/7A9Ca",
        },
      },
    },
    response: {
      200: {
        type: "object",
        description: "Counts from Timeful event payload.",
        properties: {
          shortId: { type: "string", example: "7A9Ca" },
          name: { type: "string", example: "Team practice" },
          numResponses: {
            type: ["integer", "null"],
            description: "Timeful `numResponses` (null if omitted, e.g. blind + anonymous).",
            example: 0,
          },
          respondentCount: {
            type: "integer",
            description: "Number of keys in `responses` when returned.",
            example: 0,
          },
        },
        required: ["shortId", "respondentCount"],
      },
      400: {
        type: "object",
        properties: {
          error: { type: "string" },
        },
        required: ["error"],
      },
      404: {
        type: "object",
        properties: {
          error: { type: "string" },
        },
        required: ["error"],
      },
      502: {
        type: "object",
        properties: {
          error: { type: "string" },
        },
        required: ["error"],
      },
    },
  },

  timefulBestTimes: {
    tags: ["timeful"],
    summary: "Best meeting windows",
    description: [
      "Fetches event + **`GET …/events/:id/responses`** (see [Timeful `getResponses`](https://github.com/schej-it/timeful.app/blob/main/server/routes/events.go)), then finds **`meetingDurationHours`**-long runs aligned to the poll’s **`timeIncrement`** (default 15 minutes).",
      "Scores only **`availability`** (not `if_needed`). Respondents with **empty** `availability` are excluded from **`respondentsConsidered`**.",
      "**`largestFullGroupContiguous`** — longest stretch where **every** considered respondent has **every** slot (same idea as Timeful’s darkest green). If people only overlap 1h but you ask for **1.5h**, **`windows`** may show `availableCount: 1` while this field still shows the **1h** everyone-shared band.",
      "**`hasFullGroupForRequestedDuration`** — `true` only if **some** `windows[]` row has `allAvailable: true` for **this** `meetingDurationHours` (not “any overlap”: e.g. 1.5h stays `false` if everyone only shares 1h). Compare **`largestFullGroupContiguous`**.",
      "Sort: **`allAvailable`** first, then higher **`availableCount`**, then earlier **`start**.",
      "",
      "**400** — invalid body, **days-only** poll, or **`dow`** type. **403** — **blind** availability. **404** — unknown id. **502** — Timeful/network.",
    ].join("\n"),
    body: {
      type: "object",
      required: ["timefulUrl", "meetingDurationHours"],
      properties: {
        timefulUrl: {
          type: "string",
          minLength: 1,
          description: "Share URL (`…/e/{shortId}`), short id, or Mongo `_id`.",
          example: "https://timeful.app/e/7A9Ca",
        },
        meetingDurationHours: {
          type: "number",
          description: "Meeting length in hours (`1`, `2`, `2.5`, …). Must be in `(0, 168]`.",
          example: 1.5,
        },
        maxResults: {
          type: "integer",
          minimum: 1,
          maximum: 200,
          default: 40,
          description: "Cap on returned windows (default 40).",
        },
      },
      example: {
        timefulUrl: "https://timeful.app/e/7A9Ca",
        meetingDurationHours: 1.5,
      },
    },
    response: {
      200: {
        type: "object",
        description: "Ranked candidate windows in UTC ISO.",
        properties: {
          shortId: { type: "string", example: "7A9Ca" },
          name: { type: "string", example: "Team practice" },
          meetingDurationHours: { type: "number", example: 1.5 },
          timeIncrementMinutes: { type: "number", example: 15 },
          slotsNeeded: {
            type: "integer",
            description: "Consecutive poll slots required (`ceil(hours×60 / increment)`).",
            example: 6,
          },
          respondentsConsidered: {
            type: "integer",
            description: "People with at least one `availability` timestamp.",
            example: 3,
          },
          hasFullGroupForRequestedDuration: {
            type: "boolean",
            description:
              "True iff some `windows[]` entry has `allAvailable: true` for **this** `meetingDurationHours`. False when the longest mutual block is shorter (see `largestFullGroupContiguous`).",
            example: false,
          },
          largestFullGroupContiguous: {
            type: ["object", "null"],
            description:
              "Longest contiguous mutual block (all respondents); `durationHours` may be shorter than requested.",
            properties: {
              start: { type: "string", format: "date-time" },
              end: { type: "string", format: "date-time" },
              durationHours: { type: "number" },
              slotCount: { type: "integer" },
            },
            required: ["start", "end", "durationHours", "slotCount"],
          },
          windows: {
            type: "array",
            items: {
              type: "object",
              required: ["start", "end", "availableCount", "allAvailable"],
              properties: {
                start: { type: "string", format: "date-time" },
                end: { type: "string", format: "date-time" },
                availableCount: { type: "integer" },
                allAvailable: {
                  type: "boolean",
                  description: "True when `availableCount === respondentsConsidered`.",
                },
              },
            },
          },
        },
        required: [
          "shortId",
          "meetingDurationHours",
          "timeIncrementMinutes",
          "slotsNeeded",
          "respondentsConsidered",
          "hasFullGroupForRequestedDuration",
          "largestFullGroupContiguous",
          "windows",
        ],
      },
      400: {
        type: "object",
        properties: { error: { type: "string" } },
        required: ["error"],
      },
      403: {
        type: "object",
        properties: { error: { type: "string" } },
        required: ["error"],
      },
      404: {
        type: "object",
        properties: { error: { type: "string" } },
        required: ["error"],
      },
      502: {
        type: "object",
        properties: { error: { type: "string" } },
        required: ["error"],
      },
    },
  },
};

