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
import { buildTrackDeck, secureRandomUnit } from '@/src/features/cosmic-aquarium/track-shuffle';
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
  { id: 'ca-11', trackIndex: 3, species: 'anemone', depth: 'far', x: 32, y: 17, size: 78, duration: 37, delay: -14, travelX: 46, travelY: 34, hue: 258 },
  { id: 'ca-12', trackIndex: 16, species: 'cosmos', depth: 'mid', x: 68, y: 56, size: 88, duration: 32, delay: -25, travelX: -52, travelY: 30, hue: 202 },
  { id: 'ca-13', trackIndex: 33, species: 'poppy', depth: 'far', x: 37, y: 78, size: 62, duration: 41, delay: -11, travelX: 35, travelY: -46, hue: 318 },
  { id: 'ca-14', trackIndex: 22, species: 'anemone', depth: 'near', x: 93, y: 63, size: 124, duration: 36, delay: -31, travelX: -40, travelY: -22, hue: 237 },
];

const historyKeyPrefix = 'cosmic-aquaria:recent-tracks:';
const deckKeyPrefix = 'cosmic-aquaria:track-deck:';
const captureDurationMs = 430;
const serviceBase = 'https://cosmic-aquaria.andrewharris501.workers.dev';

const themedSpecies: Record<string, Species[]> = {
  violet: ['anemone', 'cosmos', 'anemone', 'cosmos', 'anemone', 'cosmos', 'anemone', 'cosmos', 'anemone', 'cosmos', 'cosmos', 'anemone', 'cosmos', 'anemone'],
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
  const trackDeck = useRef<string[]>([]);
  const trackDeckSlug = useRef('');
  const analyticsSession = useRef('');
  const [manifest, setManifest] = useState(defaultArtistManifest);
  const [capturingId, setCapturingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTrack, setSelectedTrack] = useState<ArtistManifest['tracks'][number] | null>(null);
  const [playerDeparting, setPlayerDeparting] = useState(false);
  const [secondaryActionsVisible, setSecondaryActionsVisible] = useState(false);
  const [touchOrigin, setTouchOrigin] = useState({ x: 50, y: 50 });
  const [announcement, setAnnouncement] = useState('A living aquarium surrounds you. Touch an unknown creature to discover its song.');

  const selectedCreature = useMemo(
    () => CREATURES.find((creature) => creature.id === selectedId) ?? null,
    [selectedId],
  );
  const selectedCreatureIndex = selectedCreature ? CREATURES.findIndex((creature) => creature.id === selectedCreature.id) : 0;
  const selectedSpecies = selectedCreature
    ? speciesForStyle(manifest.visualStyle, selectedCreatureIndex, selectedCreature.species)
    : 'cosmos';
  const selectedFlower = '/flowers/' + selectedSpecies + '.png';
  const selectedEmbed = selectedTrack ? officialTrackEmbedUrl(selectedTrack.bandcampEmbedTrackId) : null;
  const selectedAccent = selectedTrack ? selectedTrack.accent ?? albumAccent(manifest, selectedTrack.albumKey) : '#b9a7ff';

  useEffect(() => {
    if (!playerDeparting) {
      setSecondaryActionsVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setSecondaryActionsVisible(true), 4000);
    return () => window.clearTimeout(timer);
  }, [playerDeparting]);

  function recordEvent(eventType: string, details: Record<string, unknown> = {}) {
    if (!analyticsSession.current) return;
    const payload = JSON.stringify({eventType, aquariumId: manifest.slug, batchId: manifest.dailyBatchId ?? null, sessionId: analyticsSession.current, ...details});
    try {
      if (navigator.sendBeacon) navigator.sendBeacon(serviceBase + '/api/events', new Blob([payload], { type: 'application/json' }));
      else void fetch(serviceBase + '/api/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload, keepalive: true });
    } catch {
      // Analytics never interrupts listening.
    }
  }

  useEffect(() => {
    const viewportTimers = new Set<number>();

    function syncVisibleViewport() {
      const viewport = window.visualViewport;
      const visibleHeight = Math.max(window.innerHeight || 0, viewport?.height || 0);
      const visibleTop = Math.max(0, viewport?.offsetTop || 0);
      document.documentElement.style.setProperty('--aquarium-height', Math.ceil(visibleHeight) + 'px');
      document.documentElement.style.setProperty('--viewport-top', Math.round(visibleTop) + 'px');
    }

    function settleVisibleViewport() {
      syncVisibleViewport();
      viewportTimers.forEach(timer => window.clearTimeout(timer));
      viewportTimers.clear();
      [60, 240, 720, 1500].forEach(delay => {
        const timer = window.setTimeout(() => {
          syncVisibleViewport();
          viewportTimers.delete(timer);
        }, delay);
        viewportTimers.add(timer);
      });
    }

    settleVisibleViewport();
    window.addEventListener('pageshow', settleVisibleViewport);
    window.addEventListener('resize', settleVisibleViewport, { passive: true });
    window.addEventListener('orientationchange', settleVisibleViewport, { passive: true });
    window.visualViewport?.addEventListener('resize', syncVisibleViewport, { passive: true });
    window.visualViewport?.addEventListener('scroll', syncVisibleViewport, { passive: true });
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') settleVisibleViewport();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      viewportTimers.forEach(timer => window.clearTimeout(timer));
      window.removeEventListener('pageshow', settleVisibleViewport);
      window.removeEventListener('resize', settleVisibleViewport);
      window.removeEventListener('orientationchange', settleVisibleViewport);
      window.visualViewport?.removeEventListener('resize', syncVisibleViewport);
      window.visualViewport?.removeEventListener('scroll', syncVisibleViewport);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const key = 'cosmic-aquaria:session';
    try {
      analyticsSession.current = window.sessionStorage.getItem(key) || crypto.randomUUID();
      window.sessionStorage.setItem(key, analyticsSession.current);
    } catch {
      analyticsSession.current = 'session-' + Date.now();
    }
  }, []);

  useEffect(() => {
    if (!analyticsSession.current) return;
    recordEvent('session_start');
    recordEvent('aquarium_open');
    if (new URLSearchParams(window.location.search).get('source') === 'daily-email') recordEvent('email_link_click');
  }, [manifest.slug]);

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

  function readStoredIds(key: string) {
    try {
      const stored = JSON.parse(window.sessionStorage.getItem(key) ?? '[]') as unknown;
      return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      return [];
    }
  }

  function rememberTrack(trackId: string) {
    try {
      const key = historyKeyPrefix + manifest.slug;
      const prior = readStoredIds(key);
      const next = [trackId, ...prior.filter((id) => id !== trackId)].slice(0, 12);
      window.sessionStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Session history is a progressive enhancement.
    }
  }

  function nextShuffledTrack() {
    const validIds = new Set(manifest.tracks.map((track) => track.id));
    const deckKey = deckKeyPrefix + manifest.slug;

    if (trackDeckSlug.current !== manifest.slug) {
      trackDeck.current = readStoredIds(deckKey).filter((id) => validIds.has(id));
      trackDeckSlug.current = manifest.slug;
    }

    if (!trackDeck.current.length) {
      const recent = readStoredIds(historyKeyPrefix + manifest.slug);
      trackDeck.current = buildTrackDeck([...validIds], recent, secureRandomUnit);
    }

    const trackId = trackDeck.current.shift();
    try {
      window.sessionStorage.setItem(deckKey, JSON.stringify(trackDeck.current));
    } catch {
      // The in-memory deck still prevents repeats when storage is unavailable.
    }
    return manifest.tracks.find((track) => track.id === trackId) ?? null;
  }

  function beginCapture(creature: CreatureDefinition, clientX?: number, clientY?: number) {
    if (capturingId === creature.id) return;
    if (captureTimer.current !== null) window.clearTimeout(captureTimer.current);
    const track = nextShuffledTrack();
    if (!track) return;
    recordEvent('object_touch', { trackId: track.id });
    setTouchOrigin({
      x: clientX === undefined ? creature.x : (clientX / window.innerWidth) * 100,
      y: clientY === undefined ? creature.y : (clientY / window.innerHeight) * 100,
    });
    setCapturingId(creature.id);
    setAnnouncement('Flower caught. Its light is reorganising.');
    if ('vibrate' in navigator) navigator.vibrate(10);
    captureTimer.current = window.setTimeout(() => {
      setPlayerDeparting(false);
      setSelectedId(creature.id);
      setSelectedTrack(track);
      setCapturingId(null);
      rememberTrack(track.id);
      recordEvent('track_selected', { trackId: track.id });
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
    recordEvent('release_click', { trackId: selectedTrack.id });
    setPlayerDeparting(false);
    setSelectedId(null);
    setSelectedTrack(null);
    setAnnouncement(selectedTrack.title + ' returned to the aquarium. Touch another creature.');
    if ('vibrate' in navigator) navigator.vibrate(7);
  }

  async function shareAquarium() {
    recordEvent('share_click');
    const shareData = {
      title: 'Cosmic Aquaria — ' + manifest.artist,
      text: 'Enter this Cosmic Aquaria music discovery.',
      url: window.location.href,
    };
    try {
      if (navigator.share) {
        recordEvent('share_native_opened');
        await navigator.share(shareData);
        recordEvent('share_complete');
        setAnnouncement('Aquarium shared.');
      } else {
        await navigator.clipboard.writeText(window.location.href);
        recordEvent('share_copy');
        setAnnouncement('Aquarium link copied.');
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setAnnouncement('Sharing is unavailable on this device.');
    }
  }

  async function exploreAnotherAquarium() {
    recordEvent('explore_click');
    try {
      const recentKey = 'cosmic-aquaria:recent-aquariums';
      const recent = readStoredIds(recentKey);
      let destination: { id?: string; slug: string; url?: string; aquarium_url?: string } | null = null;
      const serviceResponse = await fetch(serviceBase + '/api/aquariums/random?exclude=' + encodeURIComponent(manifest.slug) + '&recent=' + encodeURIComponent(recent.join(',')), { cache: 'no-store' }).catch(() => null);
      if (serviceResponse?.ok) destination = await serviceResponse.json() as typeof destination;
      if (!destination) {
        const response = await fetch('https://raggedya.github.io/cosmic-aquarium/aquariums.json', { cache: 'no-store' });
        if (!response.ok) throw new Error('Aquarium registry unavailable');
        const data = await response.json() as { aquariums?: Array<{ slug: string; url: string; status: string }> };
        const published = (data.aquariums ?? []).filter((entry) => entry.status === 'published' && entry.slug !== manifest.slug);
        const fresh = published.filter((entry) => !recent.includes(entry.slug));
        const pool = fresh.length ? fresh : published;
        if (!pool.length) throw new Error('No other Aquarium is available');
        destination = pool[Math.floor(secureRandomUnit() * pool.length)];
      }
      try {
        window.sessionStorage.setItem(recentKey, JSON.stringify([manifest.slug, destination.slug, ...recent].filter((value, index, values) => values.indexOf(value) === index).slice(0, 6)));
      } catch {
        // Recent journeys are a progressive enhancement.
      }
      recordEvent('aquarium_transition', { sourceAquariumId: manifest.slug, destinationAquariumId: destination.id ?? destination.slug });
      window.location.assign(destination.url ?? destination.aquarium_url ?? '/');
    } catch {
      setAnnouncement('Another Aquarium is not available just now.');
    }
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
          top: 'calc(var(--viewport-top, 0px) + max(20px, env(safe-area-inset-top)))',
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
          {selectedTrack && !playerDeparting ? 'A SONG FOUND IN THE DARK' : 'TOUCH SOMETHING.'}
        </p>
      </header>

      <main
      className={'cosmic-aquarium ' + (selectedTrack ? 'has-player ' : '') + (capturingId ? 'is-capturing ' : '') + (secondaryActionsVisible ? 'show-secondary-actions' : '')}
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
        <section key={selectedTrack.id} className="living-player is-active" aria-labelledby="living-player-title">
          <img
            className="player-membrane"
            src={selectedFlower}
            alt=""
            aria-hidden="true"
            onAnimationStart={(event) => {
              if (event.animationName === 'player-flower-drift-away') setPlayerDeparting(true);
            }}
          />
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
          <a className="bandcamp-link" href={selectedTrack.bandcampUrl} target="_blank" rel="noopener noreferrer" onClick={() => recordEvent('bandcamp_click', { trackId: selectedTrack.id })}>
            VIEW &amp; SUPPORT ON BANDCAMP ↗
          </a>
          <button className="release-current" type="button" onClick={releaseCurrent} aria-label="Release this song back into the aquarium">
            <i aria-hidden="true" /><span>RELEASE</span>
          </button>
        </section>
      ) : null}

      <nav className="aquarium-actions aquarium-secondary-actions" aria-label="Aquarium actions">
        <button className="aquarium-action aquarium-action--share" type="button" onClick={shareAquarium} aria-label="Share this Aquarium">
          <span className="aquarium-action-orbit" aria-hidden="true"><img src="/flowers/anemone.png" alt="" /></span>
          <strong>SHARE<br />AQUARIUM</strong>
        </button>
        {manifest.commerceAvailable && manifest.commerceUrl ? (
          <a
            className={'aquarium-action aquarium-action--buy aquarium-buy-action' + (playerDeparting ? ' is-visible' : '')}
            href={manifest.commerceUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => recordEvent('buy_click')}
            aria-label={'Buy music or merchandise from ' + manifest.artist + ' on Bandcamp'}
          >
            <span className="aquarium-action-orbit" aria-hidden="true"><img src="/flowers/cosmos.png" alt="" /></span>
            <span><strong>BUY MUSIC</strong><small>SUPPORT THE ARTIST</small></span>
          </a>
        ) : null}
        <button className="aquarium-action aquarium-action--explore" type="button" onClick={exploreAnotherAquarium} aria-label="Explore another random Aquarium">
          <span className="aquarium-action-orbit" aria-hidden="true"><img src="/flowers/cosmos.png" alt="" /></span>
          <strong>EXPLORE<br />ANOTHER<br />AQUARIUM</strong>
        </button>
      </nav>

      <p className="cosmic-legal">INDEPENDENT &amp; UNOFFICIAL · LISTENING AND SUPPORT REMAIN ON BANDCAMP</p>
      <p className="visually-hidden" role="status" aria-live="polite">{announcement}</p>
      </main>
    </>
  );
}
