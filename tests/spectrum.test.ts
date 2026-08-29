import test from 'node:test';
import assert from 'node:assert/strict';
import { spectrumReleases } from '../src/data/spectrum-releases.ts';
import { isUnknownZone, nearestSpectrumRelease, surpriseSpectrumRelease } from '../src/discovery/spectrum.ts';

test('the black centre is the unknown and the outer field is not', () => {
  assert.equal(isUnknownZone(.5, .5), true);
  assert.equal(isUnknownZone(.8, .2), false);
});

test('a touch nearest the synth-punk point finds Endure', () => {
  assert.equal(nearestSpectrumRelease(spectrumReleases, .57, .21).id, 'endure');
});

test('surprise selection is deterministic for a supplied seed', () => {
  assert.equal(surpriseSpectrumRelease(spectrumReleases, 3), spectrumReleases[3]);
});

test('every MVP destination is an exact HTTPS Bandcamp album page', () => {
  for (const release of spectrumReleases) {
    const url = new URL(release.bandcampUrl);
    assert.equal(url.protocol, 'https:');
    assert.ok(url.hostname === 'bandcamp.com' || url.hostname.endsWith('.bandcamp.com'));
    assert.ok(url.pathname.startsWith('/album/'));
  }
});
