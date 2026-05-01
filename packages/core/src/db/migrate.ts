import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const sql = postgres(url, { max: 1, prepare: false });
  const db = drizzle(sql);
  await migrate(db, { migrationsFolder: path.join(__dirname, 'migrations') });
  await sql.end({ timeout: 5 });
  console.log('migrations applied');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
