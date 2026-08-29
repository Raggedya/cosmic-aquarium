'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { validateBandcampUrl } from '@/src/adapters/bandcamp-link-adapter';
import { spectrumReleases } from '@/src/data/spectrum-releases';
import { clampUnit, isUnknownZone, nearestSpectrumRelease, surpriseSpectrumRelease } from '@/src/discovery/spectrum';
import type { SpectrumRelease } from '@/src/types/spectrum';

type Point = { x: number; y: number };
type RegionLabel = { name: string; x: number; y: number };

const initialPoint: Point = { x: .5, y: .53 };
const regionLabels: RegionLabel[] = [
  { name: 'synth', x: .18, y: .14 },
  { name: 'punk', x: .84, y: .23 },
  { name: 'metal', x: .88, y: .61 },
  { name: 'folk', x: .70, y: .85 },
  { name: 'jazz', x: .39, y: .87 },
  { name: 'ambient', x: .14, y: .72 },
  { name: 'electronic', x: .08, y: .43 },
];

function pointDistance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
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
  const [announcement, setAnnouncement] = useState('The unknown is selected. Move through the spectrum and release to discover.');

  const unknown = isUnknownZone(point.x, point.y);
  const nearby = useMemo(() => nearestSpectrumRelease(spectrumReleases, point.x, point.y), [point]);
  const destination = selected ? validateBandcampUrl(selected.bandcampUrl) : null;

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
    const zone = isUnknownZone(next.x, next.y)
      ? 'the unknown'
      : nearestSpectrumRelease(spectrumReleases, next.x, next.y).zone;
    if (zone !== lastZoneRef.current) {
      lastZoneRef.current = zone;
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(5);
    }
  }

  function discoverAt(target: Point, seed = Date.now()) {
    const release = isUnknownZone(target.x, target.y)
      ? surpriseSpectrumRelease(spectrumReleases, seed)
      : nearestSpectrumRelease(spectrumReleases, target.x, target.y);
    setSelectedPoint(target);
    setSelected(release);
    setAnnouncement(`${release.title} by ${release.artist}. ${release.zone}.`);
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
    '--pick-x': `${point.x * 100}%`,
    '--pick-y': `${point.y * 100}%`,
  } as CSSProperties;
  const revealStyle = {
    '--origin-x': `${selectedPoint.x * 100}%`,
    '--origin-y': `${selectedPoint.y * 100}%`,
  } as CSSProperties;

  return (
    <main className={`spectrum-app ${interacted ? 'has-interacted' : ''}`}>
      <button
        ref={fieldRef}
        className={`spectrum-field ${dragging ? 'is-dragging' : ''}`}
        style={fieldStyle}
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDragging(false)}
        onKeyDown={onKeyDown}
        aria-label={`Full-screen music spectrum. Current region: ${unknown ? 'the unknown' : nearby.zone}. Drag or use arrow keys, then release or press Enter to discover.`}
      >
        <span className="field-atmosphere" aria-hidden="true" />
        <span className="field-rings" aria-hidden="true" />
        {regionLabels.map((label) => {
          const proximity = clampUnit(1 - pointDistance(point, label) / .44);
          return (
            <span
              key={label.name}
              className="field-label"
              style={{
                left: `${label.x * 100}%`,
                top: `${label.y * 100}%`,
                '--proximity': proximity,
              } as CSSProperties}
            >
              {label.name}
            </span>
          );
        })}
        {spectrumReleases.map((release) => (
          <span
            key={release.id}
            className={`release-star ${nearby.id === release.id && !unknown ? 'is-near' : ''}`}
            style={{ left: `${release.x * 100}%`, top: `${release.y * 100}%` }}
            aria-hidden="true"
          />
        ))}
        <span className="unknown-core" aria-hidden="true"><i>?</i><small>no map</small></span>
        <span className="spectrum-lens" aria-hidden="true"><i /><b /></span>
      </button>

      <header className="spectrum-header">
        <a className="spectrum-brand" href="#spectrum" aria-label="Project B-Side home"><span>B</span><b>PROJECT B-SIDE</b></a>
        <span className="live-mark"><i /> live curation</span>
      </header>

      <section className="spectrum-intro" id="spectrum" aria-labelledby="spectrum-title">
        <p>An independent discovery experience for Bandcamp</p>
        <h1 id="spectrum-title">Touch the <em>spectrum.</em></h1>
        <span>Move through colour. Release to find one record.</span>
      </section>

      <div className="touch-reading" aria-hidden="true">
        <span>{unknown ? 'THE UNKNOWN' : nearby.zone}</span>
        <small>{dragging ? 'release to discover' : interacted ? 'touch somewhere else' : 'touch + drift'}</small>
      </div>

      <div className="gesture-rail" aria-hidden="true">
        <span>move</span><i /><span>hold</span><i /><span>release</span>
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
          <span className="origin-signal" aria-hidden="true" />
          <button ref={closeRef} className="discovery-close" type="button" onClick={closeDiscovery} aria-label="Return to the spectrum">×</button>
          <div className="record-reveal">
            <p className="record-index">A record from <span>{selected.zone}</span></p>
            <h2 id="discovery-title">{selected.title}</h2>
            <p className="record-artist">{selected.artist} <span>· {selected.year}</span></p>
            <p className="record-note">{selected.note}</p>
            {destination ? (
              <a className="bandcamp-action" href={destination.href} target="_blank" rel="noopener noreferrer">
                <span>Listen / support</span><b>Bandcamp ↗</b>
              </a>
            ) : null}
            <button className="return-action" type="button" onClick={closeDiscovery}>Return to the spectrum</button>
          </div>
        </section>
      ) : null}

      <footer className="spectrum-footer">
        <span>Real releases · human placement</span>
        <span>Listening and commerce stay on Bandcamp</span>
      </footer>
      <p className="visually-hidden" role="status" aria-live="polite">{announcement}</p>
    </main>
  );
}
