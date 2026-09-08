import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { formatMachineTitleLines } from '../github-pages/assets/discovery-machine-core.js';

const read=(file:string)=>readFile(new URL(`../${file}`,import.meta.url),'utf8');

test('Festival Mode preserves the master cabinet and existing one-reel control surface',async()=>{
  const [festival,artist]=await Promise.all([read('templates/festival-machine.html'),read('templates/artist-machine.html')]);
  assert.match(festival,/data-machine-mode="artist" data-machine-content="festival"/);
  assert.match(festival,/data-machine-state="SLEEPING"/);
  assert.match(festival,/aggits-festival-cabinet-v2\.webp/);
  assert.match(festival,/data-festival-title/);
  assert.equal((festival.match(/class="reel" data-reel=/g)||[]).length,1);
  for(const action of ['share','play','buy','spin-again','love'])assert.match(festival,new RegExp(`data-action="${action}"`));
  assert.match(festival,/data-action="spin-again" aria-label="Re-spin the festival song reel">RE-SPIN<\/button>/);
  assert.doesNotMatch(festival,/festival-identity-plaque|speaker-label/);
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
  assert.match(runtime,/setState\('IDLE','Pull the lever or press Re-Spin to discover a festival song\.'/);
});

test('Festival Mode owns the tall green floral chassis, hero reel and central circular PLAY treatment',async()=>{
  const [css,asset]=await Promise.all([
    read('app/discovery-machine.css'),
    readFile(new URL('../public/music-machine/aggits-festival-cabinet-v2.webp',import.meta.url)),
  ]);
  assert.ok(asset.byteLength>100_000);
  assert.match(css,/data-machine-content="festival"/);
  assert.doesNotMatch(css,/\.festival-identity-plaque|\.festival-identity-line/);
  assert.match(css,/aspect-ratio:953\/1650/);
  assert.match(css,/grid-template-columns:1fr 1fr 1\.36fr 1fr 1fr/);
  assert.match(css,/data-machine-content="festival"\] \.reel-bank\{left:17\.9%;right:17\.9%;top:36\.3%;height:17\.35%/);
  assert.match(css,/data-machine-content="festival"\] \.reel-strip\{inset:2\.5% 14% 3%/);
  assert.match(css,/machine-controls>\.play-button\{[^}]*aspect-ratio:1[^}]*border-radius:50%/);
  assert.match(css,/\.festival-speaker-title/);
  assert.match(css,/#32683a/);
});

test('Festival Mode waits for its entrance reveal before the existing wake and leaves Re-Spin as a spin control',async()=>{
  const [runtime,css,core]=await Promise.all([read('github-pages/assets/discovery-machine.js'),read('app/discovery-machine.css'),read('github-pages/assets/discovery-machine-core.js')]);
  assert.match(core,/'SLEEPING','WAKING','IDLE'/);
  assert.match(runtime,/const FESTIVAL_DORMANT_HOLD_MS=1000/);
  assert.match(runtime,/const FESTIVAL_WAKE_DURATION_MS=1800/);
  assert.match(runtime,/const FESTIVAL_INTRO_HOLD_MS=5000/);
  assert.match(runtime,/const FESTIVAL_INTRO_DOOR_OPEN_MS=1200/);
  assert.match(runtime,/const FESTIVAL_INTRO_REVEAL_PAUSE_MS=1000/);
  assert.match(runtime,/function wakeFestivalMachine\(\)/);
  assert.match(runtime,/setState\('WAKING'/);
  assert.match(runtime,/requestFestivalWake\('festival_intro'\)/);
  assert.match(runtime,/setTimeout\(\(\)=>requestFestivalWake\('return_visit'\),FESTIVAL_DORMANT_HOLD_MS\)/);
  assert.match(runtime,/spinAgainButton\.addEventListener\('click',\(\)=>void runSpin\('spin_again'\)\)/);
  assert.doesNotMatch(runtime,/festivalSleeping\?wakeFestivalMachine\(\):runSpin/);
  assert.doesNotMatch(css,/data-machine-state="SLEEPING"\] \.machine-controls>\.re-spin-button/);
  assert.match(css,/@keyframes festivalCabinetWake/);
  assert.match(css,/@keyframes festivalComponentWake/);
});

test('Festival entrance is dynamic, split-door, skippable, session-keyed and accessible',async()=>{
  const [runtime,css,festival,asset]=await Promise.all([
    read('github-pages/assets/discovery-machine.js'),
    read('app/discovery-machine.css'),
    read('templates/festival-machine.html'),
    readFile(new URL('../public/music-machine/aggits-festival-intro.webp',import.meta.url)),
  ]);
  assert.ok(asset.byteLength>100_000);
  assert.match(festival,/data-festival-intro data-intro-state="hold"/);
  assert.equal((festival.match(/class="festival-intro-door /g)||[]).length,2);
  assert.equal((festival.match(/data-festival-intro-title/g)||[]).length,2);
  assert.equal((festival.match(/data-festival-intro-year/g)||[]).length,2);
  assert.match(festival,/aggits-festival-intro\.webp/);
  assert.match(festival,/festival-intro-seen:\$\{slug\}/);
  assert.doesNotMatch(festival,/PORT FAIRY|2026/);
  assert.match(runtime,/const festivalIntroSeenKey=`aggits:festival-intro-seen:\$\{requestedFestivalSlug\|\|'festival'\}`/);
  assert.match(runtime,/formatMachineTitleLines\(name,3\)/);
  assert.match(runtime,/function onFestivalIntroPointerMove/);
  assert.match(runtime,/Math\.hypot\([^)]*\)>12/);
  assert.match(runtime,/festivalIntroMultiTouch=true/);
  assert.match(runtime,/setFestivalInteractionLocked\(true\)/);
  assert.match(runtime,/setFestivalInteractionLocked\(false\)/);
  for(const event of ['intro_shown','intro_skipped','intro_open_started','intro_open_completed','machine_wake_started'])assert.match(runtime,new RegExp(`recordEvent\\('${event}'`),event);
  assert.match(css,/\.festival-intro\{[^}]*height:100dvh[^}]*perspective:/);
  assert.match(css,/festival-intro-door--left\{[^}]*transform-origin:0 50%/);
  assert.match(css,/festival-intro-door--right\{[^}]*transform-origin:100% 50%/);
  assert.match(css,/@media \(prefers-reduced-motion:reduce\)\{\.festival-intro-door/);
});

test('the Festival ticker starts once and remains independent of spin and winner state',async()=>{
  const [runtime,css,festival]=await Promise.all([read('github-pages/assets/discovery-machine.js'),read('app/discovery-machine.css'),read('templates/festival-machine.html')]);
  assert.match(runtime,/let festivalTickerStarted=false/);
  assert.match(runtime,/function showFestivalTitleIntro\(\)/);
  assert.match(runtime,/showInformationTicker\(festivalInformationText\(\)/);
  assert.match(runtime,/if\(isFestivalMode&&festivalTickerStarted\)return/);
  assert.match(runtime,/if\(isFestivalMode\)\{showFestivalTitleIntro\(\);return\}/);
  assert.match(css,/\.artist-information-track\.is-streaming\{animation:artistInformationStream var\(--artist-duration,120s\) linear infinite\}/);
  assert.match(css,/data-machine-content="festival"\] \.machine-title-identity small\{display:none\}/);
  assert.doesNotMatch(festival,/festival-identity-plaque/);
});

test('the winner splash fully owns the foreground and the celebration sound fires with its reveal',async()=>{
  const [runtime,css]=await Promise.all([read('github-pages/assets/discovery-machine.js'),read('app/discovery-machine.css')]);
  assert.match(css,/data-machine-content="festival"\]\[data-machine-state="WIN_CELEBRATION"\] \.winner-splash\{z-index:48\}/);
  assert.match(css,/data-machine-content="festival"\]\[data-machine-state="WIN_CELEBRATION"\] \.winner-splash-artwork\{visibility:hidden\}/);
  assert.match(runtime,/setState\('WIN_CELEBRATION'\);celebrationSound\(\);recordEvent\('winner_revealed'/);
  assert.match(runtime,/function celebrationSound\(\)\{\s*ensureMachineSamples\(\);clearTimeout\(winnerAudioTimer\);playSample\(winnerAudio/);
  assert.match(runtime,/function playSample\(audio,\{volume=\.55,rate=1\}=\{\}\)\{\s*if\(soundOff\|\|!audio\)return/);
});

test('Festival titles fit the lower forged medallion without hard-coded festival copy',async()=>{
  const [runtime,festival]=await Promise.all([read('github-pages/assets/discovery-machine.js'),read('templates/festival-machine.html')]);
  for(const title of ['PORT FAIRY FOLK FESTIVAL 2026','MEREDITH MUSIC FESTIVAL','GOLDEN PLAINS','QUEENSCLIFF MUSIC FESTIVAL','DARK MOFO','MELBOURNE INTERNATIONAL JAZZ FESTIVAL','FESTIVAL OF SMALL HALLS']){
    const lines=formatMachineTitleLines(title);assert.ok(lines.length>=1&&lines.length<=3,title);assert.equal(lines.join(' '),title);
  }
  assert.match(festival,/data-festival-speaker-title>FESTIVAL MUSIC MACHINE/);
  assert.match(runtime,/renderFestivalSpeakerTitle\(identity\)/);
  assert.doesNotMatch(festival,/PORT FAIRY|GOOD MUSIC|BRIGHTER DAYS|TREE/);
});

test('LOVE THIS is anonymous, session-deduplicated and uses the central analytics transport',async()=>{
  const [runtime,festival]=await Promise.all([read('github-pages/assets/discovery-machine.js'),read('templates/festival-machine.html')]);
  assert.match(festival,/data-action="love" aria-pressed="false" disabled/);
  assert.match(runtime,/const analytics=Object\.freeze/);
  assert.match(runtime,/function recordEvent\(eventType,details=\{\}\)\{analytics\.track/);
  assert.match(runtime,/function lovedTracks\(\)\{return new Set\(readSession/);
  assert.match(runtime,/if\(loved\.has\(trackId\)\)return/);
  for(const event of ['session_start','machine_wake','machine_wake_started','spin_started','spin_completed','track_selected','track_play_started','track_play_paused','track_love','re_spin','bandcamp_click','share_click','home_click','sound_toggle'])assert.match(runtime,new RegExp(`recordEvent\\('${event}'`),event);
  assert.doesNotMatch(festival,/LOVE COUNT|POPULAR|TRENDING|LEADERBOARD/);
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
