export const CATEGORIES = Object.freeze(['heavy','dreamy','quiet','electronic','dark','loud','strange','anything']);
export const FILTER_CATEGORIES = Object.freeze(CATEGORIES.filter(category => category !== 'anything'));
export const GO_HOLD_MS = 1500;
export const DESTRUCTION_MS = 900;
export const SESSION_HISTORY_LIMIT = 20;

export const CRACK_VARIANTS = Object.freeze({
  heavy: ['M49 48L13 10','M49 48L8 51','M49 48L23 91','M49 48L77 12','M49 48L94 58','M49 48L72 94','M31 27L38 45L20 60','M70 29L62 47L88 42'],
  dreamy: ['M57 43L27 5','M57 43L11 33','M57 43L20 79','M57 43L53 97','M57 43L83 81','M57 43L96 35','M35 18L42 41L18 49','M75 67L66 46L91 55'],
  quiet: ['M40 55L5 25','M40 55L6 70','M40 55L35 96','M40 55L68 91','M40 55L93 64','M40 55L85 19','M21 39L43 45L33 14','M68 43L53 57L76 76'],
  electronic: ['M61 51L21 7','M61 51L9 40','M61 51L17 87','M61 51L58 98','M61 51L89 84','M61 51L96 43','M39 29L53 49L28 60','M75 24L66 48L90 62'],
  dark: ['M37 42L8 9','M37 42L4 48','M37 42L19 88','M37 42L55 97','M37 42L92 76','M37 42L94 28','M19 23L34 45L9 64','M65 53L40 42L71 18'],
  loud: ['M66 57L30 4','M66 57L7 29','M66 57L8 76','M66 57L43 96','M66 57L89 92','M66 57L98 48','M45 31L59 55L35 70','M83 27L69 54L94 65'],
  strange: ['M44 37L16 4','M44 37L5 38','M44 37L11 83','M44 37L47 98','M44 37L82 90','M44 37L98 55','M27 19L40 40L13 58','M73 18L55 40L89 43'],
  anything: ['M53 61L20 4','M53 61L4 30','M53 61L9 78','M53 61L34 98','M53 61L85 94','M53 61L99 52','M31 31L50 59L21 71','M80 23L59 57L96 73'],
  go: ['M50 49L8 8','M50 49L2 46','M50 49L18 94','M50 49L50 99','M50 49L84 92','M50 49L98 54','M50 49L88 12','M29 27L45 48L17 63','M71 29L58 48L91 45'],
});

export function nextSelection(current, category) {
  if (!CATEGORIES.includes(category)) return new Set(current);
  const next = new Set(current);
  if (category === 'anything') return next.has('anything') ? new Set() : new Set(['anything']);
  next.delete('anything');
  if (next.has(category)) next.delete(category);
  else next.add(category);
  return next;
}

export function normalizeSelection(values) {
  const valid = [...new Set(values)].filter(value => CATEGORIES.includes(value));
  return valid.includes('anything') ? ['anything'] : FILTER_CATEGORIES.filter(value => valid.includes(value));
}

export function eligibleReleases(catalogue, selection, recent = []) {
  const selected = normalizeSelection(selection);
  if (!selected.length) return [];
  const recentSet = new Set(recent);
  const all = catalogue.filter(entry => entry && entry.slug && entry.status === 'published' && entry.bandcampUrl);
  const inScope = selected.includes('anything') ? all : all.filter(entry => selected.some(category => (entry.waters || []).includes(category)));
  const fresh = inScope.filter(entry => !recentSet.has(entry.slug));
  return fresh.length ? fresh : inScope;
}

export function secureRandomIndex(length, cryptoApi = globalThis.crypto) {
  if (!Number.isInteger(length) || length <= 0) return -1;
  if (cryptoApi?.getRandomValues) {
    const ceiling = 0x100000000 - (0x100000000 % length);
    const value = new Uint32Array(1);
    do cryptoApi.getRandomValues(value); while (value[0] >= ceiling);
    return value[0] % length;
  }
  return Math.floor(Math.random() * length);
}

export function chooseRelease(catalogue, selection, recent = [], cryptoApi = globalThis.crypto) {
  const pool = eligibleReleases(catalogue, selection, recent);
  return pool[secureRandomIndex(pool.length, cryptoApi)] || null;
}

export function pushHistory(history, slug, limit = SESSION_HISTORY_LIMIT) {
  return [slug, ...history].filter((value, index, all) => value && all.indexOf(value) === index).slice(0, limit);
}

export function buildShareUrl(origin, base, slug, selection) {
  const url = new URL(`${base.replace(/\/$/,'')}/`, origin);
  url.searchParams.set('release', slug);
  const categories = normalizeSelection(selection);
  if (categories.length) url.searchParams.set('categories', categories.join(','));
  return url.toString();
}

export function buildTickerFacts(manifest, registryEntry = {}, artistEntry = {}) {
  const facts = [];
  if (artistEntry.primaryLocation) facts.push(String(artistEntry.primaryLocation).toUpperCase());
  const waters = (registryEntry.waters || manifest.waters || []).map(value => String(value).toUpperCase());
  if (waters.length) facts.push(waters.join(' + '));
  if (manifest.releaseDate) {
    const date = new Date(manifest.releaseDate);
    if (!Number.isNaN(date.valueOf())) facts.push(`RELEASED ${date.toLocaleDateString('en-AU',{month:'short',year:'numeric'}).toUpperCase()}`);
  }
  if (artistEntry.labels?.length) facts.push(String(artistEntry.labels[0]).toUpperCase());
  facts.push('SUPPORT THE ARTIST');
  return [...new Set(facts)].join('  •  ');
}

export function validBandcampUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./,'');
    return url.protocol === 'https:' && (host === 'bandcamp.com' || host.endsWith('.bandcamp.com')) && !url.username && !url.password ? url.toString() : null;
  } catch { return null; }
}

export function pickPlayableTrack(manifest, cryptoApi = globalThis.crypto) {
  const tracks = (manifest?.tracks || []).filter(track => /^\d+$/.test(String(track.bandcampEmbedTrackId || '')) && validBandcampUrl(track.bandcampUrl));
  return tracks[secureRandomIndex(tracks.length, cryptoApi)] || null;
}
