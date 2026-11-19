// Strava: the trainer sessions recorded by the app go to the athlete's Strava too (19 November 2026).
// Strava's own API: one OAuth authorization (scope activity:write) given once from the website, then every session is
// uploaded as a FIT file marked as ridden on a trainer. The client secret stays on the server; the tokens are kept
// encrypted (AES-GCM, key from the client secret) in a private note of the athlete's Intervals.icu account, like the copy
// of the sheet, so the server needs no database and the phone needs nothing but the app password.
// Intervals.icu also gets the copy that comes back from Strava, but keeps its own direct upload (direct sources win).
// Pure functions here (tested); the routes in app/api/strava/ and server.ts do the I/O.

export const AUTHORIZE_URL = "https://www.strava.com/oauth/authorize";
export const TOKEN_URL = "https://www.strava.com/oauth/token";
export const DEAUTHORIZE_URL = "https://www.strava.com/oauth/deauthorize";
export const API = "https://www.strava.com/api/v3";
/** read = the public profile (the athlete's name on the card), activity:write = uploads. */
export const SCOPE = "read,activity:write";
/** One-time value of "Collega Strava", checked when Strava sends the athlete back (no forged authorizations). */
export const STATE_COOKIE = "mascoach_strava_state";

export type StravaTokens = {
  accessToken: string;
  refreshToken: string;
  /** Epoch seconds. */
  expiresAt: number;
  athlete: { id: number; name: string };
  /** The last session sent, for the settings card. */
  last?: { name: string; at: string; id: number | null } | null;
};

export type StravaConfig = { clientId: string; clientSecret: string };

/** The Strava app of the athlete (Settings → My API Application on strava.com), from the server's variables. */
export function stravaConfig(env: Record<string, string | undefined> = process.env): StravaConfig | null {
  const clientId = env.STRAVA_CLIENT_ID?.trim();
  const clientSecret = env.STRAVA_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function authorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", approval_prompt: "auto", scope: SCOPE, state });
  return `${AUTHORIZE_URL}?${params}`;
}

/** The scopes the athlete actually granted (Strava lets them untick boxes). */
export const grantsUpload = (scope: string | null | undefined) => (scope ?? "").split(/[,\s]+/).includes("activity:write");

/** An access token lasts 6 hours: refresh it a minute before it runs out. */
export const needsRefresh = (t: Pick<StravaTokens, "expiresAt">, nowMs = Date.now()) => t.expiresAt * 1000 - 60_000 <= nowMs;

const athleteName = (a: { firstname?: string; lastname?: string } | undefined) =>
  [a?.firstname, a?.lastname ? `${a.lastname.charAt(0)}.` : ""].filter(Boolean).join(" ").trim() || "atleta Strava";

type Fetch = typeof fetch;
const message = (j: unknown, status: number) => {
  const m = (j as { message?: unknown })?.message;
  return typeof m === "string" && m ? m : `errore ${status}`;
};

/** Trades the code of the authorization page (or a refresh token) for tokens. */
async function token(cfg: StravaConfig, body: Record<string, string>, f: Fetch): Promise<Omit<StravaTokens, "athlete"> & { athlete?: StravaTokens["athlete"] }> {
  const res = await f(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, ...body }),
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_at?: number; athlete?: { id?: number; firstname?: string; lastname?: string } };
  if (!res.ok || !j.access_token || !j.refresh_token || typeof j.expires_at !== "number") throw new Error(`Strava non ha dato l'autorizzazione (${message(j, res.status)}).`);
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresAt: j.expires_at,
    ...(j.athlete?.id ? { athlete: { id: j.athlete.id, name: athleteName(j.athlete) } } : {}),
  };
}

export async function exchangeCode(cfg: StravaConfig, code: string, f: Fetch = fetch): Promise<StravaTokens> {
  const t = await token(cfg, { code, grant_type: "authorization_code" }, f);
  return { ...t, athlete: t.athlete ?? { id: 0, name: "atleta Strava" }, last: null };
}

/** A new access token; Strava may hand out a new refresh token too, and the old one stops working: always keep the latest. */
export async function refreshTokens(cfg: StravaConfig, t: StravaTokens, f: Fetch = fetch): Promise<StravaTokens> {
  const n = await token(cfg, { refresh_token: t.refreshToken, grant_type: "refresh_token" }, f);
  return { ...t, accessToken: n.accessToken, refreshToken: n.refreshToken, expiresAt: n.expiresAt };
}

