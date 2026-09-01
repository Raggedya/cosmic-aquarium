'use client';

/* eslint-disable @next/next/no-img-element -- these pre-composited WebP layers are intentionally rendered without framework rewriting */

import { useEffect, useRef, useState, type CSSProperties } from 'react';

const serviceBase = 'https://cosmic-aquaria.andrewharris501.workers.dev';
const catalogueUrl = 'https://raggedya.github.io/cosmic-aquarium/aquariums.json';
type Water = 'anywhere' | 'heavy' | 'dreamy' | 'electronic' | 'quiet' | 'loud' | 'dark' | 'strange';
interface CatalogueEntry { id?: string; slug: string; url?: string; aquarium_url?: string; status?: string; waters?: string[] }

const bubbleLayout: Array<{ water: Water; x: number; y: number; size: number }> = [
  { water: 'heavy', x: 22, y: 28, size: 104 },
  { water: 'dreamy', x: 78, y: 28, size: 104 },
  { water: 'quiet', x: 13, y: 48, size: 98 },
  { water: 'anywhere', x: 50, y: 48, size: 212 },
  { water: 'electronic', x: 87, y: 48, size: 104 },
  { water: 'dark', x: 24, y: 69, size: 106 },
  { water: 'loud', x: 76, y: 69, size: 106 },
  { water: 'strange', x: 50, y: 79, size: 102 },
];

function secureRandomIndex(length: number) {
  if (length < 2) return 0;
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return Math.floor((values[0] / 0x100000000) * length);
}

