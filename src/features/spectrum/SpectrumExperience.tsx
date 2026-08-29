'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { validateBandcampUrl } from '@/src/adapters/bandcamp-link-adapter';
import { spectrumReleases } from '@/src/data/spectrum-releases';
import { clampUnit, nearestSpectrumRelease } from '@/src/discovery/spectrum';
import { SpectrumCanvas } from '@/src/features/spectrum/SpectrumCanvas';
import { awakeningDurationMs } from '@/src/features/spectrum/awakening';
import type { SpectrumRelease } from '@/src/types/spectrum';

type Point = { x: number; y: number };

const initialPoint: Point = { x: .5, y: .5 };
const awakeningSessionKey = 'project-b-side:immigrant-union-awakening-depth-v2';
const flowerHues = [326, 18, 48, 92, 158, 188, 218, 258, 286, 344];

type FlowerDepth = 'back' | 'mid' | 'front';

function flowerDepth(index: number): FlowerDepth {
  if (index % 9 === 0) return 'front';
  if (index % 4 === 0) return 'back';
  return 'mid';
}

function flowerHue(song: SpectrumRelease): number {
  const index = spectrumReleases.findIndex((candidate) => candidate.id === song.id);
  return flowerHues[Math.max(0, index) % flowerHues.length];
}

function listeningEmbedUrl(trackId?: string) {
  if (!trackId || !/^\d+$/.test(trackId)) return null;
  return 'https://bandcamp.com/EmbeddedPlayer/track=' + trackId + '/size=large/bgcol=030817/linkcol=9fd6ff/tracklist=false/artwork=small/transparent=true/';
}

function flowerStyle(song: SpectrumRelease, index: number): CSSProperties {
  const depth = flowerDepth(index);
  const depthDuration = depth === 'back' ? 1.16 : depth === 'front' ? .86 : 1;
  const depthScale = depth === 'back' ? .62 : depth === 'front' ? 1.42 : 1;
  const duration = (12 + ((index * 7) % 11) * 1.05) * 2.5 * depthDuration;
  const phase = ((index * 43) % 100) / 100;
  const scale = (.78 + ((index * 13) % 25) / 100) * depthScale;
  return {
    '--stream-x': String(8 + ((index * 37) % 84)) + '%',
    '--stream-duration': duration.toFixed(2) + 's',
    '--stream-delay': (-phase * duration).toFixed(2) + 's',
    '--stream-sway': String(-28 + ((index * 19) % 57)) + 'px',
    '--stream-turn': String(-18 + ((index * 31) % 37)) + 'deg',
    '--flower-hue': String(flowerHues[index % flowerHues.length]),
    '--flower-hue-alt': String((flowerHues[index % flowerHues.length] + 34 + (index % 3) * 18) % 360),
    '--flower-scale': scale.toFixed(2),
    '--rest-rise': String(-(10 + song.y * 80)) + 'vh',
    '--magnet-x': '0px',
    '--magnet-y': '0px',
  } as CSSProperties;
}

