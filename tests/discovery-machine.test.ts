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

test('the lever remains tactile while SPIN AGAIN shares the same canonical spin path',async()=>{
  const [template,runtime]=await Promise.all([read('templates/universe-index.html'),read('github-pages/assets/discovery-machine.js')]);
  assert.equal((template.match(/class="lever"/g)||[]).length,1);
  assert.match(template,/data-action="spin-again"[^>]*disabled><span>SPIN<br>AGAIN<\/span>/);
  assert.match(runtime,/lever\.addEventListener\('pointerdown',onLeverDown\)/);
  assert.match(runtime,/lever\.addEventListener\('pointermove',onLeverMove\)/);
  assert.match(runtime,/leverProgress>=\.72/);
  assert.match(runtime,/\['Enter',' '\]/);
  assert.match(runtime,/spinAgainButton\.addEventListener\('click',\(\)=>void runSpin\('spin_again'\)\)/);
  assert.match(runtime,/async function runSpin\(source='lever'\)/);
});

test('a partial pull returns without a spin and a full pull is guarded against double triggering',async()=>{
  const runtime=await read('github-pages/assets/discovery-machine.js');
  assert.match(runtime,/if\(locked\|\|!catalogue\.length\)return/);
  assert.match(runtime,/if\(leverTriggered\)\{void runSpin\('lever'\);resetLever\(true\)\}/);
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
  for(const required of ['BOOT','IDLE','LEVER_PULL','SPIN_START','SPINNING','REEL_1_STOP','REEL_2_STOP','REEL_3_STOP','EVALUATE','LOSS','NEAR_MISS','WIN','WIN_CELEBRATION','LOADING_TRACK','READY_TO_PLAY','AUTOPLAY_ATTEMPT','AWAITING_PLAY','PLAYING','PLAY_ERROR'])assert.ok(MACHINE_STATES.includes(required));
});

test('the twin meters and centre inscription share a recessed cabinet instrument cavity',async()=>{
  const css=await read('app/discovery-machine.css');
  assert.match(css,/\.meter-bank\{[^}]*box-shadow:inset/);
  assert.match(css,/\.meter-bank::before/);
  assert.match(css,/\.meter-bank::after/);
  assert.match(css,/\.meter-inscription\{[^}]*background:linear-gradient/);
  assert.doesNotMatch(css,/\.vu-meter\{[^}]*drop-shadow/);
});

