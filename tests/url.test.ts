import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBandcampUrl } from '../src/adapters/bandcamp-link-adapter.ts';

test('accepts Bandcamp and artist subdomain HTTPS links', () => {
  assert.equal(validateBandcampUrl('https://bandcamp.com/')?.hostname, 'bandcamp.com');
  assert.equal(validateBandcampUrl('https://artist.bandcamp.com/album/example')?.hostname, 'artist.bandcamp.com');
});

test('rejects lookalikes, credentials, non-HTTPS and malformed values', () => {
  const values = ['https://bandcamp.com.example.org/', 'https://bandcamp.com@evil.example/', 'http://bandcamp.com/', 'not a url'];
  for (const value of values) assert.equal(validateBandcampUrl(value), null);
});
