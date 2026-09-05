import {
  CRACK_VARIANTS, GO_HOLD_MS, DESTRUCTION_MS, SESSION_HISTORY_LIMIT,
  nextSelection, normalizeSelection, chooseRelease, pushHistory, buildShareUrl,
  buildTickerMessages, validBandcampUrl, pickPlayableTrack, artistIdentity,
} from './discovery-machine-core.js';

const machine = document.querySelector('.discovery-machine');
const base = machine?.dataset.base || '';
const selectionScreen = document.querySelector('[data-screen="selection"]');
const playerScreen = document.querySelector('[data-screen="player"]');
const categoryButtons = [...document.querySelectorAll('[data-category]')];
const goButton = document.querySelector('.go-key');
const machineStatus = document.querySelector('.machine-status');
const playerStatus = document.querySelector('.player-status');
const shareButton = document.querySelector('[data-action="share"]');
const buyLink = document.querySelector('[data-action="buy"]');
const nextButton = document.querySelector('[data-action="next"]');
const changeButton = document.querySelector('.change-categories');
const soundToggles = [...document.querySelectorAll('.sound-toggle')];
const tickerTrack = document.querySelector('.ticker-track');
const tickerStream = document.querySelector('.ticker-stream');
const tickerCopies = [...document.querySelectorAll('.ticker-copy')];
const tickerAccessible = document.querySelector('.ticker-accessible');
const bandcampFrame = document.querySelector('.bandcamp-transport iframe');
const liquidCanvas = document.querySelector('.liquid-surface');
const liquidContext = liquidCanvas?.getContext('2d');
const bubbleTubeCanvas = document.querySelector('.bubble-tube');
const bubbleTubeContext = bubbleTubeCanvas?.getContext('2d');
const canvas = document.querySelector('.destruction-canvas');
const context = canvas?.getContext('2d');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const workerBase = 'https://cosmic-aquaria.andrewharris501.workers.dev';
const historyKey = 'cosmic-aquaria:discovery-history';
const artistHistoryKey = 'cosmic-aquaria:discovery-artist-history';
const selectionKey = 'cosmic-aquaria:category-selection';
const sessionKey = 'cosmic-aquaria:analytics-session';

let catalogue = [];
let artistsById = new Map();
let universeStats = {};
let selected = new Set();
let currentEntry = null;
let currentManifest = null;
let currentTrack = null;
let isLocked = false;
let lastImpactAt = 0;
let audioContext = null;
let bubbleTubeFrame = 0;
let bubbleTubeStartedAt = 0;
let liquidFrame = 0;
let liquidStartedAt = 0;
let liquidLastFrameAt = 0;
let liquidPlaybackActive = false;
let liquidEnergy = 0;
let liquidSeed = 5381;
let liquidProfile = null;
let liquidDroplets = [];
let liquidDropBucket = -1;
let liquidReducedLastDraw = 0;
let bandcampFrameFocused = false;
let tickerQueue = [];
let tickerLayoutFrame = 0;

const BUBBLE_TUBE_PARTICLES = Object.freeze([
  {y:.5,r:.31,duration:34.5,phase:.08,wobble:.022,depth:1.14,duty:.31,major:true},
  {y:.31,r:.105,duration:12.7,phase:.03,wobble:.052,depth:.92},
  {y:.66,r:.047,duration:8.9,phase:.14,wobble:.09,depth:.61},
  {y:.43,r:.071,duration:15.8,phase:.22,wobble:.045,depth:.78},
  {y:.72,r:.026,duration:10.6,phase:.33,wobble:.11,depth:.48},
  {y:.25,r:.039,duration:17.2,phase:.41,wobble:.058,depth:.55},
  {y:.55,r:.087,duration:13.9,phase:.51,wobble:.041,depth:.86},
  {y:.35,r:.021,duration:7.8,phase:.59,wobble:.13,depth:.42},
  {y:.68,r:.057,duration:11.4,phase:.68,wobble:.073,depth:.69},
  {y:.22,r:.031,duration:16.4,phase:.76,wobble:.068,depth:.51},
  {y:.49,r:.116,duration:14.8,phase:.86,wobble:.035,depth:1},
  {y:.73,r:.018,duration:9.7,phase:.94,wobble:.12,depth:.38},
]);

function fitBubbleTube() {
  if (!bubbleTubeCanvas || !bubbleTubeContext) return null;
  const rect=bubbleTubeCanvas.getBoundingClientRect();
  const ratio=Math.min(devicePixelRatio||1,2);
  const width=Math.max(1,Math.round(rect.width*ratio));
  const height=Math.max(1,Math.round(rect.height*ratio));
  if(bubbleTubeCanvas.width!==width||bubbleTubeCanvas.height!==height){
    bubbleTubeCanvas.width=width;bubbleTubeCanvas.height=height;
  }
  bubbleTubeContext.setTransform(ratio,0,0,ratio,0,0);
  return rect;
}

function drawBubbleTube(now=performance.now(),staticFrame=false) {
  const rect=fitBubbleTube();
  if(!rect||!bubbleTubeContext)return;
  const {width,height}=rect;
  bubbleTubeContext.clearRect(0,0,width,height);
  for(const bubble of BUBBLE_TUBE_PARTICLES){
    const cycle=staticFrame ? bubble.phase : (((now-bubbleTubeStartedAt)/1000/bubble.duration)+bubble.phase)%1;
    if(bubble.duty&&cycle>bubble.duty)continue;
    const travel=bubble.duty?cycle/bubble.duty:cycle;
    const radius=Math.max(1.6,height*bubble.r);
    const x=-radius+travel*(width+radius*2);
    const y=height*(bubble.y+Math.sin(travel*Math.PI*2+bubble.phase*8.3)*bubble.wobble);
    const alpha=.34+bubble.depth*.52;
    const body=bubbleTubeContext.createRadialGradient(x-radius*.34,y-radius*.42,radius*.04,x,y,radius);
    body.addColorStop(0,`rgba(244,255,246,${alpha})`);
    body.addColorStop(.12,`rgba(157,255,176,${alpha*.48})`);
    body.addColorStop(.55,`rgba(0,126,41,${alpha*.24})`);
    body.addColorStop(.78,`rgba(0,12,4,${alpha*.72})`);
    body.addColorStop(1,`rgba(177,255,188,${alpha*.6})`);
    bubbleTubeContext.fillStyle=body;
    bubbleTubeContext.beginPath();bubbleTubeContext.arc(x,y,radius,0,Math.PI*2);bubbleTubeContext.fill();
    bubbleTubeContext.lineWidth=Math.max(.55,radius*.075);
    bubbleTubeContext.strokeStyle=`rgba(218,255,225,${alpha*.72})`;
    bubbleTubeContext.stroke();
    bubbleTubeContext.fillStyle=`rgba(255,255,255,${alpha*.86})`;
    bubbleTubeContext.beginPath();bubbleTubeContext.ellipse(x-radius*.32,y-radius*.38,radius*.16,radius*.1,-.55,0,Math.PI*2);bubbleTubeContext.fill();
    if(bubble.major){
      bubbleTubeContext.save();
      bubbleTubeContext.beginPath();bubbleTubeContext.arc(x,y,radius*.92,0,Math.PI*2);bubbleTubeContext.clip();
      const highlightX=width*.53;
      const highlight=bubbleTubeContext.createLinearGradient(highlightX-radius*.52,0,highlightX+radius*.52,0);
      highlight.addColorStop(0,'rgba(232,255,237,0)');
      highlight.addColorStop(.36,'rgba(232,255,237,.16)');
      highlight.addColorStop(.5,'rgba(255,255,255,.86)');
      highlight.addColorStop(.64,'rgba(160,255,177,.2)');
      highlight.addColorStop(1,'rgba(232,255,237,0)');
      bubbleTubeContext.globalCompositeOperation='screen';
      bubbleTubeContext.fillStyle=highlight;
      bubbleTubeContext.fillRect(highlightX-radius*.56,y-radius, radius*1.12,radius*2);
      bubbleTubeContext.restore();
      bubbleTubeContext.strokeStyle='rgba(239,255,242,.62)';
      bubbleTubeContext.lineWidth=Math.max(.8,radius*.09);
      bubbleTubeContext.beginPath();bubbleTubeContext.arc(x,y,radius*.82,-2.72,-.68);bubbleTubeContext.stroke();
    }
  }
}

function stopBubbleTube(){if(bubbleTubeFrame)cancelAnimationFrame(bubbleTubeFrame);bubbleTubeFrame=0;}

function startBubbleTube(){
  stopBubbleTube();
  if(!bubbleTubeCanvas||!bubbleTubeContext||!playerScreen.classList.contains('is-active'))return;
  bubbleTubeStartedAt=performance.now();
  if(reducedMotion.matches){drawBubbleTube(bubbleTubeStartedAt,true);return;}
  const frame=now=>{
    if(document.hidden||!playerScreen.classList.contains('is-active')){bubbleTubeFrame=0;return;}
    drawBubbleTube(now,false);bubbleTubeFrame=requestAnimationFrame(frame);
  };
  bubbleTubeFrame=requestAnimationFrame(frame);
}

