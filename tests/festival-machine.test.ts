import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { formatMachineTitleLines } from '../github-pages/assets/discovery-machine-core.js';

const read=(file:string)=>readFile(new URL(`../${file}`,import.meta.url),'utf8');

test('Festival Mode preserves the master cabinet and existing one-reel control surface',async()=>{
  const [festival,artist]=await Promise.all([read('templates/festival-machine.html'),read('templates/artist-machine.html')]);
  assert.match(festival,/data-machine-mode="artist" data-machine-content="festival"/);
  assert.match(festival,/aggits-festival-cabinet\.webp/);
  assert.match(festival,/data-festival-title/);
  assert.equal((festival.match(/class="reel" data-reel=/g)||[]).length,1);
  for(const action of ['share','play','buy','spin-again'])assert.match(festival,new RegExp(`data-action="${action}"`));
  assert.match(festival,/assets\/discovery-machine\.js/);
  assert.match(artist,/data-machine-mode="artist"/);
  assert.doesNotMatch(artist,/data-machine-content="festival"/);
});

test('Festival Mode feeds the shared catalogue, spin and Bandcamp purchase pipeline',async()=>{
  const runtime=await read('github-pages/assets/discovery-machine.js');
  assert.match(runtime,/const isSingleReelMode=isArtistMode\|\|isFestivalMode/);
  assert.match(runtime,/registryPath=isFestivalMode\?'festival-machines\.json':'artist-machines\.json'/);
  assert.match(runtime,/async function runSpin\(source='lever'\)/);
  assert.match(runtime,/validBandcampUrl\(track\.artistBandcampUrl\)/);
  assert.match(runtime,/festival_machine_catalogue_unavailable/);
  assert.match(runtime,/renderFestivalIdentity\(identity\)/);
  assert.match(runtime,/festivalIdentityPlaque\.dataset\.lines/);
});

test('Festival Mode owns the green floral cabinet, wider reels and forged identity treatment',async()=>{
  const [css,asset]=await Promise.all([
    read('app/discovery-machine.css'),
    readFile(new URL('../public/music-machine/aggits-festival-cabinet.webp',import.meta.url)),
  ]);
  assert.ok(asset.byteLength>100_000);
  assert.match(css,/data-machine-content="festival"/);
  assert.match(css,/\.festival-identity-plaque/);
  assert.match(css,/\.machine-controls\{left:19\.2%;right:19\.2%;top:66\.55%;height:10\.8%/);
  assert.match(css,/height:76%;border-radius:9%\/11%/);
  assert.match(css,/data-machine-content="festival"\] \.reel-bank\{left:19\.2%;right:19\.2%/);
  assert.match(css,/data-machine-content="festival"\] \.reel\{background-size:130% 140%/);
  assert.match(css,/data-machine-content="festival"\] \.reel-strip\{inset:2\.5% 13% 3%/);
  assert.match(css,/\.festival-identity-line\{[^}]*white-space:nowrap/);
  assert.match(css,/\.festival-identity-line::before\{content:attr\(data-text\)/);
  assert.match(css,/\.festival-identity-plaque\[data-lines="3"\]/);
  assert.match(css,/#32683a/);
  assert.match(css,/-webkit-background-clip:text/);
});

test('festival titles are deterministically balanced into one to three ironwork lines',()=>{
  const examples=[
    'PORT FAIRY FOLK FESTIVAL 2026',
    'MEREDITH MUSIC FESTIVAL',
    'GOLDEN PLAINS',
    'QUEENSCLIFF MUSIC FESTIVAL',
    'MELBOURNE INTERNATIONAL JAZZ FESTIVAL',
    'THE FESTIVAL OF SMALL HALLS',
  ];
  for(const title of examples){
    const lines=formatMachineTitleLines(title);
    assert.ok(lines.length>=1&&lines.length<=3,title);
    assert.equal(lines.join(' '),title);
    assert.deepEqual(formatMachineTitleLines(title),lines);
  }
  assert.equal(formatMachineTitleLines('GOLDEN PLAINS').length,1);
  assert.equal(formatMachineTitleLines('PORT FAIRY FOLK FESTIVAL 2026').length,2);
  assert.equal(formatMachineTitleLines('A VERY LONG INTERNATIONAL FESTIVAL OF INDEPENDENT MUSIC AND ARTS 2026').length,3);
});

test('the publisher enforces 35 URLs and keeps track data out of the festival registry',async()=>{
  const build=await read('scripts/build-github-pages.mjs');
  assert.match(build,/bandcampUrls\.length>35/);
  assert.match(build,/delete sourceMetadata\.songs/);
  assert.match(build,/festival-machine-catalogues/);
  assert.match(build,/festival-machines\.json/);
  assert.match(build,/renderFestivalMachine/);
});

test('the Festivals dashboard retains manual editing, explicit replacement and dirty ticker protection',async()=>{
  const source=await read('desktop/festivals.py');
  assert.match(source,/range\(MAX_FESTIVAL_ARTISTS\)/);
  assert.match(source,/askyesno/);
  assert.match(source,/self\._ticker_dirty/);
  assert.match(source,/CLEAR FESTIVAL IMPORT/);
  assert.match(source,/CONFIGURE SEARCH/);
  assert.match(source,/BRAVE_SEARCH_API_KEY/);
  assert.match(source,/check_failed/);
  assert.match(source,/deliver_artist/);
});
