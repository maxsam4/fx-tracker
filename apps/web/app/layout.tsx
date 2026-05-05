import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { TopNav } from '@/components/TopNav';

export const metadata: Metadata = {
  title: 'fx·tracker — honest remittance rates',
  description: 'Live comparison of remittance providers against the mid-market.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      // Use Geist Sans for both body and display — single, premium fintech-grade
      // family (Stripe / Mercury / Brex idiom). Mono is reserved for tabular numerals.
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      style={{
        // Alias --font-display to Geist Sans so existing `.display` styles
        // render in sans without touching every component.
        ['--font-display' as never]: GeistSans.style.fontFamily,
      }}
    >
      <body className="font-sans antialiased paper-bg">
        <div className="relative min-h-screen">
          <div className="pointer-events-none fixed inset-0 -z-10 paper-grain opacity-60" />

          <TopNav />

          <main className="mx-auto max-w-[1440px] px-5 pb-20 pt-6 md:px-8">{children}</main>

          <footer className="mx-auto max-w-[1440px] px-5 pb-8 md:px-8">
            <div className="dot-rule mb-5" aria-hidden />
            <div className="flex flex-wrap items-center justify-between gap-3 text-2xs uppercase tracking-[0.18em] text-subtle">
              <div className="flex items-center gap-2">
                <span className="font-sans text-sm font-semibold tracking-tight text-muted normal-case">
                  fx·tracker
                </span>
                <span>· self-hosted · open data · {new Date().getFullYear()}</span>
              </div>
              <div className="flex items-center gap-5">
                <a href="/api/health" className="transition-colors hover:text-text">
                  health
                </a>
                <a
                  href="https://github.com"
                  className="transition-colors hover:text-text"
                  rel="noreferrer"
                  target="_blank"
                >
                  source
                </a>
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
