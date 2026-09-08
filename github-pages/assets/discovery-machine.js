import {
  SESSION_HISTORY_LIMIT, pushHistory, validBandcampUrl, pickPlayableTrack,
  artistIdentity, secureRandomIndex, selectGuaranteedWinner, isThreeArtistMatch,
  playableMelbourneEntries, MACHINE_STATES, MELBOURNE_CULTURE_SEGMENTS,
  playableArtistTracks, createShuffleBag, formatMachineTitleLines,
} from './discovery-machine-core.js?v=festival-master-v2';
const machine=document.querySelector('.music-machine');
const base=machine?.dataset.base||'';
const cabinetSkin=document.querySelector('.cabinet-skin');
const isFestivalMode=machine?.dataset.machineContent==='festival';
const machineMode=isFestivalMode?'festival':machine?.dataset.machineMode==='artist'?'artist':'city';
const isArtistMode=machineMode==='artist';
const isSingleReelMode=isArtistMode||isFestivalMode;
const requestedParameters=new URLSearchParams(location.search);
const requestedArtistSlug=requestedParameters.get('artist')||'workfriend';
const requestedFestivalSlug=requestedParameters.get('festival')||'';
if(isSingleReelMode)document.body.classList.add('artist-machine-page');
const reels=[...document.querySelectorAll('.reel')];
const ticker=document.querySelector('.ticker-copy');
const lever=document.querySelector('.lever');
const buyLink=document.querySelector('[data-action="buy"]');
const shareButton=document.querySelector('[data-action="share"]');
const spinAgainButton=document.querySelector('[data-action="spin-again"]');
const loveButton=document.querySelector('[data-action="love"]');
const homeButton=document.querySelector('[data-action="home"]');
const soundButton=document.querySelector('[data-action="sound"]');
const playControl=document.querySelector('[data-action="play"]');
const frame=playControl.querySelector('iframe');
const bandcampPlayerShell=document.querySelector('.bandcamp-player-shell');
const playerTrack=document.querySelector('[data-player-track]');
const playerArtist=document.querySelector('[data-player-artist]');
const playerStatus=document.querySelector('[data-player-status]');
const playerDuration=document.querySelector('[data-player-duration]');
const playerArtworkImage=document.querySelector('[data-player-artwork-image]');
const playerArtworkFallback=document.querySelector('[data-player-artwork-fallback]');
const statusNode=document.querySelector('.machine-status');
const needles=[...document.querySelectorAll('[data-meter-needle]')];
const needleShadows=[...document.querySelectorAll('[data-meter-shadow]')];
const scales=[...document.querySelectorAll('[data-meter-scale]')];
const winnerName=document.querySelector('[data-winner-name]');
const winnerRelease=document.querySelector('[data-winner-release]');
const winnerArtwork=document.querySelector('[data-winner-artwork]');
const machineTitle=document.querySelector('.machine-title');
const machineTitleIdentity=document.querySelector('.machine-title-identity');
const machineTitleHeading=document.querySelector('[data-machine-title]');
const speakerLabel=document.querySelector('[data-speaker-label]');
const festivalSpeakerTitle=document.querySelector('.festival-speaker-title');
const festivalSpeakerTitleCopy=document.querySelector('[data-festival-speaker-title]');
const artistInformationPanel=document.querySelector('.artist-information');
const artistInformation=document.querySelector('[data-artist-information]');
const artistInformationCopy=document.querySelector('[data-artist-information-copy]');
const artistInformationTrack=document.querySelector('[data-artist-information-track]');
const requestMachineButton=document.querySelector('[data-action="request-machine"]');
const requestDialog=document.querySelector('.artist-machine-dialog');
const requestForm=document.querySelector('[data-artist-machine-form]');
const requestStatus=document.querySelector('[data-request-status]');
const closeRequestButton=document.querySelector('[data-action="close-request"]');
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const workerBase='https://cosmic-aquaria.andrewharris501.workers.dev';
const stateSet=new Set(MACHINE_STATES);
const historyKey=isFestivalMode?`aggits:festival-track-history:${requestedFestivalSlug}`:isSingleReelMode?`aggits:artist-track-history:${requestedArtistSlug}`:'aggits:melbourne-artist-history';
const sessionKey='aggits:analytics-session';
const soundKey='aggits:sound-off';
const lovedTracksKey=`aggits:loved-tracks:${machineMode}:${requestedFestivalSlug||requestedArtistSlug||'melbourne'}`;
const WINNER_SPLASH_DURATION_MS=4000;
const WINNER_SPLASH_TRANSITION_MS=260;
const FESTIVAL_WAKE_DURATION_MS=1800;
const FESTIVAL_TITLE_HOLD_MS=5000;
const reelMotorUrl=`${base}/assets/audio/machine/reel-actual-slotmachine-freesound-261346.mp3`;
const reelRatchetUrl=`${base}/assets/audio/machine/reel-ratchet-mixkit-2641.mp3`;
const reelStopUrls=[
  `${base}/assets/audio/machine/reel-stop-lock-mixkit-2857.mp3`,
  `${base}/assets/audio/machine/reel-stop-gear-mixkit-2858.mp3`,
  `${base}/assets/audio/machine/reel-stop-lock-mixkit-2857.mp3`,
];
const winnerFanfareUrl=`${base}/assets/audio/machine/winner-tonal-bloom-mixkit-3109.mp3`;

let catalogue=[];
let artistsById=new Map();
let stats={};
let artistConfig=null;
let artistManifest=null;
let artistTrackDeck=[];
let state='BOOT';
let locked=true;
let currentEntry=null;
let currentManifest=null;
let currentTrack=null;
let currentEmbedUrl='';
let currentPurchaseUrl='';
let tickerItems=[];
let tickerIndex=0;
let tickerTimer=0;
let audioContext=null;
let motorNodes=[];
let reelSpinAudio=null;
let reelRatchetAudio=null;
let reelStopAudio=[];
let winnerAudio=null;
let winnerAudioTimer=0;
let motorFadeTimer=0;
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
let bandcampEngaged=false;
let primaryAction='dormant';
let tickerRenderToken=0;
let titleRenderToken=0;
let selectionToken=0;
let winnerSplashTimer=0;
let winnerSplashResolve=null;
let festivalCatalogueReady=false;
let festivalWakeRequested=false;
let festivalWakePromise=null;
let festivalTitleTimer=0;
let festivalSleeping=isFestivalMode&&!requestedParameters.get('track');
let sessionStartRecorded=false;
const manifestCache=new Map();

if(isFestivalMode&&!festivalSleeping)machine.dataset.machineState='BOOT';

machine.style.setProperty('--winner-splash-total',`${(WINNER_SPLASH_DURATION_MS+WINNER_SPLASH_TRANSITION_MS*2)/1000}s`);

