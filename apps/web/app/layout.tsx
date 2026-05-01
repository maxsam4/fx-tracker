import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { Instrument_Serif } from 'next/font/google';
import './globals.css';
import { TopNav } from '@/components/TopNav';
import { StatusDot } from '@/components/ui/Pill';

const instrument = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['italic', 'normal'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'fx·tracker — honest remittance rates',
  description: 'Self-hosted comparison of remittance providers against the mid-market.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} ${instrument.variable}`}
    >
      <body className="font-sans antialiased">
        <div className="relative min-h-screen">
          <div className="pointer-events-none fixed inset-0 -z-10 grid-bg opacity-[0.55]" />

          <TopNav />

          <main className="mx-auto max-w-6xl px-6 pb-24 pt-8 md:px-8">{children}</main>

          <footer className="mx-auto max-w-6xl px-6 pb-10 md:px-8">
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-edge pt-6 text-2xs uppercase tracking-[0.16em] text-subtle">
              <div className="flex items-center gap-2">
                <StatusDot status="ok" />
                <span>self-hosted · open data</span>
              </div>
              <div className="flex items-center gap-4">
                <a href="/api/health" className="hover:text-text">
                  health
                </a>
                <a
                  href="https://github.com"
                  className="hover:text-text"
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
