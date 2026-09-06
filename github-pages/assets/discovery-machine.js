import {
  SESSION_HISTORY_LIMIT, pushHistory, buildTickerMessages, validBandcampUrl, pickPlayableTrack,
  artistIdentity, secureRandomIndex, decideMachineResult, isThreeArtistMatch,
  playableMelbourneEntries, MACHINE_STATES,
} from './discovery-machine-core.js';

const machine=document.querySelector('.music-machine');
const base=machine?.dataset.base||'';
const reels=[...document.querySelectorAll('.reel')];
const ticker=document.querySelector('.ticker-copy');
const lever=document.querySelector('.lever');
const buyLink=document.querySelector('[data-action="buy"]');
const shareButton=document.querySelector('[data-action="share"]');
const stopButton=document.querySelector('[data-action="pause"]');
const homeButton=document.querySelector('[data-action="home"]');
const soundButton=document.querySelector('[data-action="sound"]');
const frame=document.querySelector('.bandcamp-slot iframe');
const statusNode=document.querySelector('.machine-status');
const needles=[...document.querySelectorAll('[data-meter-needle]')];
const needleShadows=[...document.querySelectorAll('[data-meter-shadow]')];
const scales=[...document.querySelectorAll('[data-meter-scale]')];
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const workerBase='https://cosmic-aquaria.andrewharris501.workers.dev';
const stateSet=new Set(MACHINE_STATES);
const historyKey='aggits:melbourne-artist-history';
const lossKey='aggits:losses-since-match';
const sessionKey='aggits:analytics-session';
const soundKey='aggits:sound-off';

let catalogue=[];
let artistsById=new Map();
let stats={};
let state='BOOT';
let locked=true;
let currentEntry=null;
let currentManifest=null;
let currentTrack=null;
let currentTickerFacts=[];
let tickerItems=[];
let tickerIndex=0;
let tickerTimer=0;
let audioContext=null;
let motorNodes=[];
let soundOff=readStorage(soundKey)==='true';
let leverStartY=0;
let leverProgress=0;
let leverPointer=null;
let leverMoved=false;
let leverTriggered=false;
let meterMode='idle';
let meterFrame=0;
let meterStartedAt=performance.now();
let meterLastAt=0;
let meterSeed=5381;
let meterChannels=[{x:0,v:0},{x:0,v:0}];

function readStorage(key){try{return localStorage.getItem(key)}catch{return null}}
function writeStorage(key,value){try{localStorage.setItem(key,String(value))}catch{}}
function readSession(key,fallback){try{return JSON.parse(sessionStorage.getItem(key)||'')??fallback}catch{return fallback}}
function writeSession(key,value){try{sessionStorage.setItem(key,JSON.stringify(value))}catch{}}
function sessionId(){let id=readStorage(sessionKey);if(!id){id=crypto.randomUUID?.()||`session-${Date.now()}`;writeStorage(sessionKey,id)}return id}
function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms))}

function recordEvent(eventType,details={}){
  const body=JSON.stringify({eventType,aquariumId:currentEntry?.slug||'melbourne-music-machine',sessionId:sessionId(),trackId:currentTrack?.id||null,metadata:{interface:'aggits-machine',...details}});
  try{fetch(`${workerBase}/api/events`,{method:'POST',headers:{'content-type':'application/json'},body,keepalive:true,credentials:'omit'}).catch(()=>{})}catch{}
}

function setState(next,message=''){
  if(!stateSet.has(next))throw new Error(`Unknown machine state: ${next}`);
  state=next;machine.dataset.machineState=next;
  if(message)statusNode.textContent=message;
  window.dispatchEvent(new CustomEvent('aggits:state',{detail:{state:next}}));
}

function randomEntry(excluded=new Set()){
  const pool=catalogue.filter(entry=>!excluded.has(artistIdentity(entry)));
  return pool[secureRandomIndex(pool.length)]||catalogue[secureRandomIndex(catalogue.length)]||null;
}