const GLASS_AUDIO_FILES = Object.freeze({
  plate:'glass-plate-crunching',
  debris:'glass-debris-014',
  settle:'picture-frame-shards',
  shards:'glass-shards-moved-07',
});
const DIRECT_IMPACT_FILES=Object.freeze({impact:'glass-impact-mobile.mp3',go:'glass-impact-go-mobile.mp3'});

const GLASS_AUDIO_SEGMENTS = Object.freeze({
  pressure:[
    {source:'plate',offset:2.38,duration:.105,filter:'lowpass',frequency:1850,gain:.72},
    {source:'plate',offset:5.00,duration:.095,filter:'lowpass',frequency:1650,gain:.78},
    {source:'plate',offset:8.20,duration:.11,filter:'lowpass',frequency:2050,gain:.68},
  ],
  crack:[
    {source:'shards',offset:.105,duration:.13,filter:'highpass',frequency:720,gain:.64},
    {source:'plate',offset:2.71,duration:.145,filter:'highpass',frequency:640,gain:.72},
    {source:'debris',offset:.38,duration:.14,filter:'highpass',frequency:780,gain:.82},
    {source:'shards',offset:.51,duration:.14,filter:'highpass',frequency:850,gain:.58},
  ],
  crunch:[
    {source:'plate',offset:2.39,duration:.39,filter:'bandpass',frequency:1750,q:.45,gain:.76},
    {source:'shards',offset:.12,duration:.34,filter:'bandpass',frequency:2100,q:.38,gain:.62},
    {source:'debris',offset:.56,duration:.37,filter:'bandpass',frequency:1900,q:.42,gain:.88},
    {source:'plate',offset:5.02,duration:.42,filter:'bandpass',frequency:1550,q:.4,gain:.72},
  ],
  settle:[
    {source:'settle',offset:.38,duration:.46,filter:'highpass',frequency:1450,gain:1.32},
    {source:'debris',offset:2.22,duration:.48,filter:'highpass',frequency:1350,gain:.72},
    {source:'settle',offset:.91,duration:.5,filter:'highpass',frequency:1650,gain:1.4},
    {source:'shards',offset:.52,duration:.4,filter:'highpass',frequency:1500,gain:.42},
  ],
});

const GLASS_AUDIO_PROFILES = Object.freeze({
  heavy:{master:.91,pressure:1.18,crack:1.02,crunch:1.22,settle:.7,rate:.965,crunchDelay:.082,settleDelay:.34,haptic:[16,34,8]},
  dreamy:{master:.78,pressure:.72,crack:.82,crunch:.72,settle:1.12,rate:1.028,crunchDelay:.1,settleDelay:.3,haptic:[10,42,5]},
  quiet:{master:.66,pressure:.62,crack:.68,crunch:.58,settle:.76,rate:1.012,crunchDelay:.094,settleDelay:.28,haptic:9},
  electronic:{master:.78,pressure:.74,crack:.96,crunch:.72,settle:.75,rate:1.035,crunchDelay:.078,settleDelay:.27,haptic:[11,30,5]},
  dark:{master:.86,pressure:1.15,crack:.94,crunch:1.08,settle:.65,rate:.95,crunchDelay:.086,settleDelay:.35,haptic:[17,36,7]},
  loud:{master:.96,pressure:1.04,crack:1.2,crunch:1.27,settle:.82,rate:.982,crunchDelay:.072,settleDelay:.32,haptic:[19,31,9]},
  strange:{master:.8,pressure:.86,crack:.9,crunch:.92,settle:1.05,rate:.995,crunchDelay:.116,settleDelay:.39,haptic:[12,48,7]},
  anything:{master:.82,pressure:.9,crack:.94,crunch:.94,settle:.88,rate:1,crunchDelay:.09,settleDelay:.32,haptic:[13,36,6]},
  go:{master:.98,pressure:1.18,crack:1.16,crunch:1.3,settle:.92,rate:.972,crunchDelay:.078,settleDelay:.36,haptic:[20,38,10]},
});

const glassAudio = {
  buffers:new Map(),
  encoded:new Map(),
  activeNodes:new Set(),
  preloadPromise:null,
  decodePromise:null,
  activationPromise:null,
  pendingImpact:null,
  output:null,
  limiter:null,
  directPools:new Map(),
  format:null,
  formatBySource:{},
  sequence:0,
  activated:false,
  failed:false,
  directFallback:false,
  lastType:null,
  lastTriggeredAt:null,
  lastSourceStartedAt:null,
  lastError:null,
  muted:readPersistentMute(),
};

function readPersistentMute() {
  try { return localStorage.getItem('cosmic-aquaria:muted') === 'true'; }
  catch { return false; }
}

function writePersistentMute(value) {
  try { localStorage.setItem('cosmic-aquaria:muted',String(Boolean(value))); } catch {}
}

function readJson(key, fallback) {
  try { return JSON.parse(sessionStorage.getItem(key) || '') ?? fallback; } catch { return fallback; }
}

