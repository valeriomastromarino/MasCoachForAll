// Whether Strava is set up and connected, for the settings card: the website (cookie) and the phone app (password).
import { allowedRequest, APP_CORS } from "@/lib/auth/request";
import { loadTokens } from "@/lib/strava/server";
import { stravaConfig } from "@/lib/strava/strava";

export const maxDuration = 30;

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { ...APP_CORS, "Cache-Control": "no-store" } });

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: APP_CORS });
}

export async function GET(request: Request): Promise<Response> {
  if (!(await allowedRequest(request))) return reply({ error: "Accesso richiesto" }, 401);
  const cfg = stravaConfig();
  if (!cfg) return reply({ configured: false, connected: false, athlete: null, last: null });
  try {
    const t = await loadTokens(cfg);
    return reply({ configured: true, connected: t !== null, athlete: t?.athlete.name ?? null, last: t?.last ?? null });
  } catch (e) {
    return reply({ error: `Non riesco a leggere il collegamento a Strava: ${e instanceof Error ? e.message : "errore"}` }, 502);
  }
}