function readStorage(key){try{return localStorage.getItem(key)}catch{return null}}
function writeStorage(key,value){try{localStorage.setItem(key,String(value))}catch{}}
function readSession(key,fallback){try{return JSON.parse(sessionStorage.getItem(key)||'')??fallback}catch{return fallback}}
function writeSession(key,value){try{sessionStorage.setItem(key,JSON.stringify(value))}catch{}}
function sessionId(){let id=readStorage(sessionKey);if(!id){id=crypto.randomUUID?.()||`session-${Date.now()}`;writeStorage(sessionKey,id)}return id}
function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
function clearWinnerSplashTimer(){clearTimeout(winnerSplashTimer);winnerSplashTimer=0;if(winnerSplashResolve){winnerSplashResolve(false);winnerSplashResolve=null}}
function holdWinnerSplash(){
  clearWinnerSplashTimer();
  return new Promise(resolve=>{winnerSplashResolve=resolve;winnerSplashTimer=setTimeout(()=>{winnerSplashTimer=0;winnerSplashResolve=null;resolve(true)},WINNER_SPLASH_DURATION_MS+WINNER_SPLASH_TRANSITION_MS*2)});
}

const analytics=Object.freeze({
  track(eventType,details={}){
    const machineId=isFestivalMode?`festival-machine:${artistConfig?.festivalSlug||requestedFestivalSlug}`:isSingleReelMode?`artist-machine:${artistConfig?.artistSlug||requestedArtistSlug}`:(currentEntry?.slug||'melbourne-music-machine');
    const activeArtist=currentTrack?.artist||currentManifest?.artist||currentEntry?.artist||currentEntry?.artistName||artistConfig?.artistName||null;
    const body=JSON.stringify({eventType,aquariumId:machineId,sessionId:sessionId(),trackId:currentTrack?.id||currentTrack?.bandcampEmbedTrackId||null,metadata:{interface:'aggits-machine',machineMode,machineId,festivalId:isFestivalMode?(artistConfig?.festivalSlug||requestedFestivalSlug):null,festivalName:isFestivalMode?(artistConfig?.title||null):null,artistId:currentTrack?.artistId||currentEntry?.canonicalArtistId||null,artistName:activeArtist,trackName:currentTrack?.title||null,timestamp:new Date().toISOString(),interactionSource:details.source||null,...details}});
    try{fetch(`${workerBase}/api/events`,{method:'POST',headers:{'content-type':'application/json'},body,keepalive:true,credentials:'omit'}).catch(()=>{})}catch{}
  },
});
function recordEvent(eventType,details={}){analytics.track(eventType,details)}
function recordSessionStart(){if(sessionStartRecorded)return;sessionStartRecorded=true;recordEvent('session_start',{source:requestedParameters.get('source')||'direct'})}

function setState(next,message=''){
  if(!stateSet.has(next))throw new Error(`Unknown machine state: ${next}`);
  state=next;machine.dataset.machineState=next;
  if(message)statusNode.textContent=message;
  window.dispatchEvent(new CustomEvent('aggits:state',{detail:{state:next}}));
}

function randomEntry(excluded=new Set()){
  const pool=catalogue.filter(entry=>!excluded.has(reelIdentity(entry)));
  return pool[secureRandomIndex(pool.length)]||catalogue[secureRandomIndex(catalogue.length)]||null;
}

function artistName(entry){return String(isFestivalMode?(entry?.artist||currentTrack?.artist||artistConfig?.title||'FESTIVAL'):entry?.artist||entry?.artistName||artistConfig?.artistName||(isSingleReelMode?'ARTIST':'MELBOURNE')).trim()}
function reelLabel(entry){return String(isSingleReelMode?entry?.title:artistName(entry)).trim()||'MUSIC'}
function reelIdentity(entry){return String(isSingleReelMode?(entry?.id||entry?.bandcampEmbedTrackId):artistIdentity(entry)).toLowerCase()}

function setReelLabel(node,label){
  const text=String(label||'MELBOURNE').replace(/\s+/g,' ').trim();
  node.textContent=text;
  if(isFestivalMode){
    node.classList.toggle('is-long',text.length>18);
    node.classList.toggle('is-very-long',text.length>31);
  }else{
    node.classList.toggle('is-long',text.length>13);
    node.classList.toggle('is-very-long',text.length>22);
  }
}

function setReelRows(index,entry,neighbours=true){
  const strip=reels[index].querySelector('.reel-strip');
  const current=reelLabel(entry);
  const used=new Set([reelIdentity(entry)]);
  const pickNeighbour=()=>{const item=randomEntry(used);if(item)used.add(reelIdentity(item));return reelLabel(item||entry)};
  const before=neighbours?pickNeighbour():current;
  const after=neighbours?pickNeighbour():current;
  [before,current,after].forEach((label,row)=>setReelLabel(strip.children[row],label));
}

function showTicker(text,{hold=7200,onComplete=null}={}){
  clearTimeout(tickerTimer);const renderToken=++tickerRenderToken;
  ticker.textContent=String(text||'LET’S PLAY').toUpperCase();
  ticker.classList.remove('is-scrolling');
  ticker.style.removeProperty('--ticker-duration');ticker.style.removeProperty('--ticker-start');ticker.style.removeProperty('--ticker-end');ticker.style.removeProperty('--ticker-reduced-duration');
  requestAnimationFrame(()=>{
    if(renderToken!==tickerRenderToken)return;
    const viewport=ticker.parentElement.clientWidth,textWidth=ticker.scrollWidth,overflow=textWidth>viewport*.92;
    if(overflow){
      const start=viewport/2+textWidth/2+12,end=-(viewport/2+textWidth/2+12),distance=start-end;
      const duration=Math.max(9,distance/(reducedMotion.matches?28:46));
      ticker.style.setProperty('--ticker-start',`${start.toFixed(1)}px`);ticker.style.setProperty('--ticker-end',`${end.toFixed(1)}px`);ticker.style.setProperty('--ticker-duration',`${duration.toFixed(2)}s`);ticker.style.setProperty('--ticker-reduced-duration',`${duration.toFixed(2)}s`);
      if(onComplete)ticker.addEventListener('animationend',()=>{if(renderToken===tickerRenderToken)tickerTimer=setTimeout(onComplete,650)},{once:true});
      ticker.classList.add('is-scrolling');
    }else if(onComplete)tickerTimer=setTimeout(onComplete,hold);
  });
}
function startTickerRotation(items,delay=7200){
  clearTimeout(tickerTimer);tickerItems=[...new Set(items.filter(Boolean))];tickerIndex=0;
  const next=()=>{if(!tickerItems.length)return;showTicker(tickerItems[tickerIndex++%tickerItems.length],{hold:delay,onComplete:next})};
  next();
}

function setPrimaryMode(mode){
  primaryAction=mode;
  buyLink.dataset.primaryMode=mode;
  buyLink.removeAttribute('aria-busy');
  buyLink.innerHTML='<span>VISIT<br>BANDCAMP</span>';
  const active=mode==='buy';
  buyLink.disabled=!active;
  buyLink.setAttribute('aria-disabled',String(!active));
  buyLink.setAttribute('aria-label',active?`Visit ${currentTrack?.artist||currentManifest?.artist||'this artist'} on Bandcamp`:'The artist’s Bandcamp becomes available after a winning song is selected');
}

