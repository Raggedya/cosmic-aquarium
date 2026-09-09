import{TOURISM_STATES,chooseTourismDiscovery,fitDiscoveryName,pushTourismHistory,validateTourismConfig}from'./tourism-machine-core.js';
import{MUSIC_MACHINE_REEL_PROFILE,leverResistance}from'./machine-mechanics-core.js';
import{ARTIST_SINGLE_REEL_PROFILE,populateSingleReel,spinSingleReel}from'./single-reel-engine.js';

const machine=document.querySelector('[data-tourism-machine]');
const base=(document.querySelector('link[href*="tourism-machine.css"]')?.href||location.href).includes('/cosmic-aquarium/')?'/cosmic-aquarium':'';
const machineAudioBase=base?`${base}/assets/audio/machine`:'/audio/machine';
machine.style.setProperty('--tourism-lever-image',`url("${base?`${base}/assets/music-machine/aggits-lever.webp`:'/music-machine/aggits-lever.webp'}")`);
machine.style.setProperty('--artist-reel-skin',`url("${base?`${base}/assets/music-machine/aggits-reel-v2.webp`:'/music-machine/aggits-reel-v2.webp'}")`);
const rows=document.querySelector('[data-reel-rows]'),reel=document.querySelector('.tourism-reel'),ticker=document.querySelector('[data-ticker]'),announcement=document.querySelector('[data-machine-announcement]');
const title=document.querySelector('[data-machine-title]'),tagline=document.querySelector('[data-title-tagline]'),lever=document.querySelector('[data-action="lever"]'),soundButton=document.querySelector('[data-action="sound"]'),soundLabel=document.querySelector('[data-sound-label]');
const shareButton=document.querySelector('[data-action="share"]'),mapButton=document.querySelector('[data-action="map"]'),infoButton=document.querySelector('[data-action="info"]'),anotherButton=document.querySelector('[data-action="another"]');
const resultImage=document.querySelector('[data-result-image]'),resultName=document.querySelector('[data-result-name]'),resultCategory=document.querySelector('[data-result-category]'),resultSummary=document.querySelector('[data-result-summary]'),resultDistance=document.querySelector('[data-result-distance]'),resultHours=document.querySelector('[data-result-hours]');
const reducedMotion=matchMedia('(prefers-reduced-motion:reduce)'),soundKey='aggits:tourism:bendigo:sound-muted',historyKey='aggits:tourism:bendigo:recent';

let config=null,reelItems=[],reelItemById=new Map(),state='READY',selected=null,locked=false,factIndex=0,tickerTimer=0,pointerId=null,pointerStart=0,pointerTravel=0,leverProgress=0,leverTriggered=false,leverMoved=false;
let factTimer=0;
let muted=localStorage.getItem(soundKey)==='true';
let reelSpinAudio=null,reelRatchetAudio=null,reelStopAudio=null,winnerAudio=null,winnerAudioTimer=0,motorFadeTimer=0,audioState='IDLE';

const wait=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

function setState(next,message=''){
  if(!TOURISM_STATES.includes(next))throw new Error(`Unknown tourism state: ${next}`);
  state=next;machine.dataset.machineState=next;
  if(message)announcement.textContent=message;
  window.dispatchEvent(new CustomEvent('aggits:tourism-state',{detail:{state:next,selectedId:selected?.id||null}}));
}

function setAudioState(next){audioState=next;machine.dataset.audioState=next}

function setTicker(text){
  clearTimeout(tickerTimer);ticker.style.opacity='0';
  tickerTimer=setTimeout(()=>{ticker.textContent=String(text||'').toUpperCase();ticker.style.opacity='1'},120);
}

function recentIds(){try{return JSON.parse(sessionStorage.getItem(historyKey)||'[]')}catch{return[]}}
function remember(id){sessionStorage.setItem(historyKey,JSON.stringify(pushTourismHistory(recentIds(),id)))}