export function SpectrumExperience() {
  const fieldRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const flowerRefs = useRef(new Map<string, HTMLSpanElement>());
  const lastLitSongRef = useRef('');
  const introSeenRef = useRef(false);
  const awakeningTimerRef = useRef<number | null>(null);
  const [point, setPoint] = useState<Point>(initialPoint);
  const [selectedPoint, setSelectedPoint] = useState<Point>(initialPoint);
  const [dragging, setDragging] = useState(false);
  const [awakening, setAwakening] = useState(false);
  const [titleVisible, setTitleVisible] = useState(false);
  const [hasCaughtFlower, setHasCaughtFlower] = useState(false);
  const [litSongId, setLitSongId] = useState('');
  const [selected, setSelected] = useState<SpectrumRelease | null>(null);
  const [announcement, setAnnouncement] = useState('Move through the dark stream. A passing flower carries a song.');

  const illuminated = useMemo(
    () => spectrumReleases.find((song) => song.id === litSongId) ?? null,
    [litSongId],
  );
  const destination = selected ? validateBandcampUrl(selected.bandcampUrl) : null;
  const embedUrl = listeningEmbedUrl(selected?.bandcampEmbedTrackId);

  useEffect(() => {
    if (selected) closeRef.current?.focus();
  }, [selected]);

  useEffect(() => {
    try {
      introSeenRef.current = window.sessionStorage.getItem(awakeningSessionKey) === 'seen';
      setTitleVisible(introSeenRef.current);
    } catch {
      introSeenRef.current = false;
    }
    return () => {
      if (awakeningTimerRef.current !== null) window.clearTimeout(awakeningTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    const preventViewportDrag = (event: TouchEvent) => event.preventDefault();
    document.documentElement.classList.add('spectrum-locked-root');
    document.body.classList.add('spectrum-locked-root');
    field.addEventListener('touchmove', preventViewportDrag, { passive: false });
    return () => {
      field.removeEventListener('touchmove', preventViewportDrag);
      document.documentElement.classList.remove('spectrum-locked-root');
      document.body.classList.remove('spectrum-locked-root');
    };
  }, []);

  function pointFromPointer(event: PointerEvent<HTMLButtonElement>): Point {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: clampUnit((event.clientX - bounds.left) / bounds.width),
      y: clampUnit((event.clientY - bounds.top) / bounds.height),
    };
  }

  function clearFlowerMagnetism() {
    for (const flower of flowerRefs.current.values()) {
      flower.style.setProperty('--magnet-x', '0px');
      flower.style.setProperty('--magnet-y', '0px');
    }
  }

  function flowingSongAt(next: Point, magnetize = false): SpectrumRelease | null {
    const field = fieldRef.current;
    if (!field) return null;
    const bounds = field.getBoundingClientRect();
    const pointerX = bounds.left + next.x * bounds.width;
    const pointerY = bounds.top + next.y * bounds.height;
    let nearest: { song: SpectrumRelease; distance: number } | null = null;

    for (const song of spectrumReleases) {
      const flower = flowerRefs.current.get(song.id);
      if (!flower) continue;
      const flowerBounds = flower.getBoundingClientRect();
      const deltaX = pointerX - (flowerBounds.left + flowerBounds.width / 2);
      const deltaY = pointerY - (flowerBounds.top + flowerBounds.height / 2);
      const distance = Math.hypot(deltaX, deltaY);
      if (magnetize) {
        const magneticReach = 112;
        const pull = Math.max(0, 1 - distance / magneticReach) ** 2;
        const magneticX = Math.sign(deltaX) * Math.min(14, Math.abs(deltaX) * pull * .22);
        const magneticY = Math.sign(deltaY) * Math.min(14, Math.abs(deltaY) * pull * .22);
        flower.style.setProperty('--magnet-x', magneticX.toFixed(2) + 'px');
        flower.style.setProperty('--magnet-y', magneticY.toFixed(2) + 'px');
      }
      if (!nearest || distance < nearest.distance) nearest = { song, distance };
    }

    const forgivingRadius = Math.max(44, Math.min(56, bounds.width * .13));
    return nearest && nearest.distance <= forgivingRadius ? nearest.song : null;
  }

  function setLivePoint(next: Point, explicitSong?: SpectrumRelease | null, magnetize = false) {
    setPoint(next);
    const lit = explicitSong === undefined ? flowingSongAt(next, magnetize) : explicitSong;
    const nextId = lit?.id ?? '';
    setLitSongId(nextId);
    if (nextId !== lastLitSongRef.current) {
      lastLitSongRef.current = nextId;
      if (lit) {
        setAnnouncement(lit.title + ' is flowering. Release or press Enter to open it.');
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate([8, 22, 12]);
      }
    }
  }

  function revealSong(song: SpectrumRelease, origin: Point) {
    setHasCaughtFlower(true);
    setSelectedPoint(origin);
    setSelected(song);
    setLitSongId('');
    setAnnouncement(song.title + ' by Immigrant Union. From ' + song.albumTitle + ', ' + song.year + '.');
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate([12, 35, 8]);
  }

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    const next = pointFromPointer(event);
    if (!introSeenRef.current) {
      introSeenRef.current = true;
      try { window.sessionStorage.setItem(awakeningSessionKey, 'seen'); } catch { /* Session storage is optional. */ }
      setPoint(next);
      setAwakening(true);
      setTitleVisible(true);
      setAnnouncement('Immigrant Union. The hidden song stream is awake.');
      awakeningTimerRef.current = window.setTimeout(() => setAwakening(false), awakeningDurationMs);
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(8);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    setLivePoint(next, undefined, true);
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (dragging) setLivePoint(pointFromPointer(event), undefined, true);
  }

  function onPointerUp(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (!dragging) return;
    const next = pointFromPointer(event);
    const song = flowingSongAt(next, true) ?? illuminated;
    setPoint(next);
    setDragging(false);
    clearFlowerMagnetism();
    setLitSongId('');
    lastLitSongRef.current = '';
    if (song) revealSong(song, next);
    else setAnnouncement('The flower drifted on. Another will rise through the stream.');
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const step = event.shiftKey ? .08 : .035;
    const movement: Record<string, Point> = {
      ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step },
    };
    if (movement[event.key]) {
      event.preventDefault();
      const next = {
        x: clampUnit(point.x + movement[event.key].x),
        y: clampUnit(point.y + movement[event.key].y),
      };
      setLivePoint(next, nearestSpectrumRelease(spectrumReleases, next.x, next.y));
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      revealSong(illuminated ?? nearestSpectrumRelease(spectrumReleases, point.x, point.y), point);
    }
  }

  function closeDiscovery() {
    setSelected(null);
    setLitSongId('');
    window.setTimeout(() => fieldRef.current?.focus(), 0);
  }

  const fieldStyle = {
    '--pick-x': String(point.x * 100) + '%',
    '--pick-y': String(point.y * 100) + '%',
  } as CSSProperties;
  const selectedHue = selected ? flowerHue(selected) : 210;
  const revealStyle = {
    '--origin-x': String(selectedPoint.x * 100) + '%',
    '--origin-y': String(selectedPoint.y * 100) + '%',
    '--record-color': 'hsl(' + selectedHue + ' 92% 72%)',
  } as CSSProperties;

  return (
    <main className="spectrum-app artist-spectrum mystery-spectrum flower-stream-spectrum">
      <button
        ref={fieldRef}
        className={'spectrum-field ' + (dragging ? 'is-dragging' : '')}
        style={fieldStyle}
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          setDragging(false);
          setLitSongId('');
          clearFlowerMagnetism();
          lastLitSongRef.current = '';
        }}
        onKeyDown={onKeyDown}
        aria-label="An Immigrant Union song stream. Drag through the dark water. Passing flowers carry hidden songs; approach one and release to open it. Use arrow keys and Enter on a keyboard."
      >
        <SpectrumCanvas point={point} active={dragging} awakening={awakening} />
        {spectrumReleases.map((song, index) => (
          <span
            key={song.id}
            ref={(node) => {
              if (node) flowerRefs.current.set(song.id, node);
              else flowerRefs.current.delete(song.id);
            }}
            className={'release-star song-flower depth-' + flowerDepth(index) + ' ' + (illuminated?.id === song.id ? 'is-near' : '')}
            style={flowerStyle(song, index)}
            aria-hidden="true"
          />
        ))}
        <span className="field-atmosphere" aria-hidden="true" />
        {illuminated ? <span className="capture-bloom" aria-hidden="true"><i /></span> : null}
      </button>

      {titleVisible ? (
        <>
          <div
            className={'awakening-title ' + (awakening ? 'is-rising' : 'is-settled') + (dragging ? ' is-exploring' : '')}
            style={fieldStyle}
            aria-hidden="true"
          >
            <span>Immigrant Union</span>
          </div>
          {!hasCaughtFlower && !selected ? (
            <p
              className={'flower-instruction ' + (awakening ? 'is-waking' : 'is-ready') + (dragging ? ' is-following' : '')}
              aria-hidden="true"
            >
              Catch a flower
            </p>
          ) : null}
        </>
      ) : null}

      {selected ? (
        <section
          className="discovery-layer"
          style={revealStyle}
          role="dialog"
          aria-modal="true"
          aria-labelledby="discovery-title"
          onKeyDown={(event) => { if (event.key === 'Escape') closeDiscovery(); }}
        >
          <span className="reveal-bloom" aria-hidden="true" />
          <span className="reveal-orbit reveal-orbit-one" aria-hidden="true" />
          <span className="reveal-orbit reveal-orbit-two" aria-hidden="true" />
          <span className="origin-signal" aria-hidden="true" />
          <button ref={closeRef} className="discovery-close" type="button" onClick={closeDiscovery} aria-label="Return to the song stream">×</button>
          <article className="record-reveal song-reveal">
            <p className="record-index"><span>PROJECT B-SIDE · UNOFFICIAL</span> · track {selected.trackNumber} · {selected.albumTitle}</p>
            <p className="record-coordinate">Caught while flowering through the stream</p>
            <h2 id="discovery-title">{selected.title}</h2>
            <p className="record-artist">Immigrant Union <span>· {selected.year} · {selected.duration}</span></p>
            <p className="record-note">{selected.note}</p>
            {embedUrl ? (
              <div className="bandcamp-embed-shell">
                <span>Listen here · official Bandcamp player</span>
                <iframe
                  title={'Listen to ' + selected.title + ' by Immigrant Union on Bandcamp'}
                  src={embedUrl}
                  loading="lazy"
                  allow="autoplay"
                />
              </div>
            ) : null}
            {destination ? (
              <a className="bandcamp-action" href={destination.href} target="_blank" rel="noopener noreferrer">
                <span>Support / open this song</span><b>Bandcamp ↗</b>
              </a>
            ) : null}
            <button className="return-action" type="button" onClick={closeDiscovery}>Return to the stream</button>
          </article>
        </section>
      ) : null}

      <p className="visually-hidden">An independent, unofficial discovery experience for Bandcamp. Listening and support remain on Bandcamp.</p>
      <p className="visually-hidden" role="status" aria-live="polite">{announcement}</p>
    </main>
  );
}
