import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const required = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'D1_DATABASE_ID'];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required.`);
}

const directory = path.dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = path.resolve(directory, '..', 'migrations');
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${process.env.D1_DATABASE_ID}/query`;
const headers = {
  authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
  'content-type': 'application/json',
};

async function query(sql) {
  const response = await fetch(endpoint, {method: 'POST', headers, body: JSON.stringify({sql})});
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success !== true) {
    throw new Error(`D1 schema statement failed: ${sql}\n${JSON.stringify(payload.errors || payload)}`);
  }
  return payload.result?.[0]?.results || [];
}

const columnCache = new Map();
async function columns(table) {
  if (!columnCache.has(table)) {
    const rows = await query(`PRAGMA table_info(${table})`);
    columnCache.set(table, new Set(rows.map(row => String(row.name))));
  }
  return columnCache.get(table);
}

const files = (await fs.readdir(migrationsDirectory)).filter(name => /^\d+.*\.sql$/i.test(name)).sort();
let applied = 0;
let skipped = 0;

for (const filename of files) {
  const source = await fs.readFile(path.join(migrationsDirectory, filename), 'utf8');
  const statements = source
    .split(/\r?\n/)
    .filter(line => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map(value => value.trim())
    .filter(Boolean);

  for (const statement of statements) {
    if (/^PRAGMA\s+/i.test(statement)) {
      skipped += 1;
      continue;
    }
    const alteration = statement.match(/^ALTER\s+TABLE\s+([A-Za-z_][\w]*)\s+ADD\s+COLUMN\s+([A-Za-z_][\w]*)\b/i);
    if (alteration) {
      const [, table, column] = alteration;
      const existing = await columns(table);
      if (existing.has(column)) {
        skipped += 1;
        continue;
      }
      await query(statement);
      existing.add(column);
      applied += 1;
      continue;
    }
    await query(statement);
    applied += 1;
  }
}

console.log(`D1 schema ready: ${applied} statement(s) applied, ${skipped} already satisfied or not required.`);
