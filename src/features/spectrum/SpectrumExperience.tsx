'use client';

import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { validateBandcampUrl } from '@/src/adapters/bandcamp-link-adapter';
import { spectrumReleases } from '@/src/data/spectrum-releases';
import { clampUnit, isUnknownZone, nearestSpectrumRelease, surpriseSpectrumRelease } from '@/src/discovery/spectrum';
import type { SpectrumRelease } from '@/src/types/spectrum';

type Point = { x: number; y: number };
const initialPoint: Point = { x: .5, y: .5 };

export function SpectrumExperience() {
  const fieldRef = useRef<HTMLButtonElement | null>(null);
  const [point, setPoint] = useState<Point>(initialPoint);
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState<SpectrumRelease | null>(null);
  const [announcement, setAnnouncement] = useState('The unknown is selected. Move through the spectrum and release to discover.');

  const unknown = isUnknownZone(point.x, point.y);
  const nearby = useMemo(() => nearestSpectrumRelease(spectrumReleases, point.x, point.y), [point]);
  const destination = selected ? validateBandcampUrl(selected.bandcampUrl) : null;

  function pointFromPointer(event: PointerEvent<HTMLButtonElement>): Point {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: clampUnit((event.clientX - bounds.left) / bounds.width),
      y: clampUnit((event.clientY - bounds.top) / bounds.height),
    };
  }

  function discoverAt(target: Point, seed = Date.now()) {
    const release = isUnknownZone(target.x, target.y)
      ? surpriseSpectrumRelease(spectrumReleases, seed)
      : nearestSpectrumRelease(spectrumReleases, target.x, target.y);
    setSelected(release);
    setAnnouncement(`${release.title} by ${release.artist}. ${release.zone}.`);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(12);
  }

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const next = pointFromPointer(event);
    setDragging(true);
    setSelected(null);
    setPoint(next);
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    if (!dragging) return;
    setPoint(pointFromPointer(event));
  }

  function onPointerUp(event: PointerEvent<HTMLButtonElement>) {
    if (!dragging) return;
    const next = pointFromPointer(event);
    setPoint(next);
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
      setSelected(null);
      setPoint((current) => ({
        x: clampUnit(current.x + movement[event.key].x),
        y: clampUnit(current.y + movement[event.key].y),
      }));
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      discoverAt(point);
    }
  }

  const fieldStyle = {
    '--pick-x': `${point.x * 100}%`,
    '--pick-y': `${point.y * 100}%`,
  } as CSSProperties;

  return (
    <main className="spectrum-app">
      <header className="spectrum-header">
        <a className="spectrum-brand" href="#top" aria-label="Project B-Side home"><span>B</span> PROJECT B-SIDE</a>
        <span className="mvp-badge">MVP · real releases</span>
      </header>

      <section className="spectrum-shell" id="top" aria-labelledby="spectrum-title">
        <div className="spectrum-intro">
          <p className="spectrum-kicker">An independent discovery experience for Bandcamp</p>
          <h1 id="spectrum-title">Find where your <em>ears</em> are.</h1>
          <p>Touch a colour. Drift between sounds. Release your finger to uncover one record.</p>
        </div>

        <div className="field-column">
          <div className="field-readout" aria-hidden="true">
            <span>{unknown ? 'THE UNKNOWN' : nearby.zone}</span>
            <span>{dragging ? 'release to discover' : 'touch + drift'}</span>
          </div>

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
            aria-label={`Music spectrum. Current region: ${unknown ? 'the unknown' : nearby.zone}. Drag or use arrow keys, then release or press Enter to discover.`}
          >
            <span className="field-label label-synth">synth</span>
            <span className="field-label label-punk">punk</span>
            <span className="field-label label-metal">metal</span>
            <span className="field-label label-folk">folk</span>
            <span className="field-label label-jazz">jazz</span>
            <span className="field-label label-electronic">electronic</span>
            <span className="field-label label-ambient">ambient</span>
            {spectrumReleases.map((release) => (
              <span key={release.id} className="release-star" style={{ left: `${release.x * 100}%`, top: `${release.y * 100}%` }} aria-hidden="true" />
            ))}
            <span className="unknown-label" aria-hidden="true">?</span>
            <span className="spectrum-picker" aria-hidden="true"><i /></span>
          </button>
          <p className="field-help">Arrow keys work too · Enter opens the selected region</p>
        </div>

        <aside className={`discovery-sheet ${selected ? 'is-open' : ''}`} aria-live="polite" aria-label="Your discovery">
          {selected ? <>
            <button className="sheet-close" type="button" onClick={() => { setSelected(null); fieldRef.current?.focus(); }} aria-label="Close this discovery">×</button>
            <p className="sheet-zone">You touched · {selected.zone}</p>
            <h2>{selected.title}</h2>
            <p className="sheet-artist">{selected.artist} <span>· {selected.year}</span></p>
            <p className="sheet-note">{selected.note}</p>
            {destination ? <a className="bandcamp-action" href={destination.href} target="_blank" rel="noopener noreferrer">Listen / support on Bandcamp <span>↗</span></a> : null}
            <button className="explore-again" type="button" onClick={() => { setSelected(null); fieldRef.current?.focus(); }}>Keep exploring</button>
          </> : <div className="sheet-empty">
            <span>01</span>
            <p>The closer you move to the black centre, the less control you keep.</p>
          </div>}
        </aside>
      </section>

      <footer className="spectrum-footer">Curated from published Bandcamp tags and release notes. No catalogue scraping. Bandcamp remains the destination for listening, following and buying.</footer>
      <p className="visually-hidden" role="status" aria-live="polite">{announcement}</p>
    </main>
  );
}
