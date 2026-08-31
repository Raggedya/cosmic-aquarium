import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTrackDeck, shuffleTrackIds } from '../src/features/cosmic-aquarium/track-shuffle.ts';

test('a shuffled deck contains every track exactly once', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const deck = shuffleTrackIds(ids, () => 0.37);
  assert.equal(deck.length, ids.length);
  assert.deepEqual([...deck].sort(), ids);
});

test('unheard tracks are dealt before recently heard tracks', () => {
  const deck = buildTrackDeck(['a', 'b', 'c', 'd'], ['b', 'd'], () => 0.42);
  assert.deepEqual(new Set(deck.slice(0, 2)), new Set(['a', 'c']));
  assert.deepEqual(new Set(deck.slice(2)), new Set(['b', 'd']));
});

test('a new cycle avoids an immediate repeat when alternatives exist', () => {
  const deck = buildTrackDeck(['a', 'b', 'c'], ['a', 'b', 'c'], () => 0);
  assert.notEqual(deck[0], 'a');
  assert.deepEqual([...deck].sort(), ['a', 'b', 'c']);
});
