import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIX_ROOT = path.join(__dirname, '..', 'fixtures');

export function readFixtureText(rel: string): string {
  return fs.readFileSync(path.join(FIX_ROOT, rel), 'utf8');
}

export function readFixtureJson<T = unknown>(rel: string): T {
  return JSON.parse(readFixtureText(rel)) as T;
}
