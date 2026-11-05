// The Android home-screen widget asks for its summary here, in the background (no cookie): the app password in a header decides.
// Outside proxy.ts's login on purpose, so it checks access itself; the cookie also works (the website).
import { cookies } from "next/headers";
import { SESSION_COOKIE, isAllowed, isRightPassword } from "@/lib/auth/session";
import { handleApi } from "@/lib/api/handlers";

export const maxDuration = 30;

export async function GET(request: Request): Promise<Response> {
  const password = request.headers.get("x-mascoach-password");
  let ok = false;
  if (password) {
    ok = await isRightPassword(password);
    // A wrong password costs a pause, so guessing is slow.
    if (!ok) await new Promise((r) => setTimeout(r, 800));
  } else ok = await isAllowed((await cookies()).get(SESSION_COOKIE)?.value);
  if (!ok) return Response.json({ error: "Accesso richiesto" }, { status: 401 });
  const r = await handleApi("GET", "/api/widget");
  return Response.json(r.json, { status: r.status, headers: { "Cache-Control": "no-store" } });
}
