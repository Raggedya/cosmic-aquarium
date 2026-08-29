import type { DiscoveryRelationship, RelationshipKind } from '@/src/types/discovery';

const kinds: RelationshipKind[] = ['place', 'person', 'idea'];

export function selectThreadSet(relationships: DiscoveryRelationship[]): DiscoveryRelationship[] {
  return kinds.flatMap((kind) => relationships.find((relationship) => relationship.kind === kind) ?? []);
}
