import test from 'node:test';
import assert from 'node:assert/strict';
import { immigrantUnionAlbums, immigrantUnionSongs } from '../src/data/immigrant-union-catalogue.ts';
import { nearestSpectrumRelease } from '../src/discovery/spectrum.ts';

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

test('all songs form one broadly scattered field instead of four album clusters', () => {
  const positions = new Set(immigrantUnionSongs.map((song) => song.x.toFixed(6) + ':' + song.y.toFixed(6)));
  assert.equal(positions.size, 40);
  for (const song of immigrantUnionSongs) {
    assert.ok(song.x >= .075 && song.x <= .925);
    assert.ok(song.y >= .075 && song.y <= .925);
  }
  for (const album of immigrantUnionAlbums) {
    const albumSongs = immigrantUnionSongs.filter((song) => song.albumKey === album.key);
    const xRange = Math.max(...albumSongs.map((song) => song.x)) - Math.min(...albumSongs.map((song) => song.x));
    const yRange = Math.max(...albumSongs.map((song) => song.y)) - Math.min(...albumSongs.map((song) => song.y));
    assert.ok(xRange > .3, album.name + ' should cross the field horizontally');
    assert.ok(yRange > .3, album.name + ' should cross the field vertically');
  }
});

test('a touch nearest a song point returns that exact song', () => {
  const song = immigrantUnionSongs.find((candidate) => candidate.id === 'anyway-5');
  assert.ok(song);
  assert.equal(nearestSpectrumRelease(immigrantUnionSongs, song.x, song.y).id, 'anyway-5');
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
