import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createShuffleBag, playableArtistTracks } from '../github-pages/assets/discovery-machine-core.js';

const read=(file:string)=>readFile(new URL(`../${file}`,import.meta.url),'utf8');

test('Artist Mode is one reusable one-reel machine with the approved controls and acquisition path',async()=>{
  const template=await read('templates/artist-machine.html');
  assert.match(template,/data-machine-mode="artist"/);
  assert.equal((template.match(/class="reel" data-reel=/g)||[]).length,1);
  assert.match(template,/data-machine-title>ARTIST<\/strong>/);
  assert.doesNotMatch(template,/MUSIC MACHINE<\/strong>|BANDCAMP CATALOGUE|data-stat="tracks"/);
  for(const action of ['share','play','buy','spin-again'])assert.match(template,new RegExp(`data-action="${action}"`));
  assert.match(template,/VISIT<br>BANDCAMP/);
  assert.match(template,/WANT ONE FOR YOUR BAND\?/);
  assert.match(template,/GET YOUR OWN MUSIC MACHINE/);
  for(const field of ['artistName','bandcampUrl','email','city','message','website'])assert.match(template,new RegExp(`name="${field}"`));
});

test('Artist Mode title contains only the artist name and no catalogue subtitle',async()=>{
  const [template,published,runtime,css]=await Promise.all([
    read('templates/artist-machine.html'),
    read('github-pages/artist/index.html'),
    read('github-pages/assets/discovery-machine.js'),
    read('app/discovery-machine.css'),
  ]);
  for(const page of [template,published]){
    assert.match(page,/data-machine-title>ARTIST<\/strong>/);
    assert.doesNotMatch(page,/MUSIC MACHINE<\/strong>|BANDCAMP CATALOGUE|data-stat="tracks"/);
  }
  assert.match(runtime,/const heading=cleanText\(identity,96\)\.toUpperCase\(\)/);
  assert.doesNotMatch(runtime,/`\$\{identity\} MUSIC MACHINE`/);
  assert.match(runtime,/isArtistMode&&heading\.length>18/);
  assert.match(css,/data-machine-mode="artist"\] \.machine-title-identity strong\{[^}]*font-size:clamp\(15px,5\.1vw,29px\)/);
  assert.match(css,/data-machine-mode="artist"\] \.machine-title-identity strong\.is-very-long\{font-size:clamp\(9px,3vw,17px\)/);
});

test('Artist Mode and Melbourne City Mode share the same cabinet runtime and canonical spin path',async()=>{
  const [artistTemplate,cityTemplate,runtime,reelEngine]=await Promise.all([read('templates/artist-machine.html'),read('templates/universe-index.html'),read('github-pages/assets/discovery-machine.js'),read('github-pages/assets/single-reel-engine.js')]);
  assert.match(artistTemplate,/assets\/discovery-machine\.js/);
  assert.match(cityTemplate,/assets\/discovery-machine\.js/);
  assert.match(runtime,/const isArtistMode=machineMode==='artist'/);
  assert.match(runtime,/async function runSpin\(source='lever'\)/);
  assert.match(runtime,/spinAgainButton\.addEventListener\('click',\(\)=>void runSpin\('spin_again'\)\)/);
  assert.match(runtime,/void runSpin\('lever'\)/);
  assert.match(runtime,/stopTimes=isSingleReelMode/);
  assert.match(runtime,/entries:\[winner\]/);
  assert.match(runtime,/populateSingleReel,spinSingleReel/);
  assert.match(runtime,/return spinSingleReel\(/);
  assert.match(reelEngine,/duration:2350/);
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
  assert.match(runtime,/onStop:reelThunk/);
  assert.match(runtime,/presentWinner\(winnerHeading,winnerDetail,prepared\.track\)/);
  assert.match(css,/data-machine-mode="artist"[^}]*\.reel-bank/);
  assert.match(css,/data-machine-mode="artist"[^}]*\.reel-strip>\*/);
  assert.match(css,/grid-template-rows:repeat\(3,1fr\)/);
  assert.match(css,/data-machine-mode="artist"[^}]*\.winner-splash-copy\{left:13%;right:13%\}/);
  assert.match(css,/data-artist-skin="workfriend-western"/);
});

