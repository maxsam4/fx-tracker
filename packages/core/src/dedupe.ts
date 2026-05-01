import type { Quote } from './providers/types.js';
import type { ProvidersConfig } from './config/loadProviders.js';

/**
 * Aggregator dedup: if multiple sources emit the same providerId in the same
 * batch, the configured preferredSource wins. If none is configured, the
 * first observed source wins (stable order from the providers.yml list).
 */
export function dedupeQuotes(quotes: Quote[], config: ProvidersConfig): Quote[] {
  const byProvider = new Map<string, Quote>();
  for (const q of quotes) {
    const existing = byProvider.get(q.providerId);
    if (!existing) {
      byProvider.set(q.providerId, q);
      continue;
    }
    const preferred = config.preferredSource[q.providerId];
    if (!preferred) continue; // first wins by default
    if (q.dataSource.startsWith(preferred)) {
      byProvider.set(q.providerId, q);
    }
  }
  return [...byProvider.values()];
}
