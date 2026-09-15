import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { formatMachineTitleLines } from '../github-pages/assets/discovery-machine-core.js';

const read=(file:string)=>readFile(new URL(`../${file}`,import.meta.url),'utf8');

test('Festival Mode is rendered from the same standard AGGITS single-reel template',async()=>{
  const [festival,artist,builder]=await Promise.all([read('github-pages/festival/index.html'),read('templates/artist-machine.html'),read('scripts/build-github-pages.mjs')]);
  assert.match(festival,/data-machine-mode="festival" data-festival-shell="standard"/);
  assert.match(festival,/data-machine-state="BOOT"/);
  assert.match(festival,/aggits-cabinet\.webp/);
  assert.match(festival,/data-festival-header-title/);
  assert.equal((festival.match(/class="reel" data-reel=/g)||[]).length,1);
  for(const action of ['share','play','buy','spin-again'])assert.match(festival,new RegExp(`data-action="${action}"`));
  assert.doesNotMatch(festival,/data-action="love"|data-machine-content="festival"|aggits-festival-cabinet-v3|festival-intro/);
  assert.match(artist,/data-machine-mode="artist" \{\{MACHINE_DATA\}\}/);
  assert.doesNotMatch(builder,/festivalMachineTemplate|templates','festival-machine\.html/);
  assert.match(builder,/renderFestivalMachine\(\)[\s\S]*return artistMachineTemplate/);
});

