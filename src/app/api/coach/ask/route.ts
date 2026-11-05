// The written coach: a message (and the thread so far) in, Claude Sonnet's answer out, plus the changes it proposes.
// The proposals write nothing: the app shows them and runs them only after the athlete's "sì".
// Two ways in: the login cookie (the website) or the app password in a header (the Android app, which has no cookie).
import { cookies } from "next/headers";
import { type AskMessage, ask, AskError, hideKeys } from "@/lib/coach/ai/agent";
import type { Snapshot } from "@/lib/coach/ai/tools";
import { SESSION_COOKIE, isAllowed, isRightPassword } from "@/lib/auth/session";

export const maxDuration = 60;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MAX_MESSAGES = 24;
const MAX_CHARS = 4000;

// No cookies are involved in the app's calls, so any origin may ask; the password decides who gets an answer.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-mascoach-password",
  "Access-Control-Max-Age": "86400",
};
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: CORS });

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

async function allowed(request: Request): Promise<boolean> {
  const password = request.headers.get("x-mascoach-password");
  if (password) {
    if (await isRightPassword(password)) return true;
    // A wrong password costs a pause, so guessing is slow.
    await new Promise((r) => setTimeout(r, 800));
    return false;
  }
  return isAllowed((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function POST(request: Request): Promise<Response> {
  // This route is outside proxy.ts's login (the app can't send the cookie), so it checks access itself: it spends the Anthropic key.
  if (!(await allowed(request))) return reply({ error: "Accesso richiesto" }, 401);
  const body = (await request.json().catch(() => null)) as { messages?: unknown; snapshot?: Partial<Snapshot> } | null;
  const raw = Array.isArray(body?.messages) ? (body.messages as { role?: unknown; content?: unknown }[]) : [];
  const messages: AskMessage[] = raw
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role as AskMessage["role"], content: String(m.content).slice(0, MAX_CHARS) }));
  // The model needs to start with a user turn and end with one.
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== "user") return reply({ error: "Messaggio mancante" }, 400);
  const snap = body?.snapshot;
  if (!snap || typeof snap.today !== "string" || !ISO.test(snap.today)) return reply({ error: "Data di oggi mancante" }, 400);
  const snapshot: Snapshot = { today: snap.today, setup: snap.setup ?? null, profile: snap.profile ?? null };
  try {
    return reply(await ask(messages, snapshot));
  } catch (e) {
    const message = hideKeys(e instanceof Error ? e.message : "Errore");
    console.error("coach/ask", e instanceof AskError ? e.status : "", message);
    if (e instanceof AskError) return reply({ error: message }, e.status === 501 ? 501 : 502);
    return reply({ error: message }, 500);
  }
}
