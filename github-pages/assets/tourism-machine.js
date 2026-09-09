import{TOURISM_STATES,chooseTourismDiscovery,fitDiscoveryName,pushTourismHistory,validateTourismConfig}from'./tourism-machine-core.js';
import{MUSIC_MACHINE_REEL_PROFILE,leverResistance,mechanicalReelProgress}from'./machine-mechanics-core.js';

const machine=document.querySelector('[data-tourism-machine]');
const base=(document.querySelector('link[href*="tourism-machine.css"]')?.href||location.href).includes('/cosmic-aquarium/')?'/cosmic-aquarium':'';
const machineAudioBase=base?`${base}/assets/audio/machine`:'/audio/machine';
machine.style.setProperty('--tourism-lever-image',`url("${base?`${base}/assets/music-machine/aggits-lever.webp`:'/music-machine/aggits-lever.webp'}")`);
const rows=document.querySelector('[data-reel-rows]'),reel=document.querySelector('.tourism-reel'),ticker=document.querySelector('[data-ticker]'),announcement=document.querySelector('[data-machine-announcement]');
const title=document.querySelector('[data-machine-title]'),tagline=document.querySelector('[data-title-tagline]'),lever=document.querySelector('[data-action="lever"]'),soundButton=document.querySelector('[data-action="sound"]'),soundLabel=document.querySelector('[data-sound-label]');
const shareButton=document.querySelector('[data-action="share"]'),mapButton=document.querySelector('[data-action="map"]'),infoButton=document.querySelector('[data-action="info"]'),anotherButton=document.querySelector('[data-action="another"]');
const actionButtons=[shareButton,mapButton,infoButton,anotherButton];
const resultImage=document.querySelector('[data-result-image]'),resultName=document.querySelector('[data-result-name]'),resultCategory=document.querySelector('[data-result-category]'),resultSummary=document.querySelector('[data-result-summary]'),resultDistance=document.querySelector('[data-result-distance]'),resultHours=document.querySelector('[data-result-hours]');
const reducedMotion=matchMedia('(prefers-reduced-motion:reduce)'),soundKey='aggits:tourism:bendigo:sound-muted',historyKey='aggits:tourism:bendigo:recent';

let config=null,state='READY',selected=null,locked=false,factIndex=0,tickerTimer=0,pointerId=null,pointerStart=0,pointerTravel=0;
let currentPosition=0,lastRenderedBase=Number.NaN,spinFrame=0,factTimer=0,reelHeight=0;
let muted=localStorage.getItem(soundKey)==='true';
let motor=null,leverSound=null,lockSound=null,dingSound=null,buttonSound=null,motorFadeTimer=0,winnerAudioTimer=0,audioState='IDLE',audioRunId=0;

const wait=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const mod=(value,length)=>((value%length)+length)%length;

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

function ensureReelNodes(){
  if(rows.children.length===7)return;
  const fragment=document.createDocumentFragment();
  for(let index=0;index<7;index++){
    const node=document.createElement('div');node.className='reel-row';node.setAttribute('aria-hidden','true');fragment.append(node);
  }
  rows.replaceChildren(fragment);
}

function renderCylinder(position=currentPosition,force=false){
  if(!config)return;
  ensureReelNodes();
  const count=config.discoveries.length,baseIndex=Math.floor(position),fraction=position-baseIndex;
  if(!reelHeight)reelHeight=Math.max(1,reel.clientHeight);
  const radius=reelHeight*.49,stepDegrees=25.8;
  [...rows.children].forEach((node,nodeIndex)=>{
    const offset=nodeIndex-3,itemIndex=baseIndex+offset,item=config.discoveries[mod(itemIndex,count)];
    const angle=(offset-fraction)*stepDegrees,radians=angle*Math.PI/180,cosine=Math.max(0,Math.cos(radians));
    const y=Math.sin(radians)*radius,z=(cosine-1)*reelHeight*.29,visible=Math.abs(angle)<65,centre=Math.abs(angle)<stepDegrees*.48;
    if(force||baseIndex!==lastRenderedBase||node.dataset.discoveryId!==item.id){node.textContent=item.name;node.dataset.discoveryId=item.id;node.dataset.fit=fitDiscoveryName(item.name)}
    node.dataset.centre=String(centre);
    const scaleX=(0.92+cosine*.08).toFixed(3),scaleY=(0.63+cosine*.37).toFixed(3);
    node.style.transform=`translate3d(0,calc(${y.toFixed(2)}px - 50%),${z.toFixed(2)}px) rotateX(${(-angle*.72).toFixed(2)}deg) scaleX(${scaleX}) scaleY(${scaleY})`;
    node.style.opacity=visible?(0.13+Math.pow(cosine,2.35)*.87).toFixed(3):'0';
  });
  lastRenderedBase=baseIndex;
}

