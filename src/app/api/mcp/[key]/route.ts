// MasCoach connector for Claude (MCP). The address carries a long secret (MCP_SECRET) instead of the login
// cookie: Claude can't log in, so a wrong or missing secret simply answers "not found".
import { handleMcp } from "@/lib/coach/mcp";

async function sameSecret(given: string): Promise<boolean> {
  const secret = process.env.MCP_SECRET;
  if (!secret || secret.length < 24) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(given)), crypto.subtle.digest("SHA-256", enc.encode(secret))]);
  return Buffer.from(a).equals(Buffer.from(b));
}

const notFound = () => new Response("Not found", { status: 404 });

export async function POST(request: Request, ctx: RouteContext<"/api/mcp/[key]">) {
  if (!(await sameSecret((await ctx.params).key))) return notFound();
  const body = await request.json().catch(() => undefined);
  if (body === undefined) return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON non valido" } }, { status: 400 });
  const result = await handleMcp(body);
  return result === null ? new Response(null, { status: 202 }) : Response.json(result);
}

// No server-to-client stream and no sessions: only POST is used.
export async function GET(_request: Request, ctx: RouteContext<"/api/mcp/[key]">) {
  if (!(await sameSecret((await ctx.params).key))) return notFound();
  return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
}