/** "x.fit duplicate of <a href='/activities/123'>…</a>" → 123: the session is already on Strava. */
export function duplicateOf(error: string | null | undefined): number | null {
  const m = /duplicate of\D*?(\d{3,})/i.exec(error ?? "");
  return m ? Number(m[1]) : null;
}

const plain = (s: string) => s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type UploadResult = { id: number | null; duplicate?: boolean };

/**
 * Uploads a FIT file and waits a few seconds for Strava to process it (it works asynchronously). `id` is the Strava
 * activity, null when Strava is still processing (it finishes by itself). A session already on Strava counts as done.
 */
export async function uploadFit(
  accessToken: string,
  fit: Uint8Array,
  meta: { name: string; externalId: string },
  f: Fetch = fetch,
  wait: (ms: number) => Promise<unknown> = sleep,
): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", new Blob([fit as BlobPart], { type: "application/octet-stream" }), `${meta.externalId}.fit`);
  form.append("data_type", "fit");
  form.append("name", meta.name);
  form.append("external_id", meta.externalId);
  // Ridden on a trainer: Strava shows it as an indoor ride and leaves the distance out of the outdoor totals.
  form.append("trainer", "1");
  const auth = { Authorization: `Bearer ${accessToken}` };
  const res = await f(`${API}/uploads`, { method: "POST", headers: auth, body: form, signal: AbortSignal.timeout(30_000) });
  let up = (await res.json().catch(() => ({}))) as { id?: number; id_str?: string; error?: string | null; activity_id?: number | null; message?: string };
  if (!res.ok) {
    const dup = duplicateOf(up.error);
    if (dup) return { id: dup, duplicate: true };
    throw new Error(`Strava ha rifiutato il caricamento (${up.error ? plain(up.error) : message(up, res.status)}).`);
  }
  for (let i = 0; i < 6 && !up.activity_id && !up.error && up.id; i++) {
    await wait(2000);
    const r = await f(`${API}/uploads/${up.id_str ?? up.id}`, { headers: auth, signal: AbortSignal.timeout(10_000) });
    up = { ...up, ...((await r.json().catch(() => ({}))) as typeof up) };
  }
  if (up.activity_id) return { id: up.activity_id };
  if (up.error) {
    const dup = duplicateOf(up.error);
    if (dup) return { id: dup, duplicate: true };
    throw new Error(`Strava non ha accettato il file: ${plain(up.error)}.`);
  }
  return { id: null };
}

// ── The tokens, sealed in the note ──────────────────────────────────────────────────────────────────

export const STRAVA_NOTE = { date: "2000-01-02", externalId: "mascoach-strava", name: "MasCoach: collegamento a Strava (non cancellare)" };
const MARKER = "---MASCOACH-STRAVA---";
const HEADER = "Collegamento di MasCoach a Strava, cifrato: lo legge solo il server dell'app. Per toglierlo: Impostazioni → Strava → Scollega.";

const enc = (s: string) => new TextEncoder().encode(s);
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function sealKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", enc(`mascoach-strava:${secret}`));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** The note's text: a readable line and the tokens encrypted with a key that only the server can rebuild. */
export async function sealTokens(t: StravaTokens, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await sealKey(secret), enc(JSON.stringify(t))));
  return `${HEADER}\n\n${MARKER}${b64(iv)}.${b64(data)}`;
}

/** The tokens in the note, or null (no note, another secret, a damaged text). */
export async function openTokens(text: string | null | undefined, secret: string): Promise<StravaTokens | null> {
  const at = text?.lastIndexOf(MARKER) ?? -1;
  if (!text || at < 0) return null;
  const [iv, data] = text.slice(at + MARKER.length).trim().split(".");
  try {
    const plainText = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await sealKey(secret), unb64(data));
    const t = JSON.parse(new TextDecoder().decode(plainText)) as StravaTokens;
    return typeof t?.accessToken === "string" && typeof t.refreshToken === "string" ? t : null;
  } catch {
    return null;
  }
}
