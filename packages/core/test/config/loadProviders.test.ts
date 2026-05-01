import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadProvidersConfig, parsePairKey } from '../../src/config/index.js';

function withTempYaml(content: string, fn: (filePath: string) => void) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fx-tracker-'));
  const file = path.join(tmp, 'providers.yml');
  fs.writeFileSync(file, content);
  try {
    fn(file);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

describe('loadProvidersConfig', () => {
  it('parses a minimal valid config', () => {
    withTempYaml(
      `
pairs:
  USD-INR:
    referenceAmounts: [200, 1000]
    providers: [wise, remitly]
midMarket:
  sources: [wiseMidMarket]
preferredSource:
  lulu: masarif
`,
      (f) => {
        const cfg = loadProvidersConfig(f);
        expect(Object.keys(cfg.pairs)).toEqual(['USD-INR']);
        expect(cfg.pairs['USD-INR']?.referenceAmounts).toEqual([200, 1000]);
        expect(cfg.midMarket.outlierTolerancePct).toBe(2.0); // default
        expect(cfg.preferredSource.lulu).toBe('masarif');
      },
    );
  });

  it('rejects empty referenceAmounts', () => {
    withTempYaml(
      `
pairs:
  USD-INR:
    referenceAmounts: []
    providers: []
midMarket:
  sources: [wiseMidMarket]
`,
      (f) => {
        expect(() => loadProvidersConfig(f)).toThrow();
      },
    );
  });

  it('rejects negative reference amounts', () => {
    withTempYaml(
      `
pairs:
  USD-INR:
    referenceAmounts: [-100]
    providers: []
midMarket:
  sources: [wiseMidMarket]
`,
      (f) => {
        expect(() => loadProvidersConfig(f)).toThrow();
      },
    );
  });

  it('rejects empty midMarket.sources', () => {
    withTempYaml(
      `
pairs:
  USD-INR:
    referenceAmounts: [100]
    providers: []
midMarket:
  sources: []
`,
      (f) => {
        expect(() => loadProvidersConfig(f)).toThrow();
      },
    );
  });

  it('defaults referenceSources/referenceOnly/preferredSource to empty', () => {
    withTempYaml(
      `
pairs:
  USD-INR:
    referenceAmounts: [100]
    providers: []
midMarket:
  sources: [wiseMidMarket]
`,
      (f) => {
        const cfg = loadProvidersConfig(f);
        expect(cfg.pairs['USD-INR']?.referenceSources).toEqual([]);
        expect(cfg.midMarket.referenceOnly).toEqual([]);
        expect(cfg.preferredSource).toEqual({});
      },
    );
  });

  it('includes the shipped config file (smoke test)', () => {
    const cfg = loadProvidersConfig();
    expect(cfg.pairs['USD-INR']).toBeDefined();
    expect(cfg.pairs['AED-INR']).toBeDefined();
    expect(cfg.midMarket.sources.length).toBeGreaterThan(0);
  });
});

describe('parsePairKey', () => {
  it('parses well-formed key', () => {
    expect(parsePairKey('USD-INR')).toEqual({ from: 'USD', to: 'INR' });
  });

  it('throws on invalid key', () => {
    expect(() => parsePairKey('USD')).toThrow();
    expect(() => parsePairKey('-INR')).toThrow();
    expect(() => parsePairKey('USD-')).toThrow();
  });
});