function positionForDiscovery(item){return config.discoveries.findIndex(candidate=>candidate.id===item.id)}

function renderResult(item){
  selected=item;resultImage.src=item.image;resultImage.alt=`View associated with ${item.name}`;resultImage.dataset.placeholder=String(item.image.includes('bendigo-tourism-cabinet-reference'));resultName.textContent=item.name;
  resultCategory.textContent=`${item.category.replace('_',' ')}  •  EXPERIENCE`;resultSummary.textContent=item.shortDescription;
  resultDistance.textContent=`◆ ${Number(item.distanceKm).toFixed(1)} km from you`;resultHours.textContent=`◷ ${item.hours||'Check details'}`;
  for(const button of[shareButton,mapButton,infoButton])button.disabled=false;remember(item.id);
}

function renderReady(){
  cancelAnimationFrame(spinFrame);clearInterval(factTimer);resetAudioSequence();selected=null;locked=false;currentPosition=0;lastRenderedBase=Number.NaN;reelHeight=Math.max(1,reel.clientHeight);
  setState('READY','Ready. Pull the lever for a new idea.');setTicker('PULL THE LEVER');renderCylinder(0,true);
  for(const button of[shareButton,mapButton,infoButton])button.disabled=true;anotherButton.disabled=false;
}

function showNextFact(){if(!config.tickerFacts.length)return;setTicker(config.tickerFacts[factIndex%config.tickerFacts.length]);factIndex+=1}

function audio(url,{volume=.4,loop=false}={}){const element=new Audio(`${machineAudioBase}/${url}`);element.preload='auto';element.volume=volume;element.loop=loop;return element}
function ensureAudio(){
  if(motor)return;
  motor=audio('reel-actual-slotmachine-freesound-261346.mp3',{volume:.1});leverSound=audio('reel-stop-gear-mixkit-2858.mp3',{volume:.4});
  lockSound=audio('reel-stop-gear-mixkit-2858.mp3',{volume:.5});dingSound=audio('winner-tonal-bloom-mixkit-3109.mp3',{volume:.32});buttonSound=audio('reel-stop-lock-mixkit-2857.mp3',{volume:.1});
}

function play(audioElement,{rate=1,volume}={}){
  if(muted||!audioElement)return null;
  const voice=audioElement.paused&&audioElement.currentTime===0?audioElement:audioElement.cloneNode();voice.playbackRate=rate;
  if(volume!==undefined)voice.volume=volume;voice.currentTime=0;voice.play().catch(()=>{});return voice;
}

function stopVoice(voice){if(!voice)return;voice.pause();voice.currentTime=0}
function resetAudioSequence(){audioRunId+=1;clearTimeout(winnerAudioTimer);clearInterval(motorFadeTimer);for(const voice of[motor,leverSound,lockSound,dingSound])stopVoice(voice);if(motor){motor.volume=.1;motor.playbackRate=.62}setAudioState('IDLE')}
function startMotor(){ensureAudio();if(muted)return;clearInterval(motorFadeTimer);setAudioState('SPINNING');motor.currentTime=.15;motor.volume=.08;motor.playbackRate=.62;motor.play().catch(()=>{})}
function updateMotor(speed){
  if(muted||!motor||motor.paused)return;
  const velocity=clamp(speed/22,0,1),targetRate=.58+velocity*.5,targetVolume=.055+velocity*.17;
  motor.playbackRate+=clamp(targetRate-motor.playbackRate,-.022,.022);motor.volume+=clamp(targetVolume-motor.volume,-.008,.008);
}
function stopMotor(immediate=false){
  if(!motor)return Promise.resolve();clearInterval(motorFadeTimer);
  const finish=()=>{motor.pause();motor.currentTime=0;motor.volume=.1;motor.playbackRate=.62};
  if(immediate||motor.paused){finish();return Promise.resolve()}
  const startingVolume=motor.volume;let fadeStep=0;
  return new Promise(resolve=>{motorFadeTimer=setInterval(()=>{fadeStep+=1;motor.volume=Math.max(.001,startingVolume*(1-fadeStep/6));if(fadeStep>=6){clearInterval(motorFadeTimer);finish();resolve()}},30)});
}
function playWinnerDing(runId){
  if(muted||runId!==audioRunId){setAudioState('IDLE');return}
  setAudioState('WINNER_DING');const voice=play(dingSound,{rate:.76,volume:.32});
  const finish=()=>{if(runId!==audioRunId)return;clearTimeout(winnerAudioTimer);stopVoice(voice);setAudioState('IDLE')};
  voice?.addEventListener('ended',finish,{once:true});winnerAudioTimer=setTimeout(finish,1250);
}