function tourismReelItem(discovery){return Object.freeze({id:discovery.id,label:discovery.name})}
function discoveryForReelItem(item){return config.discoveries.find(discovery=>discovery.id===item?.id)||null}
function reelLabel(item){return String(item?.label||'BENDIGO').trim()||'BENDIGO'}
function reelIdentity(item){return String(item?.id||'').toLowerCase()}
function randomReelItem(excluded=new Set()){
  const pool=reelItems.filter(item=>!excluded.has(reelIdentity(item))),source=pool.length?pool:reelItems;
  return source[Math.floor(Math.random()*source.length)]||reelItems[0]||null;
}

function ensureReelNodes(){
  if(rows.children.length===3&&rows.children[1].tagName==='STRONG')return;
  const before=document.createElement('span'),current=document.createElement('strong'),after=document.createElement('span');
  before.setAttribute('aria-hidden','true');after.setAttribute('aria-hidden','true');rows.replaceChildren(before,current,after);
}

function setReelLabel(node,label){
  const text=String(label||'BENDIGO').replace(/\s+/g,' ').trim();
  node.textContent=text;node.classList.toggle('is-long',text.length>13);node.classList.toggle('is-very-long',text.length>22);node.dataset.fit=fitDiscoveryName(text);
}

function setReelRows(item,neighbours=true){
  ensureReelNodes();populateSingleReel({reel,entry:item,pickRandom:randomReelItem,labelFor:reelLabel,identityFor:reelIdentity,setLabel:setReelLabel,neighbours});
}

function renderResult(item){
  selected=item;resultImage.src=item.image;resultImage.alt=`View associated with ${item.name}`;resultImage.dataset.placeholder=String(item.image.includes('bendigo-tourism-cabinet-reference'));resultName.textContent=item.name;
  resultCategory.textContent=`${item.category.replace('_',' ')}  •  EXPERIENCE`;resultSummary.textContent=item.shortDescription;
  resultDistance.textContent=`◆ ${Number(item.distanceKm).toFixed(1)} km from you`;resultHours.textContent=`◷ ${item.hours||'Check details'}`;
  for(const button of[shareButton,mapButton,infoButton])button.disabled=false;remember(item.id);
}

function stopAudio(audio){if(!audio)return;audio.pause();audio.currentTime=0}
function renderReady(){
  clearInterval(factTimer);clearTimeout(winnerAudioTimer);stopMotor(true);stopAudio(winnerAudio);stopAudio(reelStopAudio);stopAudio(reelRatchetAudio);selected=null;locked=false;leverProgress=0;leverTriggered=false;leverMoved=false;resetLever(false);
  setState('READY','Ready. Pull the lever for a new idea.');setTicker('PULL THE LEVER');if(reelItems.length)setReelRows(randomReelItem());
  for(const button of[shareButton,mapButton,infoButton])button.disabled=true;anotherButton.disabled=false;setAudioState('IDLE');
}

function showNextFact(){if(!config.tickerFacts.length)return;setTicker(config.tickerFacts[factIndex%config.tickerFacts.length]);factIndex+=1}

