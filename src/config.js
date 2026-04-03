import { TIMEFUL_DEFAULT_CREATE_URL } from "./timefulDefaults.js";

export const TIMEFUL_FETCH_TIMEOUT_MS = Number(process.env.TIMEFUL_FETCH_TIMEOUT_MS ?? 2500);
export const TIMEFUL_API_KEY = process.env.TIMEFUL_API_KEY;

export function getTimefulCreateApiUrl() {
  const fromEnv = process.env.TIMEFUL_API_URL?.trim();
  const baseUrl = fromEnv ? fromEnv : TIMEFUL_DEFAULT_CREATE_URL;
  return baseUrl.replace(/\/$/, "");
}

