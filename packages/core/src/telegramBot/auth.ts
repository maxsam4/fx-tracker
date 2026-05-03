import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { botAuthorizedChats } from '../db/schema.js';

const RATE_WINDOW_MS = 5 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 3;

interface FailureRecord {
  count: number;
  windowStart: number;
  lockedUntil?: number;
}

const failures = new Map<string, FailureRecord>();

export function _resetAuthRateLimit(): void {
  failures.clear();
}

export type LoginResult =
  | { ok: true }
  | { ok: false; reason: 'wrong_pin' | 'locked' | 'no_pin_set' };

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function tryLogin(chatId: string, pin: string): Promise<LoginResult> {
  const expected = process.env.TELEGRAM_BOT_PIN;
  if (!expected) return { ok: false, reason: 'no_pin_set' };

  const now = Date.now();
  const rec = failures.get(chatId);
  if (rec?.lockedUntil && rec.lockedUntil > now) {
    return { ok: false, reason: 'locked' };
  }

  if (!constantTimeEqual(pin, expected)) {
    let cur = rec;
    if (!cur || now - cur.windowStart > RATE_WINDOW_MS) {
      cur = { count: 0, windowStart: now };
    }
    cur.count++;
    if (cur.count >= MAX_ATTEMPTS) {
      cur.lockedUntil = now + LOCKOUT_MS;
    }
    failures.set(chatId, cur);
    return { ok: false, reason: cur.lockedUntil ? 'locked' : 'wrong_pin' };
  }

  // Success: clear any failure state and persist authorization.
  failures.delete(chatId);
  const db = getDb();
  await db
    .insert(botAuthorizedChats)
    .values({ chatId, authorizedAt: new Date(), lastSeenAt: new Date() })
    .onConflictDoUpdate({
      target: botAuthorizedChats.chatId,
      set: { lastSeenAt: new Date() },
    });
  return { ok: true };
}

export async function logout(chatId: string): Promise<void> {
  const db = getDb();
  await db.delete(botAuthorizedChats).where(eq(botAuthorizedChats.chatId, chatId));
}

export async function isAuthorized(chatId: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ chatId: botAuthorizedChats.chatId })
    .from(botAuthorizedChats)
    .where(eq(botAuthorizedChats.chatId, chatId))
    .limit(1);
  return !!row;
}

export async function touchLastSeen(chatId: string): Promise<void> {
  const db = getDb();
  await db
    .update(botAuthorizedChats)
    .set({ lastSeenAt: new Date() })
    .where(eq(botAuthorizedChats.chatId, chatId));
}