function machineAudio(name){const element=new Audio(`${machineAudioBase}/${name}`);element.preload='auto';return element}
function playSample(audio,{volume=.55,rate=1}={}){
  if(muted||!audio)return;
  try{audio.pause();audio.currentTime=0;audio.volume=volume;audio.playbackRate=rate;void audio.play().catch(()=>{})}catch{}
}
function ensureMachineSamples(){
  reelSpinAudio??=machineAudio('reel-actual-slotmachine-freesound-261346.mp3');
  reelRatchetAudio??=machineAudio('reel-ratchet-mixkit-2641.mp3');
  reelStopAudio??=machineAudio('reel-stop-lock-mixkit-2857.mp3');
  winnerAudio??=machineAudio('winner-tonal-bloom-mixkit-3109.mp3');
}
function leverClack(){ensureMachineSamples();playSample(reelStopAudio,{volume:.58,rate:.9});navigator.vibrate?.([14,28,8])}
function reelThunk(){ensureMachineSamples();playSample(reelStopAudio,{volume:.72,rate:1.04});if(reelSpinAudio&&!reelSpinAudio.paused)reelSpinAudio.volume=Math.max(.08,.34-.085);navigator.vibrate?.(12)}
function startMotor(){
  if(muted)return;stopMotor(true);ensureMachineSamples();setAudioState('SPINNING');playSample(reelRatchetAudio,{volume:.66,rate:.96});
  reelSpinAudio.loop=false;reelSpinAudio.currentTime=.15;reelSpinAudio.volume=.42;reelSpinAudio.playbackRate=1;void reelSpinAudio.play().catch(()=>{});
}
function stopMotor(immediate=false){
  clearInterval(motorFadeTimer);motorFadeTimer=0;
  if(reelSpinAudio&&!reelSpinAudio.paused){
    if(immediate){reelSpinAudio.pause();reelSpinAudio.currentTime=0;reelSpinAudio.volume=.34}
    else{let step=0,startVolume=reelSpinAudio.volume;motorFadeTimer=setInterval(()=>{step+=1;reelSpinAudio.volume=Math.max(.001,startVolume*(1-step/6));if(step>=6){clearInterval(motorFadeTimer);motorFadeTimer=0;reelSpinAudio.pause();reelSpinAudio.currentTime=0;reelSpinAudio.volume=.34}},30)}
  }
}
function celebrationSound(){
  ensureMachineSamples();clearTimeout(winnerAudioTimer);setAudioState('WINNER_DING');playSample(winnerAudio,{volume:.58,rate:1});
  winnerAudioTimer=setTimeout(()=>{stopAudio(winnerAudio);setAudioState('IDLE')},1450);navigator.vibrate?.([22,45,18,45,25]);
}

function animateReel(winner){
  let decelerationStarted=false;
  return spinSingleReel({
    reel,finalEntry:winner,stopAfter:reducedMotion.matches?ARTIST_SINGLE_REEL_PROFILE.reducedMotionDuration:ARTIST_SINGLE_REEL_PROFILE.duration,pickRandom:randomReelItem,renderRows:setReelRows,onStop:reelThunk,
    onProgress:progress=>{if(!decelerationStarted&&progress>=MUSIC_MACHINE_REEL_PROFILE.cruiseEnd){decelerationStarted=true;setAudioState('DECELERATING');setState('DECELERATION',`The reel is slowing toward ${reelLabel(winner)}.`)}}
  });
}

async function spin(source='lever'){
  if(locked||!config)return;locked=true;anotherButton.disabled=true;clearTimeout(tickerTimer);clearTimeout(winnerAudioTimer);stopAudio(winnerAudio);
  setState('LEVER_PULLED','The lever has been pulled.');showNextFact();setAudioState('LEVER');leverClack();
  const winner=chooseTourismDiscovery(config.discoveries,recentIds()),winnerReelItem=reelItemById.get(winner?.id);if(!winner||!winnerReelItem){locked=false;anotherButton.disabled=false;return}
  setState('SPINNING','Finding a Bendigo discovery.');startMotor();factTimer=setInterval(showNextFact,1050);
  await animateReel(winnerReelItem);clearInterval(factTimer);stopMotor();setAudioState('LOCKED');await wait(reducedMotion.matches?100:380);
  const landed=discoveryForReelItem(winnerReelItem);if(!landed)throw new Error('tourism_reel_winner_mapping_failed');
  renderResult(landed);celebrationSound();setState('RESULT',`${landed.name} selected.`);locked=false;anotherButton.disabled=false;machine.dataset.lastSource=source;
}

