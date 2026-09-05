export const CATEGORIES = Object.freeze(['heavy','dreamy','quiet','electronic','dark','loud','strange','anything']);
export const FILTER_CATEGORIES = Object.freeze(CATEGORIES.filter(category => category !== 'anything'));
export const GO_HOLD_MS = 1500;
export const DESTRUCTION_MS = 900;
export const SESSION_HISTORY_LIMIT = 20;

export const CRACK_VARIANTS = Object.freeze({
  heavy: ['M49 48L13 10','M49 48L8 51','M49 48L23 91','M49 48L77 12','M49 48L94 58','M49 48L72 94','M31 27L38 45L20 60','M70 29L62 47L88 42','M13 10L27 18L19 31','M8 51L24 57L15 72','M77 12L70 28L86 36','M72 94L62 76L84 81'],
  dreamy: ['M57 43L27 5','M57 43L11 33','M57 43L20 79','M57 43L53 97','M57 43L83 81','M57 43L96 35','M35 18L42 41L18 49','M75 67L66 46L91 55','M27 5L39 17L29 30','M11 33L26 40L14 54','M83 81L71 69L90 63','M96 35L80 39L87 21'],
  quiet: ['M40 55L5 25','M40 55L6 70','M40 55L35 96','M40 55L68 91','M40 55L93 64','M40 55L85 19','M21 39L43 45L33 14','M68 43L53 57L76 76','M5 25L19 31L14 44','M6 70L22 66L16 86','M68 91L59 76L79 81','M85 19L73 32L92 39'],
  electronic: ['M61 51L21 7','M61 51L9 40','M61 51L17 87','M61 51L58 98','M61 51L89 84','M61 51L96 43','M39 29L53 49L28 60','M75 24L66 48L90 62','M21 7L35 20L25 34','M9 40L27 46L14 61','M89 84L77 69L95 67','M96 43L80 47L89 27'],
  dark: ['M37 42L8 9','M37 42L4 48','M37 42L19 88','M37 42L55 97','M37 42L92 76','M37 42L94 28','M19 23L34 45L9 64','M65 53L40 42L71 18','M8 9L22 18L12 33','M4 48L20 54L8 72','M19 88L28 70L38 91','M94 28L76 34L86 13'],
  loud: ['M66 57L30 4','M66 57L7 29','M66 57L8 76','M66 57L43 96','M66 57L89 92','M66 57L98 48','M45 31L59 55L35 70','M83 27L69 54L94 65','M30 4L42 20L31 34','M7 29L24 38L11 53','M8 76L26 70L20 91','M89 92L79 75L97 72'],
  strange: ['M44 37L16 4','M44 37L5 38','M44 37L11 83','M44 37L47 98','M44 37L82 90','M44 37L98 55','M27 19L40 40L13 58','M73 18L55 40L89 43','M16 4L29 16L20 31','M5 38L22 44L9 62','M11 83L27 72L25 94','M82 90L72 72L94 76'],
  anything: ['M53 61L20 4','M53 61L4 30','M53 61L9 78','M53 61L34 98','M53 61L85 94','M53 61L99 52','M31 31L50 59L21 71','M80 23L59 57L96 73','M20 4L34 18L23 32','M4 30L21 39L8 55','M9 78L27 70L21 94','M85 94L74 77L96 76'],
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
  const all = catalogue.filter(entry => entry && entry.slug && entry.status === 'published' && validBandcampUrl(entry.bandcampUrl));
  const inScope = selected.includes('anything') ? all : all.filter(entry => selected.some(category => (entry.waters || []).includes(category)));
  const fresh = inScope.filter(entry => !recentSet.has(entry.slug));
  return fresh.length ? fresh : inScope;
}

export function artistIdentity(entry) {
  return String(entry?.canonicalArtistId || entry?.canonicalBandcampUrl || entry?.artist || entry?.slug || '').trim().toLowerCase();
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

export function chooseRelease(catalogue, selection, recent = [], cryptoApi = globalThis.crypto, recentArtists = []) {
  const pool = eligibleReleases(catalogue, selection, recent);
  const groups = new Map();
  for (const entry of pool) {
    const artistId = artistIdentity(entry);
    if (!artistId) continue;
    const releases = groups.get(artistId) || [];
    releases.push(entry);
    groups.set(artistId, releases);
  }
  const recentArtistSet = new Set(recentArtists.map(value => String(value).toLowerCase()));
  const allArtists = [...groups.entries()];
  const freshArtists = allArtists.filter(([artistId]) => !recentArtistSet.has(artistId));
  const artistPool = freshArtists.length ? freshArtists : allArtists;
  const selectedArtist = artistPool[secureRandomIndex(artistPool.length, cryptoApi)];
  if (!selectedArtist) return null;
  const releases = selectedArtist[1];
  return releases[secureRandomIndex(releases.length, cryptoApi)] || null;
}

export function pushHistory(history, slug, limit = SESSION_HISTORY_LIMIT) {
  return [slug, ...history].filter((value, index, all) => value && all.indexOf(value) === index).slice(0, limit);
}

export function normalizeArtistSearch(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLocaleLowerCase('en')
    .replace(/&/g,' and ')
    .replace(/[^a-z0-9]+/g,' ')
    .trim()
    .replace(/\s+/g,' ');
}

function searchScore(artist, query) {
  const name=normalizeArtistSearch(artist?.name || artist?.artistName);
  const canonical=normalizeArtistSearch(artist?.normalizedName || artist?.canonicalName || name);
  if(!name || !query)return -1;
  if(name===query || canonical===query)return 1000;
  if(name.startsWith(query) || canonical.startsWith(query))return 760-Math.min(180,name.length-query.length);
  const queryWords=query.split(' ');
  const nameWords=name.split(' ');
  if(queryWords.every(word=>nameWords.some(candidate=>candidate.startsWith(word))))return 560-queryWords.length;
  const position=name.indexOf(query);
  return position>=0?360-position:-1;
}

export function searchLocalArtists(artists, value, limit = 6) {
  const query=normalizeArtistSearch(value);
  if(query.length<2)return [];
  return (Array.isArray(artists)?artists:[])
    .filter(artist=>artist?.status==='published'&&artist?.aquariumSlug)
    .map(artist=>({artist,score:searchScore(artist,query)}))
    .filter(item=>item.score>=0)
    .sort((left,right)=>right.score-left.score||String(left.artist.name).localeCompare(String(right.artist.name)))
    .slice(0,Math.max(1,limit))
    .map(({artist})=>({
      source:'library',
      artistId:artist.id,
      artistName:artist.name,
      canonicalName:artist.normalizedName || artist.canonicalName || normalizeArtistSearch(artist.name),
      bandcampArtistUrl:artist.bandcampArtistUrl,
      location:artist.location || artist.primaryLocation || '',
      context:[artist.release,(artist.waters||[]).map(value=>String(value).toUpperCase()).join(' + ')].filter(Boolean).join('  •  '),
      aquariumSlug:artist.aquariumSlug,
    }));
}

export function dedupeArtistResults(results, limit = 8) {
  const seen=new Set();
  const output=[];
  for(const result of Array.isArray(results)?results:[]){
    let key='';
    try{key=new URL(result?.bandcampArtistUrl).hostname.toLowerCase().replace(/^www\./,'');}catch{}
    key=key||normalizeArtistSearch(result?.artistName);
    if(!key||seen.has(key))continue;
    seen.add(key);output.push(result);
    if(output.length>=limit)break;
  }
  return output;
}

export function highConfidenceArtistMatch(query, result) {
  return Boolean(result)&&normalizeArtistSearch(query)===normalizeArtistSearch(result.artistName);
}

export function pickDifferentPlayableTrack(manifest, currentTrackId, recentTrackIds = [], cryptoApi = globalThis.crypto) {
  const blocked=new Set([String(currentTrackId||''),...(recentTrackIds||[]).map(String)]);
  const playable=(manifest?.tracks||[]).filter(track=>/^\d+$/.test(String(track.bandcampEmbedTrackId||''))&&validBandcampUrl(track.bandcampUrl));
  const fresh=playable.filter(track=>!blocked.has(String(track.id||track.bandcampEmbedTrackId))&&!blocked.has(String(track.bandcampEmbedTrackId)));
  const pool=fresh.length?fresh:recentTrackIds.length?[]:playable.filter(track=>String(track.bandcampEmbedTrackId)!==String(currentTrackId||''));
  return pool[secureRandomIndex(pool.length,cryptoApi)]||null;
}

export function buildShareUrl(origin, base, slug, selection) {
  const url = new URL(`${base.replace(/\/$/,'')}/`, origin);
  url.searchParams.set('release', slug);
  const categories = normalizeSelection(selection);
  if (categories.length) url.searchParams.set('categories', categories.join(','));
  return url.toString();
}

function tickerText(value, limit = 220) {
  return String(value || '').replace(/\s+/g,' ').trim().slice(0,limit).toUpperCase();
}

function usefulTags(values = [], waters = []) {
  const ignored = new Set(['music','independent','album','bandcamp',...waters.map(value=>String(value).toLowerCase())]);
  return [...new Set(values.map(value=>tickerText(value,32)).filter(value=>value&&!ignored.has(value.toLowerCase())))].slice(0,3);
}

export function buildTickerMessages(manifest, registryEntry = {}, artistEntry = {}, universeStats = {}) {
  const messages = [];
  const artist=tickerText(manifest.artist || registryEntry.artist || artistEntry.name,90);
  const location=tickerText(manifest.primaryLocation || registryEntry.primaryLocation || artistEntry.primaryLocation,90);
  const release=tickerText(manifest.releaseTitle || registryEntry.release,110);
  const track=tickerText(manifest.selectedTrackTitle,110);
  const waters=(registryEntry.waters || manifest.waters || []).map(value=>tickerText(value,32)).filter(Boolean);
  const tags=usefulTags(manifest.metadataTags || registryEntry.metadataTags || [],waters);
  const bio=tickerText(manifest.bioShort || registryEntry.bioShort || artistEntry.bioShort,180);
  const labels=(manifest.labels || artistEntry.labels || []).map(value=>tickerText(value,70)).filter(Boolean);

  if(artist) messages.push(location?`${artist}  •  ${location}`:artist);
  if(release || track) messages.push(['NOW PLAYING',release,track].filter(Boolean).join('  •  '));
  if(bio) messages.push(bio);
  else {
    const context=[...tags,...waters].slice(0,3);
    if(context.length&&location) messages.push(`${context.join(' / ')} MUSIC FROM ${location}`);
  }
  const style=[waters.length?waters.join(' + '):'',...tags].filter(Boolean);
  if(style.length) messages.push(style.join('  •  '));
  if(manifest.releaseDate || registryEntry.releaseDate) {
    const date=new Date(manifest.releaseDate || registryEntry.releaseDate);
    if(!Number.isNaN(date.valueOf())) messages.push(`RELEASED ${date.toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'}).toUpperCase()}`);
  }
  if(labels.length) messages.push(`LABEL  •  ${labels[0]}`);
  const artists=Number(universeStats.canonicalArtistCount || universeStats.artists || 0);
  const releases=Number(universeStats.publishedReleaseCount || universeStats.releases || 0);
  const songs=Number(universeStats.playableTrackCount || universeStats.playableTracks || 0);
  if(artists>0&&releases>0&&songs>0) messages.push(`COSMIC AQUARIA  •  ${artists.toLocaleString('en-AU')} ARTISTS  •  ${releases.toLocaleString('en-AU')} RELEASES  •  ${songs.toLocaleString('en-AU')} PLAYABLE SONGS`);
  if(Number(universeStats.newToday)>0) messages.push(`${Number(universeStats.newToday).toLocaleString('en-AU')} NEW DISCOVERIES ADDED TODAY`);
  else if(Number(universeStats.newThisWeek)>0) messages.push(`${Number(universeStats.newThisWeek).toLocaleString('en-AU')} NEW RELEASES ADDED THIS WEEK`);
  messages.push('SUPPORT INDEPENDENT ARTISTS  •  BUY MUSIC DIRECT FROM THE ARTIST');
  messages.push('MUSIC LIVES HERE  •  GOOD VIBES  •  BANDCAMP');
  return [...new Set(messages.map(value=>tickerText(value)).filter(value=>value&&!/\b(?:UNDEFINED|NULL|N\/A)\b/.test(value)))];
}

export function buildTickerFacts(manifest, registryEntry = {}, artistEntry = {}, universeStats = {}) {
  return buildTickerMessages(manifest,registryEntry,artistEntry,universeStats).join('  •  ') || 'SUPPORT INDEPENDENT ARTISTS';
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