function artistInitials(value){
  const words=String(value||'MELBOURNE MUSIC').trim().split(/\s+/).filter(Boolean);
  return words.slice(0,2).map(word=>word[0]).join('').toUpperCase()||'MM';
}

function safeArtworkUrl(entry,manifest,track){
  const candidates=[track?.artworkUrl,track?.imageUrl,manifest?.artworkUrl,manifest?.imageUrl,entry?.artworkUrl,entry?.imageUrl];
  for(const value of candidates){try{const url=new URL(String(value||''));if(url.protocol==='https:')return url.href}catch{}}
  return '';
}

function setPlayerArtwork(entry,manifest,track){
  const label=track?.artist||manifest?.artist||entry?.artist||'Melbourne artist',url=safeArtworkUrl(entry,manifest,track);
  playerArtworkFallback.textContent=artistInitials(label);playerArtworkImage.hidden=true;playerArtworkImage.removeAttribute('src');playerArtworkImage.alt='';
  if(!url)return;
  playerArtworkImage.onload=()=>{if(playerArtworkImage.src===url){playerArtworkImage.hidden=false;playerArtworkImage.alt=`Artwork for ${label}`}};
  playerArtworkImage.onerror=()=>{playerArtworkImage.hidden=true;playerArtworkImage.removeAttribute('src');playerArtworkImage.alt=''};
  playerArtworkImage.src=url;
}

function setPlaybackReady(ready){
  playControl.dataset.playbackReady=String(Boolean(ready));
  playControl.setAttribute('aria-disabled',String(!ready));
  frame.tabIndex=ready?0:-1;
}

function cleanText(value,max=190){
  const text=String(value||'').replace(/\s+/g,' ').trim();
  if(text.length<=max)return text;
  const shortened=text.slice(0,max-1);return `${shortened.slice(0,Math.max(shortened.lastIndexOf(' '),max-24)).trim()}…`;
}

function artistInformationText(entry,manifest,track){
  if(isSingleReelMode){
    const artist=isFestivalMode?(track?.artist||'FESTIVAL ARTIST'):artistName(entry);
    const release=track?.albumTitle||manifest?.releaseTitle;
    const location=isFestivalMode?artistConfig?.festivalLocation:artistConfig?.city;
    const dates=isFestivalMode?artistConfig?.festivalDates:null;
    const bio=isFestivalMode?artistConfig?.festivalTickerText:artistConfig?.bio||manifest?.bioShort;
    const custom=[...(artistConfig?.tickerCopy||[])];
    const facts=[isFestivalMode?artistConfig?.title:null,artist,track?.title,release,location,dates,bio,...custom]
      .map(value=>cleanText(value,240)).filter(Boolean)
      .filter((value,index,list)=>list.findIndex(item=>item.toLowerCase()===value.toLowerCase())===index);
    return (facts.length?facts:[artist,'BANDCAMP CATALOGUE']).join('   ◆   ').toUpperCase();
  }
  const indexed=artistsById.get(entry?.canonicalArtistId)||null;
  const location=entry?.suburb?`${entry.suburb}, MELBOURNE`:entry?.primaryLocation||indexed?.location||'MELBOURNE';
  const waters=entry?.waters?.length?entry.waters.map(value=>String(value).toUpperCase()).join(' • '):indexed?.waters?.map(value=>String(value).toUpperCase()).join(' • ');
  const release=manifest?.releaseTitle||entry?.release;
  const bio=entry?.bioShort;
  const artistDetails=[manifest?.artist||entry?.artist,track?.title,location,waters,release,bio].map(value=>cleanText(value)).filter(Boolean).filter((value,index,list)=>list.findIndex(item=>item.toLowerCase()===value.toLowerCase())===index);
  return [...artistDetails,...MELBOURNE_CULTURE_SEGMENTS].join('   ◆   ').toUpperCase();
}

function showMachineIdentity(){
  titleRenderToken++;machineTitle.dataset.titleMode='identity';machineTitle.setAttribute('aria-label',isSingleReelMode?`${artistConfig?.artistName||'Artist'} catalogue`:'Melbourne catalogue statistics');machineTitleIdentity.setAttribute('aria-hidden','false');artistInformationPanel.setAttribute('aria-hidden','true');artistInformationTrack.classList.remove('is-entering','is-streaming');artistInformationTrack.style.removeProperty('--artist-entry-start');artistInformationTrack.style.removeProperty('--artist-entry-duration');artistInformationTrack.style.removeProperty('--artist-duration');artistInformation.textContent='';artistInformationCopy.textContent='';
}

function showInformationTicker(value,label){
  const token=++titleRenderToken,content=`${cleanText(value,900).toUpperCase()}   ◆   `;artistInformation.textContent=content;artistInformationCopy.textContent=content;artistInformationTrack.classList.remove('is-entering','is-streaming');machineTitle.dataset.titleMode='artist';machineTitle.setAttribute('aria-label',label);machineTitleIdentity.setAttribute('aria-hidden','true');artistInformationPanel.setAttribute('aria-hidden','false');
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    if(token!==titleRenderToken)return;
    const copyWidth=artistInformation.getBoundingClientRect().width,entryWidth=artistInformationPanel.getBoundingClientRect().width;
    if(copyWidth>0&&!reducedMotion.matches){
      artistInformationTrack.style.setProperty('--artist-entry-start',`${entryWidth.toFixed(1)}px`);artistInformationTrack.style.setProperty('--artist-entry-duration',`${Math.max(2.4,entryWidth/50).toFixed(2)}s`);artistInformationTrack.style.setProperty('--artist-duration',`${Math.max(18,copyWidth/50).toFixed(2)}s`);
      artistInformationTrack.addEventListener('animationend',event=>{if(event.animationName!=='artistInformationEnter'||token!==titleRenderToken)return;artistInformationTrack.classList.remove('is-entering');artistInformationTrack.classList.add('is-streaming')},{once:true});artistInformationTrack.classList.add('is-entering');
    }
  }));
}

function showArtistInformation(entry,manifest,track){
  showInformationTicker(artistInformationText(entry,manifest,track),`Winner information for ${manifest?.artist||entry?.artist||'the selected artist'}`);
}

function festivalInformationText(){
  const facts=[
    artistConfig?.festivalTickerText,
    artistConfig?.festivalLocation,
    artistConfig?.festivalDates,
    Number(artistConfig?.artistCount)>0?`${Number(artistConfig.artistCount).toLocaleString('en-AU')} ARTISTS`:null,
    Number(artistConfig?.songCount)>0?`${Number(artistConfig.songCount).toLocaleString('en-AU')} SONGS`:null,
    'BANDCAMP CATALOGUE',
  ].map(value=>cleanText(value,500)).filter(Boolean).filter((value,index,list)=>list.findIndex(item=>item.toLowerCase()===value.toLowerCase())===index);
  return facts.join('   ◆   ');
}

function showFestivalTitleIntro(){
  if(!isFestivalMode)return;
  clearTimeout(festivalTitleTimer);showMachineIdentity();
  festivalTitleTimer=setTimeout(()=>showInformationTicker(festivalInformationText(),`${artistConfig?.title||'Festival'} information`),FESTIVAL_TITLE_HOLD_MS);
}

