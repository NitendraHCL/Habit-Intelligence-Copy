import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "hi_session";

// Routes that don't require authentication.
// The MFA endpoints sit in the gap between credentials and session: they
// run *after* /login mints the short-lived pending-OTP cookie but *before*
// /verify-otp issues the real session, so they must be reachable without
// an `hi_session` cookie. Their own handlers enforce the pending-OTP
// cookie instead.
const PUBLIC_ROUTES = [
  "/login",
  "/api/auth/login",
  "/api/auth/verify-otp",
  "/api/auth/resend-otp",
];
// Static file extensions to skip
const STATIC_EXTENSIONS = [".ico", ".png", ".jpg", ".svg", ".css", ".js", ".woff", ".woff2"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static files and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    STATIC_EXTENSIONS.some((ext) => pathname.endsWith(ext))
  ) {
    return NextResponse.next();
  }

  // Allow public routes
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Check for session cookie on protected routes
  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;

  if (!sessionToken && (pathname.startsWith("/portal") || pathname.startsWith("/api"))) {
    // Redirect to login for page requests
    if (!pathname.startsWith("/api")) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
    // Return 401 for API requests
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/portal/:path*", "/api/:path*", "/login"],
};
