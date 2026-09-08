import{TOURISM_STATES,chooseTourismDiscovery,fitDiscoveryName,pushTourismHistory,reelWindow,validateTourismConfig}from'./tourism-machine-core.js';

const machine=document.querySelector('[data-tourism-machine]');
const base=(document.querySelector('link[href*="tourism-machine.css"]')?.href||location.href).includes('/cosmic-aquarium/')?'/cosmic-aquarium':'';
const rows=document.querySelector('[data-reel-rows]'),ticker=document.querySelector('[data-ticker]'),announcement=document.querySelector('[data-machine-announcement]');
const title=document.querySelector('[data-machine-title]'),tagline=document.querySelector('[data-title-tagline]'),lever=document.querySelector('[data-action="lever"]'),soundButton=document.querySelector('[data-action="sound"]'),soundLabel=document.querySelector('[data-sound-label]');
const shareButton=document.querySelector('[data-action="share"]'),mapButton=document.querySelector('[data-action="map"]'),infoButton=document.querySelector('[data-action="info"]'),anotherButton=document.querySelector('[data-action="another"]');
const resultImage=document.querySelector('[data-result-image]'),resultName=document.querySelector('[data-result-name]'),resultCategory=document.querySelector('[data-result-category]'),resultSummary=document.querySelector('[data-result-summary]'),resultDistance=document.querySelector('[data-result-distance]'),resultHours=document.querySelector('[data-result-hours]');
const reducedMotion=matchMedia('(prefers-reduced-motion:reduce)'),soundKey='aggits:tourism:bendigo:sound-muted',historyKey='aggits:tourism:bendigo:recent';
let config=null,state='READY',selected=null,locked=false,factIndex=0,tickerTimer=0,pointerId=null,pointerStart=0,pointerTravel=0;
let muted=localStorage.getItem(soundKey)==='true',motor=null,leverSound=null,stopSound=null;