function artistName(entry){return String(entry?.artist||'MELBOURNE').trim()}

function setReelLabel(node,label){
  const text=String(label||'MELBOURNE').replace(/\s+/g,' ').trim();
  node.textContent=text;
  node.classList.toggle('is-long',text.length>13);
  node.classList.toggle('is-very-long',text.length>22);
}

function setReelRows(index,entry,neighbours=true){
  const strip=reels[index].querySelector('.reel-strip');
  const current=artistName(entry);
  const used=new Set([artistIdentity(entry)]);
  const pickNeighbour=()=>{const item=randomEntry(used);if(item)used.add(artistIdentity(item));return artistName(item||entry)};
  const before=neighbours?pickNeighbour():current;
  const after=neighbours?pickNeighbour():current;
  const farAfter=neighbours?pickNeighbour():current;
  [before,current,after,farAfter].forEach((label,row)=>setReelLabel(strip.children[row],label));
}

function tickerDuration(text){return Math.max(8,Math.min(28,text.length/7.5))}
function showTicker(text){
  clearTimeout(tickerTimer);
  ticker.textContent=String(text||'PULL FOR MELBOURNE').toUpperCase();
  ticker.classList.remove('is-scrolling');
  ticker.style.removeProperty('--ticker-duration');
  requestAnimationFrame(()=>{
    const overflow=ticker.scrollWidth>ticker.parentElement.clientWidth*.92;
    if(overflow&&!reducedMotion.matches){ticker.style.setProperty('--ticker-duration',`${tickerDuration(ticker.textContent)}s`);ticker.classList.add('is-scrolling')}
  });
}
function startTickerRotation(items,delay=7200){
  clearTimeout(tickerTimer);tickerItems=[...new Set(items.filter(Boolean))];tickerIndex=0;
  const next=()=>{if(!tickerItems.length)return;showTicker(tickerItems[tickerIndex++%tickerItems.length]);tickerTimer=setTimeout(next,delay)};
  next();
}

function updateStats(){
  const artists=Number(stats.canonicalArtistCount||stats.artists||catalogue.length);
  const tracks=Number(stats.playableTrackCount||stats.playableTracks||0);
  document.querySelector('[data-stat="artists"]').textContent=artists.toLocaleString('en-AU');
  document.querySelector('[data-stat="tracks"]').textContent=tracks.toLocaleString('en-AU');
}

const SVG='http://www.w3.org/2000/svg';
function point(angle,radius){const r=angle*Math.PI/180;return{x:160+Math.sin(r)*radius,y:158-Math.cos(r)*radius}}
function buildMeters(){
  const labels=['20','10','7','5','3','2','1','0','1','2','3'];
  scales.forEach(scale=>{
    labels.forEach((label,index)=>{
      const angle=-55+(110*index/(labels.length-1));
      const outer=point(angle,100),inner=point(angle,index%2===0?79:84),text=point(angle,68);
      const tick=document.createElementNS(SVG,'line');
      for(const [key,value] of Object.entries({x1:inner.x,y1:inner.y,x2:outer.x,y2:outer.y,class:`meter-tick ${index%2===0?'major':''} ${index>=8?'red':''}`}))tick.setAttribute(key,String(value));
      scale.append(tick);
      const number=document.createElementNS(SVG,'text');number.setAttribute('x',String(text.x));number.setAttribute('y',String(text.y+4));number.setAttribute('class',`meter-number ${index>=8?'red':''}`);number.textContent=label;scale.append(number);
    });
  });
}

