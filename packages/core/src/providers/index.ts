import type { RateProvider, ReferenceSource } from './types.js';

import { wiseProvider } from './wise.js';
import { remitlyProvider } from './remitly.js';
import { xoomProvider } from './xoom.js';
import { instaremProvider } from './instarem.js';
import { masarifProvider } from './masarif.js';
import { westernUnionProvider } from './westernUnion.js';
import { careemPayProvider } from './careemPay.js';
import { asporaProvider } from './aspora.js';
import { luluProvider } from './lulu.js';
import { remitfinderProvider } from './remitfinder.js';

import { wiseMidMarketSource } from './reference/wiseMidMarket.js';
import { xeSource } from './reference/xe.js';
import { exchangerateHostSource } from './reference/exchangerateHost.js';
import { googleFinanceSource } from './reference/googleFinance.js';

export * from './types.js';

const providerList: RateProvider[] = [
  wiseProvider,
  remitlyProvider,
  xoomProvider,
  instaremProvider,
  masarifProvider,
  westernUnionProvider,
  careemPayProvider,
  asporaProvider,
  luluProvider,
  remitfinderProvider,
];

const referenceList: ReferenceSource[] = [
  wiseMidMarketSource,
  xeSource,
  exchangerateHostSource,
  googleFinanceSource,
];

export const providerRegistry = new Map(providerList.map((p) => [p.id, p] as const));
export const referenceRegistry = new Map(referenceList.map((r) => [r.id, r] as const));

export function getProvider(id: string): RateProvider {
  const p = providerRegistry.get(id);
  if (!p) throw new Error(`Unknown provider: ${id}`);
  return p;
}

export function getReferenceSource(id: string): ReferenceSource {
  const r = referenceRegistry.get(id);
  if (!r) throw new Error(`Unknown reference source: ${id}`);
  return r;
}

export function listProviders(): RateProvider[] {
  return [...providerList];
}

export function listReferenceSources(): ReferenceSource[] {
  return [...referenceList];
}
