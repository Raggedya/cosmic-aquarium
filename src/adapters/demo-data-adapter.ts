import { demoManifest } from '@/src/data/demo-manifest';
import type { DiscoveryDataAdapter, DiscoveryRelationship, Release } from '@/src/types/discovery';

export class DemoDataAdapter implements DiscoveryDataAdapter {
  async getEntry(): Promise<Release> { return demoManifest.releases[0]; }
  async getRelease(id: string): Promise<Release | null> { return demoManifest.releases.find((release) => release.id === id) ?? null; }
  async getThreads(id: string, visited: string[]): Promise<DiscoveryRelationship[]> {
    const outgoing = demoManifest.relationships.filter((relationship) => relationship.fromReleaseId === id);
    return [...outgoing].sort((left, right) => {
      const leftVisited = visited.includes(left.toReleaseId) ? 1 : 0;
      const rightVisited = visited.includes(right.toReleaseId) ? 1 : 0;
      return leftVisited - rightVisited || left.kind.localeCompare(right.kind);
    });
  }
}
