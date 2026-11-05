// Single-file build: no server, the /api/* code runs right here and talks to Intervals.icu directly.
import { handleApi } from "@/lib/api/handlers";
import { coachPassword, coachServer } from "@/lib/coach/server";

export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
  const r = await handleApi(init?.method ?? "GET", input, body);
  return new Response(JSON.stringify(r.json), { status: r.status, headers: { "Content-Type": "application/json" } });
}

/** The written coach (Claude Haiku) runs on the online MasCoach: the phone sends the question there with the app password. Without a password the chat uses its rules. */
export async function askFetch(body: unknown): Promise<Response> {
  const password = coachPassword();
  if (!password || !coachServer()) return new Response(JSON.stringify({ error: "Inserisci l'indirizzo e la password del tuo sito online in Impostazioni per usare il coach scritto." }), { status: 501, headers: { "Content-Type": "application/json" } });
  return fetch(`${coachServer()}/api/coach/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-mascoach-password": password },
    body: JSON.stringify(body),
  });
}
