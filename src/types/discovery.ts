export type RelationshipKind = 'place' | 'person' | 'idea';
export type DataStatus = 'demo' | 'supplied' | 'licensed';

export interface Release {
  id: string;
  title: string;
  artistName: string;
  year: number;
  location: string;
  tags: string[];
  accent: string;
  glyph: string;
  bandcampUrl: string;
  dataStatus: DataStatus;
}

export interface DiscoveryRelationship {
  id: string;
  fromReleaseId: string;
  toReleaseId: string;
  kind: RelationshipKind;
  label: string;
  explanation: string;
  assertedBy: string;
  sourceUrl?: string;
  confidence: 'asserted' | 'sourced';
}

export interface TrailManifest {
  id: string;
  title: string;
  curator: string;
  releases: Release[];
  relationships: DiscoveryRelationship[];
}

export interface DiscoveryDataAdapter {
  getEntry(): Promise<Release>;
  getRelease(id: string): Promise<Release | null>;
  getThreads(id: string, visited: string[]): Promise<DiscoveryRelationship[]>;
}

export interface TrailStep {
  releaseId: string;
  relationshipId?: string;
  kind?: RelationshipKind;
}
