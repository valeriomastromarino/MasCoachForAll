// A trainer session (FIT in base64) to the athlete's Strava. Called by the app right after the upload to Intervals.icu:
// from the website with the login cookie, from the phone app with the app password (it has no cookie).
// 412 = Strava is not set up or not connected: the app then does not keep the session waiting for Strava.
import { allowedRequest, APP_CORS } from "@/lib/auth/request";
import { freshTokens, saveTokens } from "@/lib/strava/server";
import { stravaConfig, uploadFit } from "@/lib/strava/strava";

export const maxDuration = 60;

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: APP_CORS });

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: APP_CORS });
}

export async function POST(request: Request): Promise<Response> {
  if (!(await allowedRequest(request))) return reply({ error: "Accesso richiesto" }, 401);
  const cfg = stravaConfig();
  if (!cfg) return reply({ error: "Strava non è configurato sul server.", code: "non_configurato" }, 412);
  const body = (await request.json().catch(() => null)) as { fit?: unknown; name?: unknown; externalId?: unknown } | null;
  if (typeof body?.fit !== "string" || typeof body.externalId !== "string" || !body.externalId.trim()) return reply({ error: "Richiesta non valida" }, 400);
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 200) : "Rulli";
  let fit: Uint8Array;
  try {
    fit = Uint8Array.from(atob(body.fit), (c) => c.charCodeAt(0));
  } catch {
    return reply({ error: "File non valido" }, 400);
  }
  if (fit.length < 14) return reply({ error: "File non valido" }, 400);
  try {
    const t = await freshTokens(cfg);
    if (!t) return reply({ error: "Strava non è collegato: collegalo da Impostazioni, sul sito.", code: "non_collegato" }, 412);
    const r = await uploadFit(t.accessToken, fit, { name, externalId: body.externalId.trim().slice(0, 120) });
    // For the card: the last session sent (a failed save of this line does not undo the upload).
    await saveTokens(cfg, { ...t, last: { name, at: new Date().toISOString(), id: r.id } }).catch(() => {});
    return reply(r);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Errore";
    console.error("strava/upload", message);
    return reply({ error: message }, 502);
  }
}
