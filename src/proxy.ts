// Every page and /api/* call needs the login cookie (see lib/auth/session.ts). Still reachable: the login page,
// static files, the install files (manifest, icons) and the Claude connector (api/mcp, which checks its own secret).
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, isAllowed } from "@/lib/auth/session";

export async function proxy(request: NextRequest) {
  if (await isAllowed(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 });
  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!login|api/login|api/mcp/|_next/static|_next/image|manifest.webmanifest|icon|apple-icon|favicon.ico|icons/).*)"],
};
