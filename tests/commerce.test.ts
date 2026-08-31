import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const manifestsDirectory = path.resolve('github-pages', 'artists');

test('every edition makes an explicit, safe commerce decision', async () => {
  const filenames = (await readdir(manifestsDirectory)).filter((name) => name.endsWith('.json'));
  assert.ok(filenames.length > 0);

  for (const filename of filenames) {
    const manifest = JSON.parse(await readFile(path.join(manifestsDirectory, filename), 'utf8'));
    assert.equal(typeof manifest.commerceAvailable, 'boolean', filename);

    if (!manifest.commerceAvailable) {
      assert.equal(manifest.commerceUrl, null, filename);
      continue;
    }

    const destination = new URL(manifest.commerceUrl);
    assert.equal(destination.protocol, 'https:', filename);
    assert.ok(destination.hostname.endsWith('.bandcamp.com'), filename);
    assert.equal(destination.pathname, '/', filename);
  }
});

test('the purchase invitation is delayed from the first discovery and pulses every ten seconds', async () => {
  const runtime = await readFile(path.resolve('github-pages', 'assets', 'site.js'), 'utf8');
  const styles = await readFile(path.resolve('github-pages', 'assets', 'site.css'), 'utf8');
  assert.match(runtime, /schedulePurchaseInvitation\(\)/);
  assert.match(runtime, /},25000\)/);
  assert.match(styles, /purchase-invitation-pulse 10s/);
});
