import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _sql: ReturnType<typeof postgres> | null = null;

export const getDb = () => {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  _sql = postgres(url, { max: 10, prepare: false });
  _db = drizzle(_sql, { schema });
  return _db;
};

export const closeDb = async () => {
  if (_sql) {
    await _sql.end({ timeout: 5 });
    _sql = null;
    _db = null;
  }
};

export type DB = ReturnType<typeof getDb>;
