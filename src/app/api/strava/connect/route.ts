// «Collega Strava» (Impostazioni, on the website): off to Strava's authorization page, with a one-time state.
import { NextResponse } from "next/server";
import { allowedRequest } from "@/lib/auth/request";
import { authorizeUrl, STATE_COOKIE, stravaConfig } from "@/lib/strava/strava";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!(await allowedRequest(request))) return NextResponse.redirect(new URL("/login", url));
  const cfg = stravaConfig();
  if (!cfg) return NextResponse.redirect(new URL("/impostazioni?strava=chiavi", url));
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(authorizeUrl(cfg.clientId, `${url.origin}/api/strava/callback`, state));
  res.cookies.set(STATE_COOKIE, state, { httpOnly: true, secure: url.protocol === "https:", sameSite: "lax", path: "/api/strava", maxAge: 600 });
  return res;
}