function resetLever(animated=true){leverProgress=0;lever.classList.toggle('is-returning',animated);lever.classList.remove('is-pulled');lever.style.removeProperty('--lever-angle');pointerTravel=0;setTimeout(()=>lever.classList.remove('is-returning'),500)}
function pullVisual(progress){leverProgress=clamp(progress,0,1);const resisted=leverResistance(leverProgress);lever.style.setProperty('--lever-angle',`${(resisted*MUSIC_MACHINE_REEL_PROFILE.leverAngle).toFixed(2)}deg`);lever.classList.toggle('is-pulled',leverProgress>.02)}
function animateLeverAndSpin(){if(locked)return;ensureMachineSamples();lever.classList.add('is-pulled','is-returning');pullVisual(1);setTimeout(()=>{void spin('lever');resetLever(true)},250)}
function onPointerDown(event){if(locked)return;ensureMachineSamples();pointerId=event.pointerId;pointerStart=event.clientY;pointerTravel=0;leverMoved=false;leverTriggered=false;lever.setPointerCapture?.(pointerId);lever.classList.remove('is-returning')}
function onPointerMove(event){if(event.pointerId!==pointerId)return;const travel=Math.max(0,event.clientY-pointerStart);pointerTravel=travel;leverMoved=leverMoved||travel>7;pullVisual(travel/115);if(leverProgress>=MUSIC_MACHINE_REEL_PROFILE.leverTrigger&&!leverTriggered){leverTriggered=true;navigator.vibrate?.(8)}}
function onPointerUp(event){if(event.pointerId!==pointerId)return;lever.releasePointerCapture?.(pointerId);pointerId=null;if(leverTriggered){void spin('lever');resetLever(true)}else if(!leverMoved)animateLeverAndSpin();else resetLever(true)}

function toggleSound(){muted=!muted;localStorage.setItem(soundKey,String(muted));soundLabel.textContent=muted?'SOUND OFF':'SOUND ON';soundButton.setAttribute('aria-pressed',String(!muted));soundButton.setAttribute('aria-label',muted?'Turn sound on':'Turn sound off');if(muted){stopMotor(true);stopAudio(winnerAudio);stopAudio(reelStopAudio);stopAudio(reelRatchetAudio);clearTimeout(winnerAudioTimer);setAudioState('IDLE')}else ensureMachineSamples()}
async function share(){if(!selected)return;const data={title:selected.name,text:selected.shortDescription,url:selected.websiteUrl};try{if(navigator.share)await navigator.share(data);else{await navigator.clipboard.writeText(`${data.title} — ${data.url}`);setTicker('DISCOVERY LINK COPIED')}}catch(error){if(error?.name!=='AbortError')setTicker('SHARING IS NOT AVAILABLE HERE')}}
function openUrl(value){try{window.open(new URL(value).toString(),'_blank','noopener,noreferrer')}catch{setTicker('THIS LINK IS NOT AVAILABLE')}}

lever.addEventListener('pointerdown',onPointerDown);lever.addEventListener('pointermove',onPointerMove);lever.addEventListener('pointerup',onPointerUp);lever.addEventListener('pointercancel',onPointerUp);
lever.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();animateLeverAndSpin()}});
soundButton.addEventListener('click',toggleSound);document.querySelector('[data-action="home"]').addEventListener('click',renderReady);shareButton.addEventListener('click',()=>void share());mapButton.addEventListener('click',()=>selected&&openUrl(selected.mapUrl));infoButton.addEventListener('click',()=>selected&&openUrl(selected.websiteUrl));anotherButton.addEventListener('click',()=>void spin('another-idea'));

fetch(`${base}/tourism-data/bendigo.json`).then(response=>{if(!response.ok)throw new Error('Tourism data unavailable.');return response.json()}).then(value=>{config=validateTourismConfig(value);reelItems=config.discoveries.map(tourismReelItem);reelItemById=new Map(reelItems.map(item=>[item.id,item]));title.textContent=config.destination.machineTitle;tagline.textContent=config.destination.tagline;soundLabel.textContent=muted?'SOUND OFF':'SOUND ON';soundButton.setAttribute('aria-pressed',String(!muted));ensureMachineSamples();renderReady()}).catch(error=>{anotherButton.disabled=true;lever.disabled=true;setTicker('TOURISM MACHINE RESTING — PLEASE REFRESH');announcement.textContent=error.message;console.error(error)});

window.aggitsTourismMachine=Object.freeze({spin:()=>spin('api'),getState:()=>({state,locked,audioState,selectedId:selected?.id||null,destination:config?.destination?.name||null,discoveryCount:config?.discoveries?.length||0,reelEngine:'artist-single-reel'})});
