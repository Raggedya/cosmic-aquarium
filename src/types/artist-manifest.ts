import type { SpectrumRelease } from '@/src/types/spectrum';

export interface ArtistAlbumAccent {
  key: string;
  color: string;
}

export type VisualStyle = 'cosmic' | 'violet';

export interface ArtistManifest {
  schemaVersion: 1;
  slug: string;
  artist: string;
  bandcampUrl: string;
  commerceAvailable?: boolean;
  commerceUrl?: string | null;
  releaseTitle?: string;
  dailyBatchId?: string | null;
  status?: 'published' | 'disabled';
  visualStyle?: VisualStyle;
  generatedAt?: string;
  albums: ArtistAlbumAccent[];
  tracks: SpectrumRelease[];
}
