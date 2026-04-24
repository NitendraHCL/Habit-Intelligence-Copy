/**
 * withCache — transparent cache wrapper for Next.js App Router GET handlers.
 *
 * Usage in any route.ts:
 *
 *   async function handler(req: NextRequest) { ... }
 *   export const GET = withCache(handler, { endpoint: "ohc/health-insights" });
 *
 * Flow:
 *   ?nocache=1 / ?refresh=1  → bypass cache, refresh from DB, store new result
 *   Cache HIT                → return stored JSON instantly  (X-Cache: HIT)
 *   Cache MISS               → run handler, store result, return  (X-Cache: MISS)
 *
 * Do NOT cache if:
 *   - handler returns non-2xx status
 *   - response body contains meta.hadErrors === true (endpoint signals degraded)
 *
 * Cache key does NOT include the control params (nocache / refresh / _t), so
 * a refresh writes to the same slot the normal request reads from.
 */

import { NextRequest, NextResponse } from "next/server";
import * as store from "./store";

type RouteHandler = (req: NextRequest) => Promise<NextResponse | Response>;

export interface CacheOptions {
  endpoint: string;
}

// Params that control caching behaviour and must not fracture the cache key
const CACHE_CONTROL_PARAMS = new Set(["nocache", "refresh", "_t", "_bust"]);

export function withCache(
  handler: RouteHandler,
  options: CacheOptions
): RouteHandler {
  return async (req: NextRequest): Promise<NextResponse> => {
    const url = new URL(req.url);
    const params = paramsFromUrl(url);
    const forceRefresh =
      url.searchParams.get("nocache") === "1" ||
      url.searchParams.get("refresh") === "1";

    if (!forceRefresh) {
      const cached = store.get(options.endpoint, params);
      if (cached !== null) {
        return NextResponse.json(cached, {
          headers: {
            "X-Cache": "HIT",
            "X-Cache-Endpoint": options.endpoint,
            "X-Cache-Key": store.buildKey(options.endpoint, params),
          },
        });
      }
    }

    // Cache MISS (or forced refresh) — hit the real handler
    let res: NextResponse | Response;
    try {
      res = await handler(req);
    } catch {
      // Never cache errors
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    const data = await res.clone().json();
    const status = res.status;
    const hadErrors = data && typeof data === "object" && data.meta?.hadErrors === true;

    // Only cache if: 2xx status AND endpoint did not signal degraded data.
    // Skipping degraded writes prevents cache poisoning from a transient DW hiccup.
    if (status >= 200 && status < 300 && !hadErrors) {
      setImmediate(() => {
        store.set(options.endpoint, params, data);
      });
    }

    return NextResponse.json(data, {
      status,
      headers: {
        "X-Cache": forceRefresh ? "REFRESH" : hadErrors ? "BYPASS" : "MISS",
        "X-Cache-Endpoint": options.endpoint,
        "X-Cache-Key": store.buildKey(options.endpoint, params),
      },
    });
  };
}

function paramsFromUrl(url: URL): Record<string, string> {
  const p: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    if (!CACHE_CONTROL_PARAMS.has(k)) p[k] = v;
  });
  return p;
}
