'use client';

/* eslint-disable @next/next/no-img-element -- collection objects reuse the established transparent flower assets */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { nextVisibleMembers, publishableMembers, shuffledMemberDeck } from '@/src/collections/model';
import type { ArtistCollection, CollectionMember } from '@/src/types/collection';

const flowers = ['/flowers/anemone.png', '/flowers/cosmos.png', '/flowers/poppy.png'];
const waters = ['heavy', 'dreamy', 'quiet', 'electronic', 'dark', 'loud', 'strange'] as const;

function secureRandom() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] / 0x100000000;
}

export function CollectionAquarium({ collectionSlug }: { collectionSlug: string }) {
  const [collection, setCollection] = useState<ArtistCollection | null>(null);
  const [visible, setVisible] = useState<CollectionMember[]>([]);
  const [selected, setSelected] = useState<CollectionMember | null>(null);
  const [activeWater, setActiveWater] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('Touch an unknown artist object.');
  const deck = useRef<CollectionMember[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetch('https://raggedya.github.io/cosmic-aquarium/collections/' + encodeURIComponent(collectionSlug) + '.json', { cache: 'no-store', signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Collection unavailable');
        return response.json() as Promise<ArtistCollection>;
      })
      .then((next) => {
        const members = publishableMembers(next);
        deck.current = shuffledMemberDeck(members, secureRandom);
        setCollection(next);
        setActiveWater(next.type === 'location' ? null : 'anywhere');
        setVisible(next.type === 'location' ? [] : nextVisibleMembers(deck.current, matchMedia('(max-width: 430px)').matches ? 10 : 14));
        setAnnouncement(`${next.name}. ${members.length} artists are waiting to be discovered.`);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setAnnouncement('This collection is not available just now.');
      });
    return () => controller.abort();
  }, [collectionSlug]);

  const positions = useMemo(() => visible.map((_, index) => ({
    left: `${10 + ((index * 37) % 80)}%`,
    top: `${18 + ((index * 23) % 64)}%`,
    animationDelay: `${-(index * 2.7)}s`,
    animationDuration: `${24 + (index % 5) * 3}s`,
    '--object-scale': String(.66 + (index % 4) * .11),
  })), [visible]);

  function chooseWater(water: string) {
    if (!collection) return;
    const members = publishableMembers(collection).filter((member) => water === 'anywhere' || [...(member.waters ?? []), ...(member.styles ?? [])].map((value) => value.toLowerCase()).includes(water));
    if (!members.length) return;
    deck.current = shuffledMemberDeck(members, secureRandom);
    setVisible(nextVisibleMembers(deck.current, matchMedia('(max-width: 430px)').matches ? 10 : 14));
    setActiveWater(water);
    setAnnouncement(`${collection.name}. Drifting through ${water === 'anywhere' ? 'all artists' : water}.`);
  }

  function reveal(member: CollectionMember) {
    setSelected(member);
    setAnnouncement(`You found ${member.artistName}. Enter their Aquarium.`);
    navigator.vibrate?.(9);
  }

  function enterArtist() {
    if (!selected) return;
    const target = new URL(selected.aquariumUrl, window.location.href);
    target.searchParams.set('source', 'collection');
    target.searchParams.set('parent', `/collections/${collectionSlug}/`);
    window.location.assign(target.href);
  }

  return (
    <main className="collection-aquarium" data-theme={collection?.theme ?? 'location'} aria-label={collection ? `${collection.name} artist Aquarium` : 'Artist collection Aquarium'}>
      <div className="collection-atmosphere" aria-hidden="true"><i /><i /><i /><i /></div>
      <header className="collection-title">
        <Link className="collection-home" href="/" aria-label="Return to Cosmic Aquaria home"><span aria-hidden="true">✦</span></Link>
        <h1>{collection?.name ?? 'COSMIC AQUARIA'}</h1>
        <p>{activeWater && activeWater !== 'anywhere' ? `${activeWater.toUpperCase()} · TOUCH AN ARTIST` : collection?.instruction ?? 'TOUCH AN ARTIST'}</p>
      </header>
      {collection?.type === 'location' && activeWater === null ? (
        <section className="collection-portals" aria-label="Choose how to drift through this location">
          {[{id: 'anywhere', label: collection.location?.city ?? collection.name, hero: true}, ...waters.map((water) => ({id: water, label: water.toUpperCase(), hero: false}))].map((choice) => {
            const available = choice.hero || publishableMembers(collection).some((member) => [...(member.waters ?? []), ...(member.styles ?? [])].map((value) => value.toLowerCase()).includes(choice.id));
            return <button key={choice.id} type="button" disabled={!available} className={`collection-portal ${choice.hero ? 'collection-portal-main' : `collection-portal-${choice.id}`}`} onClick={() => chooseWater(choice.id)} aria-label={`Discover ${choice.hero ? 'any' : choice.label} artists from ${collection.name}`}><img src={`/doorway/world-${choice.hero ? 'anywhere' : choice.id}.webp`} alt="" /><span>{choice.label}</span></button>;
          })}
        </section>
      ) : null}
      <div className="collection-field" hidden={collection?.type === 'location' && activeWater === null} aria-label="Unknown artist objects">
        {visible.map((member, index) => (
          <button key={member.artistId} type="button" className="collection-object" style={positions[index] as CSSProperties} onClick={() => reveal(member)} aria-label="Discover this unknown artist">
            <img src={flowers[index % flowers.length]} alt="" draggable="false" />
          </button>
        ))}
      </div>
      {selected ? (
        <section className="collection-reveal" aria-live="polite">
          <p>YOU FOUND</p><h2>{selected.artistName}</h2>
          {collection?.type === 'location' ? <span>{collection.name}</span> : null}
          <button type="button" onClick={enterArtist}>ENTER AQUARIUM</button>
          <button type="button" className="collection-release" onClick={() => setSelected(null)}>RELEASE</button>
        </section>
      ) : null}
      <p className="visually-hidden" role="status" aria-live="polite">{announcement}</p>
    </main>
  );
}
