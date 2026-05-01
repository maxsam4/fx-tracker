// Singleton Playwright browser. Each scrape gets a fresh page with a realistic
// user-agent. The browser is launched lazily on first use and lives for the
// process lifetime; pages are short-lived to bound memory.
//
// Stealth plugin reduces basic bot-detection (navigator.webdriver, etc.). Some
// providers will still block us — that's expected; their plugin records an
// 'error' run row and we move on.

import { chromium, type Browser, type Page } from 'playwright';

const DEFAULT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';

let _browser: Browser | null = null;
let _launching: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (_browser && _browser.isConnected()) return _browser;
  if (_launching) return _launching;
  _launching = chromium
    .launch({
      headless: true,
      args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    })
    .then((b) => {
      _browser = b;
      _launching = null;
      return b;
    });
  return _launching;
}

export async function withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  const browser = await getBrowser();
  const ctx = await browser.newContext({
    userAgent: DEFAULT_UA,
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
  });
  const page = await ctx.newPage();
  try {
    return await fn(page);
  } finally {
    await ctx.close().catch(() => {});
  }
}

export async function shutdownBrowser(): Promise<void> {
  if (_browser) {
    await _browser.close().catch(() => {});
    _browser = null;
  }
}
