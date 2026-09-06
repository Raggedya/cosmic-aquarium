import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const worker = fs.readFileSync(path.join(root, 'services', 'cosmic-worker', 'src', 'index.js'), 'utf8');
const desktop = fs.readFileSync(path.join(root, 'desktop', 'cosmic_aquarium_studio.py'), 'utf8');

test('catalogue reconciliation avoids oversized SQL and writes in bounded batches', () => {
  assert.match(worker, /async function runStatementBatches\(env, statements, size = 75\)/);
  assert.doesNotMatch(worker, /DELETE FROM aquarium WHERE id NOT IN/);
  assert.match(worker, /prior\.updated_at === updatedAt/);
  assert.match(worker, /await runStatementBatches\(env,statements\)/);
});

test('Melbourne migration archives global Worker rows instead of deleting them', () => {
  const sync=fs.readFileSync(path.join(root,'scripts','sync-worker.mjs'),'utf8');
  assert.match(sync,/archiveMissing:process\.env\.ARCHIVE_MISSING==='true'/);
  assert.match(worker,/body\?\.archiveMissing === true/);
  assert.match(worker,/UPDATE aquarium SET status='disabled'/);
  assert.match(worker,/UPDATE artist SET status='disabled'/);
});

test('a reporting sync outage does not turn a published Aquarium into a creation failure', () => {
  assert.match(desktop, /library_current = self\._watch_run/);
  assert.match(desktop, /except \(OSError, subprocess\.SubprocessError, RuntimeError\):/);
  assert.match(desktop, /self\._finish_success\(url, library_current\)/);
});
