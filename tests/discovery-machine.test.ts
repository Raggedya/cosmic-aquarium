import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildShareUrl, buildTickerMessages, validBandcampUrl, pickPlayableTrack,
  decideMachineResult, machineMatchProbability, isThreeArtistMatch,
  playableMelbourneEntries, MACHINE_STATES,
} from '../github-pages/assets/discovery-machine-core.js';

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('the public experience is one physical machine, not the retired selector/player pair',async()=>{
  const template=await read('templates/universe-index.html');
  assert.equal((template.match(/class="music-machine"/g)||[]).length,1);
  assert.equal((template.match(/class="reel" data-reel=/g)||[]).length,3);
  assert.doesNotMatch(template,/selection-screen|player-screen|glass-key|go-key/);
  assert.match(template,/AGGITS/);
  assert.match(template,/MELBOURNE MUSIC MACHINE/);
});

test('the lever is the only discovery trigger and supports drag plus keyboard fallback',async()=>{
  const [template,runtime]=await Promise.all([read('templates/universe-index.html'),read('github-pages/assets/discovery-machine.js')]);
  assert.equal((template.match(/class="lever"/g)||[]).length,1);
  assert.doesNotMatch(template,/data-action="spin"|class="(?:buy-button|secondary-button)"[^>]*>\s*SPIN/);
  assert.match(runtime,/lever\.addEventListener\('pointerdown',onLeverDown\)/);
  assert.match(runtime,/lever\.addEventListener\('pointermove',onLeverMove\)/);
  assert.match(runtime,/leverProgress>=\.72/);
  assert.match(runtime,/\['Enter',' '\]/);
});

test('a partial pull returns without a spin and a full pull is guarded against double triggering',async()=>{
  const runtime=await read('github-pages/assets/discovery-machine.js');
  assert.match(runtime,/if\(locked\|\|!catalogue\.length\)return/);
  assert.match(runtime,/if\(leverTriggered\)\{void runSpin\(\);resetLever\(true\)\}/);
  assert.match(runtime,/The lever returned without starting the reels/);
});

test('bounded random matching permits early surprises and prevents excessive dry runs',()=>{
  assert.equal(machineMatchProbability(0),.18);
  assert.equal(machineMatchProbability(4),1);
  assert.equal(decideMachineResult(0,.1,.9).match,true);
  assert.equal(decideMachineResult(0,.9,.1).nearMiss,true);
  assert.equal(decideMachineResult(4,.999,.999).match,true);
  assert.equal(decideMachineResult(2,.8,.8).nextLossesSinceMatch,3);
});

test('only three identical canonical artist identities form a match',()=>{
  const porch={canonicalArtistId:'bandcamp:porchlight',artist:'Porchlight'};
  assert.equal(isThreeArtistMatch([porch,{...porch},{...porch}]),true);
  assert.equal(isThreeArtistMatch([porch,porch,{canonicalArtistId:'bandcamp:sunbleach'}]),false);
  assert.equal(isThreeArtistMatch([porch,porch]),false);
});

test('near misses remain non-matches and ordinary settles use three artists',async()=>{
  const runtime=await read('github-pages/assets/discovery-machine.js');
  assert.match(runtime,/entries=\[winner,winner,winner\];entries\[oddIndex\]=odd/);
  assert.match(runtime,/while\(entries\.length<3\)/);
  assert.match(runtime,/if\(isThreeArtistMatch\(outcome\.entries\)\)/);
});

test('reels use real catalogue names and stop separately with physical lock-in',async()=>{
  const [template,runtime,css]=await Promise.all([read('templates/universe-index.html'),read('github-pages/assets/discovery-machine.js'),read('app/discovery-machine.css')]);
  assert.match(runtime,/artistName\(entry\)/);
  assert.equal((template.match(/class="reel-strip"/g)||[]).length,3);
  assert.equal((template.match(/<div class="reel-strip"><span><\/span><strong>[^<]+<\/strong><span><\/span><\/div>/g)||[]).length,3);
  assert.match(runtime,/\[before,current,after\]\.forEach/);
  assert.match(runtime,/classList\.toggle\('is-very-long',text\.length>22\)/);
  assert.match(runtime,/\[1550,2200,2950\]/);
  assert.match(runtime,/reelThunk\(index\)/);
  assert.match(css,/aggits-reel-v2\.webp/);
  assert.match(css,/grid-template-rows:repeat\(3,1fr\)/);
  assert.match(css,/\.payline\{[^}]*top:50%/);
  assert.match(css,/@keyframes reelLock/);
  assert.match(css,/\.reel\.is-spinning/);
});

