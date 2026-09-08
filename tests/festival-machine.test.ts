import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read=(file:string)=>readFile(new URL(`../${file}`,import.meta.url),'utf8');

test('Festival Mode preserves the master cabinet and existing one-reel control surface',async()=>{
  const [festival,artist]=await Promise.all([read('templates/festival-machine.html'),read('templates/artist-machine.html')]);
  assert.match(festival,/data-machine-mode="artist" data-machine-content="festival"/);
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
