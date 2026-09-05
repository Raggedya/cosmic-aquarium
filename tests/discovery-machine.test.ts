import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  CATEGORIES, CRACK_VARIANTS, GO_HOLD_MS, SESSION_HISTORY_LIMIT,
  nextSelection, normalizeSelection, eligibleReleases, chooseRelease,
  pushHistory, buildShareUrl, buildTickerFacts, buildTickerMessages, validBandcampUrl, pickPlayableTrack, artistIdentity,
  normalizeArtistSearch, searchLocalArtists, dedupeArtistResults, highConfidenceArtistMatch, pickDifferentPlayableTrack,
} from '../github-pages/assets/discovery-machine-core.js';
import { classifyWaters, validWaters, WATERS } from '../scripts/water-classifier.mjs';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const readBytes = (path: string) => readFile(new URL(`../${path}`, import.meta.url));
const catalogue = [
  {slug:'heavy-one',status:'published',bandcampUrl:'https://one.bandcamp.com/album/a',waters:['heavy']},
  {slug:'dark-strange',status:'published',bandcampUrl:'https://two.bandcamp.com/album/b',waters:['dark','strange']},
  {slug:'quiet-one',status:'published',bandcampUrl:'https://three.bandcamp.com/album/c',waters:['quiet']},
  {slug:'inactive',status:'disabled',bandcampUrl:'https://four.bandcamp.com/album/d',waters:['heavy']},
  {slug:'broken',status:'published',bandcampUrl:null,waters:['heavy']},
  {slug:'mock-url',status:'published',bandcampUrl:'https://example.test/fake',waters:['heavy']},
];