test('the AGGITS marquee uses the reference-matched riveted metal artwork while keeping an accessible heading',async()=>{
  const [template,css]=await Promise.all([read('templates/universe-index.html'),read('app/discovery-machine.css')]);
  assert.match(template,/aggits-marquee-v2\.webp/);
  assert.match(template,/<h1 class="visually-hidden">AGGITS<\/h1>/);
  assert.match(css,/\.aggits-marquee img/);
});

test('the formal state machine covers the complete mechanical and playback sequence',()=>{
  for(const required of ['BOOT','IDLE','LEVER_PULL','SPIN_START','SPINNING','REEL_1_STOP','REEL_2_STOP','REEL_3_STOP','EVALUATE','LOSS','NEAR_MISS','WIN','WIN_CELEBRATION','LOADING_TRACK','AUTOPLAY_ATTEMPT','AWAITING_PLAY','PLAYING','PLAY_ERROR'])assert.ok(MACHINE_STATES.includes(required));
});

test('the twin meters and centre inscription share a recessed cabinet instrument cavity',async()=>{
  const css=await read('app/discovery-machine.css');
  assert.match(css,/\.meter-bank\{[^}]*box-shadow:inset/);
  assert.match(css,/\.meter-bank::before/);
  assert.match(css,/\.meter-bank::after/);
  assert.match(css,/\.meter-inscription\{[^}]*background:linear-gradient/);
  assert.doesNotMatch(css,/\.vu-meter\{[^}]*drop-shadow/);
});

