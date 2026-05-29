/* ────────────────────────────────────────────────────────────────────
 * withProvenance — attaches a dashboard's data-audit provenance map to
 * the response's `_meta.provenance`, but ONLY for SUPER_ADMIN callers.
 *
 * Why this sits OUTSIDE withCache: the data cache key is derived purely
 * from the request's query params (see lib/cache/middleware.ts), not the
 * caller's role. If provenance were baked into the cached body it would
 * leak to whatever role hit the cache first — a non-superadmin could be
 * served a superadmin's payload, or a superadmin could get a cached body
 * with the panel missing. Provenance is a static constant that doesn't
 * depend on the data, so we inject it per-request, after the cache:
 *
 *   export const GET = withProvenance(
 *     withCache(handler, { endpoint: "ohc/repeat-visits" }),
 *     PROVENANCE
 *   );
 *
 * The cached data stays role-agnostic; only this thin outer layer varies
 * by role.
 * ──────────────────────────────────────────────────────────────────── */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import type { DashboardProvenance } from "./provenance";

type RouteHandler = (req: NextRequest) => Promise<NextResponse | Response>;

export function withProvenance(
  handler: RouteHandler,
  provenance: DashboardProvenance
): RouteHandler {
  return async (req: NextRequest): Promise<NextResponse> => {
    const res = await handler(req);

    // Resolve role independently of the handler. getSession is cheap
    // (single indexed session lookup) and the handler already called it.
    let isSuperAdmin = false;
    try {
      const session = await getSession();
      isSuperAdmin = session?.user.role === "SUPER_ADMIN";
    } catch {
      isSuperAdmin = false;
    }

    // Pass non-superadmin and non-2xx responses straight through, preserving
    // the inner response's status + cache headers.
    const headers = new Headers(res.headers);
    if (!isSuperAdmin || res.status < 200 || res.status >= 300) {
      const passthrough = await res.clone().json().catch(() => null);
      if (passthrough === null) return res as NextResponse;
      return NextResponse.json(passthrough, { status: res.status, headers });
    }

    const data = await res.clone().json().catch(() => null);
    if (data && typeof data === "object" && !Array.isArray(data)) {
      data._meta = { ...(data._meta ?? {}), provenance };
      return NextResponse.json(data, { status: res.status, headers });
    }
    return res as NextResponse;
  };
}
