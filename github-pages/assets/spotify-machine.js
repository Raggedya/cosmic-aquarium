import {createShuffleBag,secureRandomIndex} from './discovery-machine-core.js?v=spotify-bandcamp-v1';
import {leverResistance} from './machine-mechanics-core.js';
import {populateSingleReel,spinSingleReel} from './single-reel-engine.js';

const machine=document.querySelector('.spotify-machine');
const base=machine?.dataset.base||'';
const reel=document.querySelector('.reel');
const lever=document.querySelector('.lever');
const shutter=document.querySelector('[data-player-shutter]');
const frame=document.querySelector('.player-bay iframe');
const statusNode=document.querySelector('.machine-status');
const artistNode=document.querySelector('[data-result-artist]');
const trackNode=document.querySelector('[data-result-track]');
const bandcampLink=document.querySelector('[data-action="bandcamp"]');
const spotifyLink=document.querySelector('[data-action="spotify"]');
const spinAgain=document.querySelector('[data-action="spin-again"]');
const soundButton=document.querySelector('[data-action="sound"]');
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const workerBase='https://cosmic-aquaria.andrewharris501.workers.dev';
const sessionKey='aggits:analytics-session';
const soundKey='aggits:spotify-sound-off';
const allowedStates=new Set(['BOOT','IDLE','LEVER_PULL','PANEL_CLOSING','SPIN_START','SPINNING','RESULT_LOCK','PANEL_OPENING','PLAYER_REVEALED','PLAYING','ERROR']);
const analyticsId='spotify-machine:proof-of-concept';
const sourceParameters=new URLSearchParams(location.search);
const referrerHost=(()=>{try{return document.referrer?new URL(document.referrer).hostname.toLowerCase():''}catch{return''}})();
const acquisitionSource=sourceParameters.get('source')||(/facebook|fb\.com/.test(referrerHost)?'facebook':/instagram/.test(referrerHost)?'instagram':referrerHost?'referral':'direct');

let records=[];
let deck=[];
let current=null;
let state='BOOT';
let locked=true;
let soundOff=readStorage(soundKey)==='true';
let leverStartY=0;
let leverPointer=null;
let leverTriggered=false;
let panelIsOpen=false;
let audioSamples=null;

