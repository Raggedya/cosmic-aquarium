import test from 'node:test';
import assert from 'node:assert/strict';
import { immigrantUnionAlbums } from '../src/data/immigrant-union-catalogue.ts';
import { readSpectrum } from '../src/discovery/spectrum-semantics.ts';

test('the black centre explicitly means any song from any era', () => {
  const reading = readSpectrum(.5, .5);
  assert.equal(reading.label, 'ANY SONG');
  assert.equal(reading.depthLabel, 'catalogue wildcard');
  assert.equal(reading.certainty, 0);
});

test('each album anchor resolves to its factual album era', () => {
  for (const album of immigrantUnionAlbums) {
    const reading = readSpectrum(album.x, album.y);
    assert.equal(reading.primary, album.name);
    assert.equal(reading.secondary, null);
    assert.equal(reading.depthLabel, 'album current');
  }
});

test('the space between two album anchors is described as between eras', () => {
  const reading = readSpectrum(.5, .275);
  assert.match(reading.label, /The Winter EP/);
  assert.match(reading.label, /Immigrant Union/);
  assert.equal(reading.depthLabel, 'between eras');
});