function resetLever(animated=true){lever.classList.toggle('is-returning',animated);lever.classList.remove('is-pulled');lever.style.removeProperty('--lever-angle');pointerTravel=0;setTimeout(()=>lever.classList.remove('is-returning'),420)}

function animateReel(winner){
  if(reducedMotion.matches){currentPosition=positionForDiscovery(winner);renderCylinder(currentPosition,true);return Promise.resolve()}
  const count=config.discoveries.length,start=currentPosition,startWhole=Math.ceil(start),startModulo=mod(startWhole,count),winnerIndex=positionForDiscovery(winner);
  const delta=mod(winnerIndex-startModulo,count),target=startWhole+count*4+delta,travel=target-start,duration=2850;
  let decelerationStarted=false,lastTime=performance.now(),lastPosition=start;
  return new Promise(resolve=>{
    const began=performance.now();
    const frame=now=>{
      const progress=clamp((now-began)/duration,0,1),distance=travel*mechanicalReelProgress(progress);
      currentPosition=start+distance;
      const elapsedFrame=Math.max(1,now-lastTime),speed=Math.abs(currentPosition-lastPosition)/(elapsedFrame/1000);updateMotor(speed);
      if(!decelerationStarted&&progress>=MUSIC_MACHINE_REEL_PROFILE.cruiseEnd){decelerationStarted=true;if(!muted&&motor&&!motor.paused)setAudioState('DECELERATING');setState('DECELERATION',`The reel is slowing toward ${winner.name}.`);setTicker(`NEXT IDEA — ${winner.name}`)}
      renderCylinder(currentPosition);lastTime=now;lastPosition=currentPosition;
      if(progress<1){spinFrame=requestAnimationFrame(frame);return}
      currentPosition=target;renderCylinder(target,true);resolve();
    };
    spinFrame=requestAnimationFrame(frame);
  });
}

async function spin(source='lever'){
  if(locked||!config)return;locked=true;anotherButton.disabled=true;const runId=++audioRunId;clearTimeout(winnerAudioTimer);stopVoice(dingSound);stopVoice(lockSound);
  setState('LEVER_PULLED','The lever has been pulled.');lever.classList.add('is-pulled');lever.style.setProperty('--lever-angle',`${MUSIC_MACHINE_REEL_PROFILE.leverAngle}deg`);
  ensureAudio();setAudioState('LEVER');play(leverSound,{rate:.78,volume:.44});await wait(reducedMotion.matches?20:250);resetLever();
  const winner=chooseTourismDiscovery(config.discoveries,recentIds());if(!winner){locked=false;anotherButton.disabled=false;return}
  setState('SPINNING','Finding a Bendigo discovery.');showNextFact();startMotor();factTimer=setInterval(showNextFact,1050);
  await animateReel(winner);clearInterval(factTimer);await stopMotor();
  if(runId===audioRunId&&!muted){setAudioState('LOCKED');play(lockSound,{rate:.74,volume:.5});await wait(reducedMotion.matches?15:125);playWinnerDing(runId)}else setAudioState('IDLE');
  renderResult(winner);setState('RESULT',`${winner.name} selected.`);
  locked=false;anotherButton.disabled=false;machine.dataset.lastSource=source;
}

