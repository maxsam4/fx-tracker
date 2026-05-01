/**
 * safeNextPath defends the login redirect against open-redirect abuse. We
 * unit-test it in isolation since iron-session/cookies need not be touched.
 */
import { describe, it, expect, beforeAll } from 'vitest';

// Load the function only after stubbing the env so resolveSessionSecret() inside
// auth.ts doesn't throw on import.
beforeAll(() => {
  // process.env is typed as readonly NODE_ENV in @types/node; cast to bypass.
  (process.env as Record<string, string>).NODE_ENV = 'test';
  process.env.SESSION_SECRET = 'x'.repeat(40);
});

import { safeNextPath } from '../lib/auth.js';

describe('safeNextPath', () => {
  it('accepts a normal absolute path', () => {
    expect(safeNextPath('/alerts/new')).toBe('/alerts/new');
  });

  it('falls back to /alerts on empty', () => {
    expect(safeNextPath(undefined)).toBe('/alerts');
    expect(safeNextPath('')).toBe('/alerts');
    expect(safeNextPath(null)).toBe('/alerts');
  });

  it('rejects protocol-relative URLs', () => {
    expect(safeNextPath('//evil.com')).toBe('/alerts');
    expect(safeNextPath('//attacker.example/x')).toBe('/alerts');
  });

  it('rejects absolute http(s) URLs', () => {
    expect(safeNextPath('http://evil.com')).toBe('/alerts');
    expect(safeNextPath('https://evil.com/foo')).toBe('/alerts');
    expect(safeNextPath('javascript:alert(1)')).toBe('/alerts');
    expect(safeNextPath('data:text/html,foo')).toBe('/alerts');
  });

  it('rejects relative paths', () => {
    expect(safeNextPath('foo')).toBe('/alerts');
    expect(safeNextPath('./foo')).toBe('/alerts');
    expect(safeNextPath('../foo')).toBe('/alerts');
  });

  it('rejects non-strings', () => {
    expect(safeNextPath(123 as unknown as string)).toBe('/alerts');
    expect(safeNextPath({ a: 1 } as unknown as string)).toBe('/alerts');
    expect(safeNextPath([] as unknown as string)).toBe('/alerts');
  });
});
