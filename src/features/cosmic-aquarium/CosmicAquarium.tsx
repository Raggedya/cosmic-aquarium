'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import { officialTrackEmbedUrl } from '@/src/adapters/bandcamp-adapter';
import { defaultArtistManifest } from '@/src/data/default-artist-manifest';
import type { ArtistManifest } from '@/src/types/artist-manifest';

type Depth = 'far' | 'mid' | 'near' | 'foreground';
type Species = 'cosmos' | 'poppy' | 'anemone' | 'rose' | 'thorn';

interface CreatureDefinition {
  id: string;
  trackIndex: number;
  species: Species;
  depth: Depth;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
  travelX: number;
  travelY: number;
  hue: number;
}

const CREATURES: CreatureDefinition[] = [
  { id: 'ca-01', trackIndex: 0, species: 'cosmos', depth: 'near', x: 13, y: 30, size: 118, duration: 24, delay: -9, travelX: 34, travelY: -42, hue: 194 },
  { id: 'ca-02', trackIndex: 19, species: 'anemone', depth: 'far', x: 78, y: 19, size: 66, duration: 31, delay: -18, travelX: -49, travelY: 29, hue: 270 },
  { id: 'ca-03', trackIndex: 30, species: 'poppy', depth: 'mid', x: 83, y: 43, size: 98, duration: 27, delay: -4, travelX: -72, travelY: 24, hue: 312 },
  { id: 'ca-04', trackIndex: 5, species: 'cosmos', depth: 'near', x: 20, y: 61, size: 132, duration: 35, delay: -24, travelX: 43, travelY: -28, hue: 205 },
  { id: 'ca-05', trackIndex: 37, species: 'poppy', depth: 'near', x: 88, y: 79, size: 108, duration: 23, delay: -12, travelX: -38, travelY: -52, hue: 335 },
  { id: 'ca-06', trackIndex: 9, species: 'anemone', depth: 'far', x: 8, y: 84, size: 74, duration: 38, delay: -29, travelX: 64, travelY: -19, hue: 249 },
  { id: 'ca-07', trackIndex: 35, species: 'anemone', depth: 'mid', x: 52, y: 38, size: 158, duration: 33, delay: -20, travelX: -27, travelY: 39, hue: 214 },
  { id: 'ca-08', trackIndex: 24, species: 'cosmos', depth: 'foreground', x: -5, y: 48, size: 210, duration: 42, delay: -15, travelX: 44, travelY: 18, hue: 185 },
  { id: 'ca-09', trackIndex: 12, species: 'poppy', depth: 'far', x: 57, y: 73, size: 55, duration: 29, delay: -22, travelX: 30, travelY: -55, hue: 293 },
  { id: 'ca-10', trackIndex: 27, species: 'cosmos', depth: 'mid', x: 48, y: 91, size: 96, duration: 26, delay: -8, travelX: 58, travelY: -37, hue: 224 },
];

const historyKey = 'project-b-side:cosmic-aquarium-history-v1';
const captureDurationMs = 430;

const themedSpecies: Record<string, Species[]> = {
  crimson: Array<Species>(10).fill('rose'),
  paper: ['cosmos', 'cosmos', 'anemone', 'cosmos', 'cosmos', 'anemone', 'cosmos', 'anemone', 'cosmos', 'cosmos'],
  thorn: Array<Species>(10).fill('rose'),
  violet: ['anemone', 'cosmos', 'anemone', 'cosmos', 'anemone', 'cosmos', 'anemone', 'cosmos', 'anemone', 'cosmos'],
  neon: ['cosmos', 'anemone', 'cosmos', 'anemone', 'cosmos', 'anemone', 'cosmos', 'anemone', 'cosmos', 'anemone'],
  desert: ['poppy', 'cosmos', 'poppy', 'poppy', 'cosmos', 'poppy', 'poppy', 'cosmos', 'poppy', 'poppy'],
};

function speciesForStyle(style: string | undefined, index: number, fallback: Species): Species {
  return themedSpecies[style ?? 'cosmic']?.[index] ?? fallback;
}

function creatureStyle(creature: CreatureDefinition, index: number): CSSProperties {
  return {
    '--x': creature.x + '%',
    '--y': creature.y + '%',
    '--size': creature.size + 'px',
    '--duration': creature.duration + 's',
    '--delay': creature.delay + 's',
    '--travel-x': creature.travelX + 'px',
    '--travel-y': creature.travelY + 'px',
    '--hue': creature.hue,
    '--i': index,
  } as CSSProperties;
}

function albumAccent(manifest: ArtistManifest, albumKey: string) {
  return manifest.albums.find((album) => album.key === albumKey)?.color ?? '#b9a7ff';
}