function sessionId() {
  let value = sessionStorage.getItem(sessionKey);
  if (!value) {
    value = crypto.randomUUID?.() || `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    sessionStorage.setItem(sessionKey, value);
  }
  return value;
}

function recordEvent(eventType, aquariumId = currentEntry?.slug || 'discovery-machine', details = {}) {
  const body = JSON.stringify({eventType, aquariumId, sessionId:sessionId(), trackId:currentTrack?.id || null, metadata:details});
  try {
    fetch(`${workerBase}/api/events`,{method:'POST',headers:{'content-type':'application/json'},body,keepalive:true,credentials:'omit'}).catch(()=>{});
  } catch {}
}

function crackMarkup(category) {
  const paths = CRACK_VARIANTS[category] || CRACK_VARIANTS.go;
  const branches = paths.map((path,index) => `<path d="${path}" opacity="${index < 6 ? '.92' : '.64'}"/>`).join('');
  return `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${branches}</svg>`;
}

function seedCracks() {
  for (const button of categoryButtons) {
    const category = button.dataset.category;
    const layer = button.querySelector('.crack-layer');
    layer.innerHTML = crackMarkup(category);
    const first = CRACK_VARIANTS[category][0].match(/^M(\d+) (\d+)/);
    if (first) {
      layer.style.setProperty('--impact-x',`${first[1]}%`);
      layer.style.setProperty('--impact-y',`${first[2]}%`);
    }
  }
  goButton.querySelector('.crack-layer').innerHTML = crackMarkup('go');
}

function ensureAudioContext(resume = true) {
  const AudioContextConstructor=window.AudioContext||window.webkitAudioContext;
  if(!AudioContextConstructor) throw new Error('web_audio_unavailable');
  if (!audioContext) audioContext = new AudioContextConstructor({latencyHint:'interactive'});
  if (resume && audioContext.state === 'suspended') void audioContext.resume();
  return audioContext;
}

function glassAudioUrl(name,format) {
  return `${base}/assets/audio/glass/source/${GLASS_AUDIO_FILES[name]}.${format}`;
}

function useDirectAudioFallback() {
  const ua=navigator.userAgent;
  const ios=/iPad|iPhone|iPod/i.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const desktopSafari=/AppleWebKit/i.test(ua)&&!/Chrome|Chromium|CriOS|Edg|Android/i.test(ua);
  return ios||desktopSafari;
}

function updateAudioDebug() {
  const state={
    contextState:audioContext?.state||'unavailable',
    format:glassAudio.directFallback?'mp3-direct':glassAudio.format,
    encodedBuffers:glassAudio.encoded.size,
    decodedBuffers:glassAudio.buffers.size,
    muted:glassAudioMuted(),
    failed:glassAudio.failed,
    lastType:glassAudio.lastType,
    lastTriggeredAt:glassAudio.lastTriggeredAt,
    lastSourceStartedAt:glassAudio.lastSourceStartedAt,
    masterGain:glassAudio.output?.gain?.value??.72,
    directFallback:glassAudio.directFallback,
    lastError:glassAudio.lastError,
  };
  document.documentElement.dataset.glassAudioState=state.contextState;
  document.documentElement.dataset.glassAudioFormat=String(state.format||'pending');
  document.documentElement.dataset.glassAudioBuffers=String(state.decodedBuffers);
  document.documentElement.dataset.glassAudioLast=String(state.lastType||'none');
  document.documentElement.dataset.glassAudioStarted=String(Boolean(state.lastSourceStartedAt));
  return state;
}

function prepareDirectImpactAudio() {
  glassAudio.directFallback=useDirectAudioFallback();
  if(!glassAudio.directFallback)return;
  for(const kind of ['impact','go']){
    const source=`${base}/assets/audio/glass/${DIRECT_IMPACT_FILES[kind]}`;
    const pool=Array.from({length:3},()=>{
      const audio=new Audio(source);
      audio.preload='auto';audio.playsInline=true;audio.setAttribute('aria-hidden','true');audio.className='glass-impact-audio';
      audio.addEventListener('playing',()=>{glassAudio.lastSourceStartedAt=new Date().toISOString();updateAudioDebug();},{passive:true});
      audio.addEventListener('error',()=>{glassAudio.lastError=`direct_${kind}_failed`;updateAudioDebug();},{passive:true});
      document.body.append(audio);
      return audio;
    });
    glassAudio.directPools.set(kind,pool);
  }
  updateAudioDebug();
}

function playDirectImpact(type,profile,{restoring=false,control=false}={}) {
  const kind=type==='go'?'go':'impact';
  const pool=glassAudio.directPools.get(kind);
  if(!pool?.length)return false;
  const audio=pool[glassAudio.sequence%pool.length];
  try{audio.pause();audio.currentTime=restoring ? .31 : 0;}catch{}
  audio.volume=Math.min(1,(control ? .48 : restoring ? .42 : .86)*profile.master);
  audio.playbackRate=Math.max(.92,Math.min(1.08,profile.rate+((glassAudio.sequence%5)-2)*.011));
  glassAudio.lastType=type;glassAudio.lastTriggeredAt=new Date().toISOString();glassAudio.failed=false;
  const started=audio.play();
  if(started?.then)started.then(()=>{glassAudio.activated=true;glassAudio.lastSourceStartedAt=new Date().toISOString();updateAudioDebug();}).catch(error=>{glassAudio.lastError=String(error?.name||error);updateAudioDebug();});
  updateAudioDebug();
  return true;
}

function preloadGlassAudio() {
  if (glassAudio.preloadPromise) return glassAudio.preloadPromise;
  const probe = document.createElement('audio');
  const safari=useDirectAudioFallback();
  const supported={mp3:Boolean(probe.canPlayType('audio/mpeg')),ogg:Boolean(probe.canPlayType('audio/ogg; codecs="vorbis"'))};
  const formats=(safari?['mp3','ogg']:['ogg','mp3']).filter(format=>supported[format]);
  if(!formats.length) formats.push('mp3');
  glassAudio.preloadPromise = Promise.allSettled(Object.keys(GLASS_AUDIO_FILES).map(async name=>{
    let lastError=null;
    for(const format of formats){
      try{
        const response=await fetch(glassAudioUrl(name,format),{cache:'force-cache',credentials:'same-origin'});
        if(!response.ok)throw new Error(`glass_audio_${response.status}`);
        glassAudio.encoded.set(name,await response.arrayBuffer());
        glassAudio.format=glassAudio.format||format;
        glassAudio.formatBySource[name]=format;
        return;
      }catch(error){lastError=error;}
    }
    throw lastError||new Error('glass_audio_unavailable');
  })).then(results=>{
    glassAudio.failed=glassAudio.encoded.size===0;
    if(glassAudio.failed)glassAudio.lastError=results.filter(result=>result.status==='rejected').map(result=>String(result.reason)).join('; ').slice(0,240);
    updateAudioDebug();
  });
  return glassAudio.preloadPromise;
}

function decodeGlassAudio(audio) {
  if(glassAudio.buffers.size===Object.keys(GLASS_AUDIO_FILES).length)return Promise.resolve();
  if(glassAudio.decodePromise)return glassAudio.decodePromise;
  glassAudio.decodePromise=preloadGlassAudio().then(async()=>{
    const decoded=await Promise.allSettled([...glassAudio.encoded].map(async([name,encoded])=>{
      if(!glassAudio.buffers.has(name))glassAudio.buffers.set(name,await audio.decodeAudioData(encoded.slice(0)));
    }));
    glassAudio.failed=glassAudio.buffers.size===0;
    if(glassAudio.failed)glassAudio.lastError=decoded.filter(result=>result.status==='rejected').map(result=>String(result.reason)).join('; ').slice(0,240);
    updateAudioDebug();
  }).catch(error=>{glassAudio.failed=true;glassAudio.lastError=String(error);updateAudioDebug();});
  return glassAudio.decodePromise;
}

function pulseSilentUnlock(audio) {
  const buffer=audio.createBuffer(1,1,22050);
  const source=audio.createBufferSource();
  const gain=audio.createGain();
  gain.gain.value=0;
  source.buffer=buffer;
  source.connect(gain).connect(audio.destination);
  source.start(0);
  source.onended=()=>{source.disconnect();gain.disconnect();};
}

function activateGlassAudio() {
  if(glassAudio.activationPromise)return glassAudio.activationPromise;
  glassAudio.activationPromise=(async()=>{
    try{
      const audio=ensureAudioContext(false);
      pulseSilentUnlock(audio);
      if(audio.state==='suspended')await audio.resume();
      await decodeGlassAudio(audio);
      glassAudio.activated=audio.state==='running'&&glassAudio.buffers.size>0;
      glassAudio.failed=!glassAudio.activated&&!glassAudio.directFallback;
      const pending=glassAudio.pendingImpact;
      glassAudio.pendingImpact=null;
      if(pending&&glassAudio.activated&&!glassAudioMuted())playGlassBreak(pending.type,pending.options);
    }catch(error){glassAudio.failed=!glassAudio.directFallback;glassAudio.activated=false;glassAudio.lastError=String(error);}
    finally{glassAudio.activationPromise=null;updateSoundControls();updateAudioDebug();}
    return glassAudio.activated;
  })();
  return glassAudio.activationPromise;
}

function glassAudioMuted() {
  return glassAudio.muted;
}

function updateSoundControls() {
  const muted=glassAudioMuted();
  for(const button of soundToggles){
    button.textContent=muted?'SOUND OFF':'SOUND ON';
    button.setAttribute('aria-pressed',String(!muted));
    button.setAttribute('aria-label',muted?'Glass sounds off. Press to turn them on.':'Glass sounds on. Press to turn them off.');
  }
}

function setGlassAudioMuted(value) {
  glassAudio.muted=Boolean(value);
  writePersistentMute(glassAudio.muted);
  glassAudio.pendingImpact=null;
  if(glassAudio.muted)for(const pool of glassAudio.directPools.values())for(const audio of pool){audio.pause();try{audio.currentTime=0;}catch{}}
  updateSoundControls();
  updateAudioDebug();
}

function onSoundToggle() {
  const nextMuted=!glassAudioMuted();
  setGlassAudioMuted(nextMuted);
  recordEvent('glass_sound_toggle','discovery-machine',{enabled:!nextMuted});
  if(!nextMuted){playGlassBreak('anything',{control:true});void activateGlassAudio();}
}

function glassAudioOutput(audio) {
  if(glassAudio.output) return glassAudio.output;
  const output=audio.createGain();
  const presence=audio.createBiquadFilter();
  const limiter=audio.createDynamicsCompressor();
  output.gain.value=.72;
  presence.type='peaking';presence.frequency.value=2400;presence.Q.value=.72;presence.gain.value=3.2;
  limiter.threshold.value=-7;
  limiter.knee.value=5;
  limiter.ratio.value=2.4;
  limiter.attack.value=.0025;
  limiter.release.value=.095;
  output.connect(presence).connect(limiter).connect(audio.destination);
  glassAudio.output=output;
  glassAudio.limiter=limiter;
  return output;
}

function chooseGlassSegment(layer,type) {
  const candidates=GLASS_AUDIO_SEGMENTS[layer];
  const typeOffset=Object.keys(GLASS_AUDIO_PROFILES).indexOf(type);
  const index=Math.abs(glassAudio.sequence+typeOffset+(layer.length*3))%candidates.length;
  return candidates[index];
}

function scheduleGlassSegment(audio,recipe,when,profile,layer,variation=0) {
  const buffer=glassAudio.buffers.get(recipe.source);
  if(!buffer) return;
  const source=audio.createBufferSource();
  const filter=audio.createBiquadFilter();
  const gain=audio.createGain();
  const panner=audio.createStereoPanner?.();
  const jitter=(Math.random()-.5)*.025;
  const pitch=(Math.random()-.5)*.055;
  source.buffer=buffer;
  source.playbackRate.value=Math.max(.9,Math.min(1.1,profile.rate+pitch));
  filter.type=recipe.filter;
  filter.frequency.value=recipe.frequency;
  if(recipe.q) filter.Q.value=recipe.q;
  const layerGain=profile[layer] ?? 1;
  gain.gain.value=recipe.gain*layerGain*profile.master;
  source.connect(filter).connect(gain);
  const output=glassAudioOutput(audio);
  if(panner){panner.pan.value=Math.max(-.08,Math.min(.08,variation));gain.connect(panner).connect(output);}else gain.connect(output);
  const start=Math.max(audio.currentTime+.002,when+jitter);
  source.start(start,Math.max(0,recipe.offset+jitter),recipe.duration);
  glassAudio.lastSourceStartedAt=new Date().toISOString();
  glassAudio.activeNodes.add(source);
  source.onended=()=>{glassAudio.activeNodes.delete(source);source.disconnect();filter.disconnect();gain.disconnect();panner?.disconnect();};
}

function playGlassBreak(type='anything',{restoring=false,control=false}={}) {
  const now = performance.now();
  if (now - lastImpactAt < 48 || glassAudioMuted()) return false;
  const profile=GLASS_AUDIO_PROFILES[type] || GLASS_AUDIO_PROFILES.anything;
  let scheduled=false;
  glassAudio.sequence=(glassAudio.sequence+1)%2048;
  if(glassAudio.directFallback){
    lastImpactAt=now;
    scheduled=playDirectImpact(type,profile,{restoring,control});
    try { navigator.vibrate?.(restoring?5:(control?8:profile.haptic)); } catch {}
    return scheduled;
  }
  try {
    const audio=ensureAudioContext(false);
    if(!glassAudio.activated||audio.state!=='running'||!glassAudio.buffers.size){
      glassAudio.pendingImpact={type,options:{restoring,control}};
      void activateGlassAudio();
      return false;
    }
    lastImpactAt = now;
    if(glassAudio.activated && glassAudio.buffers.size){
      const start = audio.currentTime;
      if(restoring){
        scheduleGlassSegment(audio,chooseGlassSegment('settle',type),start,profile,'settle',-.025);
      }else if(control){
        scheduleGlassSegment(audio,chooseGlassSegment('pressure',type),start,profile,'pressure',0);
        scheduleGlassSegment(audio,chooseGlassSegment('settle',type),start+.06,profile,'settle',.025);
      }else{
        scheduleGlassSegment(audio,chooseGlassSegment('pressure',type),start,profile,'pressure',-.025);
        scheduleGlassSegment(audio,chooseGlassSegment('crack',type),start+.045,profile,'crack',.018);
        scheduleGlassSegment(audio,chooseGlassSegment('crunch',type),start+profile.crunchDelay,profile,'crunch',-.015);
        scheduleGlassSegment(audio,chooseGlassSegment('crack',`${type}-micro`),start+.135,profile,'crack',.045);
        scheduleGlassSegment(audio,chooseGlassSegment('settle',type),start+profile.settleDelay,profile,'settle',.035);
        if(type==='go') scheduleGlassSegment(audio,GLASS_AUDIO_SEGMENTS.crunch[2],start+.17,profile,'crunch',-.045);
      }
      scheduled=true;
      glassAudio.lastType=type;glassAudio.lastTriggeredAt=new Date().toISOString();glassAudio.failed=false;updateAudioDebug();
    }
  } catch(error) { glassAudio.failed=true;glassAudio.lastError=String(error);updateAudioDebug();return false; }
  try { navigator.vibrate?.(restoring?5:(control?8:profile.haptic)); } catch {}
  return scheduled;
}

function playGlassDisintegration() {
  if(glassAudioMuted()) return;
  try{
    const audio=ensureAudioContext(true);
    if(!glassAudio.activated||!glassAudio.buffers.size)return;
    const profile={...GLASS_AUDIO_PROFILES.anything,master:.42,crunch:.6,settle:.82,rate:1.018};
    const start=audio.currentTime;
    scheduleGlassSegment(audio,GLASS_AUDIO_SEGMENTS.crunch[1],start,profile,'crunch',-.07);
    scheduleGlassSegment(audio,GLASS_AUDIO_SEGMENTS.settle[1],start+.12,profile,'settle',.07);
    scheduleGlassSegment(audio,GLASS_AUDIO_SEGMENTS.settle[2],start+.3,profile,'settle',-.04);
  }catch{}
}

function updateSelection(next, announce = true) {
  selected = new Set(normalizeSelection(next));
  sessionStorage.setItem(selectionKey,JSON.stringify([...selected]));
  for (const button of categoryButtons) {
    const active = selected.has(button.dataset.category);
    button.classList.toggle('is-selected',active);
    button.setAttribute('aria-pressed',String(active));
  }
  const ready = selected.size > 0 && catalogue.length > 0 && !isLocked;
  goButton.disabled = !ready;
  goButton.setAttribute('aria-disabled',String(!ready));
  if (announce) machineStatus.textContent = selected.size ? `${[...selected].map(value=>value.toUpperCase()).join(', ')} selected.` : 'Choose one or more categories.';
}

function onCategory(event) {
  if (isLocked) return;
  const category = event.currentTarget.dataset.category;
  const wasSelected = selected.has(category);
  updateSelection(nextSelection(selected,category));
  playGlassBreak(category,{restoring:wasSelected});
  if (category === 'anything' && !wasSelected) recordEvent('drift_anywhere_selected','discovery-machine',{selection:['anything']});
  else recordEvent('water_selected','discovery-machine',{water:category,action:wasSelected?'deselected':'selected',selection:[...selected]});
}

function validManifestUrl(slug) {
  return `${base}/artists/${encodeURIComponent(slug)}.json`;
}

async function fetchManifest(entry) {
  const response = await fetch(validManifestUrl(entry.slug),{cache:'no-store'});
  if (!response.ok) throw new Error(`manifest_${response.status}`);
  const manifest = await response.json();
  if (!validBandcampUrl(manifest.bandcampUrl)) throw new Error('invalid_bandcamp_release_url');
  if (!pickPlayableTrack(manifest)) throw new Error('no_playable_track');
  return manifest;
}

async function resolveDiscovery(preferred = null) {
  const history = readJson(historyKey,[]);
  const artistHistory = readJson(artistHistoryKey,[]);
  const attempted = new Set();
  const attemptedArtists = new Set();
  if (preferred) { attempted.add(preferred.slug); attemptedArtists.add(artistIdentity(preferred)); }
  for (let attempt=0;attempt<8;attempt++) {
    const entry = attempt===0 && preferred ? preferred : chooseRelease(catalogue,[...selected],[...history,...attempted],globalThis.crypto,[...artistHistory,...attemptedArtists]);
    if (!entry) break;
    attempted.add(entry.slug);
    attemptedArtists.add(artistIdentity(entry));
    try { return {entry,manifest:await fetchManifest(entry)}; }
    catch (error) { recordEvent('track_selected',entry.slug,{result:'skipped',reason:String(error?.message||error)}); }
  }
  throw new Error('No playable release is currently available for this selection.');
}

function formatDuration(value) {
  const match = String(value || '').match(/^(\d{1,3}):(\d{2})$/);
  return match ? `${Number(match[1])}:${match[2]}` : '—:—';
}

function liquidRandom(offset=0){
  let value=(liquidSeed+Math.imul(offset+1,0x9e3779b1))>>>0;
  value^=value>>>16;value=Math.imul(value,0x21f0aaad);value^=value>>>15;value=Math.imul(value,0x735a2d97);value^=value>>>15;
  return (value>>>0)/4294967296;
}

function setLiquidSeed(seed, waters=[]) {
  liquidSeed=[...String(seed)].reduce((value,char)=>(Math.imul(value,33)+char.charCodeAt(0))>>>0,5381);
  const category=String(waters.find(value=>value!=='anything')||'anything').toLowerCase();
  const characters={
    heavy:{amplitude:1.06,width:1.2,pace:.8,droplets:.82,darkness:1.08},
    dreamy:{amplitude:.9,width:1.24,pace:.72,droplets:1.28,darkness:.9},
    quiet:{amplitude:.62,width:1.18,pace:.58,droplets:.42,darkness:.93},
    electronic:{amplitude:.92,width:.82,pace:1.12,droplets:1,darkness:.92},
    dark:{amplitude:.9,width:1.08,pace:.68,droplets:.76,darkness:1.22},
    loud:{amplitude:1.14,width:.92,pace:1.08,droplets:1.3,darkness:.96},
    strange:{amplitude:1.02,width:.86,pace:.9,droplets:1.15,darkness:1.03},
    anything:{amplitude:.94,width:1,pace:.86,droplets:1,darkness:1},
  };
  const character=characters[category]||characters.anything;
  const anchorZones=[.04,.205,.405,.605,.785,.955];
  const anchors=anchorZones.map((zone,index)=>({
    x:Math.max(.025,Math.min(.975,zone+(liquidRandom(index*7+1)-.5)*(category==='strange'?.18:.11))),
    width:(.052+liquidRandom(index*7+2)*.088)*character.width,
    height:(.22+liquidRandom(index*7+3)*.46)*character.amplitude,
    phase:liquidRandom(index*7+4)*Math.PI*2,
    speed:(.3+liquidRandom(index*7+5)*.5)*character.pace,
    sharpness:.68+liquidRandom(index*7+6)*1.42,
    lean:(liquidRandom(index*9+115)-.5)*.055,
  })).sort((a,b)=>a.x-b.x);
  const hero=1+Math.floor(liquidRandom(87)*(anchors.length-2));
  anchors[hero].height=(.78+liquidRandom(89)*.12)*character.amplitude;
  anchors[hero].width=(.024+liquidRandom(91)*.026)*character.width;
  anchors[hero].sharpness=2.8;
  liquidProfile={
    anchors,
    category,
    character,
    hero,
    phaseA:liquidRandom(101)*Math.PI*2,
    phaseB:liquidRandom(102)*Math.PI*2,
    viscosity:(.68+liquidRandom(103)*.28)*character.pace,
    dropInterval:(.52+liquidRandom(104)*.5)/character.droplets,
  };
  liquidDroplets=[];liquidDropBucket=-1;
}

function fitLiquidSurface(){
  if(!liquidCanvas||!liquidContext)return null;
  const rect=liquidCanvas.getBoundingClientRect();
  const ratio=Math.min(devicePixelRatio||1,2);
  const width=Math.max(1,Math.round(rect.width*ratio));
  const height=Math.max(1,Math.round(rect.height*ratio));
  if(liquidCanvas.width!==width||liquidCanvas.height!==height){liquidCanvas.width=width;liquidCanvas.height=height;}
  liquidContext.setTransform(ratio,0,0,ratio,0,0);
  return rect;
}

function liquidSurfaceY(unitX,elapsed,width,height,layer=0){
  const profile=liquidProfile||{anchors:[],phaseA:0,phaseB:1,viscosity:1};
  const reduced=reducedMotion.matches;
  const energy=reduced?.075:liquidEnergy;
  const time=reduced?elapsed*.16:elapsed;
  const calm=.0065+energy*.013;
  const roll=(Math.sin(unitX*Math.PI*3.1-time*.44*profile.viscosity+profile.phaseA)*.56+
    Math.sin(unitX*Math.PI*6.7+time*.31+profile.phaseB)*.29+
    Math.sin(unitX*Math.PI*13.9-time*.19+profile.phaseA*.7)*.15)*height*calm;
  let lift=0;
  for(const peak of profile.anchors){
    const wander=Math.sin(time*.17+peak.phase)*.012;
    const centre=peak.x+wander+peak.lean*Math.sin(time*.11+peak.phase*.7);
    const distance=unitX-centre;
    const width=peak.width*(distance<0?.82:1.16);
    const pulse=.72+.13*Math.sin(time*peak.speed+peak.phase)+.19*Math.pow(Math.max(0,Math.sin(time*(peak.speed*1.47)+peak.phase*1.3)),5);
    const gaussian=Math.exp(-Math.pow(Math.abs(distance)/width,1.72)*peak.sharpness);
    lift+=gaussian*height*peak.height*pulse*energy*1.24*(1-layer*.16);
  }
  const baseline=height*(.9+layer*.029);
  return Math.max(height*(reduced?.69:.055),baseline+roll-lift);
}

function traceLiquidSurface(ctx,elapsed,width,height,layer=0){
  const points=180;
  ctx.beginPath();
  ctx.moveTo(0,liquidSurfaceY(0,elapsed,width,height,layer));
  for(let index=1;index<=points;index++){
    const x=index/points;
    ctx.lineTo(x*width,liquidSurfaceY(x,elapsed,width,height,layer));
  }
}

function updateLiquidDroplets(elapsed,delta,height,reduced){
  if(!reduced&&liquidPlaybackActive&&liquidEnergy>.58&&liquidProfile){
    const bucket=Math.floor(elapsed/liquidProfile.dropInterval);
    if(bucket!==liquidDropBucket){
      liquidDropBucket=bucket;
      const impulse=.38+.62*Math.pow(Math.max(0,Math.sin(bucket*2.173+liquidProfile.phaseB)),3);
      if(impulse>.31&&liquidDroplets.length<8){
        const count=impulse>.72?2:1;
        for(let index=0;index<count;index++){
          const anchor=liquidProfile.anchors[(bucket*3+index*2+Math.floor(liquidRandom(bucket+151)*7))%liquidProfile.anchors.length];
          const x=Math.max(.04,Math.min(.96,anchor.x+(liquidRandom(bucket*11+index+177)-.5)*.035));
          const surface=liquidSurfaceY(x,elapsed,1,height,0)/height;
          liquidDroplets.push({x,y:surface+.006,r:.009+liquidRandom(bucket*13+index+193)*.017,vy:-.13-liquidRandom(bucket*17+index+211)*.12,life:0,phase:liquidRandom(bucket+223)*6.28});
        }
      }
    }
  }
  for(const drop of liquidDroplets){drop.life+=delta;drop.y+=drop.vy*delta;drop.vy+=.31*delta;drop.x+=Math.sin(drop.life*2.6+drop.phase)*delta*.003;}
  liquidDroplets=liquidDroplets.filter(drop=>drop.life<2.7&&(drop.life<.44||drop.y<liquidSurfaceY(drop.x,elapsed,1,height,0)/height));
}

function drawLiquidDroplets(ctx,width,height,droplets=liquidDroplets){
  for(const drop of droplets){
    const x=drop.x*width,y=drop.y*height,r=Math.max(1.2,drop.r*height);
    ctx.save();ctx.shadowColor='rgba(47,255,81,.78)';ctx.shadowBlur=r*1.15;
    const glass=ctx.createRadialGradient(x-r*.3,y-r*.42,r*.03,x+r*.12,y+r*.18,r*1.08);
    glass.addColorStop(0,'rgba(255,255,255,1)');glass.addColorStop(.1,'rgba(224,255,229,.82)');glass.addColorStop(.33,'rgba(57,255,92,.28)');glass.addColorStop(.68,'rgba(0,52,17,.52)');glass.addColorStop(.86,'rgba(137,255,153,.48)');glass.addColorStop(1,'rgba(0,18,6,.1)');
    ctx.fillStyle=glass;ctx.beginPath();ctx.ellipse(x,y,r*.82,r,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='rgba(237,255,240,.91)';ctx.lineWidth=Math.max(.55,r*.105);ctx.stroke();
    ctx.strokeStyle='rgba(0,18,6,.78)';ctx.lineWidth=Math.max(.45,r*.065);ctx.beginPath();ctx.arc(x,y,r*.69,.18,Math.PI*.94);ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,.98)';ctx.beginPath();ctx.ellipse(x-r*.25,y-r*.31,Math.max(.55,r*.16),Math.max(.4,r*.09),-.55,0,Math.PI*2);ctx.fill();ctx.restore();
  }
}

function drawSuspendedDroplets(ctx,elapsed,width,height){
  if(!liquidProfile||reducedMotion.matches)return;
  const visibility=Math.max(0,Math.min(1,(liquidEnergy-.24)/.5));
  if(!visibility)return;
  const beads=[];
  for(let index=0;index<8;index++){
    const anchor=liquidProfile.anchors[(index*2+liquidProfile.hero)%liquidProfile.anchors.length];
    const x=Math.max(.035,Math.min(.965,anchor.x+(liquidRandom(401+index)-.5)*.12+Math.sin(elapsed*.22+anchor.phase)*.006));
    const surface=liquidSurfaceY(x,elapsed,1,height,0)/height;
    const clearance=.07+liquidRandom(421+index)*.22;
    const y=Math.max(.08,surface-clearance+Math.sin(elapsed*(.24+index*.025)+anchor.phase)*.012);
    beads.push({x,y,r:.011+liquidRandom(441+index)*.012,life:0,phase:anchor.phase});
  }
  ctx.save();ctx.globalAlpha=visibility*.82;drawLiquidDroplets(ctx,width,height,beads);ctx.restore();
}

function liquidPeakGeometry(peak,index,elapsed,width,height){
  const time=reducedMotion.matches?elapsed*.16:elapsed;
  const energy=reducedMotion.matches?.075:liquidEnergy;
  const centre=peak.x+Math.sin(time*.17+peak.phase)*.012+peak.lean*Math.sin(time*.11+peak.phase*.7);
  const pulse=.72+.13*Math.sin(time*peak.speed+peak.phase)+.19*Math.pow(Math.max(0,Math.sin(time*(peak.speed*1.47)+peak.phase*1.3)),5);
  const base=height*.9;
  return {x:centre*width,y:Math.max(height*.055,base-height*peak.height*pulse*energy*1.24),width:peak.width*width,base,pulse,index};
}

function drawLiquidPeakBodies(ctx,elapsed,width,height){
  for(let index=0;index<(liquidProfile?.anchors||[]).length;index++){
    const peak=liquidProfile.anchors[index];
    const shape=liquidPeakGeometry(peak,index,elapsed,width,height);
    const left=shape.x-shape.width*(1.5+(index%3)*.15);
    const right=shape.x+shape.width*(1.75+((index+1)%3)*.18);
    const tipX=shape.x+peak.lean*width*.34;
    const gradient=ctx.createLinearGradient(left,shape.y,right,shape.base);
    gradient.addColorStop(0,'rgba(0,24,8,.2)');gradient.addColorStop(.2,'rgba(33,240,78,.74)');gradient.addColorStop(.4,'rgba(229,255,233,.9)');gradient.addColorStop(.52,'rgba(0,28,8,.68)');gradient.addColorStop(.72,'rgba(47,247,88,.71)');gradient.addColorStop(1,'rgba(0,8,3,.15)');
    ctx.fillStyle=gradient;ctx.beginPath();ctx.moveTo(left,shape.base);
    ctx.bezierCurveTo(left+shape.width*.72,shape.base-height*.045,tipX-shape.width*.34,shape.y+height*.08,tipX,shape.y);
    ctx.bezierCurveTo(tipX+shape.width*.25,shape.y+height*.095,right-shape.width*.78,shape.base-height*.055,right,shape.base);
    ctx.quadraticCurveTo(shape.x,shape.base+height*.025,left,shape.base);ctx.closePath();ctx.fill();
  }
}

function drawLiquidFolds(ctx,elapsed,width,height){
  const anchors=liquidProfile?.anchors||[];
  for(let index=0;index<anchors.length;index++){
    const peak=anchors[index];
    const shape=liquidPeakGeometry(peak,index,elapsed,width,height);
    const direction=index%2?-1:1;
    for(let band=0;band<3;band++){
      const spread=shape.width*(.58+band*.42);
      const fold=ctx.createLinearGradient(shape.x,shape.y,shape.x+direction*spread,shape.base);
      fold.addColorStop(0,band===0?'rgba(255,255,255,1)':'rgba(220,255,225,.84)');fold.addColorStop(.14,'rgba(101,255,126,.79)');fold.addColorStop(.43,'rgba(0,27,8,.79)');fold.addColorStop(.68,'rgba(61,255,95,.48)');fold.addColorStop(1,'rgba(0,80,24,0)');
      ctx.strokeStyle=fold;ctx.lineWidth=Math.max(.75,height*(.014-band*.0026));ctx.shadowColor='rgba(68,255,99,.78)';ctx.shadowBlur=height*.031;
      ctx.beginPath();ctx.moveTo(shape.x+(band-1)*height*.008,shape.y+height*(.006+band*.012));
      ctx.bezierCurveTo(shape.x+direction*spread*.12,shape.y+height*(.09+band*.03),shape.x+direction*spread*.66,shape.base-height*(.11-band*.018),shape.x+direction*spread,shape.base-height*.008);ctx.stroke();
    }
    ctx.shadowBlur=0;
    const darkFold=ctx.createLinearGradient(shape.x,shape.y,shape.x-direction*shape.width,shape.base);
    darkFold.addColorStop(0,'rgba(0,10,3,.82)');darkFold.addColorStop(.5,'rgba(0,44,14,.52)');darkFold.addColorStop(1,'rgba(0,8,2,0)');
    ctx.strokeStyle=darkFold;ctx.lineWidth=Math.max(.7,height*.011);ctx.beginPath();ctx.moveTo(shape.x-height*.009*direction,shape.y+height*.035);ctx.bezierCurveTo(shape.x-direction*shape.width*.18,shape.y+height*.18,shape.x-direction*shape.width*.72,shape.base-height*.07,shape.x-direction*shape.width*1.25,shape.base);ctx.stroke();

    const hotspot=ctx.createRadialGradient(shape.x-height*.012,shape.y+height*.035,0,shape.x,shape.y+height*.08,height*(.07+peak.width*.3));
    hotspot.addColorStop(0,'rgba(255,255,255,.72)');hotspot.addColorStop(.13,'rgba(170,255,182,.43)');hotspot.addColorStop(.5,'rgba(25,255,63,.15)');hotspot.addColorStop(1,'rgba(0,102,29,0)');
    ctx.fillStyle=hotspot;ctx.beginPath();ctx.ellipse(shape.x,shape.y+height*.095,height*(.052+peak.width*.18),height*.2,0,0,Math.PI*2);ctx.fill();
    if(liquidEnergy>.5){ctx.fillStyle='rgba(248,255,249,.94)';ctx.shadowColor='#6aff80';ctx.shadowBlur=height*.035;ctx.beginPath();ctx.ellipse(shape.x-height*.004,shape.y+height*.006,height*.009,height*.015,0,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;}
  }
}

function drawLiquidReflection(ctx,elapsed,width,height){
  const floor=height*.905;
  ctx.save();ctx.beginPath();ctx.rect(0,floor,width,height-floor);ctx.clip();ctx.globalCompositeOperation='screen';
  for(let echo=0;echo<4;echo++){
    ctx.beginPath();
    for(let index=0;index<=140;index++){
      const unit=index/140;
      const source=liquidSurfaceY(unit,elapsed-echo*.035,width,height,0);
      const y=floor+(floor-source)*(.055+echo*.023)+Math.sin(unit*31+elapsed*.45+echo)*height*.004;
      if(index===0)ctx.moveTo(0,y);else ctx.lineTo(unit*width,y);
    }
    ctx.strokeStyle=`rgba(${echo?72:225},255,${echo?101:230},${.46-echo*.085})`;ctx.lineWidth=Math.max(.55,height*(.006-echo*.0008));ctx.shadowColor='rgba(53,255,85,.7)';ctx.shadowBlur=height*.028;ctx.stroke();
  }
  ctx.restore();
}

function renderLiquidSurface(now=performance.now(),staticFrame=false){
  const rect=fitLiquidSurface();
  if(!rect||!liquidContext)return;
  const width=rect.width,height=rect.height;
  const delta=liquidLastFrameAt?Math.min(.05,(now-liquidLastFrameAt)/1000):.016;
  liquidLastFrameAt=now;
  const reduced=reducedMotion.matches||staticFrame;
  const target=reduced?.075:(liquidPlaybackActive?1:.055);
  const response=liquidPlaybackActive?1.65:.68;
  liquidEnergy+=(target-liquidEnergy)*(1-Math.exp(-delta*response));
  const elapsed=(now-liquidStartedAt)/1000;
  const ctx=liquidContext;
  ctx.clearRect(0,0,width,height);

  ctx.save();
  ctx.globalCompositeOperation='source-over';
  const chamberGlow=ctx.createLinearGradient(0,height*.05,0,height);
  chamberGlow.addColorStop(0,'rgba(0,40,13,0)');chamberGlow.addColorStop(.42,'rgba(0,96,29,.07)');chamberGlow.addColorStop(.8,'rgba(0,44,14,.38)');chamberGlow.addColorStop(1,'rgba(0,7,2,.84)');
  ctx.fillStyle=chamberGlow;ctx.fillRect(0,0,width,height);
  for(let layer=2;layer>=0;layer--){
    traceLiquidSurface(ctx,elapsed-layer*.19,width,height,layer);
    ctx.lineTo(width,height);ctx.lineTo(0,height);ctx.closePath();
    const body=ctx.createLinearGradient(0,height*.12,0,height);
    if(layer===2){body.addColorStop(0,'rgba(7,109,37,.13)');body.addColorStop(.34,'rgba(0,96,29,.34)');body.addColorStop(1,'rgba(0,7,2,.82)');}
    else if(layer===1){body.addColorStop(0,'rgba(128,255,146,.24)');body.addColorStop(.16,'rgba(7,214,59,.58)');body.addColorStop(.58,'rgba(0,55,18,.84)');body.addColorStop(1,'rgba(0,5,2,.96)');}
    else {body.addColorStop(0,'rgba(248,255,249,.75)');body.addColorStop(.035,'rgba(135,255,152,.88)');body.addColorStop(.13,'rgba(12,226,65,.86)');body.addColorStop(.45,'rgba(0,79,25,.92)');body.addColorStop(.82,'rgba(0,19,6,.98)');body.addColorStop(1,'rgba(0,3,1,.99)');}
    ctx.fillStyle=body;ctx.fill();
  }

  drawLiquidPeakBodies(ctx,elapsed,width,height);
  ctx.save();ctx.globalCompositeOperation='screen';drawLiquidFolds(ctx,elapsed,width,height);ctx.restore();

  traceLiquidSurface(ctx,elapsed,width,height,0);
  ctx.lineWidth=Math.max(1.3,height*.031);ctx.strokeStyle='rgba(22,255,61,.38)';ctx.shadowColor='rgba(39,255,73,.95)';ctx.shadowBlur=height*.1;ctx.stroke();
  traceLiquidSurface(ctx,elapsed,width,height,0);
  const surfaceSpecular=ctx.createLinearGradient(0,0,width,0);
  surfaceSpecular.addColorStop(0,'rgba(245,255,247,.96)');surfaceSpecular.addColorStop(.08,'rgba(120,255,139,.62)');surfaceSpecular.addColorStop(.2,'rgba(250,255,251,.92)');surfaceSpecular.addColorStop(.36,'rgba(70,255,101,.58)');surfaceSpecular.addColorStop(.51,'rgba(255,255,255,.98)');surfaceSpecular.addColorStop(.65,'rgba(80,255,107,.55)');surfaceSpecular.addColorStop(.79,'rgba(247,255,249,.94)');surfaceSpecular.addColorStop(.92,'rgba(90,255,116,.62)');surfaceSpecular.addColorStop(1,'rgba(244,255,246,.95)');
  ctx.lineWidth=Math.max(.9,height*.008);ctx.strokeStyle=surfaceSpecular;ctx.shadowColor='rgba(102,255,124,.98)';ctx.shadowBlur=height*.029;ctx.stroke();
  traceLiquidSurface(ctx,elapsed-.018,width,height,0);
  ctx.lineWidth=Math.max(.5,height*.0025);ctx.strokeStyle='rgba(255,255,255,.78)';ctx.shadowBlur=0;ctx.stroke();

  drawLiquidReflection(ctx,elapsed,width,height);
  const floorY=height*.91;
  const horizon=ctx.createLinearGradient(0,0,width,0);horizon.addColorStop(0,'rgba(121,255,141,0)');horizon.addColorStop(.07,'rgba(238,255,241,.64)');horizon.addColorStop(.2,'rgba(45,255,79,.82)');horizon.addColorStop(.43,'rgba(245,255,247,.79)');horizon.addColorStop(.68,'rgba(38,255,74,.72)');horizon.addColorStop(.92,'rgba(233,255,237,.66)');horizon.addColorStop(1,'rgba(103,255,125,0)');
  ctx.fillStyle=horizon;ctx.shadowColor='#35ff58';ctx.shadowBlur=height*.04;ctx.fillRect(width*.018,floorY,width*.964,Math.max(.7,height*.004));ctx.shadowBlur=0;
  updateLiquidDroplets(elapsed,delta,height,reduced);
  drawSuspendedDroplets(ctx,elapsed,width,height);
  drawLiquidDroplets(ctx,width,height);
  ctx.restore();
}

function stopLiquidSurface(){if(liquidFrame)cancelAnimationFrame(liquidFrame);liquidFrame=0;liquidLastFrameAt=0;}

function startLiquidSurface(){
  stopLiquidSurface();
  if(!liquidCanvas||!playerScreen.classList.contains('is-active'))return;
  liquidStartedAt=performance.now();
  const frame=now=>{
    if(document.hidden||!playerScreen.classList.contains('is-active')){liquidFrame=0;return;}
    if(!reducedMotion.matches||now-liquidReducedLastDraw>80){renderLiquidSurface(now);liquidReducedLastDraw=now;}
    liquidFrame=requestAnimationFrame(frame);
  };
  liquidFrame=requestAnimationFrame(frame);
}

function setLiquidPlayback(active,{restart=false}={}){
  liquidPlaybackActive=Boolean(active);
  liquidCanvas?.setAttribute('data-playback',liquidPlaybackActive?'playing':'idle');
  if(restart||(!liquidFrame&&playerScreen.classList.contains('is-active')))startLiquidSurface();
}

function onBandcampFrameInteraction(){
  if(!bandcampFrameFocused){
    bandcampFrameFocused=true;
    setLiquidPlayback(!liquidPlaybackActive);
    requestAnimationFrame(()=>{bandcampFrame.blur();bandcampFrameFocused=false;});
  }
}

function setFittedText(element, value, longAt, veryLongAt) {
  const text = String(value || '');
  element.textContent = text;
  element.classList.toggle('is-long',text.length > longAt);
  element.classList.toggle('is-very-long',text.length > veryLongAt);
}

function stopTicker() {
  if(tickerLayoutFrame)cancelAnimationFrame(tickerLayoutFrame);
  tickerLayoutFrame=0;
  tickerStream?.classList.remove('is-scrolling');
}

function layoutTicker() {
  stopTicker();
  if(!tickerStream||!tickerCopies[0]||!tickerQueue.length)return;
  tickerLayoutFrame=requestAnimationFrame(()=>{
    tickerLayoutFrame=0;
    const distance=tickerCopies[0].getBoundingClientRect().width;
    if(!distance)return;
    const speed=reducedMotion.matches?18:44;
    tickerStream.style.setProperty('--ticker-distance',`${distance.toFixed(2)}px`);
    tickerStream.style.setProperty('--ticker-duration',`${Math.max(18,distance/speed).toFixed(2)}s`);
    tickerStream.style.setProperty('--ticker-reduced-duration',`${Math.max(34,distance/18).toFixed(2)}s`);
    void tickerStream.offsetWidth;
    tickerStream.classList.add('is-scrolling');
  });
}

function setTickerQueue(messages) {
  tickerQueue=[...new Set(messages.filter(Boolean))];
  if(!tickerQueue.length)return;
  const continuous=`${tickerQueue.join('  •  ')}  •  `;
  for(const copy of tickerCopies)copy.textContent=continuous;
  if(tickerAccessible)tickerAccessible.textContent=tickerQueue.join('. ');
  tickerTrack?.setAttribute('aria-label',tickerQueue.join('. '));
  layoutTicker();
}

function populatePlayer(entry, manifest) {
  const track = pickPlayableTrack(manifest);
  if (!track) throw new Error('no_playable_track');
  currentEntry=entry; currentManifest=manifest; currentTrack=track;
  const artistEntry = artistsById.get(entry.canonicalArtistId) || {};
  setFittedText(document.querySelector('#now-playing-heading'),manifest.artist,17,25);
  setFittedText(document.querySelector('.release-title'),manifest.releaseTitle || entry.release || track.albumTitle || track.title,20,32);
  setFittedText(document.querySelector('.track-title'),track.title,20,32);
  document.querySelector('.duration').textContent = formatDuration(track.duration);
  setTickerQueue(buildTickerMessages({...manifest,selectedTrackTitle:track.title},entry,artistEntry,universeStats));
  bandcampFrame.title=`Official Bandcamp playback controls for ${track.title} by ${manifest.artist}`;
  setLiquidPlayback(false);
  bandcampFrame.src = `https://bandcamp.com/EmbeddedPlayer/track=${encodeURIComponent(track.bandcampEmbedTrackId)}/size=small/bgcol=001a08/linkcol=67ff7b/tracklist=false/artwork=none/transparent=true/`;
  buyLink.href = validBandcampUrl(manifest.bandcampUrl);
  buyLink.setAttribute('aria-label',`Buy ${manifest.releaseTitle || 'this release'} by ${manifest.artist} on Bandcamp`);
  shareButton.setAttribute('aria-label',`Share ${manifest.releaseTitle || track.title} by ${manifest.artist}`);
  setLiquidSeed(track.id || track.bandcampEmbedTrackId,entry.waters?.length?entry.waters:[...selected]);
  const history = pushHistory(readJson(historyKey,[]),entry.slug,SESSION_HISTORY_LIMIT);
  sessionStorage.setItem(historyKey,JSON.stringify(history));
  const artistHistory = pushHistory(readJson(artistHistoryKey,[]),artistIdentity(entry),SESSION_HISTORY_LIMIT);
  sessionStorage.setItem(artistHistoryKey,JSON.stringify(artistHistory));
  playerStatus.textContent = `${track.title}, from ${manifest.releaseTitle}, by ${manifest.artist}, is ready. Use the official Bandcamp play control to listen.`;
  recordEvent('track_selected',entry.slug,{result:'loaded',release:manifest.releaseTitle,categories:[...selected]});
}

function playerUrl(entry = currentEntry) {
  return buildShareUrl(location.origin,base,entry.slug,[...selected]);
}

function showPlayer({push=true}={}) {
  selectionScreen.classList.remove('is-active','is-disintegrating');
  playerScreen.classList.add('is-active');
  playerScreen.setAttribute('aria-hidden','false');
  selectionScreen.setAttribute('aria-hidden','true');
  startBubbleTube();
  startLiquidSurface();
  if (push) history.pushState({view:'player'},'',playerUrl());
}

function showSelection({historyMode='push'}={}) {
  isLocked=false;
  stopBubbleTube();
  stopLiquidSurface();
  stopTicker();
  setLiquidPlayback(false);
  goButton.classList.remove('is-broken');
  selectionScreen.classList.add('is-active');
  playerScreen.classList.remove('is-active');
  playerScreen.setAttribute('aria-hidden','true');
  selectionScreen.setAttribute('aria-hidden','false');
  bandcampFrame.src='about:blank';
  currentEntry=currentManifest=currentTrack=null;
  selected=new Set();
  sessionStorage.removeItem(selectionKey);
  updateSelection(selected,false);
  const target = `${base.replace(/\/$/,'')}/`;
  if (historyMode==='push') history.pushState({view:'selection'},'',target);
  else if(historyMode==='replace') history.replaceState({view:'selection'},'',target);
  recordEvent('doorway_open','discovery-machine',{source:'return_to_selection'});
}

function fitCanvas() {
  const ratio = Math.min(devicePixelRatio || 1,2);
  const rect = machine.getBoundingClientRect();
  canvas.width=Math.round(rect.width*ratio); canvas.height=Math.round(rect.height*ratio);
  canvas.style.width=`${rect.width}px`; canvas.style.height=`${rect.height}px`;
  context?.setTransform(ratio,0,0,ratio,0,0);
  return rect;
}

function disintegrate() {
  if (reducedMotion.matches) { showPlayer(); return Promise.resolve(); }
  const rect = fitCanvas();
  const shards=[];
  const columns=8,rows=12,width=rect.width/columns,height=rect.height/rows;
  for(let row=0;row<rows;row++) for(let column=0;column<columns;column++) {
    const x=column*width,y=row*height;
    const offset=((row*17+column*31)%11)-5;
    shards.push({x:x+offset,y,w:width+4,h:height+4,vx:(column-(columns-1)/2)*.13+offset*.05,vy:1.1+(row%4)*.22,spin:(offset||1)*.0014,rotation:0,alpha:.95,delay:(row*11+column*7)%130});
  }
  playerScreen.classList.add('is-active');
  playerScreen.setAttribute('aria-hidden','false');
  selectionScreen.classList.add('is-disintegrating');
  canvas.classList.add('is-active');
  const start=performance.now();
  return new Promise(resolve=>{
    const frame=now=>{
      const elapsed=now-start;
      context.clearRect(0,0,rect.width,rect.height);
      for(const shard of shards){
        const t=Math.max(0,elapsed-shard.delay)/DESTRUCTION_MS;
        if(t<=0||t>1.15) continue;
        shard.rotation+=shard.spin*16; const drop=t*t*rect.height*.72;
        context.save(); context.translate(shard.x+shard.w/2+shard.vx*elapsed,shard.y+shard.h/2+drop); context.rotate(shard.rotation);
        context.globalAlpha=Math.max(0,1-t);
        const gradient=context.createLinearGradient(-shard.w/2,-shard.h/2,shard.w/2,shard.h/2);
        gradient.addColorStop(0,'rgba(205,255,212,.82)');gradient.addColorStop(.16,'rgba(49,255,79,.68)');gradient.addColorStop(.65,'rgba(0,92,28,.82)');gradient.addColorStop(1,'rgba(0,14,5,.35)');
        context.fillStyle=gradient;context.strokeStyle='rgba(198,255,207,.75)';context.lineWidth=.7;
        context.beginPath();context.moveTo(-shard.w/2,-shard.h/2);context.lineTo(shard.w/2,-shard.h/2+shard.h*.18);context.lineTo(shard.w*.38,shard.h/2);context.lineTo(-shard.w/2+shard.w*.12,shard.h*.34);context.closePath();context.fill();context.stroke();context.restore();
      }
      if(elapsed<DESTRUCTION_MS+150) requestAnimationFrame(frame); else {canvas.classList.remove('is-active');context.clearRect(0,0,rect.width,rect.height);showPlayer();resolve();}
    };
    requestAnimationFrame(frame);
  });
}

function delay(ms){return new Promise(resolve=>setTimeout(resolve,ms));}

async function onGo() {
  if (isLocked || !selected.size || !catalogue.length) return;
  isLocked=true; updateSelection(selected,false); goButton.classList.add('is-broken'); playGlassBreak('go');
  machineStatus.textContent='The glass is giving way.';
  recordEvent('doorway_open','discovery-machine',{source:'go_pressed',selection:[...selected]});
  const discovery=resolveDiscovery();
  const [,result]=await Promise.all([delay(GO_HOLD_MS),discovery]).catch(error=>[null,{error}]);
  if(result?.error){isLocked=false;goButton.classList.remove('is-broken');updateSelection(selected,false);machineStatus.textContent=result.error.message;return;}
  populatePlayer(result.entry,result.manifest);
  playGlassDisintegration();
  await disintegrate();
  isLocked=false;
  recordEvent('doorway_to_aquarium_transition',result.entry.slug,{selection:[...selected],transition:'disintegration'});
}

async function onNext() {
  if (isLocked) return;
  isLocked=true; nextButton.disabled=true; playerScreen.classList.add('is-changing'); playGlassBreak('anything',{control:true});
  const previousSlug=currentEntry.slug;
  recordEvent('explore_click',previousSlug,{selection:[...selected]});
  try {
    const result=await resolveDiscovery();
    await delay(reducedMotion.matches?0:260);
    populatePlayer(result.entry,result.manifest);
    history.replaceState({view:'player'},'',playerUrl(result.entry));
    recordEvent('aquarium_transition',result.entry.slug,{sourceAquariumId:previousSlug,destinationAquariumId:result.entry.slug,selection:[...selected]});
  } catch(error) { playerStatus.textContent=error.message; }
  finally {isLocked=false;nextButton.disabled=false;playerScreen.classList.remove('is-changing');}
}

async function onShare() {
  const url=playerUrl();
  const title=`${currentManifest.artist} — ${currentManifest.releaseTitle}`;
  recordEvent('share_click',currentEntry.slug,{method:navigator.share?'native':'copy'});
  try {
    if(navigator.share){recordEvent('share_native_opened',currentEntry.slug);await navigator.share({title,text:'I found this independent release through Cosmic Aquaria.',url});recordEvent('share_complete',currentEntry.slug);}
    else {await navigator.clipboard.writeText(url);playerStatus.textContent='Discovery link copied.';recordEvent('share_copy',currentEntry.slug);}
  } catch(error) { if(error?.name!=='AbortError') playerStatus.textContent='Sharing is unavailable. Copy the page address to share this discovery.'; }
}

async function loadInitialData() {
  const [catalogueResponse,artistsResponse,statsResponse]=await Promise.all([
    fetch(`${base}/aquariums.json`,{cache:'no-store'}),fetch(`${base}/artists-index.json`,{cache:'no-store'}).catch(()=>null),fetch(`${base}/universe-stats.json`,{cache:'no-store'}).catch(()=>null),
  ]);
  if(!catalogueResponse.ok) throw new Error('The Cosmic Aquaria library could not be opened.');
  catalogue=(await catalogueResponse.json()).aquariums || [];
  if(artistsResponse?.ok){const data=await artistsResponse.json();artistsById=new Map((data.artists||[]).map(artist=>[artist.id,artist]));}
  if(statsResponse?.ok)universeStats=await statsResponse.json();
  const params=new URLSearchParams(location.search);
  const requestedSelection=normalizeSelection((params.get('categories')||'').split(',').filter(Boolean));
  // A normal homepage entry is always pristine. Only an explicit deep link may
  // arrive with a category selection; session state is retained solely while
  // the listener remains in the active Player flow.
  updateSelection(requestedSelection,false);
  const requested=params.get('release');
  if(requested){
    const entry=catalogue.find(item=>item.slug===requested&&item.status==='published');
    if(entry){if(!selected.size)selected=new Set(entry.waters?.length?entry.waters:['anything']);updateSelection(selected,false);const result=await resolveDiscovery(entry);populatePlayer(result.entry,result.manifest);showPlayer({push:false});history.replaceState({view:'player'},'',playerUrl(result.entry));return;}
  }
  history.replaceState({view:'selection'},'',`${base.replace(/\/$/,'')}/`);
}

async function restoreLocation() {
  const params=new URLSearchParams(location.search);
  const slug=params.get('release');
  if(!slug){showSelection({historyMode:'none'});return;}
  const entry=catalogue.find(item=>item.slug===slug&&item.status==='published');
  if(!entry){showSelection({historyMode:'replace'});return;}
  const requestedSelection=normalizeSelection((params.get('categories')||'').split(',').filter(Boolean));
  selected=new Set(requestedSelection.length?requestedSelection:(entry.waters?.length?entry.waters:['anything']));
  updateSelection(selected,false);
  try{const manifest=await fetchManifest(entry);populatePlayer(entry,manifest);showPlayer({push:false});}
  catch{showSelection({historyMode:'replace'});}
}

seedCracks();
prepareDirectImpactAudio();
preloadGlassAudio();
updateSoundControls();
document.addEventListener('pointerdown',()=>void activateGlassAudio(),{capture:true,passive:true});
document.addEventListener('keydown',()=>void activateGlassAudio(),{capture:true});
for(const button of categoryButtons) button.addEventListener('click',onCategory);
goButton.addEventListener('click',()=>void onGo());
nextButton.addEventListener('click',()=>void onNext());
shareButton.addEventListener('click',()=>void onShare());
buyLink.addEventListener('click',()=>recordEvent('buy_click',currentEntry?.slug,{url:buyLink.href}));
changeButton.addEventListener('click',()=>showSelection());
for(const button of soundToggles)button.addEventListener('click',onSoundToggle);
addEventListener('popstate',()=>void restoreLocation());
bandcampFrame.addEventListener('focus',onBandcampFrameInteraction);
addEventListener('blur',()=>setTimeout(()=>{if(document.activeElement===bandcampFrame)onBandcampFrameInteraction();},0));
addEventListener('message',event=>{
  if(event.source===bandcampFrame.contentWindow&&event.origin==='https://bandcamp.com'&&event.data==='playerinited')setLiquidPlayback(false,{restart:true});
});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){stopBubbleTube();stopLiquidSurface();if(audioContext?.state==='running')void audioContext.suspend();}
  else if(playerScreen.classList.contains('is-active')){startBubbleTube();startLiquidSurface();}
});
reducedMotion.addEventListener?.('change',()=>{if(playerScreen.classList.contains('is-active')){startBubbleTube();startLiquidSurface();layoutTicker();}});
addEventListener('resize',()=>{if(playerScreen.classList.contains('is-active')){startBubbleTube();startLiquidSurface();layoutTicker();}},{passive:true});

window.CosmicGlassAudio=Object.freeze({
  playGlassBreak,
  setMuted:setGlassAudioMuted,
  activate:activateGlassAudio,
  getState(){return {...updateAudioDebug(),activeNodes:glassAudio.activeNodes.size};},
});

recordEvent('session_start','discovery-machine',{product:'two-screen-discovery'});
loadInitialData().catch(error=>{machineStatus.textContent=error.message;goButton.disabled=true;});
