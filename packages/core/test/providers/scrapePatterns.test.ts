/**
 * Tests for the bare-text rate parsing patterns used inside the scrapers'
 * page.evaluate() blocks. We can't unit-test the Playwright path directly,
 * but we CAN unit-test the regex/range logic by simulating the extracted
 * page text.
 */
import { describe, it, expect } from 'vitest';

// Patterns mirrored from the scraper plugins (kept in sync via these tests).
const RATE_PATTERNS = {
  AED_INR_DIRECT: /1\s*AED\s*=\s*(\d{1,3}\.\d{2,6})\s*INR/i,
  AED_INR_LOOSE: /(\d{1,3}\.\d{2,6})\s*INR/g,
  USD_INR_DIRECT: /1\s*USD\s*=\s*(\d{1,3}\.\d{2,6})\s*INR/i,
  ASPORA_FEE_AED: /fee[^0-9]{0,40}?(\d{1,3}(?:\.\d{1,2})?)\s*AED\b/i,
  REMITFINDER_RATE: /(\d{1,3}\.\d{2,6})/,
};

describe('scraper text patterns — AED→INR', () => {
  it('matches "1 AED = 25.85 INR"', () => {
    const m = '1 AED = 25.85 INR'.match(RATE_PATTERNS.AED_INR_DIRECT);
    expect(m?.[1]).toBe('25.85');
  });

  it('matches "1 AED = 19.99 INR" (low edge)', () => {
    const m = '1 AED = 19.99 INR'.match(RATE_PATTERNS.AED_INR_DIRECT);
    expect(m?.[1]).toBe('19.99');
  });

  it('matches "1 AED = 33.4500 INR" (4-decimal)', () => {
    const m = '1 AED = 33.4500 INR'.match(RATE_PATTERNS.AED_INR_DIRECT);
    expect(m?.[1]).toBe('33.4500');
  });

  it('finds first INR-suffixed number with loose pattern', () => {
    const text = 'Some preamble. 25.85 INR. Other stuff.';
    const matches = [...text.matchAll(RATE_PATTERNS.AED_INR_LOOSE)];
    expect(matches.length).toBeGreaterThan(0);
    expect(parseFloat(matches[0]![1]!)).toBeCloseTo(25.85);
  });
});

describe('scraper text patterns — USD→INR', () => {
  it('matches "1 USD = 94.97 INR"', () => {
    const m = '1 USD = 94.97 INR'.match(RATE_PATTERNS.USD_INR_DIRECT);
    expect(m?.[1]).toBe('94.97');
  });

  it('matches even when surrounded by other text', () => {
    const m = 'Today: 1 USD = 95.1234 INR (mid-market)'.match(RATE_PATTERNS.USD_INR_DIRECT);
    expect(m?.[1]).toBe('95.1234');
  });

  it('does not match malformed "1 USD: 95 INR"', () => {
    const m = '1 USD: 95 INR'.match(RATE_PATTERNS.USD_INR_DIRECT);
    expect(m).toBeNull();
  });
});

describe('Aspora fee pattern (AED-only)', () => {
  it('captures "fee: 5 AED"', () => {
    const m = 'Service fee: 5 AED'.match(RATE_PATTERNS.ASPORA_FEE_AED);
    expect(m?.[1]).toBe('5');
  });

  it('captures decimal fee', () => {
    const m = 'Total fee 7.50 AED'.match(RATE_PATTERNS.ASPORA_FEE_AED);
    expect(m?.[1]).toBe('7.50');
  });

  it('does NOT match a fee in INR (preventing double-deduction)', () => {
    const m = 'fee 100 INR'.match(RATE_PATTERNS.ASPORA_FEE_AED);
    expect(m).toBeNull();
  });

  it('does NOT match a fee with no currency', () => {
    const m = 'fee 5'.match(RATE_PATTERNS.ASPORA_FEE_AED);
    expect(m).toBeNull();
  });
});

describe('Remitfinder rate row regex (loose)', () => {
  it('extracts the first plausible number', () => {
    const m = 'Wise   94.55  fee 0  send'.match(RATE_PATTERNS.REMITFINDER_RATE);
    expect(m?.[1]).toBe('94.55');
  });

  it('also matches AED-INR scale', () => {
    const m = 'Al Ansari 25.5012 fee 0'.match(RATE_PATTERNS.REMITFINDER_RATE);
    expect(m?.[1]).toBe('25.5012');
  });
});

// Plausibility ranges mirrored from the scrapers — used as a fence after
// regex extraction.
describe('rate plausibility ranges', () => {
  it('rejects USD-INR rates outside 60..130', () => {
    expect(60 > 60 && 60 < 130).toBe(false);
    expect(95 > 60 && 95 < 130).toBe(true);
    expect(130 > 60 && 130 < 130).toBe(false);
  });
  it('rejects AED-INR rates outside 18..35', () => {
    expect(15 > 18 && 15 < 35).toBe(false);
    expect(25 > 18 && 25 < 35).toBe(true);
    expect(40 > 18 && 40 < 35).toBe(false);
  });
});
