import { describe, expect, it } from "vitest";
import { cookieValue } from "../auth/request";
import { authorizeUrl, duplicateOf, exchangeCode, grantsUpload, needsRefresh, openTokens, refreshTokens, sealTokens, stravaConfig, type StravaTokens, uploadFit } from "./strava";

const cfg = { clientId: "12345", clientSecret: "segreto-di-prova" };
const tokens: StravaTokens = { accessToken: "a1", refreshToken: "r1", expiresAt: 2_000_000_000, athlete: { id: 7, name: "Mario R." }, last: null };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("Strava: authorization", () => {
  it("reads the app's keys from the server's variables, and only when both are there", () => {
    expect(stravaConfig({ STRAVA_CLIENT_ID: " 12345 ", STRAVA_CLIENT_SECRET: "x" })).toEqual({ clientId: "12345", clientSecret: "x" });
    expect(stravaConfig({ STRAVA_CLIENT_ID: "12345" })).toBeNull();
  });

  it("asks for the upload permission and comes back to the site with the one-time state", () => {
    const u = new URL(authorizeUrl("12345", "https://example.vercel.app/api/strava/callback", "abc"));
    expect(u.origin + u.pathname).toBe("https://www.strava.com/oauth/authorize");
    expect(Object.fromEntries(u.searchParams)).toEqual({ client_id: "12345", redirect_uri: "https://example.vercel.app/api/strava/callback", response_type: "code", approval_prompt: "auto", scope: "read,activity:write", state: "abc" });
    expect(grantsUpload("read,activity:write")).toBe(true);
    expect(grantsUpload("read")).toBe(false);
    expect(grantsUpload(null)).toBe(false);
  });

  it("trades the code for tokens, and refreshes them keeping the athlete", async () => {
    const calls: URLSearchParams[] = [];
    const f = (async (_url: string, init: RequestInit) => {
      calls.push(new URLSearchParams(init.body as URLSearchParams));
      return json({ access_token: "a2", refresh_token: "r2", expires_at: 2_000_003_600, athlete: { id: 7, firstname: "Mario", lastname: "Rossi" } });
    }) as unknown as typeof fetch;
    const t = await exchangeCode(cfg, "codice", f);
    expect(t).toEqual({ accessToken: "a2", refreshToken: "r2", expiresAt: 2_000_003_600, athlete: { id: 7, name: "Mario R." }, last: null });
    expect(calls[0].get("grant_type")).toBe("authorization_code");
    const n = await refreshTokens(cfg, { ...tokens, last: { name: "Z2", at: "2026-11-18T18:00:00Z", id: 1 } }, f);
    expect(calls[1].get("refresh_token")).toBe("r1");
    expect(n).toMatchObject({ accessToken: "a2", refreshToken: "r2", athlete: { name: "Mario R." }, last: { name: "Z2" } });
  });

  it("says why Strava refused, and refreshes a minute before the token runs out", async () => {
    const f = (async () => json({ message: "Bad Request" }, 400)) as unknown as typeof fetch;
    await expect(exchangeCode(cfg, "x", f)).rejects.toThrow("Bad Request");
    expect(needsRefresh({ expiresAt: 1000 }, 1000 * 1000 - 30_000)).toBe(true);
    expect(needsRefresh({ expiresAt: 1000 }, 1000 * 1000 - 3_600_000)).toBe(false);
  });
});

describe("Strava: the tokens in the note", () => {
  it("are sealed: readable only with the same client secret", async () => {
    const text = await sealTokens(tokens, "segreto-di-prova");
    expect(text).not.toContain("r1");
    expect(text).toContain("Scollega");
    expect(await openTokens(text, "segreto-di-prova")).toEqual(tokens);
    expect(await openTokens(text, "un altro segreto")).toBeNull();
    expect(await openTokens("una nota qualsiasi", "segreto-di-prova")).toBeNull();
    expect(await openTokens(null, "segreto-di-prova")).toBeNull();
  });
});

describe("Strava: upload", () => {
  const fit = new Uint8Array([14, 16, 1, 2, 3, 4, 5, 6, 7, 8, 46, 70, 73, 84]);
  const meta = { name: "Tempo 3x10 Indoor", externalId: "rulli-1" };
  const noWait = async () => {};

  it("sends the FIT as a trainer ride and waits for Strava to finish", async () => {
    let form: FormData | null = null;
    const f = (async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        form = init.body as FormData;
        return json({ id: 9, id_str: "9", error: null, activity_id: null, status: "Your activity is still being processed." }, 201);
      }
      expect(url).toBe("https://www.strava.com/api/v3/uploads/9");
      return json({ id: 9, error: null, activity_id: 555, status: "Your activity is ready." });
    }) as unknown as typeof fetch;
    expect(await uploadFit("a1", fit, meta, f, noWait)).toEqual({ id: 555 });
    const sent = form as unknown as FormData;
    expect([sent.get("data_type"), sent.get("trainer"), sent.get("name"), sent.get("external_id")]).toEqual(["fit", "1", "Tempo 3x10 Indoor", "rulli-1"]);
  });

  it("takes a session already on Strava as done, and explains any other refusal", async () => {
    expect(duplicateOf("rulli-1.fit duplicate of <a href='/activities/123456' target='_blank'>Rulli</a>")).toBe(123456);
    expect(duplicateOf("Improperly formatted data.")).toBeNull();
    const dup = (async (_u: string, init?: RequestInit) =>
      init?.method === "POST" ? json({ id: 9, error: null, activity_id: null }, 201) : json({ id: 9, error: "rulli-1.fit duplicate of activity 123456", activity_id: null })) as unknown as typeof fetch;
    expect(await uploadFit("a1", fit, meta, dup, noWait)).toEqual({ id: 123456, duplicate: true });
    const bad = (async (_u: string, init?: RequestInit) =>
      init?.method === "POST" ? json({ id: 9, error: null, activity_id: null }, 201) : json({ id: 9, error: "<b>Improperly</b> formatted data.", activity_id: null })) as unknown as typeof fetch;
    await expect(uploadFit("a1", fit, meta, bad, noWait)).rejects.toThrow("Strava non ha accettato il file: Improperly formatted data.");
  });

  it("leaves Strava to finish by itself when it is slow", async () => {
    const slow = (async (_u: string, init?: RequestInit) => json({ id: 9, error: null, activity_id: null }, init?.method === "POST" ? 201 : 200)) as unknown as typeof fetch;
    expect(await uploadFit("a1", fit, meta, slow, noWait)).toEqual({ id: null });
  });
});

describe("the app's routes outside the login", () => {
  it("read the login cookie from the request", () => {
    expect(cookieValue("a=1; mascoach_session=123.abc%3D", "mascoach_session")).toBe("123.abc=");
    expect(cookieValue(null, "mascoach_session")).toBeUndefined();
  });
});
