// A minimal MCP server over Streamable HTTP, stateless with plain JSON replies: all a Claude custom
// connector needs (initialize, tools/list, tools/call, ping). The tools live in tools.ts.
import { COACH_TOOLS } from "./tools";

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

const SUPPORTED = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

const INSTRUCTIONS =
  "Dati di allenamento dell'atleta da MasCoach, calcolati sui dati di Intervals.icu: " +
  "inizia da stato_di_oggi. I numeri sono già elaborati (HRV con il metodo Altini, carico, potenza critica): usali, non ricalcolarli. " +
  "Prima di crea_allenamento, modifica_allenamento, cancella_allenamento o cancella_prove mostra cosa farai e aspetta una conferma esplicita.";

const reply = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
const error = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

/** Serialises a tool result compactly: numbers with at most 2 decimals. */
function toText(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === "number" && !Number.isInteger(v) ? Math.round(v * 100) / 100 : v));
}

async function callTool(params: Record<string, unknown> | undefined) {
  const tool = COACH_TOOLS.find((t) => t.name === params?.name);
  if (!tool) return null;
  const args = (params?.arguments ?? {}) as Record<string, unknown>;
  try {
    return { content: [{ type: "text", text: toText(await tool.run(args)) }] };
  } catch (e) {
    // Tool errors go back to Claude as results, so it can read them and fix the call.
    return { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true };
  }
}

async function handleOne(msg: Rpc): Promise<unknown | null> {
  const isNotification = msg.id === undefined;
  switch (msg.method) {
    case "initialize": {
      const asked = String(msg.params?.protocolVersion ?? "");
      return reply(msg.id, {
        protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "mascoach", title: "MasCoach", version: "1.0.0" },
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return reply(msg.id, {});
    case "tools/list":
      return reply(msg.id, {
        tools: COACH_TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({
          name,
          title,
          description,
          inputSchema,
          annotations: { title, ...annotations },
        })),
      });
    case "tools/call": {
      const result = await callTool(msg.params);
      return result ? reply(msg.id, result) : error(msg.id, -32602, `Strumento sconosciuto: ${String(msg.params?.name)}`);
    }
    default:
      return isNotification ? null : error(msg.id, -32601, `Metodo non supportato: ${msg.method}`);
  }
}

/** One HTTP body (a message or a batch) → the reply body, or null when there is nothing to answer. */
export async function handleMcp(body: unknown): Promise<unknown | null> {
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handleOne(m as Rpc)))).filter((x) => x !== null);
    return out.length ? out : null;
  }
  if (!body || typeof body !== "object") return error(null, -32600, "Richiesta non valida");
  return handleOne(body as Rpc);
}
