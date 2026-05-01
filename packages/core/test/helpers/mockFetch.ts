import { vi } from 'vitest';

export interface MockResponse {
  status?: number;
  body?: unknown;
  text?: string;
  contentType?: string;
}

export function installFetchMock(
  routes: Record<string, MockResponse | ((url: string) => MockResponse)>,
) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url, init });
    let route = routes[url];
    if (!route) {
      // Allow prefix matching: try matching route keys as URL prefixes.
      const prefixKey = Object.keys(routes).find((k) => url.startsWith(k));
      if (prefixKey) route = routes[prefixKey];
    }
    if (!route) {
      return new Response(JSON.stringify({ error: `unmocked: ${url}` }), { status: 599 });
    }
    const resolved = typeof route === 'function' ? route(url) : route;
    const status = resolved.status ?? 200;
    const ct = resolved.contentType ?? (resolved.body !== undefined ? 'application/json' : 'text/plain');
    const body =
      resolved.text !== undefined
        ? resolved.text
        : resolved.body !== undefined
        ? JSON.stringify(resolved.body)
        : '';
    return new Response(body, { status, headers: { 'Content-Type': ct } });
  });

  vi.stubGlobal('fetch', fakeFetch);
  return { calls, fakeFetch };
}

export function resetFetchMock() {
  vi.unstubAllGlobals();
}