function hashSeed(value){let hash=5381;for(const char of String(value||''))hash=((hash<<5)+hash)^char.charCodeAt(0);return hash>>>0}
function noise(t,offset=0){let x=Math.sin((t+offset+meterSeed)*12.9898)*43758.5453;return x-Math.floor(x)}
function meterTarget(t,channel){
  if(meterMode==='idle')return .015+noise(Math.floor(t*1.5),channel*19)*.018;
  if(meterMode==='spin')return .28+noise(Math.floor(t*11),channel*17)*.47;
  if(meterMode==='celebrate')return .88+noise(Math.floor(t*7),channel*13)*.1;
  if(meterMode==='playing'){
    const slow=.28+.13*noise(Math.floor(t/3.1),7);
    const phrase=.18*noise(Math.floor(t*1.7),19);
    const pulse=noise(Math.floor(t*5.4),channel*37)> .82 ? .24 : 0;
    const side=(noise(Math.floor(t*2.4),channel*71)-.5)*.1;
    return Math.min(.92,slow+phrase+pulse+side);
  }
  return 0;
}
function startMeters(){
  cancelAnimationFrame(meterFrame);meterLastAt=performance.now();
  const frameTick=now=>{
    if(document.hidden){meterFrame=0;return}
    const dt=Math.min(.034,(now-meterLastAt)/1000||.016);meterLastAt=now;
    const t=(now-meterStartedAt)/1000;
    meterChannels.forEach((channel,index)=>{
      const target=meterTarget(t,index);
      const spring=target>channel.x?115:34;
      const damping=target>channel.x?16:10;
      channel.v+=(spring*(target-channel.x)-damping*channel.v)*dt;
      channel.x=Math.max(-.025,Math.min(1,channel.x+channel.v*dt));
      const angle=-55+channel.x*110;
      needles[index].setAttribute('transform',`rotate(${angle.toFixed(2)} 160 158)`);
      const shadowX=(2+channel.x*1.2).toFixed(2),shadowY=(3-channel.x*.7).toFixed(2);
      needleShadows[index].setAttribute('transform',`translate(${shadowX} ${shadowY}) rotate(${angle.toFixed(2)} 160 158)`);
    });
    meterFrame=requestAnimationFrame(frameTick);
  };
  meterFrame=requestAnimationFrame(frameTick);
}
function setMeterMode(mode,seed=''){meterMode=mode;if(seed)meterSeed=hashSeed(seed);meterStartedAt=performance.now()}

function ensureAudio(){
  if(soundOff)return null;
  const Ctx=window.AudioContext||window.webkitAudioContext;
  if(!Ctx)return null;
  audioContext??=new Ctx({latencyHint:'interactive'});
  if(audioContext.state==='suspended')void audioContext.resume();
  return audioContext;
}
function tone(frequency,duration=.12,{gain=.09,type='triangle',delay=0}={}){
  const ctx=ensureAudio();if(!ctx)return;
  const start=ctx.currentTime+delay,osc=ctx.createOscillator(),amp=ctx.createGain();osc.type=type;osc.frequency.setValueAtTime(frequency,start);amp.gain.setValueAtTime(.0001,start);amp.gain.exponentialRampToValueAtTime(gain,start+.012);amp.gain.exponentialRampToValueAtTime(.0001,start+duration);osc.connect(amp).connect(ctx.destination);osc.start(start);osc.stop(start+duration+.02);
}
function impact(rate=1,volume=.5){if(soundOff)return;const audio=new Audio(`${base}/assets/audio/glass/glass-impact-mobile.mp3`);audio.volume=volume;audio.playbackRate=rate;void audio.play().catch(()=>{})}
function leverClack(){impact(.72,.48);tone(82,.13,{gain:.12,type:'square'});navigator.vibrate?.([14,28,8])}
function reelThunk(index){impact(.61+index*.045,.35);tone(55+index*7,.17,{gain:.1,type:'triangle'});navigator.vibrate?.(10+index*2)}
function startMotor(){
  const ctx=ensureAudio();if(!ctx)return;
  stopMotor();
  const gain=ctx.createGain();gain.gain.setValueAtTime(.0001,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.055,ctx.currentTime+.16);
  const a=ctx.createOscillator(),b=ctx.createOscillator();a.type='sawtooth';b.type='triangle';a.frequency.value=42;b.frequency.value=69;a.connect(gain);b.connect(gain);gain.connect(ctx.destination);a.start();b.start();motorNodes=[a,b,gain];
}
function stopMotor(){if(!motorNodes.length)return;const ctx=audioContext,gain=motorNodes[2];try{gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.18);motorNodes.slice(0,2).forEach(node=>node.stop(ctx.currentTime+.2))}catch{}motorNodes=[]}
function celebrationSound(){tone(392,.28,{gain:.08});tone(523,.35,{gain:.085,delay:.12});tone(659,.42,{gain:.09,delay:.26});impact(1.08,.32);navigator.vibrate?.([22,45,18,45,25])}

