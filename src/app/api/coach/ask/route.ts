// The written coach: a message (and the thread so far) in, Claude Sonnet's answer out, plus the changes it proposes.
// The proposals write nothing: the app shows them and runs them only after the athlete's "sì".
import { cookies } from "next/headers";
import { type AskMessage, ask, AskError } from "@/lib/coach/ai/agent";
import type { Snapshot } from "@/lib/coach/ai/tools";
import { SESSION_COOKIE, isAllowed } from "@/lib/auth/session";

export const maxDuration = 60;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MAX_MESSAGES = 24;
const MAX_CHARS = 4000;

export async function POST(request: Request): Promise<Response> {
  // proxy.ts already checks the login; checked again because this route spends the Anthropic key.
  if (!(await isAllowed((await cookies()).get(SESSION_COOKIE)?.value))) return Response.json({ error: "Accesso richiesto" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { messages?: unknown; snapshot?: Partial<Snapshot> } | null;
  const raw = Array.isArray(body?.messages) ? (body.messages as { role?: unknown; content?: unknown }[]) : [];
  const messages: AskMessage[] = raw
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role as AskMessage["role"], content: String(m.content).slice(0, MAX_CHARS) }));
  // The model needs to start with a user turn and end with one.
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== "user") return Response.json({ error: "Messaggio mancante" }, { status: 400 });
  const snap = body?.snapshot;
  if (!snap || typeof snap.today !== "string" || !ISO.test(snap.today)) return Response.json({ error: "Data di oggi mancante" }, { status: 400 });
  const snapshot: Snapshot = { today: snap.today, setup: snap.setup ?? null, profile: snap.profile ?? null };
  try {
    return Response.json(await ask(messages, snapshot));
  } catch (e) {
    if (e instanceof AskError) return Response.json({ error: e.message }, { status: e.status === 501 ? 501 : 502 });
    return Response.json({ error: e instanceof Error ? e.message : "Errore" }, { status: 500 });
  }
}