function pullProgress(progress){const amount=clamp(progress,0,1),resisted=leverResistance(amount);lever.style.setProperty('--lever-angle',`${(resisted*MUSIC_MACHINE_REEL_PROFILE.leverAngle).toFixed(2)}deg`);lever.classList.toggle('is-pulled',amount>.02);return amount}
function onPointerDown(event){if(locked)return;ensureAudio();pointerId=event.pointerId;pointerStart=event.clientY;pointerTravel=0;lever.setPointerCapture?.(pointerId)}
function onPointerMove(event){if(event.pointerId!==pointerId)return;pointerTravel=Math.max(0,event.clientY-pointerStart);const progress=pullProgress(pointerTravel/115);if(progress>=MUSIC_MACHINE_REEL_PROFILE.leverTrigger)navigator.vibrate?.(8)}
function onPointerUp(event){if(event.pointerId!==pointerId)return;lever.releasePointerCapture?.(pointerId);pointerId=null;const trigger=pointerTravel/115>=MUSIC_MACHINE_REEL_PROFILE.leverTrigger;resetLever();if(trigger)void spin('lever')}

function toggleSound(){muted=!muted;localStorage.setItem(soundKey,String(muted));soundLabel.textContent=muted?'SOUND OFF':'SOUND ON';soundButton.setAttribute('aria-pressed',String(!muted));soundButton.setAttribute('aria-label',muted?'Turn sound on':'Turn sound off');if(muted)resetAudioSequence();else{ensureAudio();play(buttonSound,{rate:1.1,volume:.1})}}
async function share(){if(!selected)return;const data={title:selected.name,text:selected.shortDescription,url:selected.websiteUrl};try{if(navigator.share)await navigator.share(data);else{await navigator.clipboard.writeText(`${data.title} — ${data.url}`);setTicker('DISCOVERY LINK COPIED')}}catch(error){if(error?.name!=='AbortError')setTicker('SHARING IS NOT AVAILABLE HERE')}}
function openUrl(value){try{window.open(new URL(value).toString(),'_blank','noopener,noreferrer')}catch{setTicker('THIS LINK IS NOT AVAILABLE')}}

lever.addEventListener('pointerdown',onPointerDown);lever.addEventListener('pointermove',onPointerMove);lever.addEventListener('pointerup',onPointerUp);lever.addEventListener('pointercancel',onPointerUp);
lever.addEventListener('click',event=>{if(event.detail===0||pointerTravel===0)void spin('lever-button')});lever.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();void spin('lever-keyboard')}});
soundButton.addEventListener('click',toggleSound);document.querySelector('[data-action="home"]').addEventListener('click',renderReady);shareButton.addEventListener('click',()=>void share());mapButton.addEventListener('click',()=>selected&&openUrl(selected.mapUrl));infoButton.addEventListener('click',()=>selected&&openUrl(selected.websiteUrl));anotherButton.addEventListener('click',()=>void spin('another-idea'));
for(const button of actionButtons)button.addEventListener('pointerdown',()=>{ensureAudio();if(button!==anotherButton)play(buttonSound,{rate:1.12,volume:.08});navigator.vibrate?.(5)});
window.addEventListener('resize',()=>{reelHeight=Math.max(1,reel.clientHeight);renderCylinder(currentPosition,true)},{passive:true});

fetch(`${base}/tourism-data/bendigo.json`).then(response=>{if(!response.ok)throw new Error('Tourism data unavailable.');return response.json()}).then(value=>{config=validateTourismConfig(value);title.textContent=config.destination.machineTitle;tagline.textContent=config.destination.tagline;soundLabel.textContent=muted?'SOUND OFF':'SOUND ON';soundButton.setAttribute('aria-pressed',String(!muted));ensureAudio();renderReady()}).catch(error=>{anotherButton.disabled=true;lever.disabled=true;setTicker('TOURISM MACHINE RESTING — PLEASE REFRESH');announcement.textContent=error.message;console.error(error)});

window.aggitsTourismMachine=Object.freeze({spin:()=>spin('api'),getState:()=>({state,locked,audioState,selectedId:selected?.id||null,destination:config?.destination?.name||null,discoveryCount:config?.discoveries?.length||0})});