function renderFestivalSpeakerTitle(value){
  if(!festivalSpeakerTitle||!festivalSpeakerTitleCopy)return;
  const lines=formatMachineTitleLines(cleanText(value,96));
  const fragment=document.createDocumentFragment();
  for(const text of lines){const line=document.createElement('span');line.textContent=text;fragment.append(line)}
  festivalSpeakerTitleCopy.replaceChildren(fragment);
  festivalSpeakerTitle.dataset.lines=String(lines.length);
  festivalSpeakerTitle.classList.toggle('is-long',Math.max(...lines.map(line=>line.length))>16);
  festivalSpeakerTitle.classList.toggle('is-very-long',Math.max(...lines.map(line=>line.length))>21||lines.length===3);
}

function currentTrackIdentity(){return String(currentTrack?.id||currentTrack?.bandcampEmbedTrackId||'')}
function lovedTracks(){return new Set(readSession(lovedTracksKey,[]))}
function updateLoveControl(){
  if(!loveButton)return;
  const trackId=currentTrackIdentity(),loved=Boolean(trackId&&lovedTracks().has(trackId));
  loveButton.disabled=!trackId;loveButton.dataset.loved=String(loved);loveButton.setAttribute('aria-pressed',String(loved));
  loveButton.setAttribute('aria-label',loved?'Loved in this session':'Love this track');
  const symbol=loveButton.querySelector('.love-symbol');if(symbol)symbol.textContent=loved?'♥':'♡';
}
function loveCurrentTrack(){
  const trackId=currentTrackIdentity();if(!isFestivalMode||!loveButton||!trackId)return;
  const loved=lovedTracks();if(loved.has(trackId))return;
  loved.add(trackId);writeSession(lovedTracksKey,[...loved]);updateLoveControl();navigator.vibrate?.(10);
  recordEvent('track_love',{source:'love_this',trackId,artist:currentTrack?.artist||currentManifest?.artist,track:currentTrack?.title});showTicker('♥ LOVE RECORDED');
}

function presentWinner(value,release='',track=null){
  const text=String(value||'MELBOURNE MUSIC').replace(/\s+/g,' ').trim().toUpperCase();
  winnerName.textContent=text;
  winnerName.classList.toggle('is-long',text.length>18);
  winnerName.classList.toggle('is-very-long',text.length>28);
  if(winnerRelease)winnerRelease.textContent=String(release||'').toUpperCase();
  if(winnerArtwork){const artwork=safeArtworkUrl(artistConfig,artistManifest,track);winnerArtwork.hidden=!artwork;if(artwork){winnerArtwork.src=artwork;winnerArtwork.alt=`Artwork for ${value}`}else{winnerArtwork.removeAttribute('src');winnerArtwork.alt=''}}
}

function updateStats(){
  if(isSingleReelMode){
    const tracks=Number(artistConfig?.songCount||catalogue.length||0);
    const artists=Number(artistConfig?.artistCount||1);
    const trackTarget=document.querySelector('[data-stat="tracks"]');if(trackTarget)trackTarget.textContent=tracks.toLocaleString('en-AU');
    const artistTarget=document.querySelector('[data-stat="artists"]');if(artistTarget)artistTarget.textContent=artists.toLocaleString('en-AU');
    const identity=artistConfig?.title||artistConfig?.artistName||'ARTIST';
    if(machineTitleHeading){
      const heading=cleanText(isFestivalMode?identity:`${identity} MUSIC MACHINE`,96).toUpperCase();
      machineTitleHeading.textContent=heading;
      machineTitleHeading.classList.toggle('is-long',isFestivalMode&&heading.length>28);
      machineTitleHeading.classList.toggle('is-very-long',isFestivalMode&&heading.length>42);
    }
    if(isFestivalMode)renderFestivalSpeakerTitle(identity);
    else if(speakerLabel)speakerLabel.innerHTML=`${cleanText(identity,34).toUpperCase()}<br>ON BANDCAMP`;
    document.title=`AGGITS — ${identity} Music Machine`;
    machine.setAttribute('aria-label',`AGGITS ${identity} Music Machine`);
    return;
  }
  const artists=Number(stats.canonicalArtistCount||stats.artists||catalogue.length);
  const tracks=Number(stats.playableTrackCount||stats.playableTracks||0);
  document.querySelector('[data-stat="artists"]').textContent=artists.toLocaleString('en-AU');
  document.querySelector('[data-stat="tracks"]').textContent=tracks.toLocaleString('en-AU');
}

function applyArtistSkin(config){
  if(!isSingleReelMode||!cabinetSkin)return;
  const artwork=String(config?.cabinetArtwork||'');
  const variant=String(config?.skinVariant||'').toLowerCase();
  if(!/^\/assets\/[a-z0-9_./-]+\.(?:avif|jpe?g|png|webp)$/.test(artwork)||!/^[a-z0-9-]+$/.test(variant))return;
  const fallback=cabinetSkin.src;
  cabinetSkin.addEventListener('error',()=>{cabinetSkin.src=fallback;delete machine.dataset.artistSkin},{once:true});
  machine.dataset.artistSkin=variant;
  cabinetSkin.src=`${base}${artwork}`;
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
function machineAudio(url){const audio=new Audio(url);audio.preload='auto';return audio}
function playSample(audio,{volume=.55,rate=1}={}){
  if(soundOff||!audio)return;
  try{audio.pause();audio.currentTime=0;audio.volume=volume;audio.playbackRate=rate;void audio.play().catch(()=>{})}catch{}
}
function ensureMachineSamples(){
  reelSpinAudio??=machineAudio(reelMotorUrl);
  reelRatchetAudio??=machineAudio(reelRatchetUrl);
  if(!reelStopAudio.length)reelStopAudio=reelStopUrls.map(machineAudio);
  winnerAudio??=machineAudio(winnerFanfareUrl);
}
function leverClack(){ensureMachineSamples();playSample(reelStopAudio[0],{volume:.58,rate:.9});navigator.vibrate?.([14,28,8])}
function reelThunk(index){
  ensureMachineSamples();
  const rates=[1.04,.98,.9];playSample(reelStopAudio[index],{volume:.72+index*.06,rate:rates[index]});
  if(reelSpinAudio&&!reelSpinAudio.paused)reelSpinAudio.volume=Math.max(.08,.34-(index+1)*.085);
  navigator.vibrate?.(12+index*3);
}
function startMotor(){
  if(soundOff)return;
  stopMotor(true);
  ensureMachineSamples();
  playSample(reelRatchetAudio,{volume:.66,rate:.96});
  reelSpinAudio.loop=false;reelSpinAudio.currentTime=.15;reelSpinAudio.volume=.42;reelSpinAudio.playbackRate=1;
  void reelSpinAudio.play().catch(()=>{});
}
function stopMotor(immediate=false){
  clearInterval(motorFadeTimer);motorFadeTimer=0;
  if(reelSpinAudio&&!reelSpinAudio.paused){
    if(immediate){reelSpinAudio.pause();reelSpinAudio.currentTime=0;reelSpinAudio.volume=.34}
    else{let step=0,startVolume=reelSpinAudio.volume;motorFadeTimer=setInterval(()=>{step++;reelSpinAudio.volume=Math.max(.001,startVolume*(1-step/6));if(step>=6){clearInterval(motorFadeTimer);motorFadeTimer=0;reelSpinAudio.pause();reelSpinAudio.currentTime=0;reelSpinAudio.volume=.34}},30)}
  }
  if(motorNodes.length){const ctx=audioContext,gain=motorNodes[2];try{gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.12);motorNodes.slice(0,2).forEach(node=>node.stop(ctx.currentTime+.14))}catch{}motorNodes=[]}
}
function celebrationSound(){
  ensureMachineSamples();clearTimeout(winnerAudioTimer);playSample(winnerAudio,{volume:.58,rate:1});
  winnerAudioTimer=setTimeout(()=>{winnerAudio?.pause();if(winnerAudio)winnerAudio.currentTime=0},1450);
  navigator.vibrate?.([22,45,18,45,25]);
}