export function UniverseDoorway() {
  const fieldRef = useRef<HTMLDivElement>(null);
  const sessionId = useRef('');
  const [entering, setEntering] = useState<Water | null>(null);
  const [announcement, setAnnouncement] = useState('Choose a water, or drift anywhere.');

  useEffect(() => {
    const key = 'cosmic-aquaria:session';
    sessionId.current = sessionStorage.getItem(key) || crypto.randomUUID();
    sessionStorage.setItem(key, sessionId.current);
    recordEvent('doorway_open');
  }, []);

  useEffect(() => {
    const field = fieldRef.current;
    if (!field || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const nodes = [...field.querySelectorAll<HTMLButtonElement>('.doorway-bubble')];
    const bodies = nodes.map((node, index) => ({
      node,
      x: 0,
      y: 0,
      vx: Math.sin(index * 2.31) * .018,
      vy: Math.cos(index * 1.73) * .014,
      phase: index * 1.41,
      radius: node.offsetWidth * .43,
      centreX: 0,
      centreY: 0,
      anchor: node.dataset.water === 'anywhere',
    }));
    const measure = () => {
      const fieldRect = field.getBoundingClientRect();
      bodies.forEach((body) => {
        const rect = body.node.getBoundingClientRect();
        body.centreX = rect.left + rect.width / 2 - fieldRect.left - body.x;
        body.centreY = rect.top + rect.height / 2 - fieldRect.top - body.y;
        body.radius = rect.width * .43;
      });
    };
    measure();
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(2, Math.max(.5, (now - previous) / 16.67));
      previous = now;
      bodies.forEach((body, index) => {
        const spring = body.anchor ? .0018 : .0008;
        const amplitude = body.anchor ? .0008 : .0018;
        body.vx += (Math.sin(now * .00023 + body.phase) * amplitude - body.x * spring) * dt;
        body.vy += (Math.cos(now * .00019 + body.phase * 1.7) * amplitude - body.y * spring) * dt;
        body.vx *= Math.pow(.986, dt);
        body.vy *= Math.pow(.986, dt);
        const limit = body.anchor ? 2.5 : 8;
        body.x = Math.max(-limit, Math.min(limit, body.x + body.vx * dt));
        body.y = Math.max(-limit, Math.min(limit, body.y + body.vy * dt));
        for (let otherIndex = index + 1; otherIndex < bodies.length; otherIndex += 1) {
          const other = bodies[otherIndex];
          const dx = (other.centreX + other.x) - (body.centreX + body.x);
          const dy = (other.centreY + other.y) - (body.centreY + body.y);
          const distance = Math.max(1, Math.hypot(dx, dy));
          const overlap = body.radius + other.radius + 3 - distance;
          if (overlap <= 0) continue;
          const pressure = Math.min(.012, overlap * .00045);
          const nx = dx / distance;
          const ny = dy / distance;
          body.vx -= nx * pressure;
          body.vy -= ny * pressure;
          other.vx += nx * pressure;
          other.vy += ny * pressure;
        }
        body.node.style.setProperty('--drift-x', body.x.toFixed(2) + 'px');
        body.node.style.setProperty('--drift-y', body.y.toFixed(2) + 'px');
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    window.addEventListener('resize', measure, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
    };
  }, []);

  function recordEvent(eventType: string, details: Record<string, unknown> = {}) {
    const body = JSON.stringify({ eventType, aquariumId: 'universe-doorway', sessionId: sessionId.current || 'doorway-' + Date.now(), ...details });
    try {
      if (navigator.sendBeacon) navigator.sendBeacon(serviceBase + '/api/events', new Blob([body], { type: 'application/json' }));
      else void fetch(serviceBase + '/api/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true });
    } catch {
      // Discovery never waits for analytics.
    }
  }

  async function chooseWater(water: Water) {
    if (entering) return;
    setEntering(water);
    setAnnouncement(water === 'anywhere' ? 'Drifting anywhere.' : 'Entering ' + water + ' waters.');
    if (navigator.vibrate) navigator.vibrate(9);
    sessionStorage.setItem('cosmic-aquaria:water-scope', water);
    recordEvent(water === 'anywhere' ? 'drift_anywhere_selected' : 'water_selected', { metadata: { water } });
    const recentKey = 'cosmic-aquaria:recent-aquariums';
    let recent: string[] = [];
    try { recent = JSON.parse(sessionStorage.getItem(recentKey) || '[]'); } catch { recent = []; }
    let destination: { id?: string; slug: string; url?: string; aquarium_url?: string } | null = null;
    const query = new URLSearchParams({ water, recent: recent.slice(0, 8).join(',') });
    const response = await fetch(serviceBase + '/api/aquariums/random?' + query, { cache: 'no-store' }).catch(() => null);
    if (response?.ok) destination = await response.json();
    if (!destination) {
      const catalogueResponse = await fetch(catalogueUrl, { cache: 'no-store' }).catch(() => null);
      if (catalogueResponse?.ok) {
        const catalogue = await catalogueResponse.json() as { aquariums?: CatalogueEntry[] };
        const eligible = (catalogue.aquariums || []).filter((item) =>
          item.status === 'published' && item.slug && !recent.includes(item.slug) && (water === 'anywhere' || item.waters?.includes(water))
        );
        const fallback = eligible.length ? eligible : (catalogue.aquariums || []).filter((item) => item.status === 'published' && item.slug && !recent.includes(item.slug));
        if (fallback.length) destination = fallback[secureRandomIndex(fallback.length)];
      }
    }
    if (!destination) {
      setEntering(null);
      setAnnouncement('The water is still. Please touch another world.');
      return;
    }
    const destinationId = destination.id || destination.slug;
    sessionStorage.setItem(recentKey, JSON.stringify([destination.slug, ...recent].filter((value, index, all) => all.indexOf(value) === index).slice(0, 8)));
    recordEvent('random_destination_selected', { destinationAquariumId: destinationId, metadata: { water } });
    recordEvent('doorway_to_aquarium_transition', { destinationAquariumId: destinationId, metadata: { water } });
    const target = destination.aquarium_url || destination.url || ('https://raggedya.github.io/cosmic-aquarium/' + encodeURIComponent(destination.slug) + '/');
    const targetUrl = new URL(target);
    targetUrl.searchParams.set('water', water);
    targetUrl.searchParams.set('source', 'doorway');
    window.setTimeout(() => window.location.assign(targetUrl.href), 260);
  }

  return (
    <main className={'universe-doorway' + (entering ? ' is-entering' : '')} aria-label="Enter the Cosmic Aquaria universe">
      <img className="doorway-background" src="/doorway/cosmic-depth.webp" alt="" aria-hidden="true" />
      <div className="doorway-nebula" aria-hidden="true" />
      <img className="doorway-botanicals doorway-botanicals--crown" src="/doorway/botanical-crown.webp" alt="" aria-hidden="true" />
      <img className="doorway-botanicals doorway-botanicals--garden" src="/doorway/botanical-garden.webp" alt="" aria-hidden="true" />
      <header className="doorway-title">
        <span className="doorway-mark" aria-hidden="true"><i /></span>
        <h1>COSMIC<br />AQUARIA</h1>
        <p>ENTER WITHOUT KNOWING.</p>
      </header>
      <div className="doorway-field" ref={fieldRef}>
        {bubbleLayout.map((bubble) => (
          <button
            key={bubble.water}
            type="button"
            className={'doorway-bubble doorway-bubble--' + bubble.water + (entering === bubble.water ? ' is-selected' : '')}
            data-water={bubble.water}
            aria-label={bubble.water === 'anywhere' ? 'Drift anywhere into a random published Aquarium' : 'Drift into a random ' + bubble.water + ' Aquarium'}
            onClick={() => void chooseWater(bubble.water)}
            style={{ '--home-x': bubble.x + '%', '--home-y': bubble.y + '%', '--bubble-size': bubble.size + 'px' } as CSSProperties}
          >
            <img className="doorway-bubble__world" src={'/doorway/world-' + bubble.water + '.webp'} alt="" aria-hidden="true" draggable="false" />
            <span className="doorway-bubble__label">{bubble.water === 'anywhere' ? <>DRIFT<br />ANYWHERE</> : bubble.water.toUpperCase()}</span>
            {bubble.water === 'anywhere' ? <i aria-hidden="true">→</i> : null}
          </button>
        ))}
      </div>
      <footer className="doorway-footer">
        <span>TOUCH SOMETHING</span>
        <p>Let the Music find you</p>
      </footer>
      <p className="visually-hidden" role="status" aria-live="polite">{announcement}</p>
    </main>
  );
}