test('Bandcamp Label Mode reuses Artist Mode while preserving per-track identity and commerce',async()=>{
  const [runtime,build,dashboard,factory]=await Promise.all([
    read('github-pages/assets/discovery-machine.js'),
    read('scripts/build-github-pages.mjs'),
    read('desktop/artist_machine_factory_dashboard.py'),
    read('scripts/artist_machine_factory.py'),
  ]);
  assert.match(runtime,/isLabelMode=!isFestivalMode&&artistConfig\?\.catalogueKind==='label'/);
  assert.match(runtime,/isLabelMode\?\(entry\?\.artist\|\|'LABEL ARTIST'\)/);
  assert.match(runtime,/track\?\.artistBandcampUrl/);
  assert.match(runtime,/isLabelMode\?\(validBandcampUrl\(track\?\.bandcampUrl\)/);
  assert.match(runtime,/winnerHeading=isLabelMode\?revealedArtist/);
  assert.match(runtime,/catalogueKind:isLabelMode\?'label'/);
  assert.match(build,/invalid_label_machine_config/);
  assert.match(build,/Label discovery catalogue/);
  assert.match(dashboard,/RESHUFFLE 35 TRACKS/);
  assert.match(dashboard,/VIEW FULL CATALOGUE/);
  assert.match(dashboard,/REFRESH LABEL CATALOGUE/);
  assert.match(factory,/label-catalogue\.json/);
  assert.match(factory,/def refresh_label_catalogue/);
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

test('Factory publication is independent from delivery and finished machines email in batches of five',async()=>{
  const [dashboard,worker,migration,publishWorkflow,deliveryWorkflow]=await Promise.all([
    read('desktop/artist_machine_factory_dashboard.py'),
    read('services/cosmic-worker/src/index.js'),
    read('services/cosmic-worker/migrations/0009_artist_machine_delivery_batches.sql'),
    read('.github/workflows/publish-artist-machine.yml'),
    read('.github/workflows/deliver-artist-machine-batch.yml'),
  ]);
  assert.match(dashboard,/MAX_EMAIL_BATCH = 5/);
  assert.match(dashboard,/queue_published_machine/);
  assert.match(dashboard,/SEND EMAIL BATCH \(UP TO 5\)/);
  assert.match(dashboard,/register_delivery_batch/);
  assert.match(dashboard,/delivery_batch_status/);
  assert.doesNotMatch(publishWorkflow,/delivery_id|Email the finished machine link/);
  assert.match(worker,/async function createArtistMachineDeliveryBatch/);
  assert.match(worker,/async function sendArtistMachineDeliveryBatch/);
  assert.match(worker,/syncAuthorized\(request,env\)/);
  assert.match(worker,/artist-machine-delivery-batch-\$\{batchId\}/);
  assert.match(worker,/ARTIST_MACHINE_DELIVERY_FROM_EMAIL\|\|env\.REPORT_FROM_EMAIL/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS artist_machine_delivery_batch/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS artist_machine_delivery_batch_item/);
  assert.match(deliveryWorkflow,/Send one email containing the finished links and QR cards/);
  assert.match(deliveryWorkflow,/secrets\.COSMIC_WORKER_SYNC_TOKEN/);
  assert.match(deliveryWorkflow,/artist-machine-delivery-batches\/\$BATCH_ID\/send/);
});

test('each Artist Machine has a crawlable band route, branded social card and emailed QR attachment',async()=>{
  const [template,build,runtime,worker,media]=await Promise.all([
    read('templates/artist-machine.html'),read('scripts/build-github-pages.mjs'),read('github-pages/assets/discovery-machine.js'),
    read('services/cosmic-worker/src/index.js'),read('scripts/artist_machine_media.py'),
  ]);
  assert.match(template,/property="og:image"/);
  assert.match(template,/name="twitter:card" content="summary_large_image"/);
  assert.match(build,/artist\',config\.artistSlug/);
  assert.match(build,/social-card\.jpg/);
  assert.match(runtime,/dataset\.artistSlug/);
  assert.match(runtime,/artist\/\$\{encodeURIComponent\(slug\)\}\//);
  assert.match(worker,/qr-card\.png/);
  assert.match(worker,/attachments/);
  assert.match(media,/Generated Artist Machine QR artwork failed independent decode verification/);
});