async function fetchManifest(entry){
  if(manifestCache.has(entry.slug))return manifestCache.get(entry.slug);
  const response=await fetch(`${base}/artists/${encodeURIComponent(entry.slug)}.json`,{cache:'no-store'});
  if(!response.ok)throw new Error(`manifest_${response.status}`);
  const manifest=await response.json();
  if(!validBandcampUrl(manifest.bandcampUrl)||!pickPlayableTrack(manifest))throw new Error('no_playable_track');
  manifestCache.set(entry.slug,manifest);
  return manifest;
}

async function prepareWinner(entry){
  const manifest=await fetchManifest(entry);
  const track=pickPlayableTrack(manifest);
  const purchaseUrl=validBandcampUrl(track?.bandcampUrl)||validBandcampUrl(manifest.bandcampUrl);
  if(!track||!purchaseUrl)throw new Error('no_playable_track');
  return {entry,manifest,track,purchaseUrl};
}

async function selectPreparedWinner(){
  if(isSingleReelMode){
    if(!artistTrackDeck.length)artistTrackDeck=createShuffleBag(catalogue,currentTrack?.id||readSession(historyKey,[])[0]||'');
    const track=artistTrackDeck.shift();
    const purchaseUrl=validBandcampUrl(track?.artistBandcampUrl)||validBandcampUrl(track?.bandcampUrl)||validBandcampUrl(track?.sourcePage)||validBandcampUrl(artistManifest?.bandcampUrl)||validBandcampUrl(artistConfig?.bandcampArtistUrl);
    if(!track||!purchaseUrl)throw new Error('no_playable_artist_track');
    return {entry:artistConfig,manifest:artistManifest,track,purchaseUrl};
  }
  const recent=readSession(historyKey,[]);
  const rejected=[];
  while(rejected.length<catalogue.length){
    const outcome=selectGuaranteedWinner(catalogue,[...recent,...rejected]);
    if(!outcome)break;
    const entry=outcome.winner;
    try{return await prepareWinner(entry)}catch{rejected.push(artistIdentity(entry))}
  }
  throw new Error('no_playable_melbourne_artist');
}

function spinReel(index,finalEntry,stopAfter){
  const reel=reels[index],strip=reel.querySelector('.reel-strip');reel.classList.add('is-spinning');
  const started=performance.now();let lastSwap=0,current=randomEntry();
  return new Promise(resolve=>{
    const tick=now=>{
      const elapsed=now-started,progress=Math.min(1,elapsed/stopAfter);
      const cadence=progress<.18?124-(progress/.18)*80:progress<.7?44+index*2:44+Math.pow((progress-.7)/.3,2)*190;
      const rowHeight=Math.max(16,reel.clientHeight/3),phase=((now-lastSwap)/cadence)%1;
      strip.style.transform=`translate3d(0,${((phase-.5)*rowHeight).toFixed(2)}px,0)`;
      if(now-lastSwap>cadence){current=randomEntry();setReelRows(index,current);lastSwap=now}
      if(elapsed>=stopAfter){strip.style.transform='';setReelRows(index,finalEntry);reel.classList.remove('is-spinning');reel.classList.add('is-locking');setTimeout(()=>reel.classList.remove('is-locking'),260);reelThunk(index);resolve();return}
      requestAnimationFrame(tick);
    };requestAnimationFrame(tick);
  });
}

function stopPlayback(){
  selectionToken++;
  clearWinnerSplashTimer();clearTimeout(winnerAudioTimer);winnerAudioTimer=0;winnerAudio?.pause();
  if(bandcampEngaged&&currentTrack)recordEvent('track_play_paused',{source:'machine_reset',artist:currentTrack.artist||currentManifest?.artist,track:currentTrack.title});
  bandcampEngaged=false;bandcampPlayerShell.dataset.playbackState='ready';playerTrack.textContent='WINNING TRACK';playerArtist.textContent=isSingleReelMode?(artistConfig?.artistName||'ARTIST'):'MELBOURNE ARTIST';playerStatus.textContent='READY';playerDuration.textContent='BANDCAMP';setPlayerArtwork(null,null,null);setPlaybackReady(false);frame.src='about:blank';currentEntry=null;currentManifest=null;currentTrack=null;currentEmbedUrl='';currentPurchaseUrl='';shareButton.disabled=true;if(loveButton)loveButton.disabled=true;setPrimaryMode('dormant');updateLoveControl();showMachineIdentity();setMeterMode('idle');
}

function loadBandcampFrame(url,timeout=5000){
  return new Promise(resolve=>{
    let settled=false,timer=0;
    const done=()=>{if(settled)return;settled=true;clearTimeout(timer);frame.removeEventListener('load',done);resolve()};
    frame.addEventListener('load',done);frame.src=url;timer=setTimeout(done,timeout);
  });
}

