// NOTE on SSRF: this client is only ever called with hardcoded URLs from
// the provider plugins / reference sources in this codebase. It does NOT
// accept user-supplied URLs. If that ever changes, add an outbound URL
// allowlist here (or use ssrf-req-filter) before exposing this client to
// user input.

const DEFAULT_UA =
  'Mozilla/5.0 (compatible; fx-tracker/0.1; +https://github.com/fx-tracker)';

export interface FetchOptions {
  headers?: Record<string, string>;
  method?: 'GET' | 'POST';
  body?: string;
  timeoutMs?: number;
}

export async function httpFetch(url: string, opts: FetchOptions = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);
  try {
    const res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers: {
        'User-Agent': DEFAULT_UA,
        Accept: 'application/json, text/html;q=0.9, */*;q=0.8',
        ...opts.headers,
      },
      body: opts.body,
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

export async function httpJson<T>(url: string, opts: FetchOptions = {}): Promise<T> {
  const res = await httpFetch(url, opts);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return (await res.json()) as T;
}

export async function httpText(url: string, opts: FetchOptions = {}): Promise<string> {
  const res = await httpFetch(url, opts);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return await res.text();
}