const wait=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
function setState(next,message=''){if(!TOURISM_STATES.includes(next))throw new Error(`Unknown tourism state: ${next}`);state=next;machine.dataset.machineState=next;if(message)announcement.textContent=message;window.dispatchEvent(new CustomEvent('aggits:tourism-state',{detail:{state:next,selectedId:selected?.id||null}}))}
function setTicker(text){clearTimeout(tickerTimer);ticker.style.opacity='0';setTimeout(()=>{ticker.textContent=String(text||'').toUpperCase();ticker.style.opacity='1'},120)}
function recentIds(){try{return JSON.parse(sessionStorage.getItem(historyKey)||'[]')}catch{return[]}}
function remember(id){sessionStorage.setItem(historyKey,JSON.stringify(pushTourismHistory(recentIds(),id)))}
function renderRows(centre){rows.replaceChildren(...reelWindow(config.discoveries,centre?.id||config.discoveries[0].id).map(item=>{const node=document.createElement('div');node.className='reel-row';node.dataset.discoveryId=item.id;node.dataset.fit=fitDiscoveryName(item.name);node.textContent=item.name;return node}))}
function renderResult(item){selected=item;resultImage.src=item.image;resultImage.alt=`View associated with ${item.name}`;resultName.textContent=item.name;resultCategory.textContent=`${item.category.replace('_',' ')}  •  EXPERIENCE`;resultSummary.textContent=item.shortDescription;resultDistance.textContent=`◆ ${Number(item.distanceKm).toFixed(1)} km from you`;resultHours.textContent=`◷ ${item.hours||'Check details'}`;for(const button of[shareButton,mapButton,infoButton])button.disabled=false;remember(item.id)}
function renderReady(){selected=null;setState('READY','Ready. Pull the lever for a new idea.');setTicker('PULL THE LEVER');renderRows(config.discoveries[0]);for(const button of[shareButton,mapButton,infoButton])button.disabled=true}
function showNextFact(){if(!config.tickerFacts.length)return;setTicker(config.tickerFacts[factIndex%config.tickerFacts.length]);factIndex+=1}
function ensureAudio(){if(!motor)motor=new Audio(`${base}/assets/audio/machine/reel-actual-slotmachine-freesound-261346.mp3`);if(!leverSound)leverSound=new Audio(`${base}/assets/audio/machine/reel-ratchet-mixkit-2641.mp3`);if(!stopSound)stopSound=new Audio(`${base}/assets/audio/machine/reel-stop-lock-mixkit-2857.mp3`);motor.loop=true;motor.volume=.28;leverSound.volume=.35;stopSound.volume=.45}
function play(audio){if(muted||!audio)return;audio.currentTime=0;audio.play().catch(()=>{})}
function startMotor(){ensureAudio();if(muted)return;motor.currentTime=0;motor.play().catch(()=>{})}
function stopMotor(){if(!motor)return;motor.pause();motor.currentTime=0}
function resetLever(){lever.classList.remove('is-pulled');lever.style.transform='';pointerTravel=0}
async function spin(source='lever'){
  if(locked||!config)return;locked=true;anotherButton.disabled=true;setState('LEVER_PULLED','The lever has been pulled.');lever.classList.add('is-pulled');ensureAudio();play(leverSound);await wait(reducedMotion.matches?20:230);resetLever();
  const winner=chooseTourismDiscovery(config.discoveries,recentIds());if(!winner){locked=false;anotherButton.disabled=false;return}
  setState('SPINNING','Finding a Bendigo discovery.');showNextFact();startMotor();let cycles=0;
  const cycle=setInterval(()=>{renderRows(config.discoveries[(factIndex+cycles)%config.discoveries.length]);cycles+=1;if(cycles%6===0)showNextFact()},reducedMotion.matches?60:160);
  await wait(reducedMotion.matches?180:1450);setState('DECELERATION',`The reel is slowing toward ${winner.name}.`);clearInterval(cycle);renderRows(winner);await wait(reducedMotion.matches?30:950);stopMotor();play(stopSound);renderResult(winner);setState('RESULT',`${winner.name} selected.`);locked=false;anotherButton.disabled=false;machine.dataset.lastSource=source;
}
function pullProgress(progress){const amount=Math.max(0,Math.min(1,progress));lever.style.transform=`translateY(${amount*6}%) rotate(${amount*8}deg)`;return amount}
function onPointerDown(event){if(locked)return;ensureAudio();pointerId=event.pointerId;pointerStart=event.clientY;pointerTravel=0;lever.setPointerCapture?.(pointerId)}
function onPointerMove(event){if(event.pointerId!==pointerId)return;pointerTravel=Math.max(0,event.clientY-pointerStart);pullProgress(pointerTravel/90);if(pointerTravel>=66)navigator.vibrate?.(8)}
function onPointerUp(event){if(event.pointerId!==pointerId)return;lever.releasePointerCapture?.(pointerId);pointerId=null;const trigger=pointerTravel>=24;resetLever();if(trigger)void spin('lever')}
function toggleSound(){muted=!muted;localStorage.setItem(soundKey,String(muted));soundLabel.textContent=muted?'SOUND OFF':'SOUND ON';soundButton.setAttribute('aria-pressed',String(!muted));soundButton.setAttribute('aria-label',muted?'Turn sound on':'Turn sound off');if(muted)stopMotor();else ensureAudio()}
async function share(){if(!selected)return;const data={title:selected.name,text:selected.shortDescription,url:selected.websiteUrl};try{if(navigator.share)await navigator.share(data);else{await navigator.clipboard.writeText(`${data.title} — ${data.url}`);setTicker('DISCOVERY LINK COPIED')}}catch(error){if(error?.name!=='AbortError')setTicker('SHARING IS NOT AVAILABLE HERE')}}
function openUrl(value){try{window.open(new URL(value).toString(),'_blank','noopener,noreferrer')}catch{setTicker('THIS LINK IS NOT AVAILABLE') }}

lever.addEventListener('pointerdown',onPointerDown);lever.addEventListener('pointermove',onPointerMove);lever.addEventListener('pointerup',onPointerUp);lever.addEventListener('pointercancel',onPointerUp);lever.addEventListener('click',event=>{if(event.detail===0||pointerTravel===0)void spin('lever-button')});lever.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();void spin('lever-keyboard')}});
soundButton.addEventListener('click',toggleSound);document.querySelector('[data-action="home"]').addEventListener('click',renderReady);shareButton.addEventListener('click',()=>void share());mapButton.addEventListener('click',()=>selected&&openUrl(selected.mapUrl));infoButton.addEventListener('click',()=>selected&&openUrl(selected.websiteUrl));anotherButton.addEventListener('click',()=>void spin('another-idea'));

fetch(`${base}/tourism-data/bendigo.json`).then(response=>{if(!response.ok)throw new Error('Tourism data unavailable.');return response.json()}).then(value=>{config=validateTourismConfig(value);title.textContent=config.destination.machineTitle;tagline.textContent=config.destination.tagline;soundLabel.textContent=muted?'SOUND OFF':'SOUND ON';soundButton.setAttribute('aria-pressed',String(!muted));renderReady()}).catch(error=>{anotherButton.disabled=true;lever.disabled=true;setTicker('TOURISM MACHINE RESTING — PLEASE REFRESH');announcement.textContent=error.message;console.error(error)});

window.aggitsTourismMachine=Object.freeze({spin:()=>spin('api'),getState:()=>({state,locked,selectedId:selected?.id||null,destination:config?.destination?.name||null,discoveryCount:config?.discoveries?.length||0})});