async function loadWinningTrack(entry,{fromDeepLink=false,prepared=null}={}){
  const token=++selectionToken;
  setState('LOADING_TRACK',`Loading music by ${artistName(entry)}.`);showTicker(`LOADING ${artistName(entry)}...`);
  try{
    const resolved=prepared?.entry===entry?prepared:await prepareWinner(entry);const {manifest,track,purchaseUrl}=resolved;const playbackArtist=isFestivalMode?(track.artist||manifest.artist):manifest.artist;
    currentEntry=entry;currentManifest=manifest;currentTrack=track;setMeterMode('idle',track.id||track.bandcampEmbedTrackId);
    playerTrack.textContent=track.title;playerArtist.textContent=playbackArtist;playerStatus.textContent='READY';playerDuration.textContent=track.duration?`BANDCAMP • ${track.duration}`:'BANDCAMP';setPlayerArtwork(entry,manifest,track);setPlaybackReady(false);bandcampPlayerShell.dataset.playbackState='ready';
    const embedId=encodeURIComponent(track.bandcampEmbedTrackId);
    frame.title=`Official Bandcamp playback controls for ${track.title} by ${playbackArtist}`;
    currentEmbedUrl=`https://bandcamp.com/EmbeddedPlayer/track=${embedId}/size=small/bgcol=1b0808/linkcol=e8c680/tracklist=false/artwork=none/transparent=false/autoplay=false/`;
    currentPurchaseUrl=purchaseUrl;
    bandcampEngaged=false;showTicker(`PREPARING ${track.title} ON BANDCAMP...`);await loadBandcampFrame(currentEmbedUrl);if(token!==selectionToken||currentEntry!==entry)return;
    setPlaybackReady(true);shareButton.disabled=false;spinAgainButton.disabled=false;setPrimaryMode('buy');updateLoveControl();showArtistInformation(entry,manifest,track);showTicker(`LISTEN TO ${track.title} ON BANDCAMP`);
    const history=pushHistory(readSession(historyKey,[]),isSingleReelMode?String(track.id||track.bandcampEmbedTrackId):artistIdentity(entry),SESSION_HISTORY_LIMIT);writeSession(historyKey,history);
    setState('READY_TO_PLAY',`${track.title} by ${playbackArtist} is ready in the Bandcamp player.`);
    if(!fromDeepLink)historyApi('push',entry);
    recordEvent('track_selected',{result:'ready',artist:playbackArtist,release:manifest.releaseTitle,source:fromDeepLink?'deep_link':'machine_discovery'});
  }catch(error){
    if(token!==selectionToken)return;
    setState('PLAY_ERROR','That track could not be loaded. Pull again.');showTicker('TRACK UNAVAILABLE — PULL AGAIN');setPrimaryMode('dormant');setMeterMode('idle');locked=false;spinAgainButton.disabled=false;recordEvent('track_selected',{result:'failed',reason:String(error?.message||error)});await wait(1400);setState('IDLE');
  }
}

function activatePrimary(){
  if(primaryAction==='buy'&&currentPurchaseUrl){recordEvent('bandcamp_click',{source:'visit_bandcamp',url:currentPurchaseUrl,artist:currentManifest?.artist});recordEvent('buy_click',{source:'visit_bandcamp',url:currentPurchaseUrl,artist:currentManifest?.artist});window.open(currentPurchaseUrl,'_blank','noopener,noreferrer')}
}

function historyApi(mode,entry){
  if(isSingleReelMode){
    const route=isFestivalMode?'festival':'artist';
    const parameter=isFestivalMode?'festival':'artist';
    const slug=isFestivalMode?artistConfig.festivalSlug:artistConfig.artistSlug;
    const url=new URL(`${base.replace(/\/$/,'')}/${route}/`,location.origin);url.searchParams.set(parameter,slug);if(currentTrack?.id)url.searchParams.set('track',currentTrack.id);history[`${mode}State`]({view:isFestivalMode?'festival-machine':'artist-machine',slug,track:currentTrack?.id||null},'',url);return;
  }
  const url=new URL(`${base.replace(/\/$/,'')}/`,location.origin);url.searchParams.set('release',entry.slug);url.searchParams.set('universe','melbourne');history[`${mode}State`]({view:'machine',release:entry.slug},'',url);
}

async function runSpin(source='lever'){
  if(locked||!catalogue.length)return;
  locked=true;spinAgainButton.disabled=true;clearTimeout(tickerTimer);stopPlayback();showMachineIdentity();
  recordEvent('spin_started',{source});if(source==='spin_again')recordEvent('re_spin',{source});
  setState('SPIN_START',isSingleReelMode?'The song reel is starting.':'The Melbourne artist reels are starting.');showTicker(isSingleReelMode?'SEARCHING THE CATALOGUE...':'SEARCHING MELBOURNE...');setMeterMode('spin');leverClack();
  let prepared;
  try{prepared=await selectPreparedWinner()}catch(error){setState('PLAY_ERROR',isSingleReelMode?'The machine could not prepare a song.':'The machine could not prepare a Melbourne song.');showTicker('MACHINE RESTING — PULL AGAIN');setMeterMode('idle');locked=false;spinAgainButton.disabled=false;recordEvent('track_selected',{result:'failed',reason:String(error?.message||error)});return}
  const winner=isSingleReelMode?prepared.track:prepared.entry;const outcome=isSingleReelMode?{kind:'winner',winner,entries:[winner]}:{kind:'winner',winner,entries:[winner,winner,winner]};startMotor();recordEvent(isSingleReelMode?'reel_spin':'explore_click',{source});recordEvent(isSingleReelMode?'track_revealed':'artist_selected',{artist:artistName(prepared.entry),track:prepared.track?.title,source});setState('SPINNING');
  const stopTimes=isSingleReelMode?(reducedMotion.matches?[620]:[2350]):(reducedMotion.matches?[520,720,920]:[1550,2200,2950]);
  const promises=outcome.entries.map((entry,index)=>spinReel(index,entry,stopTimes[index]).then(()=>setState(`REEL_${index+1}_STOP`,isSingleReelMode?`The reel stopped on ${reelLabel(entry)}.`:`Reel ${index+1} stopped on ${artistName(entry)}.`)));
  await Promise.all(promises);stopMotor();recordEvent('spin_completed',{source,artist:artistName(prepared.entry),track:prepared.track?.title});setState('EVALUATE');await wait(reducedMotion.matches?100:380);
  if(!isSingleReelMode&&!isThreeArtistMatch(outcome.entries))throw new Error('guaranteed_winner_invariant');
  presentWinner(isSingleReelMode?prepared.track.title:artistName(winner),isSingleReelMode?prepared.track.albumTitle:'',prepared.track);setState('WIN',isSingleReelMode?`${prepared.track.title} selected.`:`Three matching reels: ${artistName(winner)}.`);showTicker(isSingleReelMode?`★ ${prepared.track.title} ★`:`★★★ ${artistName(winner)} ★★★`);setMeterMode('celebrate');celebrationSound();setState('WIN_CELEBRATION');recordEvent('winner_revealed',{artist:artistName(prepared.entry),track:prepared.track?.title});const revealCompleted=await holdWinnerSplash();if(!revealCompleted)return;await loadWinningTrack(prepared.entry,{prepared});locked=false;
}

function wakeFestivalMachine(){
  festivalWakeRequested=true;
  if(!isFestivalMode||!festivalSleeping)return runSpin('spin_again');
  if(!festivalCatalogueReady||festivalWakePromise)return festivalWakePromise;
  festivalWakePromise=(async()=>{
    locked=true;spinAgainButton.disabled=true;spinAgainButton.setAttribute('aria-label','Festival jukebox waking');ensureAudio();
    setState('WAKING','The Festival Music Machine is waking up.');recordEvent('machine_wake',{source:'re_spin'});
    await wait(reducedMotion.matches?300:FESTIVAL_WAKE_DURATION_MS);
    festivalSleeping=false;locked=false;spinAgainButton.setAttribute('aria-label','Re-spin the festival song reel');
    const spinPromise=runSpin('festival_wake');showFestivalTitleIntro();await spinPromise;
  })().finally(()=>{festivalWakePromise=null});
  return festivalWakePromise;
}

