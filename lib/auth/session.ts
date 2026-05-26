import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import bcryptjs from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import type { SessionUser, AuthSession } from "@/lib/types";

const SESSION_COOKIE = "hi_session";
const SESSION_EXPIRY_DAYS = 7;

/**
 * Idle-logout window. A session is treated as expired (and deleted) when no
 * authenticated activity has been recorded for this many minutes. Kept here
 * as a named constant + ms helper so both the server (this file) and the
 * client (IdleTimer component) can reference the same value via the
 * `/api/auth/session-policy` endpoint.
 */
export const IDLE_TIMEOUT_MINUTES = 60;
const IDLE_TIMEOUT_MS = IDLE_TIMEOUT_MINUTES * 60 * 1000;

/**
 * How often we'll touch the `last_activity` column. Writing on every request
 * would hammer Postgres; we only persist a refresh if at least this many
 * seconds have passed since the last persisted activity. The check itself
 * still happens on every request — it's just the DB write that's throttled.
 */
const ACTIVITY_WRITE_THROTTLE_MS = 30 * 1000;

export async function hashPassword(password: string): Promise<string> {
  const rounds = Number(process.env.BCRYPT_ROUNDS) || 12;
  return bcryptjs.hash(password, rounds);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcryptjs.compare(password, hash);
}

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export async function createSession(userId: string): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_EXPIRY_DAYS);

  await prisma.session.create({
    data: { userId, token, expiresAt },
  });

  // Update last login
  await prisma.user.update({
    where: { id: userId },
    data: { lastLoginAt: new Date() },
  });

  // Set cookie
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  return token;
}

export async function getSession(): Promise<AuthSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: {
      user: {
        include: { client: true },
      },
    },
  });

  const now = new Date();

  // Hard expiry — the 7-day session lifetime.
  if (!session || session.expiresAt < now) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } });
    }
    return null;
  }

  // Idle expiry — treat the session as logged-out if no activity has been
  // recorded inside the rolling IDLE_TIMEOUT window. Delete the session
  // row so the cookie becomes useless on subsequent requests too.
  const idleMs = now.getTime() - session.lastActivity.getTime();
  if (idleMs > IDLE_TIMEOUT_MS) {
    await prisma.session.delete({ where: { id: session.id } });
    return null;
  }

  // Refresh lastActivity — but throttle the DB write so we're not writing
  // on every single API call (could be dozens per page render). The idle
  // check above still runs on every request; we just don't always persist.
  if (idleMs > ACTIVITY_WRITE_THROTTLE_MS) {
    // Fire-and-forget — we don't need to await this. Even if it fails,
    // the session stays valid for the next request thanks to throttle.
    prisma.session.update({
      where: { id: session.id },
      data: { lastActivity: now },
    }).catch(() => { /* swallow — non-critical */ });
  }

  const user: SessionUser = {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
    clientId: session.user.clientId,
    avatarUrl: session.user.avatarUrl,
  };

  return { user, token: session.token, expiresAt: session.expiresAt };
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    await prisma.session.deleteMany({ where: { token } });
    cookieStore.delete(SESSION_COOKIE);
  }
}

/**
 * Get the current user's CUG code for data filtering.
 * Internal users (SUPER_ADMIN, INTERNAL_OPS) can pass clientId param.
 * External users are locked to their own client's CUG.
 */
export async function getSessionCugCode(requestedClientId?: string): Promise<string | null> {
  const session = await getSession();
  if (!session) return null;

  const { user } = session;
  const isInternal = user.role === "SUPER_ADMIN" || user.role === "INTERNAL_OPS";

  if (isInternal && requestedClientId) {
    const client = await prisma.client.findUnique({
      where: { id: requestedClientId },
      select: { cugCode: true },
    });
    return client?.cugCode ?? null;
  }

  if (user.role === "KAM" && requestedClientId) {
    // KAM can only access assigned clients
    const assignment = await prisma.userClientAssignment.findUnique({
      where: { userId_clientId: { userId: user.id, clientId: requestedClientId } },
      include: { client: { select: { cugCode: true } } },
    });
    return assignment?.client.cugCode ?? null;
  }

  // Client users: locked to own CUG
  if (user.clientId) {
    const client = await prisma.client.findUnique({
      where: { id: user.clientId },
      select: { cugCode: true },
    });
    return client?.cugCode ?? null;
  }

  return null;
}

/**
 * Get the current user's CUG ID for fact_kx queries.
 * Uses cug_facility_mapping.cug_id instead of registration_fact.cug_code.
 */
export async function getSessionCugId(requestedClientId?: string): Promise<string | null> {
  const session = await getSession();
  if (!session) return null;

  const { user } = session;
  const isInternal = user.role === "SUPER_ADMIN" || user.role === "INTERNAL_OPS";

  if (isInternal && requestedClientId) {
    const client = await prisma.client.findUnique({
      where: { id: requestedClientId },
      select: { cugId: true },
    });
    return client?.cugId ?? null;
  }

  if (user.role === "KAM" && requestedClientId) {
    const assignment = await prisma.userClientAssignment.findUnique({
      where: { userId_clientId: { userId: user.id, clientId: requestedClientId } },
      include: { client: { select: { cugId: true } } },
    });
    return assignment?.client.cugId ?? null;
  }

  if (user.clientId) {
    const client = await prisma.client.findUnique({
      where: { id: user.clientId },
      select: { cugId: true },
    });
    return client?.cugId ?? null;
  }

  return null;
}

/**
 * Require auth — throws if not authenticated. Use in API routes.
 */
export async function requireAuth(): Promise<AuthSession> {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  return session;
}
