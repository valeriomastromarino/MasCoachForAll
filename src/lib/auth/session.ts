// Login for the hosted app (Vercel): one password (APP_PASSWORD), remembered on each device by a signed cookie.
// Without APP_PASSWORD the app stays open, as on the home PC — except on Vercel, where it stays locked.

export const SESSION_COOKIE = "mascoach_session";
export const SESSION_DAYS = 60;

export function authMode(): "open" | "password" | "locked" {
  if (process.env.APP_PASSWORD) return "password";
  return process.env.VERCEL ? "locked" : "open";
}

// HMAC keyed by the password itself: changing APP_PASSWORD logs every device out.
async function sign(text: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(`mascoach:${process.env.APP_PASSWORD ?? ""}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return Buffer.from(await crypto.subtle.sign("HMAC", key, enc.encode(text))).toString("base64url");
}

export async function isRightPassword(password: string): Promise<boolean> {
  const wanted = process.env.APP_PASSWORD;
  if (!wanted) return false;
  // Compares two HMACs, so the time taken says nothing about the password.
  return (await sign(`pw:${password}`)) === (await sign(`pw:${wanted}`));
}

/** Cookie value: expiry time + its signature. */
export async function newSession(): Promise<string> {
  const expires = Date.now() + SESSION_DAYS * 86_400_000;
  return `${expires}.${await sign(`session:${expires}`)}`;
}

/** True when a request carrying this cookie may use the app. */
export async function isAllowed(cookie: string | undefined): Promise<boolean> {
  const mode = authMode();
  if (mode !== "password") return mode === "open";
  const [expires, signature] = (cookie ?? "").split(".");
  if (!expires || !signature || Number(expires) < Date.now()) return false;
  return signature === (await sign(`session:${expires}`));
}

/** Only paths inside the app: never send the browser to another site after login. */
export function safeNext(value: unknown): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}
