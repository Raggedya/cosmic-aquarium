import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const manifestsDirectory = path.resolve('github-pages', 'artists');
const approvedVisualStyles = new Set(['cosmic', 'violet']);

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
  assert.ok(template.indexOf('aquarium-action--share') < template.indexOf('aquarium-action--buy'));
  assert.ok(template.indexOf('aquarium-action--buy') < template.indexOf('aquarium-action--explore'));
  assert.match(runtime, /navigator\.share/);
  assert.match(runtime, /aquariums\.json/);
  assert.match(runtime, /show-buy-action/);
  assert.match(runtime, /show-secondary-actions/);
  assert.match(runtime, /4000/);
  assert.doesNotMatch(styles, /purchase-invitation-pulse/);
  assert.doesNotMatch(styles, /\.aquarium-action--buy\s*\{[^}]*width:/);
});

test('starting Bandcamp playback hides the controls but keeps the song title', async () => {
  const runtime = await readFile(path.resolve('github-pages', 'assets', 'site.js'), 'utf8');
  const styles = await readFile(path.resolve('app', 'cosmic-aquarium.css'), 'utf8');
  const reactExperience = await readFile(path.resolve('src', 'features', 'cosmic-aquarium', 'CosmicAquarium.tsx'), 'utf8');
  assert.match(runtime, /bandcampFrame\.addEventListener\('focus',markPlaybackStarted\)/);
  assert.match(runtime, /player\.classList\.add\('is-playing'\)/);
  assert.match(reactExperience, /playbackStarted \? ' is-playing' : ''/);
  assert.match(reactExperience, /onFocus=\{\(\) => \{/);
  assert.match(styles, /\.living-player\.is-playing \.bandcamp-stream/);
  assert.match(styles, /\.living-player\.is-playing \.player-membrane \{ animation: player-flower-drift-away 18s linear 4s forwards; \}/);
  assert.doesNotMatch(styles, /\.living-player\.is-active \.player-copy,\s/);
  assert.match(styles, /\.player-copy h2/);
});

test('the Library catalogue reports its living flowers and available songs', async () => {
  const catalogue = JSON.parse(await readFile(path.resolve('github-pages', 'aquariums.json'), 'utf8'));
  for (const entry of catalogue.aquariums ?? []) {
    assert.equal(entry.flowerCount, 14, entry.slug);
    assert.equal(entry.flowerCountMin, 10, entry.slug);
    assert.equal(entry.flowerCountMax, 14, entry.slug);
    assert.ok(Number.isInteger(entry.trackCount) && entry.trackCount >= 3, entry.slug);
    const manifest = JSON.parse(await readFile(path.join(manifestsDirectory, entry.slug + '.json'), 'utf8'));
    assert.equal(entry.trackCount, manifest.tracks.length, entry.slug);
    assert.equal(entry.releaseDate, manifest.releaseDate, entry.slug);
    assert.match(entry.releaseDate, /^20\d{2}-\d{2}-\d{2}/, entry.slug);
  }
});

test('generated aquariums can initialise their page-level Buy Music action', async () => {
  const script = await readFile(path.resolve('github-pages', 'assets', 'site.js'), 'utf8');
  assert.match(script, /document\.querySelector\('\.aquarium-action--buy'\)/);
  assert.doesNotMatch(script, /root\.querySelector\('\.aquarium-action--buy'\)/);
});

test('anonymous activity is prepared for the 7pm Sydney daily report', async () => {
  const runtime = await readFile(path.resolve('github-pages', 'assets', 'site.js'), 'utf8');
  const reactExperience = await readFile(path.resolve('src', 'features', 'cosmic-aquarium', 'CosmicAquarium.tsx'), 'utf8');
  const worker = await readFile(path.resolve('services', 'cosmic-worker', 'src', 'index.js'), 'utf8');
  const workerConfig = await readFile(path.resolve('services', 'cosmic-worker', 'wrangler.template.jsonc'), 'utf8');
  const schema = await readFile(path.resolve('services', 'cosmic-worker', 'migrations', '0001_initial.sql'), 'utf8');
  for (const source of [runtime, reactExperience]) {
    for (const event of ['aquarium_open', 'object_touch', 'track_selected', 'release_click', 'bandcamp_click', 'share_native_opened', 'share_copy', 'buy_click', 'explore_click']) {
      assert.match(source, new RegExp(`recordEvent\\('${event}'`), event);
    }
  }
  assert.match(worker, /REPORT_TIME_ZONE = 'Australia\/Sydney'/);
  assert.match(worker, /local\.hour !== 19/);
  assert.match(worker, /activity_report_delivery/);
  assert.match(worker, /Native share menus opened/);
  assert.match(worker, /Every Aquarium/);
  assert.match(workerConfig, /0,15,30,45 \* \* \* \*/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS activity_report_delivery/);
});

test('only Cosmic Bloom and Violet Haze can be assigned', async () => {
  const batch = JSON.parse(await readFile(path.resolve('automation', 'batches', '2026-09-01.json'), 'utf8'));
  for (const [index, entry] of (batch.aquariums ?? []).entries()) {
    const expected = index % 2 === 0 ? 'cosmic' : 'violet';
    assert.equal(entry.visualStyle, expected, entry.id);
    assert.ok(approvedVisualStyles.has(entry.visualStyle), entry.id);
    const manifest = JSON.parse(await readFile(path.join(manifestsDirectory, entry.id + '.json'), 'utf8'));
    assert.equal(manifest.visualStyle, expected, entry.id);
  }

  const creator = await readFile(path.resolve('scripts', 'create_artist.py'), 'utf8');
  const workflow = await readFile(path.resolve('.github', 'workflows', 'create-artist.yml'), 'utf8');
  assert.match(creator, /AUTOMATED_VISUAL_STYLES = \("cosmic", "violet"\)/);
  assert.match(creator, /CUSTOM_VISUAL_STYLES = \(\*AUTOMATED_VISUAL_STYLES, "chrome", "glass"\)/);
  assert.match(workflow, /^\s*- chrome$/m);
  assert.match(workflow, /^\s*- glass$/m);
  for (const retired of ['crimson', 'paper', 'thorn', 'neon', 'desert']) {
    assert.doesNotMatch(workflow, new RegExp('^\\s*- ' + retired + '$', 'm'));
  }
});

test('only artists with at least three verified Bandcamp songs are eligible', async () => {
  const creator = await readFile(path.resolve('scripts', 'create_artist.py'), 'utf8');
  assert.match(creator, /MINIMUM_TRACK_COUNT = 3/);
  assert.match(creator, /if len\(tracks\) < MINIMUM_TRACK_COUNT:/);
  assert.match(creator, /requires at least \{MINIMUM_TRACK_COUNT\} publicly available Bandcamp songs/);
  assert.doesNotMatch(creator, /Track metadata unavailable; no catalogue data was fabricated/);
});
