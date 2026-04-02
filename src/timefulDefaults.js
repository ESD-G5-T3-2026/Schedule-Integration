/**
 * Hosted Timeful endpoints (public; not secrets).
 * Override with env only for self-hosted, staging, or tests.
 */
export const TIMEFUL_DEFAULT_CREATE_URL = "https://timeful.app/api/events";
export const TIMEFUL_DEFAULT_PUBLIC_BASE = "https://timeful.app";

/** Base for `GET /events/:id` (no trailing slash). */
export function getTimefulApiBase() {
  const fromEnv = process.env.TIMEFUL_API_BASE?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }
  const pub = (process.env.TIMEFUL_PUBLIC_BASE_URL ?? TIMEFUL_DEFAULT_PUBLIC_BASE).replace(/\/$/, "");
  return `${pub}/api`;
}

