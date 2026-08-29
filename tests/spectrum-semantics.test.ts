import test from 'node:test';
import assert from 'node:assert/strict';
import { immigrantUnionSongs } from '../src/data/immigrant-union-catalogue.ts';
import { illuminatedSpectrumRelease, illuminationRadius } from '../src/discovery/spectrum.ts';

test('a finger directly over a song illuminates that exact star', () => {
  const song = immigrantUnionSongs[13];
  assert.equal(illuminatedSpectrumRelease(immigrantUnionSongs, song.x, song.y)?.id, song.id);
});

test('a song remains dark when the finger is beyond its illumination radius', () => {
  const song = immigrantUnionSongs[0];
  assert.equal(
    illuminatedSpectrumRelease([song], song.x + illuminationRadius * 1.01, song.y),
    null,
  );
});

test('the glow begins just inside the illumination radius', () => {
  const song = immigrantUnionSongs[0];
  assert.equal(
    illuminatedSpectrumRelease([song], song.x + illuminationRadius * .99, song.y)?.id,
    song.id,
  );
});