test('Festival Mode feeds the shared catalogue, spin and Bandcamp purchase pipeline',async()=>{
  const runtime=await read('github-pages/assets/discovery-machine.js');
  assert.match(runtime,/const isSingleReelMode=isArtistMode\|\|isFestivalMode/);
  assert.match(runtime,/registryPath=isFestivalMode\?'festival-machines\.json':'artist-machines\.json'/);
  assert.match(runtime,/async function runSpin\(source='lever'\)/);
  assert.match(runtime,/validBandcampUrl\(track\.artistBandcampUrl\)/);
  assert.match(runtime,/festival_machine_catalogue_unavailable/);
  assert.match(runtime,/setState\('IDLE','Pull the lever or press Re-Spin to discover a festival song\.'/);
});

test('Festival Mode uses the standard red cabinet geometry and standard controls',async()=>{
  const [css,festival,asset]=await Promise.all([
    read('app/discovery-machine.css'),
    read('github-pages/festival/index.html'),
    readFile(new URL('../public/music-machine/aggits-cabinet.webp',import.meta.url)),
  ]);
  assert.ok(asset.byteLength>100_000);
  assert.match(festival,/cabinet-skin[^>]+aggits-cabinet\.webp[^>]+width="1024" height="1536"/);
  assert.match(css,/:is\(\[data-machine-mode="artist"\],\[data-machine-mode="festival"\]\) \.reel-bank\{left:22%;right:22%;top:37%;height:20\.2%;grid-template-columns:1fr/);
  assert.match(css,/:is\(\[data-machine-mode="artist"\],\[data-machine-mode="festival"\]\) \.ticker-panel\{top:59%;height:7\.4%\}/);
  assert.equal((festival.match(/class="machine-controls"/g)||[]).length,1);
  assert.doesNotMatch(festival,/control-icon|LOVE THIS|festival-speaker-title/);
});

test('Festival Mode has no entrance doors or five-second interaction lock',async()=>{
  const [runtime,festival]=await Promise.all([read('github-pages/assets/discovery-machine.js'),read('github-pages/festival/index.html')]);
  assert.doesNotMatch(festival,/data-festival-intro|festival-intro-door|aggits-festival-cabinet-doors/);
  assert.match(runtime,/if\(!festivalIntro\)\{festivalIntroState='complete';setFestivalInteractionLocked\(false\);return\}/);
  assert.match(runtime,/festivalCatalogueReady=true/);
  assert.match(runtime,/spinAgainButton\.addEventListener\('click',\(\)=>void runSpin\('spin_again'\)\)/);
});

test('Festival Mode uses the standard title and ticker surfaces',async()=>{
  const [runtime,festival]=await Promise.all([read('github-pages/assets/discovery-machine.js'),read('github-pages/festival/index.html')]);
  assert.match(festival,/class="machine-title-identity"/);
  assert.match(festival,/class="ticker-copy"/);
  assert.match(runtime,/function showFestivalTitleIntro\(\)[\s\S]*festivalTickerStarted=true;\s*showMachineIdentity\(\)/);
  assert.doesNotMatch(runtime,/function showTicker\([^)]*\)\{\s*if\(isFestivalMode\)/);
  assert.doesNotMatch(runtime,/function startTickerRotation\([^)]*\)\{\s*if\(isFestivalMode\)/);
});

test('the Festival winner skips the splash and waiting period but retains the bell sound',async()=>{
  const [runtime,festival]=await Promise.all([read('github-pages/assets/discovery-machine.js'),read('github-pages/festival/index.html')]);
  assert.match(festival,/winner-splash|winner-splash-frame/);
  assert.match(runtime,/setMeterMode\(isFestivalMode\?'idle':'celebrate'\);celebrationSound\(\);recordEvent\('winner_revealed'/);
  assert.match(runtime,/if\(!isFestivalMode\)\{setState\('WIN_CELEBRATION'\);const revealCompleted=await holdWinnerSplash\(\);if\(!revealCompleted\)return\}await loadWinningTrack/);
  assert.match(runtime,/function celebrationSound\(\)\{\s*ensureMachineSamples\(\);clearTimeout\(winnerAudioTimer\);playSample\(winnerAudio/);
  assert.match(runtime,/function playSample\(audio,\{volume=\.55,rate=1\}=\{\}\)\{\s*if\(soundOff\|\|!audio\)return/);
});

test('Festival titles fit the standard hero panel and optional festival artwork',async()=>{
  const [runtime,festival]=await Promise.all([read('github-pages/assets/discovery-machine.js'),read('github-pages/festival/index.html')]);
  for(const title of ['PORT FAIRY FOLK FESTIVAL 2026','MEREDITH MUSIC FESTIVAL','GOLDEN PLAINS','QUEENSCLIFF MUSIC FESTIVAL','DARK MOFO','MELBOURNE INTERNATIONAL JAZZ FESTIVAL','FESTIVAL OF SMALL HALLS']){
    const lines=formatMachineTitleLines(title);assert.ok(lines.length>=1&&lines.length<=3,title);assert.equal(lines.join(' '),title);
  }
  assert.match(festival,/data-festival-header-title/);
  assert.match(festival,/class="machine-title-identity"/);
  assert.match(runtime,/renderFestivalHeaderIdentity\(\)/);
  assert.match(runtime,/machineHeaderArtwork\|\|artistConfig\.festivalPlaqueImage\|\|artistConfig\.festivalHeroImage/);
  assert.doesNotMatch(festival,/PORT FAIRY|GOOD MUSIC|BRIGHTER DAYS|TREE/);
});

test('Festival Mode keeps the shared analytics transport and standard four controls',async()=>{
  const [runtime,festival]=await Promise.all([read('github-pages/assets/discovery-machine.js'),read('github-pages/festival/index.html')]);
  assert.doesNotMatch(festival,/data-action="love"|LOVE THIS/);
  for(const action of ['share','play','buy','spin-again'])assert.match(festival,new RegExp(`data-action="${action}"`));
  assert.match(runtime,/const analytics=Object\.freeze/);
  assert.match(runtime,/function recordEvent\(eventType,details=\{\}\)\{analytics\.track/);
  for(const event of ['session_start','spin_started','spin_completed','track_selected','track_play_started','track_play_paused','re_spin','bandcamp_click','share_click','home_click','sound_toggle'])assert.match(runtime,new RegExp(`recordEvent\\('${event}'`),event);
});

test('the publisher enforces 35 URLs and keeps track data out of the festival registry',async()=>{
  const build=await read('scripts/build-github-pages.mjs');
  assert.match(build,/bandcampUrls\.length>35/);
  assert.match(build,/delete sourceMetadata\.songs/);
  assert.match(build,/festival-machine-catalogues/);
  assert.match(build,/festival-machines\.json/);
  assert.match(build,/renderFestivalMachine/);
});

test('Festival Mode is embedded in the Factory with poster review, explicit approvals and private projects',async()=>{
  const [factory,mode,projects,spec]=await Promise.all([read('desktop/artist_machine_factory_dashboard.py'),read('desktop/festival_mode.py'),read('scripts/festival_projects.py'),read('desktop/ArtistMachineFactory.spec')]);
  assert.match(factory,/STANDARD MODE/);assert.match(factory,/FESTIVAL MODE/);assert.match(factory,/FestivalModeFrame/);
  for(const control of ['READ FESTIVAL LINEUP','FIND BANDCAMP ARTISTS','APPROVE ALL CONFIRMED','RECHECK UNRESOLVED','BUILD FESTIVAL MACHINE','OPEN PRIVATE PREVIEW','APPROVE + PUBLISH'])assert.ok(mode.includes(control),control);
  for(const action of ['NEW','OPEN','SAVE','SAVE AS','DUPLICATE','DELETE'])assert.match(mode,new RegExp(`"${action}"`));
  assert.match(projects,/rawExtractedLineup/);assert.match(projects,/bandcampMatches/);assert.match(projects,/festivalLibrary/);
  assert.match(spec,/festival_mode/);assert.match(spec,/rapidocr_onnxruntime/);assert.doesNotMatch(spec,/Festivals\.exe/);
});

test('Festival Mode imports a validated canonical full-cabinet skin with a safe red fallback',async()=>{
  const [mode,projects,builder,runtime,css]=await Promise.all([read('desktop/festival_mode.py'),read('scripts/festival_projects.py'),read('scripts/create_festival_machine.py'),read('github-pages/assets/discovery-machine.js'),read('app/discovery-machine.css')]);
  for(const control of ['DROP A COMPLETE FESTIVAL SKIN HERE','CHOOSE / REPLACE SKIN','USE STANDARD RED SKIN'])assert.ok(mode.includes(control),control);
  assert.match(mode,/validate_festival_skin/);
  assert.match(mode,/cabinet-skin/);
  assert.match(projects,/FESTIVAL_SKIN_WIDTH = 1024/);
  assert.match(projects,/FESTIVAL_SKIN_HEIGHT = 1536/);
  assert.match(projects,/aggits-festival-canonical-1024x1536-v1/);
  assert.match(projects,/jukeboxSkinManifest/);
  assert.match(builder,/festivalCabinetArtwork/);
  assert.match(builder,/"visualShell": "standard-aggits-single-reel"/);
  assert.match(runtime,/machine\.dataset\.festivalSkin=variant/);
  assert.match(css,/data-festival-skin="festival-canonical-v1"\]>\.cabinet[^}]*aspect-ratio:2\/3/);
});
