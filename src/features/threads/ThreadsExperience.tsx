'use client';

import { useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { validateBandcampUrl } from '@/src/adapters/bandcamp-link-adapter';
import { DemoDataAdapter } from '@/src/adapters/demo-data-adapter';
import { selectThreadSet } from '@/src/discovery/engine';
import type { DiscoveryRelationship, RelationshipKind, Release, TrailStep } from '@/src/types/discovery';

const adapter = new DemoDataAdapter();
const storageKey = 'project-b-side:demo-trail:v1';
const kindColor: Record<RelationshipKind, string> = { place: 'var(--place)', person: 'var(--person)', idea: 'var(--idea)' };

interface DragState { id: string; startY: number; pointerId: number; completed: boolean; }

function safeStoredTrail(): TrailStep[] {
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((step): step is TrailStep => Boolean(step) && typeof (step as TrailStep).releaseId === 'string').slice(-24);
  } catch { return []; }
}

export function ThreadsExperience() {
  const [started, setStarted] = useState(false);
  const [release, setRelease] = useState<Release | null>(null);
  const [threads, setThreads] = useState<DiscoveryRelationship[]>([]);
  const [trail, setTrail] = useState<TrailStep[]>([]);
  const [proof, setProof] = useState<DiscoveryRelationship | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [pull, setPull] = useState<{ id: string; progress: number } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const dragRef = useRef<DragState | null>(null);

  const visited = useMemo(() => trail.map((step) => step.releaseId), [trail]);
  const destination = release ? validateBandcampUrl(release.bandcampUrl) : null;

  async function loadRelease(nextRelease: Release, nextTrail: TrailStep[], nextProof: DiscoveryRelationship | null) {
    const outgoing = await adapter.getThreads(nextRelease.id, nextTrail.map((step) => step.releaseId));
    try { window.localStorage.setItem(storageKey, JSON.stringify(nextTrail)); }
    catch { setAnnouncement('This trail will not persist on this device.'); }
    setRelease(nextRelease);
    setThreads(selectThreadSet(outgoing));
    setTrail(nextTrail);
    setProof(nextProof);
  }

  async function begin() {
    setTransitioning(true);
    const stored = safeStoredTrail();
    const storedRelease = stored.length ? await adapter.getRelease(stored[stored.length - 1].releaseId) : null;
    const entry = storedRelease ?? await adapter.getEntry();
    const nextTrail = storedRelease ? stored : [{ releaseId: entry.id }];
    await loadRelease(entry, nextTrail, null);
    setStarted(true);
    setTransitioning(false);
    setAnnouncement(`A loose thread led to ${entry.title} by ${entry.artistName}.`);
  }

  async function followThread(relationship: DiscoveryRelationship) {
    if (transitioning) return;
    setTransitioning(true);
    setPull({ id: relationship.id, progress: 1 });
    setAnnouncement(`Pulling ${relationship.kind}: ${relationship.label}.`);
    const nextRelease = await adapter.getRelease(relationship.toReleaseId);
    window.setTimeout(async () => {
      if (nextRelease) {
        const nextTrail = [...trail, { releaseId: nextRelease.id, relationshipId: relationship.id, kind: relationship.kind }];
        await loadRelease(nextRelease, nextTrail, relationship);
        setAnnouncement(`${relationship.explanation} Now at ${nextRelease.title} by ${nextRelease.artistName}.`);
      } else setAnnouncement('That thread has gone slack. The current release is still here.');
      setPull(null);
      setTransitioning(false);
    }, 360);
  }

  function onPointerDown(event: PointerEvent<HTMLButtonElement>, relationship: DiscoveryRelationship) {
    if (transitioning) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { id: relationship.id, startY: event.clientY, pointerId: event.pointerId, completed: false };
    setPull({ id: relationship.id, progress: 0 });
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>, relationship: DiscoveryRelationship) {
    const drag = dragRef.current;
    if (!drag || drag.id !== relationship.id || drag.pointerId !== event.pointerId || drag.completed) return;
    const progress = Math.max(0, Math.min(1, (event.clientY - drag.startY) / 72));
    setPull({ id: relationship.id, progress });
    if (progress >= 1) { drag.completed = true; void followThread(relationship); }
  }

  function onPointerEnd(event: PointerEvent<HTMLButtonElement>, relationship: DiscoveryRelationship) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const completed = drag.completed;
    dragRef.current = null;
    if (!completed) {
      const progress = pull?.id === relationship.id ? pull.progress : 0;
      setPull(null);
      if (progress < .18) void followThread(relationship);
    }
  }

  async function resetTrail() {
    try { window.localStorage.removeItem(storageKey); } catch { /* session remains usable */ }
    const entry = await adapter.getEntry();
    await loadRelease(entry, [{ releaseId: entry.id }], null);
    setAnnouncement('Trail cleared. Back at the first loose thread.');
  }

  return (
    <main className="experience">
      <div className="ambient-thread" aria-hidden="true" />
      <header className="identity">
        <span className="wordmark">PROJECT B-SIDE</span>
        <span className="demo-pill">Synthetic demo</span>
      </header>

      {!started ? (
        <section className="landing" aria-labelledby="landing-title">
          <p className="landing-kicker">An independent discovery experience for Bandcamp</p>
          <h1 id="landing-title">Don&apos;t search. <em>Pull.</em></h1>
          <p className="landing-copy">Pull a human-authored thread from one record to the next, and watch your trail become a map back to Bandcamp.</p>
          <button className="primary-control" type="button" onClick={() => void begin()} disabled={transitioning}>
            {transitioning ? 'Finding a thread…' : 'Find a loose thread'}
          </button>
          <p className="landing-footnote">A research prototype using clearly fictional metadata. No Bandcamp catalogue, artwork or audio has been copied.</p>
        </section>
      ) : release ? (
        <section className="explorer" aria-label="Discovery trail">
          <ol className="trail-strip" aria-label={`${trail.length} releases in your trail`}>
            <li className="trail-label">Your trail · {trail.length}</li>
            {trail.map((step, index) => (
              <li className="trail-stitch" key={`${step.releaseId}-${index}`} title={step.releaseId}>
                <span className={`trail-dot ${step.kind ?? ''}`} aria-hidden="true" />
                <span className="visually-hidden">Step {index + 1}</span>
              </li>
            ))}
          </ol>

          <div className="object-stage">
            <div className={`release-object ${transitioning ? 'is-leaving' : ''}`} data-index={Math.max(1, visited.length)} style={{ '--accent': release.accent } as CSSProperties} aria-label={`Synthetic cover for ${release.title}`} role="img">
              <span className="release-glyph" aria-hidden="true">{release.glyph}</span>
            </div>

            <div className="release-details">
              <div className="release-copy">
                <p className="eyebrow">Fictional record · equal signal</p>
                <h1 tabIndex={-1}>{release.title}</h1>
                <p className="artist">{release.artistName}</p>
                <p className="metadata">{release.location} · {release.year} · {release.tags.join(' / ')}</p>
              </div>
              <div className="proof" style={{ '--proof-color': proof ? kindColor[proof.kind] : 'var(--line)' } as CSSProperties}>
                {proof ? <>
                  <p className="proof-label">Why these touch · {proof.kind}</p>
                  <p className="proof-text">{proof.explanation}<span className="proof-source">Asserted by {proof.assertedBy} · demo, not fact</span></p>
                </> : <>
                  <p className="proof-label">First signal</p>
                  <p className="proof-text">One record. Three possible reasons to leave it.</p>
                </>}
              </div>
            </div>
          </div>

          <div className="threads-panel">
            <p className="threads-prompt">Pull down or tap a reason</p>
            {threads.length ? <div className="threads">
              {threads.map((relationship) => {
                const progress = pull?.id === relationship.id ? pull.progress : 0;
                return <button
                  className={`thread ${relationship.kind}`}
                  type="button"
                  key={relationship.id}
                  disabled={transitioning}
                  style={{ '--pull': progress, transform: `translateY(${progress * 16}px)` } as CSSProperties}
                  onPointerDown={(event) => onPointerDown(event, relationship)}
                  onPointerMove={(event) => onPointerMove(event, relationship)}
                  onPointerUp={(event) => onPointerEnd(event, relationship)}
                  onPointerCancel={(event) => onPointerEnd(event, relationship)}
                  onClick={(event) => { if (event.detail === 0) void followThread(relationship); }}
                  aria-label={`Pull ${relationship.kind}: ${relationship.label}. ${relationship.explanation}`}
                >
                  <span className="thread-kind">{relationship.kind}</span>
                  <span className="thread-label">{relationship.label}</span>
                </button>;
              })}
            </div> : <p className="proof-text">This trail ends here. Retrace it or begin elsewhere.</p>}

            <div className="handoff-row">
              {destination ? <a className="bandcamp-link" href={destination.href} target="_blank" rel="noopener noreferrer" aria-label={`Support ${release.artistName} on Bandcamp (demo handoff opens Bandcamp home)`}>Support on Bandcamp ↗</a> : <span className="bandcamp-link" aria-disabled="true">Bandcamp destination unavailable</span>}
              <button className="trail-reset" type="button" onClick={() => void resetTrail()} aria-label="Clear this trail">Clear</button>
              <p className="handoff-note">Demo handoff opens Bandcamp&apos;s front door. Real, permissioned manifests use the exact artist or release page; follow, wishlist and purchase stay there.</p>
            </div>
          </div>
        </section>
      ) : null}
      <p className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
    </main>
  );
}
