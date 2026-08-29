export interface SpectrumRelease {
  id: string;
  title: string;
  artist: string;
  year: number;
  x: number;
  y: number;
  zone: string;
  note: string;
  bandcampUrl: string;
  /** Album ID published by Bandcamp for its official embedded player. */
  bandcampEmbedAlbumId?: string;
}