async function fetchManifest(entry){
  const response=await fetch(`${base}/artists/${encodeURIComponent(entry.slug)}.json`,{cache:'no-store'});
  if(!response.ok)throw new Error(`manifest_${response.status}`);
  const manifest=await response.json();
  if(!validBandcampUrl(manifest.bandcampUrl)||!pickPlayableTrack(manifest))throw new Error('no_playable_track');
  return manifest;
}

function chooseOutcome(){
  const losses=Math.min(4,Number(readSession(lossKey,0))||0);
  const result=decideMachineResult(losses,cryptoRandom(),cryptoRandom());writeSession(lossKey,result.nextLossesSinceMatch);
  const history=new Set(readSession(historyKey,[]));
  const fresh=catalogue.filter(entry=>!history.has(artistIdentity(entry)));
  const source=fresh.length?fresh:catalogue;
  const winner=source[secureRandomIndex(source.length)]||randomEntry();
  if(result.match)return {kind:'match',entries:[winner,winner,winner]};
  if(result.nearMiss){const odd=randomEntry(new Set([artistIdentity(winner)]));const oddIndex=secureRandomIndex(3);const entries=[winner,winner,winner];entries[oddIndex]=odd;return{kind:'near',entries}}
  const used=new Set(),entries=[];while(entries.length<3){const item=randomEntry(used);if(!item)break;used.add(artistIdentity(item));entries.push(item)}
  return {kind:'loss',entries};
}
function cryptoRandom(){const value=new Uint32Array(1);crypto.getRandomValues(value);return value[0]/4294967296}

function spinReel(index,finalEntry,stopAfter){
  const reel=reels[index],strip=reel.querySelector('.reel-strip');reel.classList.add('is-spinning');
  const started=performance.now();let lastSwap=0,current=randomEntry();
  return new Promise(resolve=>{
    const tick=now=>{
      const elapsed=now-started,progress=Math.min(1,elapsed/stopAfter);
      const cadence=46+Math.pow(progress,4)*150;
      if(now-lastSwap>cadence){current=randomEntry();setReelRows(index,current);lastSwap=now;strip.style.transform=`translateY(${Math.sin(now/36)*5}px)`}
      if(elapsed>=stopAfter){strip.style.transform='';setReelRows(index,finalEntry);reel.classList.remove('is-spinning');reel.classList.add('is-locking');setTimeout(()=>reel.classList.remove('is-locking'),260);reelThunk(index);resolve();return}
      requestAnimationFrame(tick);
    };requestAnimationFrame(tick);
  });
}

function stopPlayback(){frame.src='about:blank';currentTrack=null;stopButton.disabled=true;stopButton.textContent='STOP';setMeterMode('idle')}

