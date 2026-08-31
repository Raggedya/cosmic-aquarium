import type { SpectrumRelease } from '@/src/types/spectrum';

export interface ArtistAlbumAccent {
  key: string;
  color: string;
}

export type VisualStyle = 'cosmic' | 'crimson' | 'paper' | 'thorn' | 'violet' | 'neon' | 'desert';

export interface ArtistManifest {
  schemaVersion: 1;
  slug: string;
  artist: string;
  bandcampUrl: string;
  commerceAvailable?: boolean;
  commerceUrl?: string | null;
  visualStyle?: VisualStyle;
  generatedAt?: string;
  albums: ArtistAlbumAccent[];
  tracks: SpectrumRelease[];
}
