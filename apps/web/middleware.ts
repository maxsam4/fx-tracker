import { NextResponse, type NextRequest } from 'next/server';

// Helmet-equivalent security headers via Next middleware. We avoid adding a
// Helmet dependency since this is the only thing it does for us in this app.
const headers: Array<[string, string]> = [
  ['Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload'],
  ['X-Content-Type-Options', 'nosniff'],
  ['X-Frame-Options', 'DENY'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['Permissions-Policy', 'geolocation=(), microphone=(), camera=()'],
  [
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",       // Next inlines runtime scripts
      "style-src 'self' 'unsafe-inline'",        // Tailwind generated styles
      "img-src 'self' data:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
    ].join('; '),
  ],
];

export function middleware(_req: NextRequest) {
  const res = NextResponse.next();
  for (const [k, v] of headers) {
    res.headers.set(k, v);
  }
  return res;
}

export const config = {
  matcher: '/((?!_next/static|_next/image|favicon.ico).*)',
};
