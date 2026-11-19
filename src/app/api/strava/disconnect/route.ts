// «Scollega» (Impostazioni, on the website): Strava forgets the authorization and the note with the tokens goes away.
import { allowedRequest } from "@/lib/auth/request";
import { deleteTokens, freshTokens } from "@/lib/strava/server";
import { DEAUTHORIZE_URL, stravaConfig } from "@/lib/strava/strava";

export async function POST(request: Request): Promise<Response> {
  if (!(await allowedRequest(request))) return Response.json({ error: "Accesso richiesto" }, { status: 401 });
  const cfg = stravaConfig();
  if (!cfg) return Response.json({ error: "Strava non è configurato sul server." }, { status: 412 });
  try {
    // Best effort on Strava's side (the athlete can also revoke it from Strava's settings); the note always goes.
    const t = await freshTokens(cfg).catch(() => null);
    if (t) await fetch(DEAUTHORIZE_URL, { method: "POST", headers: { Authorization: `Bearer ${t.accessToken}` }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
    await deleteTokens();
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Errore" }, { status: 502 });
  }
}