async function loadWinningTrack(entry,{fromDeepLink=false}={}){
  setState('LOADING_TRACK',`Loading music by ${artistName(entry)}.`);showTicker(`LOADING ${artistName(entry)}...`);
  try{
    const manifest=await fetchManifest(entry);const track=pickPlayableTrack(manifest);if(!track)throw new Error('no_playable_track');
    currentEntry=entry;currentManifest=manifest;currentTrack=track;setMeterMode('idle',track.id||track.bandcampEmbedTrackId);
    const embedId=encodeURIComponent(track.bandcampEmbedTrackId);
    frame.title=`Official Bandcamp playback controls for ${track.title} by ${manifest.artist}`;
    frame.src=`https://bandcamp.com/EmbeddedPlayer/track=${embedId}/size=small/bgcol=120904/linkcol=f2b654/tracklist=false/artwork=none/transparent=true/autoplay=true/`;
    const purchase=validBandcampUrl(track.bandcampUrl)||validBandcampUrl(manifest.bandcampUrl);
    buyLink.href=purchase;buyLink.target='_blank';buyLink.rel='noopener noreferrer';buyLink.setAttribute('aria-disabled','false');buyLink.tabIndex=0;buyLink.setAttribute('aria-label',`Buy ${track.title} by ${manifest.artist} on Bandcamp`);
    shareButton.disabled=false;stopButton.disabled=false;
    const artistData=artistsById.get(entry.canonicalArtistId)||{};
    currentTickerFacts=buildTickerMessages({...manifest,selectedTrackTitle:track.title},entry,artistData,stats,{universe:'melbourne',cultureSegmentCount:1});
    startTickerRotation([`READY ON BANDCAMP • TAP PLAY • ${track.title} • ${manifest.artist}`,...currentTickerFacts]);
    const history=pushHistory(readSession(historyKey,[]),artistIdentity(entry),SESSION_HISTORY_LIMIT);writeSession(historyKey,history);
    setState('PLAYING',`${track.title} by ${manifest.artist} is ready in the official Bandcamp player.`);
    if(!fromDeepLink)historyApi('push',entry);
    recordEvent('track_selected',{result:'loaded',artist:manifest.artist,release:manifest.releaseTitle,source:'lever_match'});
  }catch(error){
    setState('PLAY_ERROR','That track could not be loaded. Pull again.');showTicker('TRACK UNAVAILABLE — PULL AGAIN');setMeterMode('idle');locked=false;recordEvent('track_selected',{result:'failed',reason:String(error?.message||error)});await wait(1400);setState('IDLE');
  }
}

function historyApi(mode,entry){
  const url=new URL(`${base.replace(/\/$/,'')}/`,location.origin);url.searchParams.set('release',entry.slug);url.searchParams.set('universe','melbourne');history[`${mode}State`]({view:'machine',release:entry.slug},'',url);
}

async function runSpin(){
  if(locked||!catalogue.length)return;
  locked=true;clearTimeout(tickerTimer);if(state==='PLAYING')stopPlayback();
  setState('SPIN_START','The Melbourne artist reels are starting.');showTicker('SEARCHING MELBOURNE...');setMeterMode('spin');leverClack();startMotor();recordEvent('explore_click',{source:'lever'});
  const outcome=chooseOutcome();setState('SPINNING');
  const stopTimes=reducedMotion.matches?[520,720,920]:[1550,2200,2950];
  const promises=outcome.entries.map((entry,index)=>spinReel(index,entry,stopTimes[index]).then(()=>setState(`REEL_${index+1}_STOP`,`Reel ${index+1} stopped on ${artistName(entry)}.`)));
  await Promise.all(promises);stopMotor();setState('EVALUATE');await wait(reducedMotion.matches?80:220);
  if(isThreeArtistMatch(outcome.entries)){
    const winner=outcome.entries[0];setState('WIN',`Three matching reels: ${artistName(winner)}.`);showTicker(`★★★ ${artistName(winner)} ★★★`);setMeterMode('celebrate');celebrationSound();setState('WIN_CELEBRATION');recordEvent('machine_match',{artist:artistName(winner)});await wait(reducedMotion.matches?400:2200);await loadWinningTrack(winner);locked=false;return;
  }
  if(outcome.kind==='near'){
    const counts=new Map();outcome.entries.forEach(entry=>counts.set(artistIdentity(entry),(counts.get(artistIdentity(entry))||0)+1));const repeated=outcome.entries.find(entry=>counts.get(artistIdentity(entry))===2);
    setState('NEAR_MISS','Two matching artists. Pull again.');showTicker(`TWO ${artistName(repeated).toUpperCase()}S... PULL AGAIN`);recordEvent('machine_settle',{result:'two_match'});
  }else{setState('LOSS','No artist match. Pull again.');showTicker('NO MATCH — PULL AGAIN');recordEvent('machine_settle',{result:'no_match'})}
  setMeterMode('idle');await wait(reducedMotion.matches?120:850);locked=false;
}

