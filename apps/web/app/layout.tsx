import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { Fraunces } from 'next/font/google';
import './globals.css';
import { TopNav } from '@/components/TopNav';

const fraunces = Fraunces({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  axes: ['SOFT', 'opsz'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'fx·tracker — honest remittance rates',
  description: 'A premium comparison of remittance providers against the live mid-market.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} ${fraunces.variable}`}
    >
      <body className="font-sans antialiased paper-bg">
        <div className="relative min-h-screen">
          <div className="pointer-events-none fixed inset-0 -z-10 paper-grain opacity-60" />

          <TopNav />

          <main className="mx-auto max-w-[1200px] px-6 pb-32 pt-10 md:px-10">{children}</main>

          <footer className="mx-auto max-w-[1200px] px-6 pb-12 md:px-10">
            <div className="dot-rule mb-6" aria-hidden />
            <div className="flex flex-wrap items-center justify-between gap-3 text-2xs uppercase tracking-[0.18em] text-subtle">
              <div className="flex items-center gap-2">
                <span className="display-italic text-base font-light normal-case tracking-normal text-muted">
                  fx
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
