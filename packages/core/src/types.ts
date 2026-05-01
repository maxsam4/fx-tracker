export type CurrencyCode = 'USD' | 'AED' | 'INR' | string;

export interface CurrencyPair {
  from: CurrencyCode;
  to: CurrencyCode;
}

export const pairKey = (p: CurrencyPair): string => `${p.from}-${p.to}`;

export const parsePairKey = (key: string): CurrencyPair => {
  const [from, to] = key.split('-');
  if (!from || !to) throw new Error(`Invalid pair key: ${key}`);
  return { from, to };
};