function resetLever(animated=true){leverProgress=0;lever.style.transition=animated?'transform .48s cubic-bezier(.18,.72,.23,1)':'none';lever.style.transform='translateY(0) rotate(0)';setTimeout(()=>lever.style.transition='',500)}
function pullVisual(progress){leverProgress=Math.max(0,Math.min(1,progress));const resisted=Math.pow(leverProgress,.78);lever.style.transform=`translateY(${resisted*19}%) rotate(${resisted*11}deg)`}
function animateLeverAndSpin(){if(locked)return;ensureAudio();lever.style.transition='transform .34s cubic-bezier(.2,.7,.25,1)';pullVisual(1);setTimeout(()=>{void runSpin('lever');resetLever(true)},250)}
function onLeverDown(event){if(locked)return;ensureAudio();leverPointer=event.pointerId;leverStartY=event.clientY;leverMoved=false;leverTriggered=false;lever.setPointerCapture?.(event.pointerId);setState('LEVER_PULL','Pull the lever down past the resistance point.');lever.style.transition='none'}
function onLeverMove(event){if(event.pointerId!==leverPointer)return;const travel=Math.max(0,event.clientY-leverStartY);leverMoved=leverMoved||travel>7;pullVisual(travel/115);if(leverProgress>=.72&&!leverTriggered){leverTriggered=true;navigator.vibrate?.(8)}}
function onLeverUp(event){if(event.pointerId!==leverPointer)return;lever.releasePointerCapture?.(event.pointerId);leverPointer=null;if(leverTriggered){void runSpin('lever');resetLever(true)}else if(!leverMoved){animateLeverAndSpin()}else{setState(currentTrack?'READY_TO_PLAY':'IDLE','The lever returned without starting the reels.');resetLever(true)}}

async function shareCurrent(){if(!currentEntry||!currentManifest||!currentTrack)return;const url=location.href,performer=currentTrack.artist||currentManifest.artist,title=`${performer} — ${currentTrack.title}`;const text=isFestivalMode?`Found on the ${artistConfig?.title||'Festival'} Music Machine.`:isSingleReelMode?`Found on the ${currentManifest.artist} Music Machine.`:'Found through the AGGITS Melbourne Music Machine.';try{if(navigator.share)await navigator.share({title,text,url});else{await navigator.clipboard.writeText(url);showTicker('DISCOVERY LINK COPIED')}}catch(error){if(error?.name!=='AbortError')showTicker('SHARE UNAVAILABLE')};recordEvent('share_click',{artist:performer})}
function resetMachine(){recordEvent('home_click',{source:'home'});stopPlayback();locked=false;spinAgainButton.disabled=false;reels.forEach((_,index)=>setReelRows(index,randomEntry()));setState('IDLE',isSingleReelMode?'Pull the lever to discover a song.':'Pull the lever to discover Melbourne music.');startTickerRotation(idleMessages());if(isFestivalMode)showFestivalTitleIntro();const homeUrl=isFestivalMode?`${base.replace(/\/$/,'')}/festival/?festival=${encodeURIComponent(artistConfig.festivalSlug)}`:isSingleReelMode?`${base.replace(/\/$/,'')}/artist/?artist=${encodeURIComponent(artistConfig.artistSlug)}`:`${base.replace(/\/$/,'')}/`;history.replaceState({view:isFestivalMode?'festival-machine':isSingleReelMode?'artist-machine':'machine'},'',homeUrl)}
function idleMessages(){return isFestivalMode?[artistConfig?.festivalTickerText,'PULL FOR A FESTIVAL SONG'].filter(Boolean):[isSingleReelMode?'PULL FOR A SONG':'LET’S PLAY']}

function toggleSound(){soundOff=!soundOff;writeStorage(soundKey,soundOff);soundButton.textContent=soundOff?'SOUND OFF':'SOUND ON';soundButton.setAttribute('aria-pressed',String(!soundOff));recordEvent('sound_toggle',{source:'sound_control',soundOn:!soundOff});if(soundOff){stopMotor();winnerAudio?.pause();reelStopAudio.forEach(audio=>audio.pause());reelRatchetAudio?.pause();audioContext?.suspend()}else{ensureAudio();ensureMachineSamples()}}

function openArtistMachineRequest(){
  if(!requestDialog||!requestForm)return;
  requestStatus.textContent='';
  requestForm.elements.sourceUrl.value=location.href;
  if(artistConfig?.artistName&&!requestForm.elements.artistName.value)requestForm.elements.artistName.value=artistConfig.artistName;
  requestDialog.showModal();requestForm.elements.artistName.focus();recordEvent('artist_machine_request_opened',{artist:artistConfig?.artistName});
}
function closeArtistMachineRequest(){requestDialog?.close()}
function validRequestForm(form){
  const data=Object.fromEntries(new FormData(form));
  try{const url=new URL(String(data.bandcampUrl||''));if(url.protocol!=='https:'||!(url.hostname==='bandcamp.com'||url.hostname.endsWith('.bandcamp.com')))return {ok:false,message:'PLEASE ENTER A VALID BANDCAMP URL.'}}catch{return {ok:false,message:'PLEASE ENTER A VALID BANDCAMP URL.'}}
  if(!/^\S+@\S+\.\S+$/.test(String(data.email||'')))return {ok:false,message:'PLEASE ENTER A VALID EMAIL ADDRESS.'};
  if(!String(data.artistName||'').trim()||!String(data.city||'').trim())return {ok:false,message:'PLEASE COMPLETE THE REQUIRED FIELDS.'};
  return {ok:true,data};
}
async function submitArtistMachineRequest(event){
  event.preventDefault();if(!requestForm||requestForm.dataset.submitting==='true')return;
  const validation=validRequestForm(requestForm);if(!validation.ok){requestStatus.textContent=validation.message;return}
  requestForm.dataset.submitting='true';requestForm.querySelector('[type="submit"]').disabled=true;requestStatus.textContent='SENDING REQUEST…';
  try{
    const response=await fetch(`${workerBase}/api/artist-machine-requests`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(validation.data),credentials:'omit'});
    if(!response.ok)throw new Error(`request_${response.status}`);
    requestStatus.textContent='REQUEST SENT — WE’LL TAKE A LOOK AT YOUR BANDCAMP.';requestForm.reset();recordEvent('artist_machine_request_submitted',{sourceArtist:artistConfig?.artistName});
  }catch{requestStatus.textContent='THE REQUEST COULD NOT BE SENT. YOUR DETAILS ARE STILL HERE — PLEASE TRY AGAIN.'}
  finally{requestForm.dataset.submitting='false';requestForm.querySelector('[type="submit"]').disabled=false}
}

