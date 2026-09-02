import type { ArtistCollection, CollectionMember, VerificationStatus } from '@/src/types/collection';

const publishableVerification = new Set<VerificationStatus>(['verified', 'high_confidence']);

export function normalizeBandcampArtistUrl(value: string) {
  const parsed = new URL(value.trim());
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('Bandcamp URL must be public HTTPS.');
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'bandcamp.com' || !host.endsWith('.bandcamp.com')) throw new Error('A Bandcamp artist subdomain is required.');
  return `https://${host}/`;
}

export function canonicalArtistId(value: string) {
  const host = new URL(normalizeBandcampArtistUrl(value)).hostname;
  return `bandcamp:${host.slice(0, -'.bandcamp.com'.length)}`;
}

export function publishableMembers(collection: ArtistCollection) {
  const seen = new Set<string>();
  return collection.members.filter((member) => {
    if (!member.displayEnabled || !publishableVerification.has(member.verificationStatus)) return false;
    if (!member.artistId || !member.aquariumSlug || seen.has(member.artistId)) return false;
    seen.add(member.artistId);
    return true;
  });
}

export function shuffledMemberDeck(members: CollectionMember[], random: () => number = Math.random) {
  const deck = [...members];
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.max(0, Math.min(.999999999, random())) * (index + 1));
    [deck[index], deck[swap]] = [deck[swap], deck[index]];
  }
  return deck;
}

export function nextVisibleMembers(deck: CollectionMember[], count = 10, recent: string[] = []) {
  const recentIds = new Set(recent);
  const fresh = deck.filter((member) => !recentIds.has(member.artistId));
  const fallback = fresh.length ? fresh : deck;
  return fallback.slice(0, Math.max(1, Math.min(14, count)));
}

export function isSafeCollectionParent(value: string, currentOrigin: string) {
  try {
    const url = new URL(value, currentOrigin);
    if (url.origin !== currentOrigin) return null;
    if (!/^\/collections\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(url.pathname)) return null;
    return url.pathname + url.search;
  } catch {
    return null;
  }
}
