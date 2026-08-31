import type { SpectrumRelease } from '@/src/types/spectrum';

export interface ArtistAlbumAccent {
  key: string;
  color: string;
}

export interface ArtistManifest {
  schemaVersion: 1;
  slug: string;
  artist: string;
  bandcampUrl: string;
  generatedAt?: string;
  albums: ArtistAlbumAccent[];
  tracks: SpectrumRelease[];
}