export function CosmicAquarium({ manifestSlug }: { manifestSlug?: string }) {
  const captureTimer = useRef<number | null>(null);
  const [manifest, setManifest] = useState(defaultArtistManifest);
  const [capturingId, setCapturingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [touchOrigin, setTouchOrigin] = useState({ x: 50, y: 50 });
  const [announcement, setAnnouncement] = useState('A living aquarium surrounds you. Touch an unknown creature to discover its song.');

  const selectedCreature = useMemo(
    () => CREATURES.find((creature) => creature.id === selectedId) ?? null,
    [selectedId],
  );
  const selectedTrack = selectedCreature && manifest.tracks.length
    ? manifest.tracks[selectedCreature.trackIndex % manifest.tracks.length]
    : null;
  const selectedCreatureIndex = selectedCreature ? CREATURES.findIndex((creature) => creature.id === selectedCreature.id) : 0;
  const selectedSpecies = selectedCreature
    ? speciesForStyle(manifest.visualStyle, selectedCreatureIndex, selectedCreature.species)
    : 'cosmos';
  const selectedFlower = '/flowers/' + selectedSpecies + '.png';
  const selectedEmbed = selectedTrack ? officialTrackEmbedUrl(selectedTrack.bandcampEmbedTrackId) : null;
  const selectedAccent = selectedTrack ? selectedTrack.accent ?? albumAccent(manifest, selectedTrack.albumKey) : '#b9a7ff';

  useEffect(() => {
    if (!manifestSlug || manifestSlug === defaultArtistManifest.slug) {
      setManifest(defaultArtistManifest);
      return;
    }
    const controller = new AbortController();
    fetch('/artists/' + encodeURIComponent(manifestSlug) + '.json', { signal: controller.signal, cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('Artist manifest unavailable');
        return response.json() as Promise<ArtistManifest>;
      })
      .then((next) => {
        if (next.schemaVersion === 1 && next.artist && Array.isArray(next.tracks) && next.tracks.length) {
          setManifest(next);
          setAnnouncement(next.artist + '. The flower garden is awake.');
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setAnnouncement('This aquarium is not available yet. Immigrant Union remains in view.');
      });
    return () => controller.abort();
  }, [manifestSlug]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && selectedId) releaseCurrent();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (captureTimer.current !== null) window.clearTimeout(captureTimer.current);
    };
  }, [selectedId]);

  function rememberTrack(trackId: string) {
    try {
      const prior = JSON.parse(window.sessionStorage.getItem(historyKey) ?? '[]') as string[];
      const next = [trackId, ...prior.filter((id) => id !== trackId)].slice(0, 12);
      window.sessionStorage.setItem(historyKey, JSON.stringify(next));
    } catch {
      // Session history is a progressive enhancement.
    }
  }

  function beginCapture(creature: CreatureDefinition, clientX?: number, clientY?: number) {
    if (capturingId === creature.id) return;
    if (captureTimer.current !== null) window.clearTimeout(captureTimer.current);
    const track = manifest.tracks[creature.trackIndex % manifest.tracks.length];
    if (!track) return;
    setTouchOrigin({
      x: clientX === undefined ? creature.x : (clientX / window.innerWidth) * 100,
      y: clientY === undefined ? creature.y : (clientY / window.innerHeight) * 100,
    });
    setCapturingId(creature.id);
    setAnnouncement('Flower caught. Its light is reorganising.');
    if ('vibrate' in navigator) navigator.vibrate(10);
    captureTimer.current = window.setTimeout(() => {
      setSelectedId(creature.id);
      setCapturingId(null);
      rememberTrack(track.id);
      setAnnouncement(track.title + ' by ' + track.artist + '. Use the embedded Bandcamp control to stream.');
      if ('vibrate' in navigator) navigator.vibrate([8, 34, 12]);
      captureTimer.current = null;
    }, captureDurationMs);
  }

  function onCreaturePointerDown(event: PointerEvent<HTMLButtonElement>, creature: CreatureDefinition) {
    event.preventDefault();
    event.stopPropagation();
    beginCapture(creature, event.clientX, event.clientY);
  }

  function onCreatureKeyboardClick(event: MouseEvent<HTMLButtonElement>, creature: CreatureDefinition) {
    if (event.detail === 0) beginCapture(creature);
  }

  function releaseCurrent() {
    if (!selectedTrack) return;
    setSelectedId(null);
    setAnnouncement(selectedTrack.title + ' returned to the aquarium. Touch another creature.');
    if ('vibrate' in navigator) navigator.vibrate(7);
  }

  const aquariumStyle = {
    '--touch-x': touchOrigin.x + '%',
    '--touch-y': touchOrigin.y + '%',
    '--player-accent': selectedAccent,
  } as CSSProperties;

  return (
    <>
      <header
        className="cosmic-title"
        style={{
          position: 'fixed',
          zIndex: 2147483647,
          top: 'max(20px, env(safe-area-inset-top))',
          left: '50%',
          width: 'min(430px, 100vw)',
          display: 'block',
          visibility: 'visible',
          opacity: 1,
          color: '#f5f2ed',
          fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          textAlign: 'center',
          pointerEvents: 'none',
          transform: 'translateX(-50%)',
          filter: 'none',
          mixBlendMode: 'normal',
        }}
      >
        <span aria-hidden="true" className="cosmic-mark"><i /></span>
        <h1 style={{ margin: 0, paddingLeft: '.38em', color: '#f5f2ed', fontSize: 13, fontWeight: 500, letterSpacing: '.38em' }}>
          {manifest.artist.toUpperCase()}
        </h1>
        <p style={{ margin: '9px 0 0', color: 'rgba(235, 241, 255, .56)', fontSize: 7, fontWeight: 650, letterSpacing: '.24em' }}>
          {selectedTrack ? 'A SONG FOUND IN THE DARK' : 'TOUCH SOMETHING.'}
        </p>
      </header>

      <main
      className={'cosmic-aquarium ' + (selectedTrack ? 'has-player ' : '') + (capturingId ? 'is-capturing' : '')}
      data-theme={manifest.visualStyle ?? 'cosmic'}
      style={aquariumStyle}
      aria-label="Cosmic Aquaria music discovery experience"
    >
      <div className="cosmic-atmosphere" aria-hidden="true">
        <i /><i /><i /><i /><i /><i />
        <span className="distant-swarm"><b /><b /><b /><b /><b /></span>
      </div>

      <div className="creature-field" aria-label="Unknown song flowers">
        {CREATURES.map((creature, index) => {
          const isSelected = selectedId === creature.id;
          const isCapturing = capturingId === creature.id;
          const species = speciesForStyle(manifest.visualStyle, index, creature.species);
          return (
            <button
              key={creature.id}
              className={
                'creature creature--' + species + ' depth--' + creature.depth +
                (isSelected ? ' is-selected' : '') + (isCapturing ? ' is-touched' : '')
              }
              style={creatureStyle(creature, index)}
              type="button"
              aria-label={isSelected ? 'Currently playing flower' : 'Catch this unknown song flower'}
              aria-pressed={isSelected}
              onPointerDown={(event) => onCreaturePointerDown(event, creature)}
              onClick={(event) => onCreatureKeyboardClick(event, creature)}
            >
              <span className="creature-hitbox" aria-hidden="true" />
              <img src={'/flowers/' + species + '.png'} alt="" draggable="false" />
            </button>
          );
        })}
      </div>

      {capturingId ? (
        <div className="capture-transition" aria-hidden="true">
          <i className="capture-point" />
          <i className="capture-ring" />
          <i className="capture-pulse" />
        </div>
      ) : null}

      {selectedTrack ? (
        <section className="living-player" aria-labelledby="living-player-title">
          <img className="player-membrane" src={selectedFlower} alt="" aria-hidden="true" />
          <div className="player-nucleus" aria-hidden="true">
            <i className="nucleus-landscape" />
            <span>{selectedTrack.albumTitle.slice(0, 1)}</span>
          </div>
          <div className="player-copy">
            <p>{selectedTrack.albumTitle} · {selectedTrack.year}</p>
            <h2 id="living-player-title">{selectedTrack.title}</h2>
            <span>{selectedTrack.artist}</span>
          </div>
          <div className="organic-progress" aria-hidden="true">
            <i /><span>STREAM</span><b>{selectedTrack.duration}</b>
          </div>
          {selectedEmbed ? (
            <div className="bandcamp-stream">
              <span>TOUCH PLAY TO STREAM</span>
              <iframe
                key={selectedTrack.id}
                title={'Official Bandcamp player for ' + selectedTrack.title}
                src={selectedEmbed}
                loading="eager"
                allow="autoplay"
              />
            </div>
          ) : (
            <p className="stream-unavailable">Streaming is unavailable here. Continue on Bandcamp.</p>
          )}
          <a className="bandcamp-link" href={selectedTrack.bandcampUrl} target="_blank" rel="noopener noreferrer">
            VIEW &amp; SUPPORT ON BANDCAMP ↗
          </a>
          <button className="release-current" type="button" onClick={releaseCurrent} aria-label="Release this song back into the aquarium">
            <i aria-hidden="true" /><span>RELEASE</span>
          </button>
        </section>
      ) : null}

      <p className="cosmic-legal">INDEPENDENT &amp; UNOFFICIAL · LISTENING AND SUPPORT REMAIN ON BANDCAMP</p>
      <p className="visually-hidden" role="status" aria-live="polite">{announcement}</p>
      </main>
    </>
  );
}
