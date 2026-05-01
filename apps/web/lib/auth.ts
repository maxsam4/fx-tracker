import { cookies } from 'next/headers';
import { getIronSession, type SessionOptions } from 'iron-session';
import bcrypt from 'bcrypt';

export interface AdminSession {
  authenticated: boolean;
  loggedInAt?: string;
}

function resolveSessionSecret(): string {
  const v = process.env.SESSION_SECRET;
  if (v && v.length >= 32) return v;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'SESSION_SECRET must be set to a 32+ character string in production',
    );
  }
  // Dev/test only — never reached in production due to the throw above.
  return 'dev-only-replace-this-with-32-plus-chars-xx';
}

// Lazy: built only when actually needed (a request hits a route that calls
// getSession). This prevents the Next.js build's page-data collection step
// from throwing when SESSION_SECRET isn't set inside the build container.
let _sessionOptions: SessionOptions | null = null;
function getSessionOptions(): SessionOptions {
  if (_sessionOptions) return _sessionOptions;
  _sessionOptions = {
    cookieName: 'fx_admin_session',
    password: resolveSessionSecret(),
    cookieOptions: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    },
  };
  return _sessionOptions;
}

/**
 * Validate a post-login `next` redirect path: must be same-origin, relative,
 * and not protocol-relative (`//evil.com`). Returns the path if safe, else
 * the default `/alerts`.
 */
export function safeNextPath(input: unknown): string {
  if (typeof input !== 'string' || input.length === 0) return '/alerts';
  // Reject protocol-relative (//host) and absolute (http(s)://) URLs.
  if (input.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(input)) {
    return '/alerts';
  }
  if (!input.startsWith('/')) return '/alerts';
  return input;
}

export async function getSession() {
  const c = await cookies();
  return getIronSession<AdminSession>(c, getSessionOptions());
}

export async function isAuthenticated(): Promise<boolean> {
  const s = await getSession();
  return Boolean(s.authenticated);
}

export async function login(password: string): Promise<boolean> {
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash) {
    throw new Error('ADMIN_PASSWORD_HASH is not set');
  }
  const ok = await bcrypt.compare(password, hash);
  if (!ok) return false;
  const s = await getSession();
  s.authenticated = true;
  s.loggedInAt = new Date().toISOString();
  await s.save();
  return true;
}

export async function logout(): Promise<void> {
  const s = await getSession();
  s.destroy();
}

// In-memory IP rate-limit for the login endpoint. Single-process so a deploy
// resets counters; that's acceptable for a personal-tool gate.
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const LIMIT = 5;
const WINDOW_MS = 60_000;

export function checkLoginRate(ip: string): boolean {
  const now = Date.now();
  const e = loginAttempts.get(ip);
  if (!e || e.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (e.count >= LIMIT) return false;
  e.count++;
  return true;
}
