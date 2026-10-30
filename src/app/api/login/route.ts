// Login form target: right password → signed cookie for SESSION_DAYS, then back to the page asked for.
import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_DAYS, isRightPassword, newSession, safeNext } from "@/lib/auth/session";

export async function POST(request: Request) {
  const form = await request.formData();
  const next = safeNext(form.get("next"));
  if (!(await isRightPassword(String(form.get("password") ?? "")))) {
    // A pause on every wrong try makes guessing the password very slow.
    await new Promise((r) => setTimeout(r, 1000));
    const back = new URL("/login", request.url);
    back.searchParams.set("error", "1");
    if (next !== "/") back.searchParams.set("next", next);
    return NextResponse.redirect(back, 303);
  }
  const response = NextResponse.redirect(new URL(next, request.url), 303);
  response.cookies.set(SESSION_COOKIE, await newSession(), {
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
  return response;
}
