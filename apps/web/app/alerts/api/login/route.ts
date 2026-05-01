import { NextResponse } from 'next/server';
import { headers as nextHeaders } from 'next/headers';
import { login, checkLoginRate, safeNextPath } from '@/lib/auth';

function ipFromHeaders(h: Headers): string {
  return (
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    h.get('x-real-ip') ??
    'unknown'
  );
}

export async function POST(req: Request) {
  const form = await req.formData();
  const password = String(form.get('password') ?? '');
  const next = safeNextPath(form.get('next'));
  const ip = ipFromHeaders(await nextHeaders());

  if (!checkLoginRate(ip)) {
    return NextResponse.redirect(
      new URL(`/alerts/login?error=Too+many+attempts.+Wait+a+minute.`, req.url),
      303,
    );
  }

  try {
    const ok = await login(password);
    if (!ok) {
      return NextResponse.redirect(
        new URL(`/alerts/login?error=Wrong+password`, req.url),
        303,
      );
    }
    return NextResponse.redirect(new URL(next, req.url), 303);
  } catch (err) {
    // Never leak the raw error (could reveal "ADMIN_PASSWORD_HASH not set" or
    // a bcrypt internal). Log server-side, return a generic message.
    console.error('login error:', err);
    return NextResponse.redirect(
      new URL(`/alerts/login?error=Login+failed`, req.url),
      303,
    );
  }
}
