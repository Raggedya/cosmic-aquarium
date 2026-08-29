'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { validateBandcampUrl } from '@/src/adapters/bandcamp-link-adapter';
import { spectrumReleases } from '@/src/data/spectrum-releases';
import { clampUnit, illuminatedSpectrumRelease, nearestSpectrumRelease } from '@/src/discovery/spectrum';
import { SpectrumCanvas } from '@/src/features/spectrum/SpectrumCanvas';
import type { SpectrumRelease } from '@/src/types/spectrum';

type Point = { x: number; y: number };

const initialPoint: Point = { x: .5, y: .5 };

function listeningEmbedUrl(trackId?: string) {
  if (!trackId || !/^\d+$/.test(trackId)) return null;
  return 'https://bandcamp.com/EmbeddedPlayer/track=' + trackId + '/size=large/bgcol=030817/linkcol=9fd6ff/tracklist=false/artwork=small/transparent=true/';
}

export function SpectrumExperience() {
  const fieldRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const lastLitSongRef = useRef('');
  const [point, setPoint] = useState<Point>(initialPoint);
  const [selectedPoint, setSelectedPoint] = useState<Point>(initialPoint);
  const [dragging, setDragging] = useState(false);
  const [keyboardExploring, setKeyboardExploring] = useState(false);
  const [selected, setSelected] = useState<SpectrumRelease | null>(null);
  const [announcement, setAnnouncement] = useState('Move through the dark field. A nearby song will brighten.');

  const exploring = dragging || keyboardExploring;
  const illuminated = useMemo(
    () => exploring ? illuminatedSpectrumRelease(spectrumReleases, point.x, point.y) : null,
    [exploring, point],
  );
  const destination = selected ? validateBandcampUrl(selected.bandcampUrl) : null;
  const embedUrl = listeningEmbedUrl(selected?.bandcampEmbedTrackId);

  useEffect(() => {
    if (selected) closeRef.current?.focus();
  }, [selected]);

  function pointFromPointer(event: PointerEvent<HTMLButtonElement>): Point {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: clampUnit((event.clientX - bounds.left) / bounds.width),
      y: clampUnit((event.clientY - bounds.top) / bounds.height),
    };
  }

  function setLivePoint(next: Point) {
    setPoint(next);
    const lit = illuminatedSpectrumRelease(spectrumReleases, next.x, next.y);
    const nextId = lit?.id ?? '';
    if (nextId !== lastLitSongRef.current) {
      lastLitSongRef.current = nextId;
      if (lit) {
        setAnnouncement(lit.title + ' is glowing. Release or press Enter to open it.');
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(5);
      }
    }
  }

  function revealSong(song: SpectrumRelease, origin: Point) {
    setSelectedPoint(origin);
    setSelected(song);
    setAnnouncement(song.title + ' by Immigrant Union. From ' + song.albumTitle + ', ' + song.year + '.');
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate([12, 35, 8]);
  }

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const next = pointFromPointer(event);
    setKeyboardExploring(false);
    setDragging(true);
    setLivePoint(next);
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    if (dragging) setLivePoint(pointFromPointer(event));
  }

  function onPointerUp(event: PointerEvent<HTMLButtonElement>) {
    if (!dragging) return;
    const next = pointFromPointer(event);
    const song = illuminatedSpectrumRelease(spectrumReleases, next.x, next.y);
    setPoint(next);
    setDragging(false);
    lastLitSongRef.current = '';
    if (song) revealSong(song, next);
    else setAnnouncement('The surface is dark again. Move toward another faint star.');
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const step = event.shiftKey ? .08 : .035;
    const movement: Record<string, Point> = {
      ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step },
    };
    if (movement[event.key]) {
      event.preventDefault();
      setKeyboardExploring(true);
      setLivePoint({
        x: clampUnit(point.x + movement[event.key].x),
        y: clampUnit(point.y + movement[event.key].y),
      });
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setKeyboardExploring(true);
      revealSong(illuminated ?? nearestSpectrumRelease(spectrumReleases, point.x, point.y), point);
    }
  }

  function closeDiscovery() {
    setSelected(null);
    setKeyboardExploring(false);
    window.setTimeout(() => fieldRef.current?.focus(), 0);
  }

  const fieldStyle = {
    '--pick-x': String(point.x * 100) + '%',
    '--pick-y': String(point.y * 100) + '%',
  } as CSSProperties;
  const revealStyle = {
    '--origin-x': String(selectedPoint.x * 100) + '%',
    '--origin-y': String(selectedPoint.y * 100) + '%',
    '--record-color': '#9fd6ff',
  } as CSSProperties;

  return (
    <main className="spectrum-app artist-spectrum mystery-spectrum">
      <button
        ref={fieldRef}
        className={'spectrum-field ' + (dragging ? 'is-dragging' : '')}
        style={fieldStyle}
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { setDragging(false); lastLitSongRef.current = ''; }}
        onKeyDown={onKeyDown}
        aria-label="A wordless Immigrant Union song field. Drag across the stars. A nearby song will brighten; release to open it. Use arrow keys and Enter on a keyboard."
      >
        <SpectrumCanvas point={point} active={dragging} />
        <span className="field-atmosphere" aria-hidden="true" />
        {spectrumReleases.map((song) => (
          <span
            key={song.id}
            className={'release-star song-star ' + (illuminated?.id === song.id ? 'is-near' : '')}
            style={{
              left: String(song.x * 100) + '%',
              top: String(song.y * 100) + '%',
            } as CSSProperties}
            aria-hidden="true"
          />
        ))}
      </button>

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
          <button ref={closeRef} className="discovery-close" type="button" onClick={closeDiscovery} aria-label="Return to the song field">×</button>
          <article className="record-reveal song-reveal">
            <p className="record-index"><span>PROJECT B-SIDE · UNOFFICIAL</span> · track {selected.trackNumber} · {selected.albumTitle}</p>
            <p className="record-coordinate">A song illuminated in the dark</p>
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
            <button className="return-action" type="button" onClick={closeDiscovery}>Return to the dark</button>
          </article>
        </section>
      ) : null}

      <p className="visually-hidden">An independent, unofficial discovery experience for Bandcamp. Listening and support remain on Bandcamp.</p>
      <p className="visually-hidden" role="status" aria-live="polite">{announcement}</p>
    </main>
  );
}
