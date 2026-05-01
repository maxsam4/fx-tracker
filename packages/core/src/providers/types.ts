import type { CurrencyPair } from '../types.js';

export type DataSource = 'api' | 'aggregator' | 'scrape' | 'reference';

export interface Quote {
  /** Logical provider behind the quote (e.g. 'lulu' even when sourced via masarif). */
  providerId: string;
  /** Where we got the data from (e.g. 'masarif', 'lulu_direct', 'wise_api'). */
  dataSource: string;
  pair: CurrencyPair;
  sendAmount: number;
  receiveAmount: number;
  rate: number;
  feeAmount: number;
  capturedAt: Date;
  raw?: unknown;
}

export interface RateProvider {
  id: string;
  displayName: string;
  /** A human-readable note about how the data is captured. */
  kind: DataSource;
  supports(pair: CurrencyPair): boolean;
  fetchQuote(input: { pair: CurrencyPair; sendAmount: number }): Promise<Quote | Quote[]>;
}

export interface ReferenceRate {
  sourceId: string;
  pair: CurrencyPair;
  rate: number;
  capturedAt: Date;
  raw?: unknown;
}

export interface ReferenceSource {
  id: string;
  displayName: string;
  fetchRate(input: { pair: CurrencyPair }): Promise<ReferenceRate>;
}