test('the central burgundy control is permanently BUY MUSIC and never controls playback or spin',async()=>{
  const [template,runtime,css]=await Promise.all([read('templates/universe-index.html'),read('github-pages/assets/discovery-machine.js'),read('app/discovery-machine.css')]);
  assert.match(template,/class="buy-button" data-action="buy"/);
  assert.match(template,/BUY<br>MUSIC/);
  assert.match(runtime,/buyLink\.addEventListener\('click',activatePrimary\)/);
  assert.match(runtime,/if\(primaryAction==='buy'&&currentPurchaseUrl\)/);
  assert.doesNotMatch(runtime,/beginWinningPlayback|primaryAction==='play'|class="play-symbol"/);
  assert.doesNotMatch(runtime,/buyLink\.addEventListener\('click',\(\)=>void runSpin/);
  assert.match(css,/\.buy-button\{[^}]*#8d2c37[^}]*#641522[^}]*#3b0914/);
  assert.match(css,/\.buy-button\[data-primary-mode="dormant"\]\{[^}]*filter:brightness\(\.58\) saturate\(\.82\)/);
});

test('the primary control and SHARE remain dormant until a real winning track is resolved',async()=>{
  const [template,runtime]=await Promise.all([read('templates/universe-index.html'),read('github-pages/assets/discovery-machine.js')]);
  assert.match(template,/data-action="buy" data-primary-mode="dormant" aria-disabled="true" disabled/);
  assert.match(template,/data-action="share" disabled/);
  assert.match(runtime,/setPrimaryMode\('buy'\)/);
  assert.match(runtime,/shareButton\.disabled=false/);
});

test('official Bandcamp playback, real purchase links and track fallback validation are preserved',async()=>{
  const [template,runtime]=await Promise.all([read('templates/universe-index.html'),read('github-pages/assets/discovery-machine.js')]);
  assert.match(template,/Official Bandcamp playback controls/);
  assert.match(runtime,/bandcamp\.com\/EmbeddedPlayer\/track=/);
  assert.match(runtime,/validBandcampUrl\(track\.bandcampUrl\)\|\|validBandcampUrl\(manifest\.bandcampUrl\)/);
  assert.match(runtime,/if\(!validBandcampUrl\(manifest\.bandcampUrl\)\|\|!pickPlayableTrack\(manifest\)\)/);
});

test('a winner places the real Bandcamp player in the long bar and enables BUY MUSIC immediately',async()=>{
  const [template,runtime,css]=await Promise.all([read('templates/universe-index.html'),read('github-pages/assets/discovery-machine.js'),read('app/discovery-machine.css')]);
  assert.match(template,/Official Bandcamp playback controls/);
  assert.match(runtime,/autoplay=false/);
  assert.match(runtime,/setState\('READY_TO_PLAY'/);
  assert.match(runtime,/await loadBandcampFrame\(currentEmbedUrl\)/);
  assert.match(runtime,/setPrimaryMode\('buy'\)/);
  assert.match(runtime,/frame\.addEventListener\('focus',markBandcampPlayback\)/);
  assert.match(runtime,/function animateLeverAndSpin\(\)\{if\(locked\)return;ensureAudio\(\)/);
  assert.match(css,/\.bandcamp-slot\{position:absolute;inset:-2px 2\.5%/);
  assert.match(template,/class="bandcamp-wordmark"[^>]*>bandcamp<\/span>/);
  assert.match(template,/class="vinyl-play-control">\s*<iframe/);
  assert.match(template,/data-player-track>WINNING TRACK/);
  assert.match(template,/data-player-artist>MELBOURNE ARTIST/);
  assert.match(template,/MELBOURNE MUSIC<br>ON BANDCAMP/);
  assert.match(css,/\.vinyl-play-control\{[^}]*repeating-radial-gradient/);
  assert.match(css,/\.bandcamp-player-shell\{[^}]*grid-template-columns/);
  assert.match(runtime,/bgcol=1b0808\/linkcol=e8c680/);
  assert.match(css,/data-machine-state="READY_TO_PLAY"[^}]*\.bandcamp-slot/);
  assert.doesNotMatch(template,/data-action="pause"|>STOP</);
  assert.doesNotMatch(template,/0:00|4:12/);
});

test('a matching artist raises the physical winner nameplate with the short warm tonal bloom',async()=>{
  const [template,runtime,css]=await Promise.all([read('templates/universe-index.html'),read('github-pages/assets/discovery-machine.js'),read('app/discovery-machine.css')]);
  assert.match(template,/class="winner-splash"/);
  assert.match(template,/winner-splash-frame\.png/);
  assert.match(template,/data-winner-name/);
  assert.match(runtime,/presentWinner\(artistName\(winner\)\)/);
  assert.match(runtime,/winner-tonal-bloom-mixkit-3109\.mp3/);
  assert.match(runtime,/winnerAudioTimer=setTimeout\([\s\S]*?,1450\)/);
  assert.match(css,/@keyframes winnerSplashRise/);
  assert.match(css,/data-machine-state="WIN_CELEBRATION"[^}]*\.winner-splash/);
});

test('the winner receives eight readable seconds in the splash before the player is revealed',async()=>{
  const [runtime,css]=await Promise.all([read('github-pages/assets/discovery-machine.js'),read('app/discovery-machine.css')]);
  assert.match(runtime,/const WINNER_SPLASH_DURATION_MS=8000/);
  assert.match(runtime,/const WINNER_SPLASH_TRANSITION_MS=260/);
  assert.match(runtime,/function holdWinnerSplash\(\)/);
  assert.match(runtime,/const revealCompleted=await holdWinnerSplash\(\);if\(!revealCompleted\)return;await loadWinningTrack\(winner\)/);
  assert.match(runtime,/function stopPlayback\(\)\{[\s\S]*?clearWinnerSplashTimer\(\)/);
  assert.match(css,/var\(--winner-splash-total,8\.52s\)/);
  assert.match(css,/3\.05%\{opacity:1[\s\S]*?96\.95%\{opacity:1/);
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
  assert.match(runtime,/stats\.playableTrackCount\|\|stats\.playableTracks/);
});

test('the cream identity sign transforms into a factual, optically centred artist ticker after a win',async()=>{
  const [template,runtime,css]=await Promise.all([read('templates/universe-index.html'),read('github-pages/assets/discovery-machine.js'),read('app/discovery-machine.css')]);
  assert.match(template,/class="ticker-copy">LET’S PLAY</);
  assert.match(runtime,/function idleMessages\(\)\{return\['LET’S PLAY'\]\}/);
  assert.match(template,/data-title-mode="identity"/);
  assert.match(template,/data-artist-information/);
  assert.match(runtime,/function artistInformationText/);
  assert.match(runtime,/entry\?\.bioShort/);
  assert.match(runtime,/showArtistInformation\(entry,manifest,track\)/);
  assert.match(runtime,/showMachineIdentity\(\)/);
  assert.match(css,/@keyframes artistInformationPan/);
  assert.match(css,/font-size:clamp\(14px,4\.25vw,23px\)/);
  assert.match(css,/transform:translate3d\(0,2px,0\)/);
  assert.match(css,/@keyframes artistInformationPan\{from\{transform:translate3d\(calc\(-1 \* var\(--artist-travel,0px\)\),2px,0\)\}to\{transform:translate3d\(var\(--artist-travel,0px\),2px,0\)\}\}/);
  assert.match(runtime,/Math\.max\(4\.2,\(travel\*2\)\/42\)/);
});

test('analogue meters use damped ballistics and distinguish idle, spin, celebration and playback',async()=>{
  const runtime=await read('github-pages/assets/discovery-machine.js');
  assert.match(runtime,/spring=target>channel\.x\?115:34/);
  assert.match(runtime,/damping=target>channel\.x\?16:10/);
  for(const mode of ['idle','spin','celebrate','playing'])assert.match(runtime,new RegExp(`meterMode==='${mode}'`));
  assert.match(runtime,/procedural-transport-coupled/);
});

test('licensed physical mechanism recordings, synchronized sampled stops, haptics and a quiet loss replace electronic reel tones and glass crashes',async()=>{
  const [template,runtime,license]=await Promise.all([read('templates/universe-index.html'),read('github-pages/assets/discovery-machine.js'),read('github-pages/assets/audio/machine/LICENSE.md')]);
  assert.doesNotMatch(template,/<link rel="preload" as="audio"/);
  assert.match(runtime,/reelMotorUrl=.*reel-actual-slotmachine-freesound-261346\.mp3/);
  assert.match(runtime,/reelRatchetUrl=.*reel-ratchet-mixkit-2641\.mp3/);
  assert.match(runtime,/reel-stop-(?:lock|gear)-mixkit-/);
  assert.match(runtime,/function leverClack/);
  assert.match(runtime,/function reelThunk/);
  assert.match(runtime,/function startMotor/);
  assert.match(runtime,/function celebrationSound/);
  assert.match(runtime,/navigator\.vibrate/);
  assert.doesNotMatch(runtime,/glass-impact|function impact/);
  assert.match(license,/1989 fruit machine/);
  assert.match(license,/markkuyp/);
  assert.match(license,/Gear metallic lock sound/);
  assert.match(license,/Relaxing bell chime/);
  assert.doesNotMatch(runtime,/createOscillator|type:'square'|type:'sawtooth'/);
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

test('ticker copy is vertically centred without changing the approved panel treatment',async()=>{
  const css=await read('app/discovery-machine.css');
  assert.match(css,/\.ticker-window\{[^}]*height:100%[^}]*display:flex[^}]*align-items:center[^}]*justify-content:center/);
  assert.match(css,/--ticker-optical-y:2px/);
  assert.match(css,/padding-top:var\(--ticker-optical-y\)/);
  assert.match(css,/\.ticker-copy\{[^}]*line-height:1/);
});

test('ticker motion uses measured travel, constant pixels per second and completion-driven sequencing',async()=>{
  const runtime=await read('github-pages/assets/discovery-machine.js');
  assert.match(runtime,/textWidth=ticker\.scrollWidth/);
  assert.match(runtime,/distance\/\(reducedMotion\.matches\?28:46\)/);
  assert.match(runtime,/addEventListener\('animationend'/);
  assert.doesNotMatch(runtime,/Math\.min\(28,text\.length/);
});

test('Bandcamp is presented as a recessed branded source, not a dominant cabinet logo',async()=>{
  const [template,css]=await Promise.all([read('templates/universe-index.html'),read('app/discovery-machine.css')]);
  assert.match(template,/MELBOURNE SONGS<br>ON BANDCAMP/);
  assert.match(css,/\.bandcamp-slot\{[^}]*box-shadow:inset/);
  assert.match(template,/class="bandcamp-wordmark"[^>]*>bandcamp<\/span>/);
  assert.match(css,/\.bandcamp-player-shell\{[^}]*box-shadow:inset/);
  assert.match(css,/\.vinyl-play-control iframe\{[^}]*filter:sepia\(\.78\) saturate\(1\.7\) hue-rotate\(326deg\)/);
});

test('share deep links remain canonical and carry Melbourne universe state',()=>{
  assert.equal(buildShareUrl('https://raggedya.github.io','/cosmic-aquarium','porchlight',['anything']),'https://raggedya.github.io/cosmic-aquarium/?release=porchlight&categories=anything');
});

test('the public build packages the cabinet, lever, marquee, winner splash and mechanical sound set',async()=>{
  const build=await read('scripts/build-github-pages.mjs');
  assert.match(build,/aggits-cabinet\.webp/);
  assert.match(build,/aggits-lever\.webp/);
  assert.match(build,/aggits-marquee-v2\.webp/);
  assert.match(build,/aggits-reel-v2\.webp/);
  assert.match(build,/winner-splash-frame\.png/);
  assert.match(build,/musicMachineAssets\.forEach/);
  assert.match(build,/reel-actual-slotmachine-freesound-261346\.mp3/);
  assert.match(build,/winner-fanfare-mixkit-226\.mp3/);
  assert.match(build,/machineAudioAssets\.forEach/);
});