function resetLever(animated=true){leverProgress=0;lever.style.transition=animated?'transform .48s cubic-bezier(.18,.72,.23,1)':'none';lever.style.transform='translateY(0) rotate(0)';setTimeout(()=>lever.style.transition='',500)}
function pullVisual(progress){leverProgress=Math.max(0,Math.min(1,progress));const resisted=Math.pow(leverProgress,.78);lever.style.transform=`translateY(${resisted*19}%) rotate(${resisted*11}deg)`}
function animateLeverAndSpin(){if(locked)return;lever.style.transition='transform .34s cubic-bezier(.2,.7,.25,1)';pullVisual(1);setTimeout(()=>{void runSpin();resetLever(true)},250)}
function onLeverDown(event){if(locked)return;ensureAudio();leverPointer=event.pointerId;leverStartY=event.clientY;leverMoved=false;leverTriggered=false;lever.setPointerCapture?.(event.pointerId);setState('LEVER_PULL','Pull the lever down past the resistance point.');lever.style.transition='none'}
function onLeverMove(event){if(event.pointerId!==leverPointer)return;const travel=Math.max(0,event.clientY-leverStartY);leverMoved=leverMoved||travel>7;pullVisual(travel/115);if(leverProgress>=.72&&!leverTriggered){leverTriggered=true;navigator.vibrate?.(8)}}
function onLeverUp(event){if(event.pointerId!==leverPointer)return;lever.releasePointerCapture?.(event.pointerId);leverPointer=null;if(leverTriggered){void runSpin();resetLever(true)}else if(!leverMoved){animateLeverAndSpin()}else{setState('IDLE','The lever returned without starting the reels.');resetLever(true)}}

async function shareCurrent(){if(!currentEntry||!currentManifest||!currentTrack)return;const url=location.href,title=`${currentManifest.artist} — ${currentTrack.title}`;try{if(navigator.share)await navigator.share({title,text:'Found through the AGGITS Melbourne Music Machine.',url});else{await navigator.clipboard.writeText(url);showTicker('DISCOVERY LINK COPIED')}}catch(error){if(error?.name!=='AbortError')showTicker('SHARE UNAVAILABLE')};recordEvent('share_click',{artist:currentManifest.artist})}
function resetMachine(){stopPlayback();currentEntry=currentManifest=currentTrack=null;currentTickerFacts=[];buyLink.removeAttribute('href');buyLink.setAttribute('aria-disabled','true');buyLink.tabIndex=-1;shareButton.disabled=true;locked=false;reels.forEach((_,index)=>setReelRows(index,randomEntry()));setState('IDLE','Pull the lever to discover Melbourne music.');startTickerRotation(idleMessages());history.replaceState({view:'machine'},'',`${base.replace(/\/$/,'')}/`)}
function idleMessages(){const artists=Number(stats.artists||stats.canonicalArtistCount||catalogue.length),tracks=Number(stats.playableTracks||stats.playableTrackCount||0);return['PULL FOR MELBOURNE',`${artists.toLocaleString('en-AU')} MELBOURNE BANDS`,`${tracks.toLocaleString('en-AU')} PLAYABLE SONGS`,'LET THE MUSIC FIND YOU']}

