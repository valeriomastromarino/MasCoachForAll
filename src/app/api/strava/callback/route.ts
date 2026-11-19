// Strava sends the athlete back here after «Autorizza»: the code becomes tokens, sealed in the Intervals.icu note,
// and the settings page says how it went (?strava=ok, negato, permessi, chiavi, errore).
import { NextResponse } from "next/server";
import { allowedRequest, cookieValue } from "@/lib/auth/request";
import { saveTokens } from "@/lib/strava/server";
import { exchangeCode, grantsUpload, STATE_COOKIE, stravaConfig } from "@/lib/strava/strava";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (outcome: string) => {
    const res = NextResponse.redirect(new URL(`/impostazioni?strava=${outcome}`, url));
    res.cookies.set(STATE_COOKIE, "", { path: "/api/strava", maxAge: 0 });
    return res;
  };
  if (!(await allowedRequest(request))) return NextResponse.redirect(new URL("/login", url));
  const cfg = stravaConfig();
  if (!cfg) return back("chiavi");
  const state = url.searchParams.get("state");
  if (!state || state !== cookieValue(request.headers.get("cookie"), STATE_COOKIE)) return back("errore");
  if (url.searchParams.get("error")) return back("negato");
  // The athlete can untick "upload activities" on Strava's page: without it nothing could be sent.
  if (!grantsUpload(url.searchParams.get("scope"))) return back("permessi");
  const code = url.searchParams.get("code");
  if (!code) return back("errore");
  try {
    await saveTokens(cfg, await exchangeCode(cfg, code));
  } catch (e) {
    console.error("strava/callback", e instanceof Error ? e.message : "errore");
    return back("errore");
  }
  return back("ok");
}
