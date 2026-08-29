import test from 'node:test';
import assert from 'node:assert/strict';
import { demoManifest } from '../src/data/demo-manifest.ts';

test('demo graph has no fabricated runtime targets or unlabeled demo records', () => {
  const releaseIds = new Set(demoManifest.releases.map((release) => release.id));
  assert.equal(releaseIds.size, demoManifest.releases.length);
  for (const release of demoManifest.releases) {
    assert.equal(release.dataStatus, 'demo');
    assert.equal(new URL(release.bandcampUrl).hostname, 'bandcamp.com');
  }
  for (const relationship of demoManifest.relationships) {
    assert.ok(releaseIds.has(relationship.fromReleaseId));
    assert.ok(releaseIds.has(relationship.toReleaseId));
    assert.ok(relationship.explanation.length > 24);
    assert.equal(relationship.confidence, 'asserted');
  }
});

test('every demo release offers place, person and idea threads', () => {
  for (const release of demoManifest.releases) {
    const kinds = new Set(demoManifest.relationships.filter((relationship) => relationship.fromReleaseId === release.id).map((relationship) => relationship.kind));
    assert.deepEqual([...kinds].sort(), ['idea', 'person', 'place']);
  }
});
