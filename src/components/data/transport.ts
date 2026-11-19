// How the pages reach the /api/* code. Next.js app: a normal HTTP request to its own server.
// The single-file build replaces this module with transport.browser.ts, which runs the same code in the page.

export function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(input, init);
}

/** The written coach (Claude Haiku) lives on the server, where the Anthropic key is: never in the page. */
export function askFetch(body: unknown): Promise<Response> {
  return fetch("/api/coach/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

/** This page is the website itself: what only the server can do (Strava) is right here, with the login cookie. */
export const ON_SITE = true;

/** A route that only the online server has (Strava: the client secret stays there). */
export function serverFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, init);
}