function readStorage(key){try{return localStorage.getItem(key)}catch{return null}}
function writeStorage(key,value){try{localStorage.setItem(key,String(value))}catch{}}
function sessionId(){let id=readStorage(sessionKey);if(!id){id=crypto.randomUUID?.()||`session-${Date.now()}`;writeStorage(sessionKey,id)}return id}
function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
function setState(next,message=''){
  if(!allowedStates.has(next))throw new Error(`invalid_machine_state:${next}`);
  state=next;machine.dataset.machineState=next;
  if(message)statusNode.textContent=message;
  window.dispatchEvent(new CustomEvent('aggits:spotify-machine-state',{detail:{state:next,artistId:current?.id||null}}));
}
function validHttps(value,hostname){try{const url=new URL(value);return url.protocol==='https:'&&(url.hostname===hostname||url.hostname.endsWith(`.${hostname}`))}catch{return false}}
function validRecord(record){return record&&record.id&&record.artistName&&validHttps(record.spotifyEmbedUrl,'spotify.com')&&validHttps(record.spotifyOpenUrl,'spotify.com')&&validHttps(record.bandcampUrl,'bandcamp.com')}
function recordEvent(eventType,details={}){
  const metadata={machineMode:'spotify-bandcamp',interface:'aggits-machine',acquisitionSource,artistId:current?.id||null,artistName:current?.artistName||null,trackName:current?.trackTitle||null,...details};
  fetch(`${workerBase}/api/activity`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({eventType,aquariumId:analyticsId,sessionId:sessionId(),metadata}),keepalive:true}).catch(()=>{});
}
function randomRecord(excluded=new Set()){
  const available=records.filter(record=>!excluded.has(record.id));
  return available[secureRandomIndex(available.length)]||records[0];
}
function nextRecord(){
  if(!deck.length)deck=createShuffleBag(records,current?.id||'');
  return deck.shift();
}
function labelFor(record){return String(record?.trackTitle||record?.artistName||'DISCOVER').toUpperCase()}
function setLabel(node,label){node.querySelector('span').textContent=label}
function renderRows(record,neighbours=true){populateSingleReel({reel,entry:record,pickRandom:used=>randomRecord(used),labelFor,identityFor:item=>item.id,setLabel,neighbours})}
function setLink(link,url,label){
  if(url){link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.classList.remove('is-disabled');link.setAttribute('aria-disabled','false');link.setAttribute('aria-label',label)}
  else{link.removeAttribute('href');link.classList.add('is-disabled');link.setAttribute('aria-disabled','true')}
}
function ensureAudio(){
  if(audioSamples)return audioSamples;
  const create=name=>new Audio(`${base}/assets/audio/machine/${name}`);
  audioSamples={motor:create('reel-actual-slotmachine-freesound-261346.mp3'),ratchet:create('reel-ratchet-mixkit-2641.mp3'),gear:create('reel-stop-gear-mixkit-2858.mp3'),lock:create('reel-stop-lock-mixkit-2857.mp3')};
  audioSamples.motor.loop=true;audioSamples.motor.volume=.24;audioSamples.ratchet.volume=.28;audioSamples.gear.volume=.32;audioSamples.lock.volume=.38;
  return audioSamples;
}
function playSample(name,{rate=1,restart=true}={}){if(soundOff)return;const sample=ensureAudio()[name];if(restart)sample.currentTime=0;sample.playbackRate=rate;sample.play().catch(()=>{})}
function startMotor(){if(soundOff)return;const {motor,ratchet}=ensureAudio();motor.currentTime=0;ratchet.currentTime=0;motor.play().catch(()=>{});ratchet.play().catch(()=>{})}
function stopMotor(){if(!audioSamples)return;for(const key of ['motor','ratchet']){audioSamples[key].pause();audioSamples[key].currentTime=0}}
function resetResult(){
  setLink(bandcampLink,'','');setLink(spotifyLink,'','');
  artistNode.textContent='SEARCHING…';trackNode.textContent='The reel is selecting an artist.';
  frame.removeAttribute('src');
}
async function closePanel({record=true}={}){
  if(!panelIsOpen)return;
  setState('PANEL_CLOSING','Closing the Spotify player…');
  playSample('gear',{rate:.82});
  panelIsOpen=false;
  await wait(reducedMotion.matches?210:720);
  if(record)recordEvent('panel_closed',{source:'next_discovery'});
}
async function revealPlayer(record){
  frame.src=record.spotifyEmbedUrl;
  frame.title=`Spotify player for ${record.artistName}`;
  setState('PANEL_OPENING',`Opening Spotify for ${record.artistName}…`);
  playSample('gear',{rate:1.04});
  await wait(reducedMotion.matches?220:900);
  playSample('lock',{rate:1.05});
  panelIsOpen=true;
  setState('PLAYER_REVEALED',`${record.artistName} selected — press play in Spotify.`);
  recordEvent('panel_opened',{source:'discovery_result'});
  recordEvent('spotify_embed_shown',{spotifyUri:record.spotifyUri});
}
async function runSpin(source='lever'){
  if(locked||!records.length)return;
  locked=true;
  if(source==='lever')recordEvent('lever_pull',{source});
  if(source==='spin_again')recordEvent('spin_again_clicked',{source});
  await closePanel();
  resetResult();
  setState('SPIN_START','The mechanism is engaging…');
  recordEvent('spin_started',{source});
  playSample('lock',{rate:.92});
  await wait(reducedMotion.matches?60:130);
  current=nextRecord();
  setState('SPINNING','Searching the artist library…');
  startMotor();
  await spinSingleReel({reel,finalEntry:current,stopAfter:reducedMotion.matches?620:2350,pickRandom:()=>randomRecord(),renderRows:entry=>renderRows(entry),onStop:()=>playSample('lock')});
  stopMotor();
  setState('RESULT_LOCK',`${current.artistName} selected.`);
  artistNode.textContent=current.artistName;
  trackNode.textContent=current.trackTitle||'Explore this artist in the official Spotify player.';
  setLink(bandcampLink,current.bandcampUrl,`Buy or explore ${current.artistName} on Bandcamp`);
  setLink(spotifyLink,current.spotifyOpenUrl,`Open ${current.artistName} in Spotify`);
  recordEvent('artist_selected',{artist:current.artistName});
  recordEvent('spin_completed',{source,artist:current.artistName});
  await wait(reducedMotion.matches?110:520);
  await revealPlayer(current);
  locked=false;
}
function toggleSound(){soundOff=!soundOff;writeStorage(soundKey,soundOff);soundButton.innerHTML=soundOff?'SOUND<br>OFF':'SOUND<br>ON';soundButton.setAttribute('aria-pressed',String(!soundOff));if(soundOff)stopMotor();else playSample('lock');recordEvent('sound_toggle',{soundOn:!soundOff})}
function setLeverProgress(progress){const resisted=leverResistance(Math.max(0,Math.min(1,progress)));lever.style.transform=`translateY(${(resisted*21).toFixed(2)}%) rotate(${(resisted*10).toFixed(2)}deg)`;if(progress>=.72&&!leverTriggered){leverTriggered=true;runSpin('lever')}}
function releaseLever(){leverPointer=null;leverTriggered=false;lever.style.transition='transform .38s cubic-bezier(.2,.75,.3,1.25)';lever.style.transform='';setTimeout(()=>lever.style.removeProperty('transition'),420)}
lever.addEventListener('pointerdown',event=>{if(locked)return;leverPointer=event.pointerId;leverStartY=event.clientY;leverTriggered=false;lever.setPointerCapture(event.pointerId);setState('LEVER_PULL','Pull past the resistance point…')});
lever.addEventListener('pointermove',event=>{if(event.pointerId!==leverPointer)return;setLeverProgress((event.clientY-leverStartY)/Math.max(72,lever.getBoundingClientRect().height*.62))});
lever.addEventListener('pointerup',event=>{if(event.pointerId!==leverPointer)return;const triggered=leverTriggered;releaseLever();if(!triggered){recordEvent('lever_pull',{source:'lever_click'});runSpin('lever_click')}});
lever.addEventListener('pointercancel',releaseLever);
lever.addEventListener('click',event=>{if(event.detail===0)runSpin('lever')});
spinAgain.addEventListener('click',()=>runSpin('spin_again'));
soundButton.addEventListener('click',toggleSound);
bandcampLink.addEventListener('click',event=>{if(!current||!bandcampLink.href){event.preventDefault();return}recordEvent('bandcamp_clicked',{url:current.bandcampUrl});recordEvent('bandcamp_click',{source:'buy_explore',url:current.bandcampUrl})});
spotifyLink.addEventListener('click',event=>{if(!current||!spotifyLink.href){event.preventDefault();return}recordEvent('open_spotify_clicked',{url:current.spotifyOpenUrl})});
frame.addEventListener('focus',()=>{if(panelIsOpen){setState('PLAYING',`Spotify player active for ${current?.artistName||'the selected artist'}.`);recordEvent('spotify_player_interacted',{source:'embed_focus'})}});

async function boot(){
  soundButton.innerHTML=soundOff?'SOUND<br>OFF':'SOUND<br>ON';soundButton.setAttribute('aria-pressed',String(!soundOff));
  try{
    const response=await fetch(`${base}/spotify/artist-discovery.json`,{cache:'no-store'});
    if(!response.ok)throw new Error(`catalogue_http_${response.status}`);
    const payload=await response.json();records=(Array.isArray(payload.records)?payload.records:[]).filter(validRecord);
    if(!records.length)throw new Error('empty_valid_catalogue');
    deck=createShuffleBag(records);
    setState('IDLE',`Ready — ${records.length} artists in the discovery library.`);
    locked=false;
    recordEvent('spotify_machine_loaded',{artistCount:records.length});
  }catch(error){setState('ERROR','The discovery library could not be loaded.');console.error(error)}
}

window.AggitsSpotifyMachine={spin:()=>runSpin('api'),closePanel:()=>closePanel(),getState:()=>({state,current,artistCount:records.length,panelIsOpen})};
boot();
