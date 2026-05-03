import { describe, it, expect } from 'vitest';
import { buildAlertMessage } from '../../src/alerts/messageBuilder.js';

describe('buildAlertMessage', () => {
  const mid = 83.0;
  const captured = new Date('2026-04-30T12:00:00Z');
  const baseInput = {
    pair: { from: 'USD', to: 'INR' },
    midRate: mid,
    midSourcesUsed: ['wiseMidMarket', 'xe', 'exchangerateHost'],
    triggerLabel: 'mid_market > 82.5',
    baseUrl: 'https://fx.example.com',
    capturedAt: captured,
  };

  it('includes only providers within 1% of mid by default', () => {
    const text = buildAlertMessage({
      ...baseInput,
      providers: [
        { providerId: 'wise', effectiveRate: 82.7, sendAmount: 1000, receiveAmount: 82700, feeAmount: 5 },
        { providerId: 'remitly', effectiveRate: 82.4, sendAmount: 1000, receiveAmount: 82400, feeAmount: 0 },
        { providerId: 'badGuy', effectiveRate: 80.5, sendAmount: 1000, receiveAmount: 80500, feeAmount: 0 },
      ],
    });
    expect(text).toContain('wise');
    expect(text).toContain('remitly');
    expect(text).not.toContain('badGuy');
  });

  it('falls back to "no providers within X%" when none qualify', () => {
    const text = buildAlertMessage({
      ...baseInput,
      providers: [
        { providerId: 'badGuy', effectiveRate: 78.0, sendAmount: 1000, receiveAmount: 78000, feeAmount: 0 },
      ],
    });
    expect(text).toContain('No providers within');
  });

  it('sorts within-band providers best-first', () => {
    const text = buildAlertMessage({
      ...baseInput,
      providers: [
        { providerId: 'okay', effectiveRate: 82.55, sendAmount: 1000, receiveAmount: 82550, feeAmount: 0 },
        { providerId: 'best', effectiveRate: 82.95, sendAmount: 1000, receiveAmount: 82950, feeAmount: 0 },
      ],
    });
    expect(text.indexOf('best')).toBeLessThan(text.indexOf('okay'));
  });

  it('escapes HTML in displayName', () => {
    const text = buildAlertMessage({
      ...baseInput,
      providers: [
        {
          providerId: 'evil',
          displayName: '<script>alert(1)</script>',
          effectiveRate: 82.7,
          sendAmount: 1000,
          receiveAmount: 82700,
          feeAmount: 0,
        },
      ],
    });
    expect(text).not.toContain('<script>');
    expect(text).toContain('&lt;script&gt;');
  });

  it('omits send/receive/fee details', () => {
    const text = buildAlertMessage({
      ...baseInput,
      providers: [
        { providerId: 'wise', effectiveRate: 82.7, sendAmount: 1000, receiveAmount: 82700, feeAmount: 5 },
      ],
    });
    // Vendor + rate must appear; per-provider amounts must not.
    expect(text).toContain('wise');
    expect(text).toContain('82.7000');
    expect(text).not.toMatch(/send/i);
    expect(text).not.toMatch(/recv|receive/i);
    expect(text).not.toMatch(/fee/i);
    expect(text).not.toContain('1,000');
    expect(text).not.toContain('82,700');
  });
});
