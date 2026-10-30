// Next.js route handlers: hand the request to the shared API code and send back its JSON.
import { cookies } from "next/headers";
import { SESSION_COOKIE, isAllowed } from "@/lib/auth/session";
import { handleApi } from "./handlers";

export async function respond(request: Request): Promise<Response> {
  // proxy.ts already checks the login; checked again here because these routes can write to Intervals.icu.
  if (!(await isAllowed((await cookies()).get(SESSION_COOKIE)?.value))) {
    return Response.json({ error: "Accesso richiesto" }, { status: 401 });
  }
  const url = new URL(request.url);
  const body = request.method === "GET" || request.method === "DELETE" ? null : await request.json().catch(() => null);
  const r = await handleApi(request.method, url.pathname + url.search, body);
  return Response.json(r.json, { status: r.status });
}