test('the red central control is BUY MUSIC and never spins the reels',async()=>{
  const [template,runtime]=await Promise.all([read('templates/universe-index.html'),read('github-pages/assets/discovery-machine.js')]);
  assert.match(template,/class="buy-button" data-action="buy"/);
  assert.match(template,/BUY<br>MUSIC/);
  assert.match(runtime,/buyLink\.addEventListener\('click',\(\)=>recordEvent\('buy_click'/);
  assert.doesNotMatch(runtime,/buyLink\.addEventListener\('click',[\s\S]{0,80}runSpin/);
});

test('BUY and SHARE remain dormant until a real winning track is resolved',async()=>{
  const [template,runtime]=await Promise.all([read('templates/universe-index.html'),read('github-pages/assets/discovery-machine.js')]);
  assert.match(template,/data-action="buy" aria-disabled="true" tabindex="-1"/);
  assert.match(template,/data-action="share" disabled/);
  assert.match(runtime,/buyLink\.setAttribute\('aria-disabled','false'\)/);
  assert.match(runtime,/shareButton\.disabled=false/);
});

test('official Bandcamp playback, real purchase links and track fallback validation are preserved',async()=>{
  const [template,runtime]=await Promise.all([read('templates/universe-index.html'),read('github-pages/assets/discovery-machine.js')]);
  assert.match(template,/Official Bandcamp playback controls/);
  assert.match(runtime,/bandcamp\.com\/EmbeddedPlayer\/track=/);
  assert.match(runtime,/validBandcampUrl\(track\.bandcampUrl\)\|\|validBandcampUrl\(manifest\.bandcampUrl\)/);
  assert.match(runtime,/if\(!validBandcampUrl\(manifest\.bandcampUrl\)\|\|!pickPlayableTrack\(manifest\)\)/);
});

test('winner playback is requested automatically and degrades to an integrated tap-to-play control',async()=>{
  const [template,runtime,css]=await Promise.all([read('templates/universe-index.html'),read('github-pages/assets/discovery-machine.js'),read('app/discovery-machine.css')]);
  assert.match(template,/data-action="play-winner"/);
  assert.match(template,/Official Bandcamp playback controls/);
  assert.match(runtime,/autoplay=true/);
  assert.match(runtime,/schedulePlaybackFallback/);
  assert.match(runtime,/setState\('AUTOPLAY_ATTEMPT'/);
  assert.match(runtime,/setState\('AWAITING_PLAY'/);
  assert.match(runtime,/winnerPlayButton\.addEventListener\('click',requestWinnerPlayback\)/);
  assert.match(runtime,/function animateLeverAndSpin\(\)\{if\(locked\)return;ensureAudio\(\)/);
  assert.match(css,/data-machine-state="AWAITING_PLAY"/);
});

test('the live source of truth is exactly 500 Melbourne artists and 3,744 playable tracks',async()=>{
  const [catalogueText,statsText]=await Promise.all([read('github-pages/aquariums.json'),read('github-pages/universe-stats.json')]);
  const catalogue=JSON.parse(catalogueText),stats=JSON.parse(statsText);
  assert.equal(catalogue.universe,'melbourne');
  assert.equal(catalogue.aquariums.length,500);
  assert.equal(stats.canonicalArtistCount,500);
  assert.equal(stats.playableTrackCount,3744);
  assert.equal(playableMelbourneEntries(catalogue.aquariums).length,500);
});

test('every live reel artist is Melbourne-scoped and exposes playable Bandcamp music',async()=>{
  const payload=JSON.parse(await read('github-pages/aquariums.json'));
  for(const entry of payload.aquariums){
    assert.ok(entry.universeMembership.includes('melbourne'));
    assert.ok(validBandcampUrl(entry.bandcampUrl));
    const manifest=JSON.parse(await read(`github-pages/artists/${entry.slug}.json`));
    assert.ok(pickPlayableTrack(manifest),`${entry.artist} must have a playable track`);
  }
});

test('machine statistics are generated instead of hard-coded from the reference artwork',async()=>{
  const [template,runtime]=await Promise.all([read('templates/universe-index.html'),read('github-pages/assets/discovery-machine.js')]);
  assert.doesNotMatch(template,/23,?000/);
  assert.match(template,/data-stat="artists"/);
  assert.match(template,/data-stat="tracks"/);
  assert.match(runtime,/stats\.playableTracks\|\|stats\.playableTrackCount/);
});

test('ticker retains artist, track, biography and Melbourne context after a match',()=>{
  const messages=buildTickerMessages(
    {artist:'Porchlight',releaseTitle:'Night Music',selectedTrackTitle:'Five Minutes',bioShort:'Melbourne post-punk trio.'},
    {waters:['dark'],suburb:'Brunswick'},
    {primaryLocation:'Brunswick, Melbourne'},
    {universe:'melbourne',canonicalArtistCount:500,publishedReleaseCount:500,playableTrackCount:3744},
    {universe:'melbourne',cultureSegmentCount:1},
  );
  assert.match(messages[0],/PORCHLIGHT.*BRUNSWICK.*MELBOURNE/);
  assert.ok(messages.some(item=>item.includes('FIVE MINUTES')));
  assert.ok(messages.some(item=>item.includes('MELBOURNE POST-PUNK TRIO')));
});

test('analogue meters use damped ballistics and distinguish idle, spin, celebration and playback',async()=>{
  const runtime=await read('github-pages/assets/discovery-machine.js');
  assert.match(runtime,/spring=target>channel\.x\?115:34/);
  assert.match(runtime,/damping=target>channel\.x\?16:10/);
  for(const mode of ['idle','spin','celebrate','playing'])assert.match(runtime,new RegExp(`meterMode==='${mode}'`));
  assert.match(runtime,/procedural-transport-coupled/);
});

test('mechanical sound, distinct thunks, haptics and a quiet loss are implemented without casino effects',async()=>{
  const runtime=await read('github-pages/assets/discovery-machine.js');
  assert.match(runtime,/function leverClack/);
  assert.match(runtime,/function reelThunk/);
  assert.match(runtime,/function startMotor/);
  assert.match(runtime,/function celebrationSound/);
  assert.match(runtime,/navigator\.vibrate/);
  assert.doesNotMatch(runtime,/confetti|laser|coin|payout|credits/i);
});

test('the product contains no wagering, money or payout system',async()=>{
  const template=(await read('templates/universe-index.html')).toLowerCase();
  for(const forbidden of ['bet','wager','cash prize','credits','payout','coins'])assert.doesNotMatch(template,new RegExp(`\\b${forbidden}\\b`));
});

test('mobile full-screen, one-handed lever, reduced motion and touch targets are retained',async()=>{
  const css=await read('app/discovery-machine.css');
  assert.match(css,/height:100dvh/);
  assert.match(css,/touch-action:none/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/@media \(prefers-reduced-motion:reduce\)/);
});

test('share deep links remain canonical and carry Melbourne universe state',()=>{
  assert.equal(buildShareUrl('https://raggedya.github.io','/cosmic-aquarium','porchlight',['anything']),'https://raggedya.github.io/cosmic-aquarium/?release=porchlight&categories=anything');
});

test('the public build packages the cabinet, lever, marquee and physical reel assets',async()=>{
  const build=await read('scripts/build-github-pages.mjs');
  assert.match(build,/aggits-cabinet\.webp/);
  assert.match(build,/aggits-lever\.webp/);
  assert.match(build,/aggits-marquee-v2\.webp/);
  assert.match(build,/aggits-reel-v2\.webp/);
  assert.match(build,/musicMachineAssets\.forEach/);
});
