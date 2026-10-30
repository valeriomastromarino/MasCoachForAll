// How the pages reach the /api/* code. Next.js app: a normal HTTP request to its own server.
// The single-file build replaces this module with transport.browser.ts, which runs the same code in the page.

export function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(input, init);
}
