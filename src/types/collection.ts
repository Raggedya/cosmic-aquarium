export type CollectionType = 'label' | 'location' | 'genre' | 'curated' | 'daily' | 'era' | 'theme';

export type VerificationStatus = 'verified' | 'high_confidence' | 'probable' | 'unverified' | 'rejected';

export interface CanonicalArtist {
  id: string;
  name: string;
  canonicalName: string;
  bandcampArtistUrl: string;
  aquariumSlug: string;
  aquariumUrl: string;
  status: 'published' | 'disabled';
  location?: string | null;
}

export interface CollectionMember {
  artistId: string;
  artistName: string;
  aquariumSlug: string;
  aquariumUrl: string;
  bandcampArtistUrl?: string;
  verificationStatus: VerificationStatus;
  verificationScore?: number | null;
  source?: string | null;
  evidence?: string | null;
  displayEnabled: boolean;
  addedAt?: string;
}

export interface LocationMetadata {
  city?: string | null;
  region?: string | null;
  country: string;
  canonicalLocation: string;
  latitude?: number | null;
  longitude?: number | null;
  searchRadiusKm?: number | null;
  researchStatus?: 'pending' | 'researching' | 'review' | 'ready' | 'failed';
  lastResearchedAt?: string | null;
  aliases?: string[];
}

export interface ArtistCollection {
  schemaVersion: 1;
  id: string;
  slug: string;
  name: string;
  type: CollectionType;
  description?: string;
  status: 'draft' | 'published' | 'disabled';
  instruction: string;
  theme: string;
  createdAt: string;
  updatedAt: string;
  location?: LocationMetadata;
  members: CollectionMember[];
}
