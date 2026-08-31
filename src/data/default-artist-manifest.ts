import { immigrantUnionAlbums, immigrantUnionSongs } from '@/src/data/immigrant-union-catalogue';
import type { ArtistManifest } from '@/src/types/artist-manifest';

export const defaultArtistManifest: ArtistManifest = {
  schemaVersion: 1,
  slug: 'immigrant-union',
  artist: 'Immigrant Union',
  bandcampUrl: 'https://immigrantunionmusic.bandcamp.com/',
  albums: immigrantUnionAlbums.map(({ key, color }) => ({ key, color })),
  tracks: immigrantUnionSongs,
};
