import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'fx-tracker',
  description: 'Honest remittance rate comparison',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <header className="mb-6 flex items-center justify-between">
            <a href="/" className="text-lg font-semibold tracking-tight text-text">
              fx-tracker
            </a>
            <nav className="flex gap-4 text-sm text-muted">
              <a href="/USD-INR" className="hover:text-text">USD→INR</a>
              <a href="/AED-INR" className="hover:text-text">AED→INR</a>
              <a href="/alerts" className="hover:text-text">Alerts</a>
            </nav>
          </header>
          <main>{children}</main>
          <footer className="mt-10 text-xs text-muted">
            <span>self-hosted · open data · </span>
            <a href="/api/health" className="underline">health</a>
          </footer>
        </div>
      </body>
    </html>
  );
}
