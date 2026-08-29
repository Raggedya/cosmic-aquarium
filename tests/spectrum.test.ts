import test from 'node:test';
import assert from 'node:assert/strict';
import { immigrantUnionAlbums, immigrantUnionSongs } from '../src/data/immigrant-union-catalogue.ts';
import { isUnknownZone, nearestSpectrumRelease, surpriseSpectrumRelease } from '../src/discovery/spectrum.ts';

test('the black centre is a catalogue wildcard and the album currents are outside it', () => {
  assert.equal(isUnknownZone(.5, .5), true);
  for (const album of immigrantUnionAlbums) assert.equal(isUnknownZone(album.x, album.y), false);
});

test('the catalogue contains all forty public Bandcamp song entries', () => {
  assert.equal(immigrantUnionSongs.length, 40);
  assert.deepEqual(
    Object.fromEntries(immigrantUnionAlbums.map((album) => [
      album.key,
      immigrantUnionSongs.filter((song) => song.albumKey === album.key).length,
    ])),
    { 'winter-ep': 5, 'immigrant-union': 14, anyway: 10, judas: 11 },
  );
});

test('a touch nearest a song point returns that exact song', () => {
  const song = immigrantUnionSongs.find((candidate) => candidate.id === 'anyway-5');
  assert.ok(song);
  assert.equal(nearestSpectrumRelease(immigrantUnionSongs, song.x, song.y).id, 'anyway-5');
});

test('wildcard selection remains deterministic for a supplied seed', () => {
  assert.equal(surpriseSpectrumRelease(immigrantUnionSongs, 17), immigrantUnionSongs[17]);
});

test('every destination is an exact HTTPS Bandcamp track and every embed ID is numeric', () => {
  const embedIds = new Set<string>();
  for (const song of immigrantUnionSongs) {
    const url = new URL(song.bandcampUrl);
    assert.equal(url.protocol, 'https:');
    assert.ok(url.hostname === 'immigrantunionmusic.bandcamp.com' || url.hostname === 'cheersquadrecordstapes.bandcamp.com');
    assert.ok(url.pathname.startsWith('/track/'));
    assert.match(song.bandcampEmbedTrackId, /^\d+$/);
    embedIds.add(song.bandcampEmbedTrackId);
  }
  assert.equal(embedIds.size, 40);
});

test('every song retains its public album-page provenance', () => {
  const sources = new Set(immigrantUnionSongs.map((song) => song.sourcePage));
  assert.deepEqual(sources, new Set(immigrantUnionAlbums.map((album) => album.sourcePage)));
});