async function loadData(){
  if(isSingleReelMode){
    const registryPath=isFestivalMode?'festival-machines.json':'artist-machines.json';
    const configResponse=await fetch(`${base}/${registryPath}`,{cache:'no-store'});
    if(!configResponse.ok)throw new Error(isFestivalMode?'festival_machine_catalogue_unavailable':'artist_machine_catalogue_unavailable');
    const configPayload=await configResponse.json();
    const sourceConfig=isFestivalMode?(configPayload.festivals||[]).find(item=>item.festivalSlug===requestedFestivalSlug):(configPayload.artists||[]).find(item=>item.artistSlug===requestedArtistSlug);
    if(!sourceConfig)throw new Error(isFestivalMode?'festival_machine_not_found':'artist_machine_not_found');
    artistConfig=isFestivalMode?{...sourceConfig,artistName:sourceConfig.title,artistSlug:sourceConfig.festivalSlug,city:sourceConfig.festivalLocation,bio:sourceConfig.festivalTickerText,bandcampArtistUrl:sourceConfig.bandcampUrls?.[0]}:sourceConfig;
    applyArtistSkin(artistConfig);
    const manifestResponse=await fetch(`${base}${artistConfig.cataloguePath}`,{cache:'no-store'});
    if(!manifestResponse.ok)throw new Error(isFestivalMode?'festival_catalogue_unavailable':'artist_catalogue_unavailable');
    artistManifest=await manifestResponse.json();catalogue=playableArtistTracks(artistManifest);
    if(!catalogue.length)throw new Error('no_playable_artist_tracks');
    recordSessionStart();
    artistConfig.songCount=catalogue.length;updateStats();reels.forEach((_,index)=>setReelRows(index,randomEntry()));showMachineIdentity();
    const requestedTrack=requestedParameters.get('track');
    if(isFestivalMode)festivalCatalogueReady=true;
    if(requestedTrack){const track=catalogue.find(item=>String(item.id)===requestedTrack||String(item.bandcampEmbedTrackId)===requestedTrack);if(track){const purchaseUrl=validBandcampUrl(track.artistBandcampUrl)||validBandcampUrl(track.bandcampUrl)||validBandcampUrl(track.sourcePage)||validBandcampUrl(artistManifest.bandcampUrl)||validBandcampUrl(artistConfig.bandcampArtistUrl);setReelRows(0,track,false);locked=true;await loadWinningTrack(artistConfig,{fromDeepLink:true,prepared:{entry:artistConfig,manifest:artistManifest,track,purchaseUrl}});locked=false;return}}
    if(isFestivalMode){
      festivalSleeping=true;locked=true;spinAgainButton.disabled=false;spinAgainButton.setAttribute('aria-label','Wake the Festival Music Machine');setState('SLEEPING','Press the illuminated Re-Spin button to wake the Festival Music Machine.');recordEvent('festival_machine_loaded',{artist:artistConfig.artistName,catalogueSize:catalogue.length});if(festivalWakeRequested)void wakeFestivalMachine();return;
    }
    locked=false;spinAgainButton.disabled=false;setState('IDLE','Pull the lever to discover a song.');startTickerRotation(idleMessages());recordEvent(isFestivalMode?'festival_machine_loaded':'artist_machine_loaded',{artist:artistConfig.artistName,catalogueSize:catalogue.length});return;
  }
  const [catalogueResponse,artistsResponse,statsResponse]=await Promise.all([fetch(`${base}/aquariums.json`,{cache:'no-store'}),fetch(`${base}/artist-search-index.json`,{cache:'no-store'}),fetch(`${base}/universe-stats.json`,{cache:'no-store'})]);
  if(!catalogueResponse.ok)throw new Error('catalogue_unavailable');
  const cataloguePayload=await catalogueResponse.json();catalogue=playableMelbourneEntries(cataloguePayload.aquariums||[]);
  if(!catalogue.length)throw new Error('no_playable_melbourne_artists');
  recordSessionStart();
  if(artistsResponse.ok){const data=await artistsResponse.json();artistsById=new Map((data.artists||[]).map(artist=>[artist.id,artist]))}
  if(statsResponse.ok)stats=await statsResponse.json();updateStats();reels.forEach((_,index)=>setReelRows(index,randomEntry()));
  const requested=requestedParameters.get('release');
  if(requested){const entry=catalogue.find(item=>item.slug===requested);if(entry){reels.forEach((_,index)=>setReelRows(index,entry,false));locked=true;await loadWinningTrack(entry,{fromDeepLink:true});locked=false;return}}
  locked=false;spinAgainButton.disabled=false;setState('IDLE','Pull the lever to discover Melbourne music.');startTickerRotation(idleMessages());recordEvent('doorway_open',{catalogueSize:catalogue.length,universe:'melbourne'});
}

buildMeters();startMeters();soundButton.textContent=soundOff?'SOUND OFF':'SOUND ON';soundButton.setAttribute('aria-pressed',String(!soundOff));
const warmMachineAudio=()=>ensureMachineSamples();
if('requestIdleCallback'in window)requestIdleCallback(warmMachineAudio,{timeout:1500});else setTimeout(warmMachineAudio,700);
lever.addEventListener('pointerdown',onLeverDown);lever.addEventListener('pointermove',onLeverMove);lever.addEventListener('pointerup',onLeverUp);lever.addEventListener('pointercancel',onLeverUp);
lever.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();animateLeverAndSpin()}});
shareButton.addEventListener('click',()=>void shareCurrent());buyLink.addEventListener('click',activatePrimary);spinAgainButton.addEventListener('click',()=>void (isFestivalMode&&festivalSleeping?wakeFestivalMachine():runSpin('spin_again')));loveButton?.addEventListener('click',loveCurrentTrack);homeButton.addEventListener('click',resetMachine);soundButton.addEventListener('click',toggleSound);
requestMachineButton?.addEventListener('click',openArtistMachineRequest);closeRequestButton?.addEventListener('click',closeArtistMachineRequest);requestForm?.addEventListener('submit',submitArtistMachineRequest);requestDialog?.addEventListener('click',event=>{if(event.target===requestDialog)closeArtistMachineRequest()});
function markBandcampPlayback(){if(!currentTrack||bandcampEngaged)return;const performer=currentTrack.artist||currentManifest.artist;bandcampEngaged=true;bandcampPlayerShell.dataset.playbackState='playing';playerStatus.textContent='PLAYING';setState('PLAYING',`Playing ${currentTrack.title} by ${performer} through Bandcamp.`);setMeterMode('playing',currentTrack.id);recordEvent('track_play_started',{source:'bandcamp_embed',artist:performer,track:currentTrack.title})}
frame.addEventListener('focus',markBandcampPlayback);addEventListener('blur',()=>setTimeout(()=>{if(document.activeElement===frame)markBandcampPlayback()},0));addEventListener('popstate',()=>location.reload());
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(meterFrame);stopMotor()}else startMeters()});
loadData().catch(error=>{spinAgainButton.disabled=true;setState('PLAY_ERROR',isFestivalMode?'This festival catalogue could not be opened.':isSingleReelMode?'This artist catalogue could not be opened.':'The Melbourne library could not be opened.');showTicker('MACHINE RESTING — PLEASE REFRESH');console.error(error)});

window.AggitsMachine=Object.freeze({
  spin:()=>isFestivalMode&&festivalSleeping?wakeFestivalMachine():runSpin('api'),
  getState:()=>({state,locked,machineMode,catalogueSize:catalogue.length,currentArtist:currentTrack?.artist||currentEntry?.artist||currentEntry?.artistName||artistConfig?.artistName||null,currentTrack:currentTrack?.title||null,primaryAction,meterSource:'procedural-transport-coupled'}),
});
