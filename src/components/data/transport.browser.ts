// Single-file build: no server, the /api/* code runs right here and talks to Intervals.icu directly.
import { handleApi } from "@/lib/api/handlers";

export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
  const r = await handleApi(init?.method ?? "GET", input, body);
  return new Response(JSON.stringify(r.json), { status: r.status, headers: { "Content-Type": "application/json" } });
}
