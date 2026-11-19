// Who may call a route that the phone app reaches from outside the login (it has no cookie): the app password in a
// header, or the website's login cookie. Used by the Strava routes; the coach and the widget check the same way.
import { isAllowed, isRightPassword, SESSION_COOKIE } from "./session";

/** The phone app calls from its own origin: any origin may ask, the password decides who gets an answer. */
export const APP_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-mascoach-password",
  "Access-Control-Max-Age": "86400",
};

export function cookieValue(header: string | null, name: string): string | undefined {
  for (const part of (header ?? "").split(/;\s*/)) if (part.startsWith(`${name}=`)) return decodeURIComponent(part.slice(name.length + 1));
  return undefined;
}

export async function allowedRequest(request: Request): Promise<boolean> {
  const password = request.headers.get("x-mascoach-password");
  if (password) {
    if (await isRightPassword(password)) return true;
    // A wrong password costs a pause, so guessing is slow.
    await new Promise((r) => setTimeout(r, 800));
    return false;
  }
  return isAllowed(cookieValue(request.headers.get("cookie"), SESSION_COOKIE));
}