function toggleSound(){soundOff=!soundOff;writeStorage(soundKey,soundOff);soundButton.textContent=soundOff?'SOUND OFF':'SOUND ON';soundButton.setAttribute('aria-pressed',String(!soundOff));if(soundOff){stopMotor();audioContext?.suspend()}else ensureAudio()}
function stopCurrent(){if(!currentTrack)return;stopPlayback();showTicker('MUSIC STOPPED — PULL AGAIN');setState('IDLE','Playback stopped. Pull again.');locked=false}

async function loadData(){
  const [catalogueResponse,artistsResponse,statsResponse]=await Promise.all([fetch(`${base}/aquariums.json`,{cache:'no-store'}),fetch(`${base}/artist-search-index.json`,{cache:'no-store'}),fetch(`${base}/universe-stats.json`,{cache:'no-store'})]);
  if(!catalogueResponse.ok)throw new Error('catalogue_unavailable');
  const cataloguePayload=await catalogueResponse.json();catalogue=playableMelbourneEntries(cataloguePayload.aquariums||[]);
  if(!catalogue.length)throw new Error('no_playable_melbourne_artists');
  if(artistsResponse.ok){const data=await artistsResponse.json();artistsById=new Map((data.artists||[]).map(artist=>[artist.id,artist]))}
  if(statsResponse.ok)stats=await statsResponse.json();updateStats();reels.forEach((_,index)=>setReelRows(index,randomEntry()));
  const requested=new URLSearchParams(location.search).get('release');
  if(requested){const entry=catalogue.find(item=>item.slug===requested);if(entry){reels.forEach((_,index)=>setReelRows(index,entry,false));locked=true;await loadWinningTrack(entry,{fromDeepLink:true});locked=false;return}}
  locked=false;setState('IDLE','Pull the lever to discover Melbourne music.');startTickerRotation(idleMessages());recordEvent('doorway_open',{catalogueSize:catalogue.length,universe:'melbourne'});
}

buildMeters();startMeters();soundButton.textContent=soundOff?'SOUND OFF':'SOUND ON';soundButton.setAttribute('aria-pressed',String(!soundOff));
lever.addEventListener('pointerdown',onLeverDown);lever.addEventListener('pointermove',onLeverMove);lever.addEventListener('pointerup',onLeverUp);lever.addEventListener('pointercancel',onLeverUp);
lever.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();animateLeverAndSpin()}});
shareButton.addEventListener('click',()=>void shareCurrent());buyLink.addEventListener('click',()=>recordEvent('buy_click',{url:buyLink.href}));stopButton.addEventListener('click',stopCurrent);homeButton.addEventListener('click',resetMachine);soundButton.addEventListener('click',toggleSound);
function markBandcampPlayback(){if(!currentTrack)return;setMeterMode('playing',currentTrack.id);startTickerRotation([`NOW PLAYING • ${currentTrack.title} • ${currentManifest.artist}`,...currentTickerFacts]);statusNode.textContent=`Playing ${currentTrack.title} by ${currentManifest.artist} through Bandcamp.`;recordEvent('bandcamp_click',{artist:currentManifest.artist,track:currentTrack.title})}
frame.addEventListener('focus',markBandcampPlayback);addEventListener('blur',()=>setTimeout(()=>{if(document.activeElement===frame)markBandcampPlayback()},0));addEventListener('popstate',()=>location.reload());
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(meterFrame);stopMotor()}else startMeters()});
loadData().catch(error=>{setState('PLAY_ERROR','The Melbourne library could not be opened.');showTicker('MACHINE RESTING — PLEASE REFRESH');console.error(error)});

window.AggitsMachine=Object.freeze({
  spin:()=>animateLeverAndSpin(),
  getState:()=>({state,locked,catalogueSize:catalogue.length,currentArtist:currentEntry?.artist||null,currentTrack:currentTrack?.title||null,meterSource:'procedural-transport-coupled',lossesSinceMatch:readSession(lossKey,0)}),
});
