import { validateBandcampUrl } from '@/src/adapters/bandcamp-link-adapter';

export interface AquariumTrack {
  id: string;
  title: string;
  artist: string;
  albumTitle: string;
  duration: string;
  bandcampUrl: string;
  bandcampEmbedTrackId?: string;
}

export interface TrackProvider {
  loadArtist(): Promise<string>;
  loadTracks(): Promise<AquariumTrack[]>;
}

export type PlayableBandcampSource = {
  kind: 'official-embed';
  src: string;
} | {
  kind: 'external-only';
  href: string;
};

/**
 * Boundary for artist-supplied track manifests and official Bandcamp embeds.
 * It intentionally performs no scraping and never invents a general catalogue API.
 */
export class BandcampAdapter {
  constructor(private readonly tracks: AquariumTrack[]) {}

  async loadArtist() {
    return this.tracks[0]?.artist ?? '';
  }

  async loadTracks() {
    return [...this.tracks];
  }

  getTrackMetadata(trackId: string) {
    return this.tracks.find((track) => track.id === trackId) ?? null;
  }

  getArtwork() {
    return null;
  }

  getPlayableSourceOrEmbed(trackId: string): PlayableBandcampSource | null {
    const track = this.getTrackMetadata(trackId);
    if (!track) return null;
    const embed = officialTrackEmbedUrl(track.bandcampEmbedTrackId);
    if (embed) return { kind: 'official-embed', src: embed };
    const destination = validateBandcampUrl(track.bandcampUrl);
    return destination ? { kind: 'external-only', href: destination.href } : null;
  }

  getBandcampUrl(trackId: string) {
    const track = this.getTrackMetadata(trackId);
    return track ? validateBandcampUrl(track.bandcampUrl) : null;
  }
}

export function officialTrackEmbedUrl(trackId?: string) {
  if (!trackId || !/^\d+$/.test(trackId)) return null;
  return (
    'https://bandcamp.com/EmbeddedPlayer/track=' + encodeURIComponent(trackId) +
    '/size=small/bgcol=07101f/linkcol=73d9ff/tracklist=false/artwork=none/transparent=true/'
  );
}
