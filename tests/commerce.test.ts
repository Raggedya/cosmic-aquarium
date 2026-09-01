import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const manifestsDirectory = path.resolve('github-pages', 'artists');

test('every edition makes an explicit, safe commerce decision', async () => {
  const filenames = (await readdir(manifestsDirectory)).filter((name) => name.endsWith('.json'));

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

test('the three intentional listener actions use the requested staged reveal', async () => {
  const runtime = await readFile(path.resolve('github-pages', 'assets', 'site.js'), 'utf8');
  const styles = await readFile(path.resolve('github-pages', 'assets', 'site.css'), 'utf8');
  const template = await readFile(path.resolve('templates', 'artist-index.html'), 'utf8');
  assert.match(template, /SHARE<br>AQUARIUM/);
  assert.match(template, /BUY MUSIC/);
  assert.match(template, /EXPLORE<br>ANOTHER<br>AQUARIUM/);
  assert.match(runtime, /navigator\.share/);
  assert.match(runtime, /aquariums\.json/);
  assert.match(runtime, /show-buy-action/);
  assert.match(runtime, /show-secondary-actions/);
  assert.match(runtime, /4000/);
  assert.doesNotMatch(styles, /purchase-invitation-pulse/);
});