test('the listener has exactly eight canonical category controls and two screens', async () => {
  const template = await read('templates/universe-index.html');
  assert.equal((template.match(/class="glass-key"/g)||[]).length,8);
  assert.equal((template.match(/class="machine-screen/g)||[]).length,2);
  for(const category of CATEGORIES) assert.match(template,new RegExp(`data-category="${category}"`));
  assert.match(template,/data-screen="selection"/);
  assert.match(template,/data-screen="player"/);
});

test('a category can be selected and deselected',()=>{
  const selected=nextSelection(new Set(),'dark');
  assert.deepEqual([...selected],['dark']);
  assert.deepEqual([...nextSelection(selected,'dark')],[]);
});

test('multiple categories form a stable union and ANYTHING is exclusive',()=>{
  let selected=nextSelection(new Set(),'dark');
  selected=nextSelection(selected,'strange');
  assert.deepEqual([...selected],['dark','strange']);
  assert.deepEqual([...nextSelection(selected,'anything')],['anything']);
  assert.deepEqual([...nextSelection(new Set(['anything']),'quiet')],['quiet']);
  assert.deepEqual(normalizeSelection(['strange','dark','strange']),['dark','strange']);
});

test('candidate pools exclude inactive/broken rows and use union semantics',()=>{
  assert.deepEqual(eligibleReleases(catalogue,['heavy'],[]).map((item: {slug:string})=>item.slug),['heavy-one']);
  assert.deepEqual(eligibleReleases(catalogue,['dark','quiet'],[]).map((item: {slug:string})=>item.slug),['dark-strange','quiet-one']);
  assert.deepEqual(eligibleReleases(catalogue,['anything'],[]).map((item: {slug:string})=>item.slug),['heavy-one','dark-strange','quiet-one']);
});

test('session history prevents immediate repeats and is bounded',()=>{
  const fixedCrypto={getRandomValues:(value:Uint32Array)=>{value[0]=0;return value;}} as Crypto;
  assert.equal(chooseRelease(catalogue,['anything'],['heavy-one','dark-strange'],fixedCrypto)?.slug,'quiet-one');
  const history=Array.from({length:30},(_,index)=>`release-${index}`);
  const result=pushHistory(history,'new-release');
  assert.equal(result.length,SESSION_HISTORY_LIMIT);
  assert.equal(result[0],'new-release');
});

test('discovery selects an artist first so large discographies cannot dominate',()=>{
  const artistWeightedCatalogue=[
    {slug:'large-1',canonicalArtistId:'artist:large',status:'published',bandcampUrl:'https://large.bandcamp.com/album/1',waters:['dark']},
    {slug:'large-2',canonicalArtistId:'artist:large',status:'published',bandcampUrl:'https://large.bandcamp.com/album/2',waters:['dark']},
    {slug:'large-3',canonicalArtistId:'artist:large',status:'published',bandcampUrl:'https://large.bandcamp.com/album/3',waters:['dark']},
    {slug:'small-1',canonicalArtistId:'artist:small',status:'published',bandcampUrl:'https://small.bandcamp.com/album/1',waters:['dark']},
  ];
  const picks=[0,0];
  const firstArtistThenRelease={getRandomValues:(value:Uint32Array)=>{value[0]=picks.shift()??0;return value;}} as Crypto;
  assert.equal(chooseRelease(artistWeightedCatalogue,['dark'],[],firstArtistThenRelease)?.slug,'large-1');
  const skipLargeArtist={getRandomValues:(value:Uint32Array)=>{value[0]=0;return value;}} as Crypto;
  assert.equal(chooseRelease(artistWeightedCatalogue,['dark'],[],skipLargeArtist,['artist:large'])?.slug,'small-1');
  assert.equal(artistIdentity(artistWeightedCatalogue[0]),'artist:large');
});

test('the production catalogue contains only real playable Bandcamp records',async()=>{
  const registry=JSON.parse(await read('github-pages/aquariums.json')).aquariums;
  assert.ok(registry.length>=200);
  assert.ok(registry.every((entry:{artist:string;release:string;status:string;bandcampUrl:string;canonicalArtistId:string})=>entry.artist&&entry.release&&entry.status==='published'&&validBandcampUrl(entry.bandcampUrl)&&entry.canonicalArtistId));
  for(const entry of registry){
    const manifest=JSON.parse(await read(`github-pages/artists/${entry.slug}.json`));
    assert.ok(pickPlayableTrack(manifest),`${entry.slug} must expose at least one lawful playable track`);
  }
});

test('crack geometry is deterministic and not universally identical',()=>{
  const signatures=new Set(CATEGORIES.map(category=>CRACK_VARIANTS[category as keyof typeof CRACK_VARIANTS].join('|')));
  assert.equal(signatures.size,CATEGORIES.length);
  for(const category of CATEGORIES) assert.ok(CRACK_VARIANTS[category as keyof typeof CRACK_VARIANTS].length>=8);
});

test('GO retains the deliberate 1.5 second hold and locks interaction',async()=>{
  const runtime=await read('github-pages/assets/discovery-machine.js');
  assert.equal(GO_HOLD_MS,1500);
  assert.match(runtime,/isLocked=true/);
  assert.match(runtime,/Promise\.all\(\[delay\(GO_HOLD_MS\),discovery\]\)/);
  assert.match(runtime,/disintegrate\(\)/);
});

test('glass interaction audio uses layered real recordings rather than procedural synthesis',async()=>{
  const runtime=await read('github-pages/assets/discovery-machine.js');
  for(const layer of ['pressure','crack','crunch','settle']) assert.match(runtime,new RegExp(`${layer}:\\[`));
  for(const source of ['glass-plate-crunching','glass-debris-014','picture-frame-shards','glass-shards-moved-07']) assert.match(runtime,new RegExp(source));
  assert.doesNotMatch(runtime,/createOscillator|createBuffer\(1,frames|Math\.random\(\)\*2-1/);
  assert.match(runtime,/createDynamicsCompressor/);
  assert.match(runtime,/output\.gain\.value=\.72/);
});

test('every category and GO has a distinct fracture personality',async()=>{
  const runtime=await read('github-pages/assets/discovery-machine.js');
  for(const category of [...CATEGORIES,'go']) assert.match(runtime,new RegExp(`\\b${category}:\\{master:`));
  assert.match(runtime,/type==='go'[^\n]+GLASS_AUDIO_SEGMENTS\.crunch/);
  assert.match(runtime,/playGlassDisintegration\(\);[\s\S]{0,40}await disintegrate\(\)/);
});

test('glass audio preloads once, waits for a gesture, respects mute and never blocks selection',async()=>{
  const runtime=await read('github-pages/assets/discovery-machine.js');
  assert.match(runtime,/if \(glassAudio\.preloadPromise\) return glassAudio\.preloadPromise/);
  assert.match(runtime,/glassAudio\.activated && glassAudio\.buffers\.size/);
  assert.match(runtime,/cosmic-aquaria:muted/);
  assert.match(runtime,/document\.addEventListener\('pointerdown',\(\)=>void activateGlassAudio\(\),\{capture:true,passive:true\}\)/);
  assert.match(runtime,/pulseSilentUnlock\(audio\)/);
  assert.match(runtime,/glassAudio\.pendingImpact=\{type,options:\{restoring,control\}\}/);
  assert.match(runtime,/safari\?\['mp3','ogg'\]:\['ogg','mp3'\]/);
  assert.match(runtime,/function playDirectImpact/);
  assert.match(runtime,/glass-impact-mobile\.mp3/);
  assert.match(runtime,/Promise\.allSettled/);
  assert.match(runtime,/updateSoundControls\(\)/);
  assert.match(runtime,/updateSelection\(nextSelection\(selected,category\)\);\s*playGlassBreak\(category,\{restoring:wasSelected\}\)/);
  assert.match(runtime,/catch\(error\) \{ glassAudio\.failed=true;glassAudio\.lastError=String\(error\);updateAudioDebug\(\);return false; \}/);
});

test('deselection produces only residual shards while GO fractures before its hold',async()=>{
  const runtime=await read('github-pages/assets/discovery-machine.js');
  assert.match(runtime,/if\(restoring\)\{\s*scheduleGlassSegment\(audio,chooseGlassSegment\('settle'/);
  assert.match(runtime,/goButton\.classList\.add\('is-broken'\); playGlassBreak\('go'\)/);
  assert.match(runtime,/Promise\.all\(\[delay\(GO_HOLD_MS\),discovery\]\)/);
});

test('CC0 audio provenance and dual browser formats are packaged into the public build',async()=>{
  const [metadataText,license,build]=await Promise.all([
    read('public/audio/glass/source/metadata.json'),read('public/audio/glass/source/LICENSE.md'),read('scripts/build-github-pages.mjs'),
  ]);
  const metadata=JSON.parse(metadataText);
  assert.equal(metadata.sources.length,4);
  assert.ok(metadata.sources.every((source: {license:string; sourceUrl:string; files:string[]})=>source.license==='CC0 1.0'&&source.sourceUrl.startsWith('https://freesound.org/')&&source.files.some(file=>file.endsWith('.ogg'))&&source.files.some(file=>file.endsWith('.mp3'))));
  assert.match(license,/Creative Commons CC0 1\.0/);
  assert.match(build,/glassAudioAssets\.forEach\(\(asset\) => assetHash\.update\(asset\)\)/);
  for(const source of metadata.sources){
    for(const file of source.files){
      const bytes=await readBytes(`public/audio/glass/source/${file}`);
      assert.ok(bytes.length>10000,`${file} should contain a real compressed recording`);
      assert.match(build,new RegExp(file.replace('.','\\.')));
    }
  }
});

test('deep links and share URLs remain on the canonical application',()=>{
  assert.equal(buildShareUrl('https://raggedya.github.io','/cosmic-aquarium','dark-strange',['dark','strange']),'https://raggedya.github.io/cosmic-aquarium/?release=dark-strange&categories=dark%2Cstrange');
});

test('Bandcamp links and tracks are strictly validated',()=>{
  assert.ok(validBandcampUrl('https://artist.bandcamp.com/album/release'));
  for(const value of ['http://artist.bandcamp.com/album/a','https://bandcamp.example/','https://bandcamp.com@evil.example/']) assert.equal(validBandcampUrl(value),null);
  const fixedCrypto={getRandomValues:(value:Uint32Array)=>{value[0]=0;return value;}} as Crypto;
  const track=pickPlayableTrack({tracks:[{id:'x',bandcampEmbedTrackId:'123',bandcampUrl:'https://artist.bandcamp.com/track/x'}]},fixedCrypto);
  assert.equal(track.id,'x');
});

test('ticker facts are sourced only from stored catalogue metadata',()=>{
  const text=buildTickerFacts({releaseDate:'2026-08-22T00:00:00Z',waters:['dreamy']},{waters:['dreamy']},{primaryLocation:'Melbourne, Australia',labels:['Low Light Records']});
  assert.match(text,/MELBOURNE, AUSTRALIA/);
  assert.match(text,/DREAMY/);
  assert.match(text,/RELEASED 22 AUG 2026/);
  assert.match(text,/LOW LIGHT RECORDS/);
  assert.match(text,/SUPPORT INDEPENDENT ARTISTS/);
});

test('ticker rotates factual artist, release, bio, style and generated universe statistics',()=>{
  const messages=buildTickerMessages(
    {artist:'Aneira',releaseTitle:'Rotations',selectedTrackTitle:'Steady as a Speedy Oak',releaseDate:'2026-08-22T00:00:00Z',waters:['dreamy','strange'],metadataTags:['ambient','experimental'],bioShort:'Atmospheric textural music from Melbourne.'},
    {waters:['dreamy','strange']},
    {primaryLocation:'Melbourne, Australia'},
    {canonicalArtistCount:220,publishedReleaseCount:227,playableTrackCount:2398,newToday:20},
  );
  assert.match(messages[0],/ANEIRA.*MELBOURNE, AUSTRALIA/);
  assert.ok(messages.some(message=>/ROTATIONS.*STEADY AS A SPEEDY OAK/.test(message)));
  assert.ok(messages.some(message=>/ATMOSPHERIC TEXTURAL MUSIC/.test(message)));
  assert.ok(messages.some(message=>/DREAMY \+ STRANGE/.test(message)));
  assert.ok(messages.some(message=>/220 ARTISTS.*227 RELEASES.*2,398 PLAYABLE SONGS/.test(message)));
  assert.ok(messages.every(message=>!/(undefined|null|n\/a)/i.test(message)));
});

test('universe statistics are generated from published manifests and distinct playable track ids',async()=>{
  const [stats,build]=await Promise.all([read('github-pages/universe-stats.json'),read('scripts/build-github-pages.mjs')]);
  const parsed=JSON.parse(stats);
  assert.ok(parsed.canonicalArtistCount>=200);
  assert.ok(parsed.publishedReleaseCount>=parsed.canonicalArtistCount);
  assert.ok(parsed.playableTrackCount>=parsed.publishedReleaseCount);
  assert.match(build,/playableTrackIds\.add\(trackId\)/);
  assert.match(build,/publishedReleaseCount:aquariumRegistry\.filter/);
  assert.doesNotMatch(build,/canonicalArtistCount:\s*\d/);
});

test('official Bandcamp playback has truthful transport-coupled dual analogue meters',async()=>{
  const [template,runtime,css]=await Promise.all([read('templates/universe-index.html'),read('github-pages/assets/discovery-machine.js'),read('app/discovery-machine.css')]);
  assert.match(template,/Official Bandcamp playback controls/);
  assert.doesNotMatch(template,/PLAY \/ PAUSE ON BANDCAMP/);
  assert.doesNotMatch(template,/>0:00<|transport-rail/);
  const transportRule=css.match(/\.player-screen \.bandcamp-transport \{[^}]*\}/)?.[0]||'';
  assert.doesNotMatch(transportRule,/position:fixed|left:-10000px|width:1px/);
  assert.match(transportRule,/opacity:1/);
  assert.match(transportRule,/background:linear-gradient\(180deg,#020705/);
  assert.match(transportRule,/clamp\(44px,11\.2%,46px\)/);
  assert.match(css,/\.bandcamp-transport iframe \{[^}]*filter:contrast\(1\.92\) brightness\(\.8\) grayscale\(\.76\)/);
  assert.equal((template.match(/class="vu-meter"/g)||[]).length,2);
  assert.equal((template.match(/data-vu-needle/g)||[]).length,2);
  assert.equal((template.match(/data-vu-shadow/g)||[]).length,2);
  assert.equal((template.match(/class="vu-glass-reflection"/g)||[]).length,2);
  assert.equal((template.match(/class="vu-face-texture"/g)||[]).length,2);
  assert.match(template,/data-analysis="transport-coupled"/);
  assert.ok(template.indexOf('<div class="vu-meter-row"')<template.indexOf('<h2 id="now-playing-heading"'));
  assert.ok(template.indexOf('<h2 id="now-playing-heading"')<template.indexOf('<p class="release-line"'));
  assert.doesNotMatch(template,/liquid-surface|class="spectrum"/);
  assert.doesNotMatch(runtime,/createMediaElementSource|createMediaStreamSource/);
  assert.match(runtime,/function buildVuMeters/);
  assert.match(runtime,/function setMeterSeed/);
  assert.match(runtime,/function meterEnvelope/);
  assert.match(runtime,/function meterTransient/);
  assert.match(runtime,/function proceduralMeterTarget/);
  const procedural=runtime.slice(runtime.indexOf('function proceduralMeterTarget'),runtime.indexOf('function renderVuMeters'));
  assert.doesNotMatch(procedural,/Math\.sin|Math\.random/);
  assert.match(runtime,/const acceleration=\(channel\.target-channel\.level\)\*stiffness-channel\.velocity\*damping/);
  assert.match(runtime,/const stiffness=\(rising\?178:28\*meterProfile\.character\.release\)/);
  assert.match(runtime,/meterPlaybackStartedAt\)\/640/);
  assert.match(runtime,/meterNeedleShadows\[index\]\.style\.transform/);
  assert.match(runtime,/leftAngle:meterChannels\[0\]\.angle,rightAngle:meterChannels\[1\]\.angle/);
  assert.match(runtime,/bandcampFrame\.addEventListener\('focus',onBandcampFrameInteraction\)/);
  assert.match(runtime,/event\.data==='playerinited'/);
  assert.match(css,/\.vu-meter-row\[data-playback="playing"\]/);
  assert.match(css,/\.vu-red-arc/);
  assert.doesNotMatch(css,/\.liquid-surface|\.spectrum\s+i|nth-child\([^)]*\)\{--h/);
});

test('artist search normalizes punctuation, case and diacritics and prioritises exact local matches',()=>{
  const artists=[
    {id:'bandcamp:aneira',name:'Aneira',canonicalName:'aneira',status:'published',aquariumSlug:'aneira-rotations',bandcampArtistUrl:'https://aneira.bandcamp.com/',primaryLocation:'London, UK',release:'Rotations'},
    {id:'bandcamp:weird',name:'À New & Strange Band!',status:'published',aquariumSlug:'new-strange',bandcampArtistUrl:'https://weird.bandcamp.com/'},
    {id:'disabled',name:'Aneira Demo',status:'disabled',aquariumSlug:'disabled',bandcampArtistUrl:'https://demo.bandcamp.com/'},
  ];
  assert.equal(normalizeArtistSearch(' À New & Strange—Band! '),'a new and strange band');
  const exact=searchLocalArtists(artists,'ANEIRA');
  assert.equal(exact[0].artistId,'bandcamp:aneira');
  assert.equal(exact[0].source,'library');
  assert.equal(searchLocalArtists(artists,'new strange')[0].artistName,'À New & Strange Band!');
  assert.ok(highConfidenceArtistMatch('aneira',exact[0]));
});

test('search results deduplicate canonical Bandcamp hosts and Next avoids the current search track',()=>{
  const results=dedupeArtistResults([
    {artistName:'Aneira',bandcampArtistUrl:'https://aneira.bandcamp.com/',source:'library'},
    {artistName:'aneira',bandcampArtistUrl:'https://aneira.bandcamp.com',source:'bandcamp'},
    {artistName:'Another',bandcampArtistUrl:'https://another.bandcamp.com',source:'bandcamp'},
  ]);
  assert.equal(results.length,2);
  const fixedCrypto={getRandomValues:(value:Uint32Array)=>{value[0]=0;return value;}} as Crypto;
  const manifest={tracks:[
    {id:'one',bandcampEmbedTrackId:'1',bandcampUrl:'https://aneira.bandcamp.com/track/one'},
    {id:'two',bandcampEmbedTrackId:'2',bandcampUrl:'https://aneira.bandcamp.com/track/two'},
  ]};
  assert.equal(pickDifferentPlayableTrack(manifest,'1',[],fixedCrypto)?.id,'two');
  assert.equal(pickDifferentPlayableTrack(manifest,'1',['two'],fixedCrypto),null);
});

test('selector search and genre modes are exclusive while GO remains the shared commitment control',async()=>{
  const [template,runtime,css]=await Promise.all([read('templates/universe-index.html'),read('github-pages/assets/discovery-machine.js'),read('app/discovery-machine.css')]);
  assert.match(template,/id="artist-search-input"[^>]+role="combobox"/);
  assert.match(template,/placeholder="SEARCH COSMIC AQUARIA"/);
  assert.match(template,/id="artist-search-results"[^>]+role="listbox"/);
  assert.match(template,/class="search-clear"/);
  assert.match(template,/MUSIC WITHOUT BORDERS/);
  assert.match(template,/INDEPENDENT MUSIC FLOATS FURTHER/);
  assert.match(runtime,/function setSearchMode\(active\)/);
  assert.match(runtime,/button\.disabled=active/);
  assert.match(runtime,/if\(active&&selected\.size\)/);
  assert.match(runtime,/searchTimer=setTimeout\(\(\)=>void runArtistSearch\(next\.trim\(\),serial\),320\)/);
  assert.match(runtime,/searchLocalArtists\(artists,query,6\)/);
  assert.match(runtime,/resolveSelectedSearchArtist\(\):resolveDiscovery\(\)/);
  assert.match(runtime,/playerDiscoveryMode==='search'/);
  assert.match(runtime,/clearArtistSearch\(\)/);
  assert.match(css,/\.selection-screen\.is-search-mode \.selection-grid \.glass-key::before \{ opacity:\.94/);
  assert.match(css,/backdrop-filter:saturate\(\.1\) brightness\(\.54\) contrast\(\.9\)/);
  assert.match(css,/\.selection-screen > \.go-key[^}]+selector-go\.webp/);
});

test('the build emits a compact artist search index for catalogue-scale lookup',async()=>{
  const [build,runtime]=await Promise.all([read('scripts/build-github-pages.mjs'),read('github-pages/assets/discovery-machine.js')]);
  assert.match(build,/artist-search-index\.json/);
  assert.match(build,/normalizedName:artist\.canonicalName/);
  assert.match(runtime,/artist-search-index\.json/);
  assert.doesNotMatch(runtime,/fetch\(`\$\{base\}\/artists-index\.json/);
});

test('local artist search remains fast with a simulated 5,000-artist index',()=>{
  const artists=Array.from({length:5000},(_,index)=>({
    id:`bandcamp:artist-${index}`,name:`Cosmic Artist ${index}`,normalizedName:`cosmic artist ${index}`,
    status:'published',aquariumSlug:`cosmic-artist-${index}`,bandcampArtistUrl:`https://artist-${index}.bandcamp.com/`,
    location:index%2?'Melbourne, Australia':'Tokyo, Japan',waters:[index%2?'dreamy':'electronic'],
  }));
  const started=performance.now();
  for(let index=0;index<100;index+=1){
    const results=searchLocalArtists(artists,`artist ${index}`,6);
    assert.ok(results.length>0);
  }
  assert.ok(performance.now()-started<2500);
});

test('the visual system uses layered liquid glass with controlled per-control variation',async()=>{
  const [template,css]=await Promise.all([read('templates/universe-index.html'),read('app/discovery-machine.css')]);
  for(const layer of ['conic-gradient','radial-gradient','inset','mix-blend-mode']) assert.match(css,new RegExp(layer));
  assert.match(css,/--body-a/);
  assert.match(css,/--glint-x/);
  assert.match(css,/\.glass-key\[data-category="heavy"\]/);
  assert.match(css,/\.glass-key\[data-category="anything"\]/);
  assert.match(css,/\.material-bubble--ticker-a/);
  assert.match(css,/\.material-bubble--footer-d/);
  assert.match(template,/material-bubble--ticker-a/);
  assert.match(template,/material-bubble--footer-d/);
});

test('canonical photographic material uses continuous plates behind real controls',async()=>{
  const [template,css,build]=await Promise.all([read('templates/universe-index.html'),read('app/discovery-machine.css'),read('scripts/build-github-pages.mjs')]);
  assert.doesNotMatch(template,/background-image[^>]+selector-canonical/);
  assert.match(css,/selector-chassis\.webp/);
  assert.match(css,/selector-selected-dark\.webp/);
  assert.match(css,/player-chassis-concise-actions-v3\.webp/);
  assert.equal((template.match(/class="glass-key"/g)||[]).length,8);
  assert.match(build,/discovery-fidelity/);
});

test('every category has a distinct photographic collapse treatment and player return is Home',async()=>{
  const [template,css,build]=await Promise.all([read('templates/universe-index.html'),read('app/discovery-machine.css'),read('scripts/build-github-pages.mjs')]);
  for(const category of CATEGORIES){
    assert.match(css,new RegExp(`selector-selected-${category}\\.webp`));
    assert.match(build,new RegExp(`selector-selected-${category}\\.webp`));
  }
  assert.match(template,/aria-label="Home — choose music categories">Home<\/button>/);
  assert.doesNotMatch(template,/>‹ CHANGE<\/button>/);
});

test('fresh homepage state is pristine while explicit deep-link categories remain supported',async()=>{
  const runtime=await read('github-pages/assets/discovery-machine.js');
  assert.match(runtime,/updateSelection\(requestedSelection,false\)/);
  assert.doesNotMatch(runtime,/requestedSelection\.length\?requestedSelection:readJson\(selectionKey/);
  assert.match(runtime,/selected=new Set\(\);\s*sessionStorage\.removeItem\(selectionKey\);\s*clearArtistSearch\(\);\s*updateSelection\(selected,false\)/);
});

test('GO uses a dedicated wide photographic collapse plate rather than a generic crack overlay',async()=>{
  const [template,css,build,asset]=await Promise.all([
    read('templates/universe-index.html'),read('app/discovery-machine.css'),read('scripts/build-discovery-fidelity-assets.py'),readBytes('public/discovery-fidelity/selector-go-broken.webp'),
  ]);
  assert.match(template,/selector-go-broken\.webp/);
  assert.match(css,/\.go-key\.is-broken[^}]+selector-go-broken\.webp/);
  assert.match(css,/\.go-key\.is-broken > \.crack-layer \{ display:none; \}/);
  assert.match(build,/selector-go-broken-imagegen\.png/);
  assert.ok(asset.length>100000,'GO collapse should be a detailed photographic plate');
});

test('player ticker is optically recessed and the upper chamber has a contained living bubble tube',async()=>{
  const [template,css,runtime]=await Promise.all([read('templates/universe-index.html'),read('app/discovery-machine.css'),read('github-pages/assets/discovery-machine.js')]);
  assert.match(template,/canvas class="bubble-tube" aria-hidden="true"/);
  assert.match(css,/\.ticker-shell::before[^}]+inset[^}]+box-shadow/);
  assert.match(css,/\.ticker-shell::after[^}]+pointer-events:none/);
  assert.match(template,/class="ticker-stream"/);
  assert.equal((template.match(/class="ticker-copy"/g)||[]).length,2);
  assert.match(css,/\.player-screen \.ticker-copy \{ font-size:clamp\(12px,3\.55vw,28px\)/);
  assert.match(css,/color:#fff4d4/);
  assert.match(css,/@keyframes ticker-scroll[\s\S]+translate3d\(calc\(8px - var\(--ticker-distance\)\)/);
  assert.match(runtime,/const continuous=`\$\{tickerQueue\.join\('  •  '\)\}  •  `/);
  assert.match(runtime,/distance\/speed/);
  assert.doesNotMatch(runtime,/showTickerMessage|tickerTimer/);
  assert.match(css,/\.bubble-tube[^}]+mask-image/);
  assert.match(runtime,/BUBBLE_TUBE_PARTICLES/);
  assert.match(runtime,/duration:17\.2/);
  assert.match(runtime,/r:\.31,duration:34\.5[^}]+duty:\.31,major:true/);
  assert.match(runtime,/const highlightX=width\*\.53/);
  assert.match(runtime,/globalCompositeOperation='screen'/);
  assert.match(runtime,/if\(reducedMotion\.matches\)\{drawBubbleTube\(bubbleTubeStartedAt,true\);return;\}/);
  assert.match(runtime,/document\.hidden\|\|!playerScreen\.classList\.contains\('is-active'\)/);
});

test('player actions use one baked concise-label layer without duplicate live text',async()=>{
  const [template,css,chassis]=await Promise.all([
    read('templates/universe-index.html'),
    read('app/discovery-machine.css'),
    readBytes('public/discovery-fidelity/player-chassis-concise-actions-v3.webp'),
  ]);
  assert.match(template,/data-action="share"><span>SHARE<\/span>/);
  assert.match(template,/data-action="buy"[^>]+><span>BUY<br>MUSIC<\/span>/);
  assert.match(template,/data-action="next"><span>NEXT<\/span>/);
  assert.doesNotMatch(template,/SHARE<br>JUKEBOX|NEXT<br>JUKEBOX/);
  assert.match(css,/player-chassis-concise-actions-v3\.webp/);
  assert.match(css,/\.player-actions span \{ opacity:0; \}/);
  assert.doesNotMatch(css,/button:nth-child\(1\) span|button:nth-child\(3\) span/);
  assert.ok(chassis.length>1000000);
});

test('forensic plates are continuous, lossless-built and fracture states are preloaded',async()=>{
  const [template,css,buildScript]=await Promise.all([
    read('templates/universe-index.html'),read('app/discovery-machine.css'),read('scripts/build-discovery-fidelity-assets.py'),
  ]);
  assert.match(css,/selector-chassis\.webp/);
  assert.match(css,/player-chassis-concise-actions-v3\.webp/);
  assert.match(css,/\.selection-grid \{ gap:0; filter:none; \}/);
  assert.match(css,/\.discovery-machine::before, \.discovery-machine::after \{ display:none; \}/);
  assert.match(buildScript,/lossless=True/);
  for(const category of CATEGORIES){
    assert.match(css,new RegExp(`selector-selected-${category}\\.webp`));
    assert.match(template,new RegExp(`rel="preload" as="image" href="\\{\\{BASE\\}\\}/assets/discovery-fidelity/selector-selected-${category}\\.webp"`));
  }
});

test('the commitment control uses the canonical high-energy green glass material',async()=>{
  const css=await read('app/discovery-machine.css');
  const goRule=css.match(/\.go-key \{[^}]+\}/)?.[0]||'';
  assert.match(goRule,/#bbff8a/);
  assert.match(goRule,/#22ee3e/);
  assert.match(goRule,/rgba\(36,255,65/);
});

test('reduced motion, mobile containment and browser history are explicit',async()=>{
  const [css,runtime]=await Promise.all([read('app/discovery-machine.css'),read('github-pages/assets/discovery-machine.js')]);
  assert.match(css,/prefers-reduced-motion:\s*reduce/);
  assert.match(css,/overflow:\s*hidden/);
  assert.match(runtime,/popstate/);
  assert.match(runtime,/history\.pushState/);
  assert.match(runtime,/document\.hidden/);
});

test('mobile viewport is edge-to-edge emerald with safe-area-aware controls',async()=>{
  const [template,css,manifest]=await Promise.all([read('templates/universe-index.html'),read('app/discovery-machine.css'),read('public/discovery.webmanifest')]);
  assert.match(template,/viewport-fit=cover/);
  assert.match(template,/rel="manifest"/);
  assert.match(css,/html, body[^}]+background: #001807/);
  assert.match(css,/@media \(max-width:768px\)[\s\S]{0,260}\.discovery-machine \{ position:fixed; inset:0; width:100vw; height:100vh; height:100svh; height:100dvh/);
  assert.match(css,/env\(safe-area-inset-top,0px\)/);
  const parsed=JSON.parse(manifest);
  assert.equal(parsed.display,'standalone');
  assert.equal(parsed.background_color,'#001807');
});

test('legacy artist and collection routes redirect into the canonical root',async()=>{
  const [artist,collection]=await Promise.all([read('templates/artist-index.html'),read('templates/collection-index.html')]);
  assert.match(artist,/\?release=/);
  assert.doesNotMatch(artist,/cosmic-aquarium music discovery experience/);
  assert.match(collection,/\?categories=/);
  assert.doesNotMatch(collection,/collection-aquarium/);
});

test('water classification remains multi-label, valid and deterministic',()=>{
  assert.deepEqual(classifyWaters({tags:['shoegaze','ambient'] as never[],text:'ethereal'}),['dreamy','quiet']);
  const first=classifyWaters({seed:'same release'});
  assert.deepEqual(first,classifyWaters({seed:'same release'}));
  assert.ok(first.length>=1&&first.length<=2);
  assert.ok(first.every(value=>WATERS.includes(value)));
  assert.deepEqual(validWaters(['dreamy','nope','dreamy','dark']),['dreamy','dark']);
});

test('Worker random fallback and canonical universe QR remain intact',async()=>{
  const [worker,generator]=await Promise.all([read('services/cosmic-worker/src/index.js'),read('scripts/generate_universe_qr.py')]);
  assert.match(worker,/status='published'/);
  assert.match(worker,/disabled_at IS NULL/);
  assert.match(generator,/https:\/\/raggedya\.github\.io\/cosmic-aquarium\//);
});
