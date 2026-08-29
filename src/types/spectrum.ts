export interface SpectrumRelease {
  id: string;
  title: string;
  artist: string;
  albumTitle: string;
  albumKey: string;
  year: number;
  trackNumber: number;
  duration: string;
  x: number;
  y: number;
  zone: string;
  note: string;
  bandcampUrl: string;
  /** Track ID published by Bandcamp for its official embedded player. */
  bandcampEmbedTrackId: string;
  sourcePage: string;
}
