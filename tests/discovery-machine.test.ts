import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  CATEGORIES, CRACK_VARIANTS, GO_HOLD_MS, SESSION_HISTORY_LIMIT,
  nextSelection, normalizeSelection, eligibleReleases, chooseRelease,
  pushHistory, buildShareUrl, buildTickerFacts, validBandcampUrl, pickPlayableTrack,
} from '../github-pages/assets/discovery-machine-core.js';
import { classifyWaters, validWaters, WATERS } from '../scripts/water-classifier.mjs';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const catalogue = [
  {slug:'heavy-one',status:'published',bandcampUrl:'https://one.bandcamp.com/album/a',waters:['heavy']},
  {slug:'dark-strange',status:'published',bandcampUrl:'https://two.bandcamp.com/album/b',waters:['dark','strange']},
  {slug:'quiet-one',status:'published',bandcampUrl:'https://three.bandcamp.com/album/c',waters:['quiet']},
  {slug:'inactive',status:'disabled',bandcampUrl:'https://four.bandcamp.com/album/d',waters:['heavy']},
  {slug:'broken',status:'published',bandcampUrl:null,waters:['heavy']},
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
  assert.match(text,/RELEASED AUG 2026/);
  assert.match(text,/LOW LIGHT RECORDS/);
  assert.match(text,/SUPPORT THE ARTIST/);
});

test('official Bandcamp playback is not misrepresented as analyser-driven',async()=>{
  const [template,runtime]=await Promise.all([read('templates/universe-index.html'),read('github-pages/assets/discovery-machine.js')]);
  assert.match(template,/bandcamp\.com\/EmbeddedPlayer|Official Bandcamp player/);
  assert.match(template,/data-analysis="unavailable"/);
  assert.match(template,/Live analysis is unavailable/);
  assert.doesNotMatch(runtime,/createMediaElementSource|createMediaStreamSource/);
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

test('canonical photographic material is applied per component rather than as a flattened hotspot screen',async()=>{
  const [template,css,build]=await Promise.all([read('templates/universe-index.html'),read('app/discovery-machine.css'),read('scripts/build-github-pages.mjs')]);
  assert.doesNotMatch(template,/background-image[^>]+selector-canonical/);
  assert.match(css,/selector-heavy\.webp/);
  assert.match(css,/selector-dark-broken\.webp/);
  assert.match(css,/player-main-frame\.webp/);
  assert.match(css,/player-share\.webp/);
  assert.match(build,/discovery-fidelity/);
});

test('every category has a distinct photographic collapse treatment and player return is Home',async()=>{
  const [template,css,build]=await Promise.all([read('templates/universe-index.html'),read('app/discovery-machine.css'),read('scripts/build-github-pages.mjs')]);
  for(const category of ['heavy','dreamy','quiet','electronic','loud','strange','anything']){
    assert.match(css,new RegExp(`selector-break-${category}\\.webp`));
    assert.match(build,new RegExp(`selector-break-${category}\\.webp`));
  }
  assert.match(css,/selector-dark-broken\.webp/);
  assert.match(template,/aria-label="Home — choose music categories">Home<\/button>/);
  assert.doesNotMatch(template,/>‹ CHANGE<\/button>/);
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
