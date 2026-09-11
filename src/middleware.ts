import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession, homePathForRole } from "@/lib/auth";

const roleForPrefix: Record<string, "wife" | "warehouse" | "admin"> = {
  "/wife": "wife",
  "/warehouse": "warehouse",
  "/admin": "admin",
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic =
    pathname === "/login" ||
    pathname === "/setup" ||
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/api/setup") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico";

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);

  if (isPublic) {
    // لو مسجّل دخول بالفعل وفتح /login أو /setup، رجّعه لصفحته
    if (session && (pathname === "/login" || pathname === "/setup")) {
      return NextResponse.redirect(new URL(homePathForRole[session.role], req.url));
    }
    return NextResponse.next();
  }

  if (!session) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const matchedPrefix = Object.keys(roleForPrefix).find((p) => pathname.startsWith(p));
  if (matchedPrefix) {
    const requiredRole = roleForPrefix[matchedPrefix];
    const allowed =
      session.role === requiredRole || (requiredRole === "warehouse" && session.role === "admin");
    if (!allowed) {
      return NextResponse.redirect(new URL(homePathForRole[session.role], req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
