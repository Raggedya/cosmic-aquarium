import test from 'node:test';
import assert from 'node:assert/strict';
import { spectrumReleases } from '../src/data/spectrum-releases.ts';
import { readSpectrum } from '../src/discovery/spectrum-semantics.ts';

test('the black centre is explicitly unmapped rather than a hidden genre', () => {
  const reading = readSpectrum(.5, .5);
  assert.equal(reading.label, 'THE UNKNOWN');
  assert.equal(reading.depthLabel, 'unmapped core');
  assert.equal(reading.certainty, 0);
});

test('the interior expresses a meaningful blend between nearby genre anchors', () => {
  const reading = readSpectrum(.5, .19);
  assert.match(reading.label, /synth/);
  assert.match(reading.label, /punk/);
  assert.equal(reading.depthLabel, 'hybrid signal');
});

test('the outer field resolves toward a clearer genre signal', () => {
  const reading = readSpectrum(.98, .2);
  assert.equal(reading.primary, 'punk');
  assert.equal(reading.secondary, null);
  assert.equal(reading.depthLabel, 'clear signal');
});

test('one verified release exposes only Bandcamp’s official embedded-player album ID', () => {
  const listenable = spectrumReleases.filter((release) => release.bandcampEmbedAlbumId);
  assert.equal(listenable.length, 1);
  assert.equal(listenable[0].id, 'universal-beings');
  assert.equal(listenable[0].bandcampEmbedAlbumId, '1059062676');
});
