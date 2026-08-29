import test from 'node:test';
import assert from 'node:assert/strict';
import { selectThreadSet } from '../src/discovery/engine.ts';
import type { DiscoveryRelationship } from '../src/types/discovery.ts';

const relationships: DiscoveryRelationship[] = [
  { id: 'p1', fromReleaseId: 'a', toReleaseId: 'b', kind: 'person', label: 'person', explanation: 'x', assertedBy: 'test', confidence: 'asserted' },
  { id: 'l1', fromReleaseId: 'a', toReleaseId: 'c', kind: 'place', label: 'place', explanation: 'x', assertedBy: 'test', confidence: 'asserted' },
  { id: 'i1', fromReleaseId: 'a', toReleaseId: 'd', kind: 'idea', label: 'idea', explanation: 'x', assertedBy: 'test', confidence: 'asserted' },
  { id: 'i2', fromReleaseId: 'a', toReleaseId: 'e', kind: 'idea', label: 'extra idea', explanation: 'x', assertedBy: 'test', confidence: 'asserted' },
];

test('selectThreadSet returns one thread per P0 kind in stable order', () => {
  assert.deepEqual(selectThreadSet(relationships).map((item) => item.id), ['l1', 'p1', 'i1']);
});

test('selectThreadSet does not fabricate missing kinds', () => {
  assert.deepEqual(selectThreadSet(relationships.filter((item) => item.kind === 'person')).map((item) => item.id), ['p1']);
});
