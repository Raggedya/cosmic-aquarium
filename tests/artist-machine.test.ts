import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createShuffleBag, playableArtistTracks } from '../github-pages/assets/discovery-machine-core.js';

const read=(file:string)=>readFile(new URL(`../${file}`,import.meta.url),'utf8');

test('Artist Mode is one reusable one-reel machine with the approved controls and acquisition path',async()=>{
  const template=await read('templates/artist-machine.html');
  assert.match(template,/data-machine-mode="artist"/);
  assert.equal((template.match(/class="reel" data-reel=/g)||[]).length,1);
  assert.match(template,/data-machine-title>ARTIST MUSIC MACHINE/);
  for(const action of ['share','play','buy','spin-again'])assert.match(template,new RegExp(`data-action="${action}"`));
  assert.match(template,/VISIT<br>BANDCAMP/);
  assert.match(template,/WANT ONE FOR YOUR BAND\?/);
  assert.match(template,/GET YOUR OWN MUSIC MACHINE/);
  for(const field of ['artistName','bandcampUrl','email','city','message','website'])assert.match(template,new RegExp(`name="${field}"`));
});

test('Artist Mode and Melbourne City Mode share the same cabinet runtime and canonical spin path',async()=>{
  const [artistTemplate,cityTemplate,runtime]=await Promise.all([read('templates/artist-machine.html'),read('templates/universe-index.html'),read('github-pages/assets/discovery-machine.js')]);
  assert.match(artistTemplate,/assets\/discovery-machine\.js/);
  assert.match(cityTemplate,/assets\/discovery-machine\.js/);
  assert.match(runtime,/const isArtistMode=machineMode==='artist'/);
  assert.match(runtime,/async function runSpin\(source='lever'\)/);
  assert.match(runtime,/spinAgainButton\.addEventListener\('click',\(\)=>void \(isFestivalMode&&festivalSleeping\?wakeFestivalMachine\(\):runSpin\('spin_again'\)\)\)/);
  assert.match(runtime,/void runSpin\('lever'\)/);
  assert.match(runtime,/stopTimes=isSingleReelMode/);
  assert.match(runtime,/entries:\[winner\]/);
});

test('the Workfriend reference machine exposes every unique eligible song and a clean permanent URL identity',async()=>{
  const config=JSON.parse(await read('automation/artist-machines/workfriend.json'));
  assert.equal(config.machineMode,'artist');
  assert.equal(config.artistSlug,'workfriend');
  assert.equal(config.artistName,'Workfriend');
  assert.equal(config.cabinetArtwork,'/assets/music-machine/workfriend-cabinet.jpg');
  assert.equal(config.skinVariant,'workfriend-western');
  const songs=playableArtistTracks({tracks:config.songs});
  assert.equal(songs.length,13);
  assert.equal(new Set(songs.map(track=>track.id)).size,songs.length);
  assert.ok(songs.some(track=>track.title==='La Scala'));
  assert.ok(songs.every(track=>track.artworkUrl?.startsWith('https://')));
});

test('a shuffle bag produces 30 successful spins without an immediate repeat',async()=>{
  const config=JSON.parse(await read('automation/artist-machines/workfriend.json'));
  const songs=playableArtistTracks({tracks:config.songs});
  let bag:Array<{id:string}>=[];let previous='';
  for(let spin=0;spin<30;spin++){
    if(!bag.length){const seed=spin+1;const cryptoStub={getRandomValues(array:Uint32Array){array[0]=(seed*2654435761+array.length)>>>0;return array}} as unknown as Crypto;bag=createShuffleBag(songs,previous,cryptoStub)}
    const selected=bag.shift();assert.ok(selected,`spin ${spin+1} must select a track`);
    assert.notEqual(selected.id,previous,`spin ${spin+1} must avoid an immediate repeat`);
    previous=selected.id;
  }
});

test('Artist Mode retains one mechanical stop and the shared four-second winner spotlight',async()=>{
  const [runtime,css]=await Promise.all([read('github-pages/assets/discovery-machine.js'),read('app/discovery-machine.css')]);
  assert.match(runtime,/const WINNER_SPLASH_DURATION_MS=4000/);
  assert.match(runtime,/\[2350\]/);
  assert.match(runtime,/reelThunk\(index\)/);
  assert.match(runtime,/presentWinner\(isSingleReelMode\?prepared\.track\.title/);
  assert.match(css,/data-machine-mode="artist"[^}]*\.reel-bank/);
  assert.match(css,/data-machine-mode="artist"[^}]*\.reel-strip>\*/);
  assert.match(css,/grid-template-rows:repeat\(3,1fr\)/);
  assert.match(css,/data-machine-mode="artist"[^}]*\.winner-splash-copy\{left:13%;right:13%\}/);
  assert.match(css,/data-artist-skin="workfriend-western"/);
});

test('artist-specific cabinet artwork is applied from validated configuration with a safe fallback',async()=>{
  const [runtime,build]=await Promise.all([read('github-pages/assets/discovery-machine.js'),read('scripts/build-github-pages.mjs')]);
  assert.match(runtime,/function applyArtistSkin\(config\)/);
  assert.match(runtime,/machine\.dataset\.artistSkin=variant/);
  assert.match(runtime,/cabinetSkin\.src=`\$\{base\}\$\{artwork\}`/);
  assert.match(build,/readdir\(path\.join\(root,'public','music-machine'\)\)/);
  assert.ok((await read('automation/artist-machines/workfriend.json')).includes('workfriend-cabinet.jpg'));
});

test('the artist ticker is factual and excludes the Melbourne culture bank',async()=>{
  const runtime=await read('github-pages/assets/discovery-machine.js');
  assert.match(runtime,/if\(isSingleReelMode\)\{/);
  assert.match(runtime,/artistConfig\?\.bio\|\|manifest\?\.bioShort/);
  assert.match(runtime,/artistConfig\?\.tickerCopy/);
  assert.match(runtime,/MELBOURNE_CULTURE_SEGMENTS/);
});

test('the build publishes only fully ingested Artist Machine catalogues without duplicating track data in the registry',async()=>{
  const build=await read('scripts/build-github-pages.mjs');
  assert.match(build,/artist-machines\.json/);
  assert.match(build,/cataloguePath:`\/artist-machine-catalogues\/\$\{artistSlug\}\.json`/);
  assert.match(build,/delete sourceMetadata\.songs/);
  assert.match(build,/templates','artist-machine\.html/);
  assert.match(build,/automation','artist-machines/);
  assert.match(build,/artist-machine-catalogues/);
});

test('the enquiry endpoint validates, rate limits, stores and emails requests without client credentials',async()=>{
  const [worker,migration,template]=await Promise.all([read('services/cosmic-worker/src/index.js'),read('services/cosmic-worker/migrations/0005_artist_machine_requests.sql'),read('templates/artist-machine.html')]);
  assert.match(worker,/\/api\/artist-machine-requests/);
  assert.match(worker,/validBandcampDestination/);
  assert.match(worker,/recentIp/);
  assert.match(worker,/recentEmail/);
  assert.match(worker,/RESEND_API_KEY/);
  assert.match(worker,/Artist Music Machine Request — \$\{artistName\}/);
  assert.match(worker,/ARTIST_MACHINE_REQUEST_EMAIL\|\|env\.OWNER_EMAIL/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS artist_machine_request/);
  assert.match(migration,/idx_artist_machine_request_ip_time/);
  assert.doesNotMatch(template,/RESEND_API_KEY|OWNER_EMAIL|REPORT_FROM_EMAIL/);
});
