// The loop: a message from the athlete goes to Claude Haiku with the coach prompt and the tools; whatever tools it calls run
// here (reads) or are only recorded (proposals); when it answers in plain text, the text and the proposals go back to the app.
import type { Action, TodayOverrides } from "../chat/context";
import { COACH_MODEL, systemPrompt } from "./system";
import { AI_TOOLS, type Snapshot } from "./tools";

export type AskMessage = { role: "user" | "assistant"; content: string };
export type AskResult = { text: string; actions: Action[]; overrides?: Partial<Omit<TodayOverrides, "date">> };

const API = "https://api.anthropic.com/v1/messages";
const MAX_ROUNDS = 8;
const MAX_TOKENS = 2000;
/** A tool result longer than this is cut, so one wide read can't fill the context. */
const MAX_RESULT_CHARS = 14000;

type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };
type ApiMessage = { role: "user" | "assistant"; content: string | Block[] };
type ApiReply = { content: Block[]; stop_reason: string; error?: { message?: string } };

/** An error text must never carry the API key (a bad header value is quoted back by fetch): hide anything that looks like one. */
export function hideKeys(text: string): string {
  return text.replace(/"[^"]*sk-ant-[^"]*"/g, '"[chiave nascosta]"').replace(/sk-ant-\S*/g, "[chiave nascosta]");
}

export class AskError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const toText = (v: unknown) => {
  const s = JSON.stringify(v, (_k, x) => (typeof x === "number" && !Number.isInteger(x) ? Math.round(x * 100) / 100 : x));
  return s.length > MAX_RESULT_CHARS ? `${s.slice(0, MAX_RESULT_CHARS)}…[tagliato: chiedi un intervallo più stretto]` : s;
};

async function callModel(system: string, messages: ApiMessage[]): Promise<ApiReply> {
  // A key pasted with a line break or a space inside is an invalid header: drop all whitespace.
  const key = process.env.ANTHROPIC_API_KEY?.replace(/\s+/g, "");
  if (!key) throw new AskError("Manca ANTHROPIC_API_KEY sul server", 501);
  const tools = AI_TOOLS.map((t, i) => ({ name: t.name, description: t.description, input_schema: t.input_schema, ...(i === AI_TOOLS.length - 1 ? { cache_control: { type: "ephemeral" } } : {}) }));
  const res = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: COACH_MODEL, max_tokens: MAX_TOKENS, system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }], tools, messages }),
  });
  const json = (await res.json().catch(() => ({}))) as ApiReply;
  if (!res.ok) throw new AskError(json.error?.message ?? `Errore ${res.status} dall'API di Anthropic`, res.status === 401 || res.status === 403 ? 502 : res.status);
  return json;
}

export async function ask(messages: AskMessage[], snapshot: Snapshot): Promise<AskResult> {
  const system = systemPrompt(snapshot.today);
  const convo: ApiMessage[] = messages.map((m) => ({ role: m.role, content: m.content }));
  const ctx = { snapshot, actions: [] as Action[], overrides: {} as NonNullable<AskResult["overrides"]> };
  const done = (text: string): AskResult => ({ text, actions: ctx.actions, ...(Object.keys(ctx.overrides).length ? { overrides: ctx.overrides } : {}) });

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const reply = await callModel(system, convo);
    const uses = reply.content.filter((b): b is Extract<Block, { type: "tool_use" }> => b.type === "tool_use");
    if (reply.stop_reason !== "tool_use" || uses.length === 0) {
      const text = reply.content.filter((b): b is Extract<Block, { type: "text" }> => b.type === "text").map((b) => b.text).join("\n").trim();
      return done(text || "Non ho una risposta: riprova a scrivermelo in altro modo.");
    }
    convo.push({ role: "assistant", content: reply.content });
    const results: Block[] = [];
    for (const use of uses) {
      const tool = AI_TOOLS.find((t) => t.name === use.name);
      try {
        if (!tool) throw new Error(`Strumento sconosciuto: ${use.name}`);
        results.push({ type: "tool_result", tool_use_id: use.id, content: toText(await tool.run(use.input ?? {}, ctx)) });
      } catch (e) {
        // The error goes back to the model as a result, so it can read it and fix the call.
        results.push({ type: "tool_result", tool_use_id: use.id, content: e instanceof Error ? e.message : String(e), is_error: true });
      }
    }
    convo.push({ role: "user", content: results });
  }
  return done("Ho girato troppo a vuoto su questa richiesta. Riscrivila più semplice o a pezzi.");
}
