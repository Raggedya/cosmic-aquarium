'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { validateBandcampUrl } from '@/src/adapters/bandcamp-link-adapter';
import { immigrantUnionAlbums } from '@/src/data/immigrant-union-catalogue';
import { spectrumReleases } from '@/src/data/spectrum-releases';
import { clampUnit, isUnknownZone, nearestSpectrumRelease, surpriseSpectrumRelease } from '@/src/discovery/spectrum';
import { readSpectrum, spectrumAnchors } from '@/src/discovery/spectrum-semantics';
import { SpectrumCanvas } from '@/src/features/spectrum/SpectrumCanvas';
import type { SpectrumRelease } from '@/src/types/spectrum';

type Point = { x: number; y: number };

const initialPoint: Point = { x: .5, y: .53 };

function pointDistance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function listeningEmbedUrl(trackId?: string) {
  if (!trackId || !/^\d+$/.test(trackId)) return null;
  return 'https://bandcamp.com/EmbeddedPlayer/track=' + trackId + '/size=large/bgcol=0b0b0d/linkcol=dfff70/tracklist=false/artwork=small/transparent=true/';
}

function albumColor(albumKey: string) {
  return immigrantUnionAlbums.find((album) => album.key === albumKey)?.color ?? '#ffffff';
}

export function SpectrumExperience() {
  const fieldRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const lastZoneRef = useRef('');
  const [point, setPoint] = useState<Point>(initialPoint);
  const [selectedPoint, setSelectedPoint] = useState<Point>(initialPoint);
  const [dragging, setDragging] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const [selected, setSelected] = useState<SpectrumRelease | null>(null);
  const [announcement, setAnnouncement] = useState('Any song is selected. Move through the catalogue and release to discover.');

  const unknown = isUnknownZone(point.x, point.y);
  const nearby = useMemo(() => nearestSpectrumRelease(spectrumReleases, point.x, point.y), [point]);
  const reading = useMemo(() => readSpectrum(point.x, point.y), [point]);
  const resolvedReading = useMemo(() => readSpectrum(selectedPoint.x, selectedPoint.y), [selectedPoint]);
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
    const zone = readSpectrum(next.x, next.y).label;
    if (zone !== lastZoneRef.current) {
      lastZoneRef.current = zone;
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(5);
    }
  }

  function discoverAt(target: Point, seed = Date.now()) {
    const song = isUnknownZone(target.x, target.y)
      ? surpriseSpectrumRelease(spectrumReleases, seed)
      : nearestSpectrumRelease(spectrumReleases, target.x, target.y);
    const targetReading = readSpectrum(target.x, target.y);
    setSelectedPoint(target);
    setSelected(song);
    setAnnouncement(song.title + ' by Immigrant Union. From ' + song.albumTitle + ', ' + song.year + '. Found in ' + targetReading.label + '.');
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate([12, 35, 8]);
  }

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const next = pointFromPointer(event);
    setInteracted(true);
    setDragging(true);
    setLivePoint(next);
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    if (dragging) setLivePoint(pointFromPointer(event));
  }

  function onPointerUp(event: PointerEvent<HTMLButtonElement>) {
    if (!dragging) return;
    const next = pointFromPointer(event);
    setLivePoint(next);
    setDragging(false);
    discoverAt(next, event.timeStamp);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const step = event.shiftKey ? .08 : .035;
    const movement: Record<string, Point> = {
      ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step },
    };
    if (movement[event.key]) {
      event.preventDefault();
      setInteracted(true);
      setLivePoint({
        x: clampUnit(point.x + movement[event.key].x),
        y: clampUnit(point.y + movement[event.key].y),
      });
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setInteracted(true);
      discoverAt(point);
    }
  }

  function closeDiscovery() {
    setSelected(null);
    window.setTimeout(() => fieldRef.current?.focus(), 0);
  }

  const fieldStyle = {
    '--pick-x': String(point.x * 100) + '%',
    '--pick-y': String(point.y * 100) + '%',
  } as CSSProperties;
  const revealStyle = {
    '--origin-x': String(selectedPoint.x * 100) + '%',
    '--origin-y': String(selectedPoint.y * 100) + '%',
    '--record-color': selected ? albumColor(selected.albumKey) : '#dfff70',
  } as CSSProperties;

  return (
    <main className={'spectrum-app artist-spectrum ' + (interacted ? 'has-interacted' : '')}>
      <button
        ref={fieldRef}
        className={'spectrum-field ' + (dragging ? 'is-dragging' : '')}
        style={fieldStyle}
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDragging(false)}
        onKeyDown={onKeyDown}
        aria-label={'Immigrant Union song spectrum. Current region: ' + reading.label + ', ' + reading.depthLabel + '. Drag or use arrow keys, then release or press Enter to discover a song.'}
      >
        <SpectrumCanvas point={point} active={dragging} />
        <span className="field-atmosphere" aria-hidden="true" />
        <span className="field-rings" aria-hidden="true" />
        {spectrumAnchors.map((label) => {
          const proximity = clampUnit(1 - pointDistance(point, label) / .42);
          return (
            <span
              key={label.name}
              className="field-label album-label"
              style={{
                left: String(label.x * 100) + '%',
                top: String(label.y * 100) + '%',
                '--proximity': proximity,
                '--anchor-color': label.color,
              } as CSSProperties}
            >
              <b>{label.name}</b><small>{label.year}</small>
            </span>
          );
        })}
        {spectrumReleases.map((song) => (
          <span
            key={song.id}
            className={'release-star song-star ' + (nearby.id === song.id && !unknown ? 'is-near' : '')}
            style={{
              left: String(song.x * 100) + '%',
              top: String(song.y * 100) + '%',
              '--star-color': albumColor(song.albumKey),
            } as CSSProperties}
            aria-hidden="true"
          />
        ))}
        <span className="unknown-core" aria-hidden="true"><i>?</i><small>any song</small></span>
        <span className="spectrum-lens" aria-hidden="true"><i /><b /></span>
      </button>

      <header className="spectrum-header">
        <a className="spectrum-brand" href="#spectrum" aria-label="Project B-Side home"><span>B</span><b>PROJECT B-SIDE</b></a>
        <span className="live-mark"><i /> unofficial study</span>
      </header>

      <section className="spectrum-intro" id="spectrum" aria-labelledby="spectrum-title">
        <p>Immigrant Union · complete Bandcamp song spectrum</p>
        <h1 id="spectrum-title">Every song.<em>One spectrum.</em></h1>
        <span>Four releases. Forty songs. Touch a star—or drift between eras.</span>
      </section>

      <div className="touch-reading" aria-hidden="true">
        <span>{reading.label}</span>
        <small><b>{reading.depthLabel}</b>{dragging ? 'release to hear it' : interacted ? 'touch somewhere else' : 'touch + drift'}</small>
      </div>

      <div className="gesture-rail" aria-hidden="true">
        <span>move</span><i /><span>cross eras</span><i /><span>release</span>
      </div>

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
          <button ref={closeRef} className="discovery-close" type="button" onClick={closeDiscovery} aria-label="Return to the song spectrum">×</button>
          <article className="record-reveal song-reveal">
            <p className="record-index"><span>Song found</span> · track {selected.trackNumber} · {selected.albumTitle}</p>
            <p className="record-coordinate">
              {resolvedReading.certainty === 0
                ? 'Catalogue wildcard · chosen from all eras'
                : resolvedReading.label + ' · ' + resolvedReading.depthLabel}
            </p>
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
            <button className="return-action" type="button" onClick={closeDiscovery}>Return to all forty songs</button>
          </article>
        </section>
      ) : null}

      <footer className="spectrum-footer">
        <span>40 songs · 4 releases · public Bandcamp catalogue</span>
        <span>Unofficial · listening and support stay on Bandcamp</span>
      </footer>
      <p className="visually-hidden" role="status" aria-live="polite">{announcement}</p>
    </main>
  );
}
