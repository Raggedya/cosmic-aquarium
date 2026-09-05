import {
  CRACK_VARIANTS, GO_HOLD_MS, DESTRUCTION_MS, SESSION_HISTORY_LIMIT,
  nextSelection, normalizeSelection, chooseRelease, pushHistory, buildShareUrl,
  buildTickerMessages, validBandcampUrl, pickPlayableTrack, artistIdentity,
  searchLocalArtists, dedupeArtistResults, highConfidenceArtistMatch, pickDifferentPlayableTrack,
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
const artistSearch = document.querySelector('.artist-search');
const artistSearchInput = document.querySelector('#artist-search-input');
const searchClear = document.querySelector('.search-clear');
const searchResultsPanel = document.querySelector('#artist-search-results');
const searchFeedback = document.querySelector('.search-feedback');
const tickerTrack = document.querySelector('.ticker-track');
const tickerStream = document.querySelector('.ticker-stream');
const tickerCopies = [...document.querySelectorAll('.ticker-copy')];
const tickerAccessible = document.querySelector('.ticker-accessible');
const bandcampTransport = document.querySelector('.bandcamp-transport');
const bandcampFrame = document.querySelector('.bandcamp-transport iframe');
const meterRow = document.querySelector('.vu-meter-row');
const meterNeedles = [...document.querySelectorAll('[data-vu-needle]')];
const meterNeedleShadows = [...document.querySelectorAll('[data-vu-shadow]')];
const meterScales = [...document.querySelectorAll('[data-vu-scale]')];
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
let meterFrame = 0;
let meterLastFrameAt = 0;
let meterPlayElapsed = 0;
let meterPlaybackActive = false;
let meterPlaybackStartedAt = 0;
let meterSeed = 5381;
let meterProfile = null;
let meterSettleUntil = 0;
let meterChannels = [
  {level:0,velocity:0,target:0,angle:-58,peak:0},
  {level:0,velocity:0,target:0,angle:-58,peak:0},
];
let bandcampFrameFocused = false;
let artists=[];
let searchQuery='';
let searchResults=[];
let selectedSearchArtist=null;
let selectorMode='GENRE_IDLE';
let searchTimer=0;
let searchRequestSerial=0;
let searchAbortController=null;
let searchActiveIndex=-1;
let playerDiscoveryMode='genre';
let currentSearchContext=null;
let searchTrackHistory=[];
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

function isSearchMode(){return searchQuery.trim().length>0;}

function setSelectorMode(mode){
  selectorMode=mode;
  selectionScreen.dataset.mode=mode;
}

function setSearchState(state,feedback=''){
  artistSearch?.setAttribute('data-search-state',state);
  if(searchFeedback)searchFeedback.textContent=feedback;
}

function refreshGoState(){
  const searchReady=isSearchMode()&&catalogue.length>0;
  const genreReady=!isSearchMode()&&selected.size>0&&catalogue.length>0;
  const ready=(searchReady||genreReady)&&!isLocked;
  goButton.disabled=!ready;
  goButton.setAttribute('aria-disabled',String(!ready));
}

function setSearchMode(active){
  selectionScreen.classList.toggle('is-search-mode',active);
  for(const button of categoryButtons){
    button.disabled=active;
    button.setAttribute('aria-disabled',String(active));
  }
  if(active&&selected.size){
    selected=new Set();
    sessionStorage.removeItem(selectionKey);
    for(const button of categoryButtons){button.classList.remove('is-selected');button.setAttribute('aria-pressed','false');}
  }
  setSelectorMode(active?(selectedSearchArtist?'SEARCH_SELECTED':'SEARCH_TYPING'):(selected.size?'GENRE_SELECTED':'GENRE_IDLE'));
  refreshGoState();
}

function closeSearchResults(){
  searchActiveIndex=-1;
  if(searchResultsPanel){searchResultsPanel.hidden=true;searchResultsPanel.replaceChildren();}
  artistSearchInput?.setAttribute('aria-expanded','false');
  artistSearchInput?.setAttribute('aria-activedescendant','');
}

function renderSearchResults(results,feedback=''){
  searchResults=dedupeArtistResults(results,8);
  searchActiveIndex=-1;
  if(!searchResultsPanel)return;
  searchResultsPanel.replaceChildren();
  for(const [index,result] of searchResults.entries()){
    const option=document.createElement('button');
    option.type='button';option.className='search-result';option.id=`artist-result-${index}`;option.role='option';
    option.setAttribute('aria-selected','false');option.dataset.index=String(index);
    const name=document.createElement('strong');name.textContent=result.artistName;
    const context=document.createElement('small');context.textContent=[result.location,result.context].filter(Boolean).join('  •  ')||'ARTIST';
    const source=document.createElement('em');source.textContent=result.source==='library'?'IN COSMIC AQUARIA':'ON BANDCAMP';
    option.append(name,context,source);
    option.addEventListener('click',()=>selectSearchResult(index));
    searchResultsPanel.append(option);
  }
  const visible=searchResults.length>0;
  searchResultsPanel.hidden=!visible;
  artistSearchInput?.setAttribute('aria-expanded',String(visible));
  setSearchState(selectedSearchArtist?'selected':'idle',feedback);
}

function selectSearchResult(index){
  const result=searchResults[index];
  if(!result)return;
  selectedSearchArtist=result;
  searchQuery=result.artistName;
  artistSearchInput.value=result.artistName;
  searchClear.hidden=false;
  closeSearchResults();
  setSearchMode(true);
  setSearchState('selected','');
  machineStatus.textContent=`${result.artistName} selected. Press GO.`;
  refreshGoState();
}

function setActiveSearchResult(index){
  if(!searchResults.length)return;
  searchActiveIndex=(index+searchResults.length)%searchResults.length;
  for(const [itemIndex,element] of [...searchResultsPanel.children].entries()){
    const active=itemIndex===searchActiveIndex;
    element.classList.toggle('is-active',active);element.setAttribute('aria-selected',String(active));
  }
  const activeElement=searchResultsPanel.children[searchActiveIndex];
  artistSearchInput.setAttribute('aria-activedescendant',activeElement?.id||'');
  activeElement?.scrollIntoView({block:'nearest'});
}

async function runArtistSearch(query,serial){
  const local=searchLocalArtists(artists,query,6);
  if(serial!==searchRequestSerial||query!==searchQuery)return;
  renderSearchResults(local,local.length?'CHOOSE AN ARTIST':'NOT YET IN COSMIC AQUARIA');
  setSearchState(selectedSearchArtist?'selected':'idle',local.length?'':'NOT YET IN COSMIC AQUARIA');
}

function onSearchInput(){
  const next=artistSearchInput.value.slice(0,80);
  searchQuery=next;
  if(selectedSearchArtist&&selectedSearchArtist.artistName!==next)selectedSearchArtist=null;
  searchClear.hidden=!next;
  clearTimeout(searchTimer);searchRequestSerial+=1;searchAbortController?.abort();
  const active=next.trim().length>0;
  setSearchMode(active);
  if(!active){selectedSearchArtist=null;closeSearchResults();setSearchState('idle','');machineStatus.textContent='Choose one or more categories.';return;}
  if(next.trim().length<2){closeSearchResults();setSearchState('idle','KEEP TYPING');machineStatus.textContent='Enter at least two characters to search.';return;}
  const local=searchLocalArtists(artists,next,6);
  renderSearchResults(local,local.length?'COSMIC AQUARIA RESULTS':'');
  const serial=searchRequestSerial;
  searchTimer=setTimeout(()=>void runArtistSearch(next.trim(),serial),320);
  machineStatus.textContent='Search mode. Choose an artist in Cosmic Aquaria, then press GO.';
}

function clearArtistSearch({focus=false}={}){
  clearTimeout(searchTimer);searchRequestSerial+=1;searchAbortController?.abort();
  searchQuery='';searchResults=[];selectedSearchArtist=null;searchActiveIndex=-1;
  if(artistSearchInput)artistSearchInput.value='';
  if(searchClear)searchClear.hidden=true;
  closeSearchResults();setSearchState('idle','');setSearchMode(false);
  machineStatus.textContent='Choose one or more categories.';
  if(focus)artistSearchInput?.focus({preventScroll:true});
}

function onSearchKeydown(event){
  if(event.key==='ArrowDown'){event.preventDefault();setActiveSearchResult(searchActiveIndex+1);}
  else if(event.key==='ArrowUp'){event.preventDefault();setActiveSearchResult(searchActiveIndex-1);}
  else if(event.key==='Enter'){
    event.preventDefault();
    if(searchActiveIndex>=0)selectSearchResult(searchActiveIndex);
    else if(searchResults.length===1||highConfidenceArtistMatch(searchQuery,searchResults[0]))selectSearchResult(0);
    else {renderSearchResults(searchResults,'CHOOSE AN ARTIST');}
  }else if(event.key==='Escape'){event.preventDefault();clearArtistSearch({focus:true});}
}

function updateSelection(next, announce = true) {
  if(isSearchMode())next=[];
  selected = new Set(normalizeSelection(next));
  sessionStorage.setItem(selectionKey,JSON.stringify([...selected]));
  for (const button of categoryButtons) {
    const active = selected.has(button.dataset.category);
    button.classList.toggle('is-selected',active);
    button.setAttribute('aria-pressed',String(active));
  }
  refreshGoState();
  if (announce) machineStatus.textContent = selected.size ? `${[...selected].map(value=>value.toUpperCase()).join(', ')} selected.` : 'Choose one or more categories.';
}

function onCategory(event) {
  if (isLocked || isSearchMode() || event.currentTarget.disabled) return;
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

async function resolveSearchArtist(result,{excludeReleaseId='',preferredReleaseId='',preferredReleaseType=''}={}){
  if(result?.source==='library'){
    const entry=catalogue.find(item=>item.slug===result.aquariumSlug&&item.status==='published');
    if(!entry)throw new Error('This library artist is temporarily unavailable.');
    return {entry,manifest:await fetchManifest(entry),search:{source:'library',artistId:result.artistId,artistName:result.artistName,bandcampArtistUrl:result.bandcampArtistUrl}};
  }
  if(!isSearchMode())setSelectorMode(selected.size?'GENRE_SELECTED':'GENRE_IDLE');
  if(!/^\d+$/.test(String(result?.bandId||''))||!validBandcampUrl(result?.bandcampArtistUrl))throw new Error('Choose a valid Bandcamp artist.');
  const params=new URLSearchParams({band_id:String(result.bandId),artist_url:result.bandcampArtistUrl});
  if(excludeReleaseId)params.set('exclude_release',String(excludeReleaseId));
  if(preferredReleaseId){params.set('release_id',String(preferredReleaseId));params.set('release_type',preferredReleaseType==='track'?'t':'a');}
  const response=await fetch(`${workerBase}/api/search/artist?${params}`,{credentials:'omit'});
  if(!response.ok)throw new Error(response.status===404?'No playable Bandcamp release was found for this artist.':'Bandcamp search is temporarily unavailable.');
  const payload=await response.json();
  if(!payload?.entry||!payload?.manifest||!pickPlayableTrack(payload.manifest))throw new Error('No playable Bandcamp release was found for this artist.');
  return payload;
}

async function resolveSelectedSearchArtist(){
  let result=selectedSearchArtist;
  if(!result){
    const exact=searchResults.find(candidate=>highConfidenceArtistMatch(searchQuery,candidate));
    if(exact)result=exact;
  }
  if(!result){renderSearchResults(searchResults,'CHOOSE AN ARTIST');throw new Error('Choose an artist from the search results.');}
  return resolveSearchArtist(result);
}

function formatDuration(value) {
  const match = String(value || '').match(/^(\d{1,3}):(\d{2})$/);
  return match ? `${Number(match[1])}:${match[2]}` : '—:—';
}

const SVG_NS='http://www.w3.org/2000/svg';
const METER_REST_ANGLE=-58;
const METER_MAX_ANGLE=58;
const METER_PIVOT={x:160,y:167};

function meterRandom(offset=0){
  let value=(meterSeed+Math.imul(offset+1,0x9e3779b1))>>>0;
  value^=value>>>16;value=Math.imul(value,0x21f0aaad);value^=value>>>15;value=Math.imul(value,0x735a2d97);value^=value>>>15;
  return (value>>>0)/4294967296;
}

function meterPoint(angle,radius){
  const radians=angle*Math.PI/180;
  return {x:METER_PIVOT.x+Math.sin(radians)*radius,y:METER_PIVOT.y-Math.cos(radians)*radius};
}

function meterArcPath(startAngle,endAngle,radius){
  const start=meterPoint(startAngle,radius);
  const end=meterPoint(endAngle,radius);
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 0 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

function svgElement(name,attributes={}){
  const element=document.createElementNS(SVG_NS,name);
  for(const [key,value] of Object.entries(attributes))element.setAttribute(key,String(value));
  return element;
}

function buildVuMeters(){
  const labels=['20','10','7','5','3','2','1','0','1','2','3'];
  for(const [meterIndex,scale] of meterScales.entries()){
    if(scale.childElementCount)continue;
    const bubbles=[
      {cx:48+(meterIndex*7),cy:145,r:4.2},
      {cx:269-(meterIndex*9),cy:139,r:3.1},
      {cx:75+(meterIndex*181),cy:157,r:2.2},
    ];
    for(const bubble of bubbles)scale.append(svgElement('circle',{...bubble,class:'vu-face-bubble'}));
    scale.append(svgElement('path',{class:'vu-scale-arc',d:meterArcPath(METER_REST_ANGLE,METER_MAX_ANGLE,112)}));
    const redStart=METER_REST_ANGLE+(METER_MAX_ANGLE-METER_REST_ANGLE)*.72;
    scale.append(svgElement('path',{class:'vu-red-arc',d:meterArcPath(redStart,METER_MAX_ANGLE,112)}));
    for(let index=0;index<labels.length;index++){
      const amount=index/(labels.length-1);
      const angle=METER_REST_ANGLE+(METER_MAX_ANGLE-METER_REST_ANGLE)*amount;
      const outer=meterPoint(angle,119);
      const inner=meterPoint(angle,index===0||index===7||index===10?98:102);
      const label=meterPoint(angle,88);
      scale.append(svgElement('line',{x1:inner.x.toFixed(2),y1:inner.y.toFixed(2),x2:outer.x.toFixed(2),y2:outer.y.toFixed(2),class:`vu-scale-tick is-major${index>=8?' is-red':''}`}));
      const text=svgElement('text',{x:label.x.toFixed(2),y:label.y.toFixed(2),class:`vu-scale-label${index===10?' is-red':''}`});
      text.textContent=labels[index];
      scale.append(text);
      if(index<labels.length-1){
        const minorAngle=angle+(METER_MAX_ANGLE-METER_REST_ANGLE)/(labels.length-1)/2;
        const minorOuter=meterPoint(minorAngle,118);
        const minorInner=meterPoint(minorAngle,108);
        scale.append(svgElement('line',{x1:minorInner.x.toFixed(2),y1:minorInner.y.toFixed(2),x2:minorOuter.x.toFixed(2),y2:minorOuter.y.toFixed(2),class:`vu-scale-tick${index>=7?' is-red':''}`}));
      }
    }
  }
}

function setMeterSeed(seed,waters=[]){
  meterSeed=[...String(seed)].reduce((value,char)=>(Math.imul(value,33)+char.charCodeAt(0))>>>0,5381);
  const category=String(waters.find(value=>value!=='anything')||'anything').toLowerCase();
  const characters={
    heavy:{activity:1.04,pace:.9,stereo:.13,release:.94,transients:1.14},
    dreamy:{activity:.82,pace:.72,stereo:.18,release:.76,transients:.76},
    quiet:{activity:.56,pace:.62,stereo:.1,release:.84,transients:.48},
    electronic:{activity:.91,pace:1.12,stereo:.16,release:1.08,transients:1.08},
    dark:{activity:.73,pace:.68,stereo:.12,release:.83,transients:.78},
    loud:{activity:1.08,pace:1.05,stereo:.17,release:1.04,transients:1.2},
    strange:{activity:.9,pace:.88,stereo:.25,release:.9,transients:1.02},
    anything:{activity:.85,pace:.86,stereo:.16,release:.9,transients:.92},
  };
  const character=characters[category]||characters.anything;
  meterProfile={
    category,
    character,
    pulsePeriod:.42+meterRandom(5)*.31,
    slowPeriod:4.8+meterRandom(11)*4.7,
    phrasePeriod:.72+meterRandom(17)*1.18,
    channelPeriod:.4+meterRandom(23)*.44,
  };
  meterPlayElapsed=0;
  meterChannels=[
    {level:0,velocity:0,target:0,angle:METER_REST_ANGLE,peak:0},
    {level:0,velocity:0,target:0,angle:METER_REST_ANGLE,peak:0},
  ];
  for(const needle of meterNeedles)needle.style.transform=`rotate(${METER_REST_ANGLE}deg)`;
  for(const shadow of meterNeedleShadows)shadow.style.transform=`translate(1px,1.6px) rotate(${METER_REST_ANGLE}deg)`;
}

function meterHash(index,salt=0){
  let value=(meterSeed^Math.imul(index+1,0x9e3779b1)^Math.imul(salt+17,0x85ebca6b))>>>0;
  value^=value>>>16;value=Math.imul(value,0x7feb352d);value^=value>>>15;value=Math.imul(value,0x846ca68b);value^=value>>>16;
  return (value>>>0)/4294967296;
}

function meterEnvelope(time,period,salt){
  const cursor=Math.max(0,time)/period;
  const index=Math.floor(cursor);
  const fraction=cursor-index;
  const eased=fraction*fraction*(3-2*fraction);
  const start=meterHash(index,salt);
  const end=meterHash(index+1,salt);
  return start+(end-start)*eased;
}

function meterTransient(time,channelIndex){
  const period=meterProfile.pulsePeriod*(channelIndex?1.037:.973);
  const cursor=Math.max(0,time)/period;
  const index=Math.floor(cursor);
  const phase=cursor-index;
  const strength=meterHash(index,channelIndex?151:139);
  if(strength<.42)return 0;
  const rarity=strength>.93?1.65:strength>.8?1.05:.55;
  return Math.exp(-phase*(strength>.93?7:11))*((strength-.42)/.58)*rarity;
}

function proceduralMeterTarget(elapsed,channelIndex){
  if(!meterProfile||!meterPlaybackActive)return 0;
  const {character,slowPeriod,phrasePeriod,channelPeriod}=meterProfile;
  const time=elapsed*character.pace;
  const wake=reducedMotion.matches?.5:Math.min(1,Math.max(0,(performance.now()-meterPlaybackStartedAt)/640));
  const slow=meterEnvelope(time,slowPeriod,31);
  const phrase=meterEnvelope(time,phrasePeriod,47);
  const sharedTransient=Math.max(meterTransient(time,0),meterTransient(time+.08,1)*.72);
  const channel=meterEnvelope(time,channelPeriod,channelIndex?83:71)-.5;
  const bias=meterEnvelope(time,2.3+channelIndex*.37,channelIndex?109:101)-.5;
  const independentTransient=meterTransient(time+(channelIndex?.12:.03),channelIndex);
  const sustained=.16+slow*.22+phrase*.24;
  const transient=(sharedTransient*.68+independentTransient*.32)*.78*character.transients;
  const relatedOffset=(channel*.12+bias*.07)*(.55+character.stereo)*(channelIndex?1:-.88);
  const ceiling=channelIndex?.94:.92;
  let target=(sustained+transient+relatedOffset)*character.activity*wake;
  if(reducedMotion.matches)target=.07+target*.24;
  return Math.max(0,Math.min(ceiling,target));
}

function renderVuMeters(now=performance.now()){
  if(!meterNeedles.length)return;
  const delta=meterLastFrameAt?Math.min(.034,(now-meterLastFrameAt)/1000):.016;
  meterLastFrameAt=now;
  if(meterPlaybackActive)meterPlayElapsed+=delta;
  for(let index=0;index<meterChannels.length;index++){
    const channel=meterChannels[index];
    channel.target=proceduralMeterTarget(meterPlayElapsed,index);
    const rising=channel.target>channel.level;
    const motionScale=reducedMotion.matches?.46:1;
    const stiffness=(rising?178:28*meterProfile.character.release)*motionScale;
    const damping=(rising?17.6:8.4)/Math.max(.72,motionScale);
    const acceleration=(channel.target-channel.level)*stiffness-channel.velocity*damping;
    channel.velocity+=acceleration*delta;
    channel.level=Math.max(-.018,Math.min(1.015,channel.level+channel.velocity*delta));
    channel.peak=Math.max(channel.peak*.994,channel.level);
    const micro=meterPlaybackActive&&!reducedMotion.matches?(meterEnvelope(meterPlayElapsed,.095,index?197:193)-.5)*.14:0;
    channel.angle=METER_REST_ANGLE+(METER_MAX_ANGLE-METER_REST_ANGLE)*channel.level+micro;
    if(meterNeedles[index])meterNeedles[index].style.transform=`rotate(${channel.angle.toFixed(2)}deg)`;
    const shadowX=(.9+Math.sin(channel.angle*Math.PI/180)*.7).toFixed(2);
    const shadowY=(1.45-Math.cos(channel.angle*Math.PI/180)*.18).toFixed(2);
    if(meterNeedleShadows[index])meterNeedleShadows[index].style.transform=`translate(${shadowX}px,${shadowY}px) rotate(${channel.angle.toFixed(2)}deg)`;
  }
}

function stopVuMeters({rest=false}={}){
  if(meterFrame)cancelAnimationFrame(meterFrame);
  meterFrame=0;meterLastFrameAt=0;
  if(rest){
    meterChannels.forEach(channel=>{channel.level=0;channel.velocity=0;channel.target=0;channel.angle=METER_REST_ANGLE;channel.peak=0;});
    for(const needle of meterNeedles)needle.style.transform=`rotate(${METER_REST_ANGLE}deg)`;
    for(const shadow of meterNeedleShadows)shadow.style.transform=`translate(1px,1.6px) rotate(${METER_REST_ANGLE}deg)`;
  }
}

function startVuMeters(){
  stopVuMeters();
  if(!meterRow||!playerScreen.classList.contains('is-active'))return;
  const frame=now=>{
    if(document.hidden||!playerScreen.classList.contains('is-active')){meterFrame=0;return;}
    renderVuMeters(now);
    const settled=!meterPlaybackActive&&now>meterSettleUntil&&meterChannels.every(channel=>Math.abs(channel.level)<.002&&Math.abs(channel.velocity)<.003);
    if(settled){stopVuMeters({rest:true});return;}
    meterFrame=requestAnimationFrame(frame);
  };
  meterFrame=requestAnimationFrame(frame);
}

function setMeterPlayback(active,{restart=false}={}){
  const next=Boolean(active);
  if(next&&!meterPlaybackActive)meterPlaybackStartedAt=performance.now();
  meterPlaybackActive=next;
  if(!next)meterSettleUntil=performance.now()+(reducedMotion.matches?1800:1200);
  meterRow?.setAttribute('data-playback',meterPlaybackActive?'playing':'idle');
  bandcampTransport?.setAttribute('data-playback',meterPlaybackActive?'playing':'idle');
  if(restart||meterPlaybackActive||!meterFrame)startVuMeters();
}

function onBandcampFrameInteraction(){
  if(!bandcampFrameFocused){
    bandcampFrameFocused=true;
    setMeterPlayback(!meterPlaybackActive);
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

function populatePlayer(entry, manifest, {trackOverride=null}={}) {
  const track = trackOverride || pickPlayableTrack(manifest);
  if (!track) throw new Error('no_playable_track');
  currentEntry=entry; currentManifest=manifest; currentTrack=track;
  const artistEntry = artistsById.get(entry.canonicalArtistId) || {};
  setFittedText(document.querySelector('#now-playing-heading'),manifest.artist,17,25);
  setFittedText(document.querySelector('.release-title'),manifest.releaseTitle || entry.release || track.albumTitle || track.title,20,32);
  setFittedText(document.querySelector('.track-title'),track.title,20,32);
  document.querySelector('.duration').textContent = formatDuration(track.duration);
  setTickerQueue(buildTickerMessages({...manifest,selectedTrackTitle:track.title},entry,artistEntry,universeStats));
  bandcampFrame.title=`Official Bandcamp playback controls for ${track.title} by ${manifest.artist}`;
  setMeterPlayback(false);
  bandcampFrame.src = `https://bandcamp.com/EmbeddedPlayer/track=${encodeURIComponent(track.bandcampEmbedTrackId)}/size=small/bgcol=000000/linkcol=67ff7b/tracklist=false/artwork=none/transparent=true/`;
  buyLink.href = validBandcampUrl(manifest.bandcampUrl);
  buyLink.setAttribute('aria-label',`Buy ${manifest.releaseTitle || 'this release'} by ${manifest.artist} on Bandcamp`);
  shareButton.setAttribute('aria-label',`Share ${manifest.releaseTitle || track.title} by ${manifest.artist}`);
  setMeterSeed(track.id || track.bandcampEmbedTrackId,entry.waters?.length?entry.waters:[...selected]);
  if(playerDiscoveryMode==='search')searchTrackHistory=pushHistory(searchTrackHistory,String(track.id||track.bandcampEmbedTrackId),Math.max(20,manifest.tracks?.length||20));
  const history = pushHistory(readJson(historyKey,[]),entry.slug,SESSION_HISTORY_LIMIT);
  sessionStorage.setItem(historyKey,JSON.stringify(history));
  const artistHistory = pushHistory(readJson(artistHistoryKey,[]),artistIdentity(entry),SESSION_HISTORY_LIMIT);
  sessionStorage.setItem(artistHistoryKey,JSON.stringify(artistHistory));
  playerStatus.textContent = `${track.title}, from ${manifest.releaseTitle}, by ${manifest.artist}, is ready. Use the official Bandcamp play control to listen.`;
  recordEvent('track_selected',entry.slug,{result:'loaded',release:manifest.releaseTitle,categories:[...selected],mode:playerDiscoveryMode});
}

function playerUrl(entry = currentEntry) {
  if(playerDiscoveryMode==='search'&&currentSearchContext?.source==='bandcamp'){
    const url=new URL(`${base.replace(/\/$/,'')}/`,location.origin);
    url.searchParams.set('searchBand',String(currentSearchContext.bandId));
    url.searchParams.set('searchUrl',currentSearchContext.bandcampArtistUrl);
    if(currentSearchContext.releaseId)url.searchParams.set('searchRelease',String(currentSearchContext.releaseId));
    if(currentSearchContext.releaseType)url.searchParams.set('searchType',currentSearchContext.releaseType);
    if(currentTrack?.bandcampEmbedTrackId)url.searchParams.set('track',String(currentTrack.bandcampEmbedTrackId));
    return url.toString();
  }
  const url=new URL(buildShareUrl(location.origin,base,entry.slug,[...selected]));
  if(playerDiscoveryMode==='search'&&currentSearchContext?.source==='library')url.searchParams.set('searchArtist',currentSearchContext.artistId);
  return url.toString();
}

function showPlayer({push=true}={}) {
  selectionScreen.classList.remove('is-active','is-disintegrating');
  playerScreen.classList.add('is-active');
  playerScreen.setAttribute('aria-hidden','false');
  selectionScreen.setAttribute('aria-hidden','true');
  startBubbleTube();
  startVuMeters();
  if (push) history.pushState({view:'player'},'',playerUrl());
}

function showSelection({historyMode='push'}={}) {
  isLocked=false;
  stopBubbleTube();
  stopVuMeters({rest:true});
  stopTicker();
  setMeterPlayback(false);
  goButton.classList.remove('is-broken');
  selectionScreen.classList.add('is-active');
  playerScreen.classList.remove('is-active');
  playerScreen.setAttribute('aria-hidden','true');
  selectionScreen.setAttribute('aria-hidden','false');
  bandcampFrame.src='about:blank';
  currentEntry=currentManifest=currentTrack=null;
  playerDiscoveryMode='genre';currentSearchContext=null;searchTrackHistory=[];
  selected=new Set();
  sessionStorage.removeItem(selectionKey);
  clearArtistSearch();
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
  const searchMode=isSearchMode();
  if (isLocked || (!searchMode&&!selected.size) || !catalogue.length) return;
  isLocked=true; setSelectorMode('TRANSITIONING'); updateSelection(selected,false); setSelectorMode('TRANSITIONING'); goButton.classList.add('is-broken'); playGlassBreak('go');
  machineStatus.textContent='The glass is giving way.';
  recordEvent('doorway_open','discovery-machine',{source:'go_pressed',selection:[...selected],mode:searchMode?'search':'genre',artist:selectedSearchArtist?.artistName||null});
  const discovery=searchMode?resolveSelectedSearchArtist():resolveDiscovery();
  const [,result]=await Promise.all([delay(GO_HOLD_MS),discovery]).catch(error=>[null,{error}]);
  if(result?.error){isLocked=false;goButton.classList.remove('is-broken');updateSelection(selected,false);setSearchMode(searchMode);machineStatus.textContent=result.error.message;return;}
  playerDiscoveryMode=searchMode?'search':'genre';
  currentSearchContext=searchMode?{
    source:result.search?.source||selectedSearchArtist?.source,
    artistId:result.search?.artistId||selectedSearchArtist?.artistId,
    artistName:result.search?.artistName||selectedSearchArtist?.artistName,
    bandcampArtistUrl:result.search?.bandcampArtistUrl||selectedSearchArtist?.bandcampArtistUrl,
    bandId:result.search?.bandId||selectedSearchArtist?.bandId,
    releaseId:result.search?.releaseId||null,
    releaseType:result.search?.releaseType||null,
  }:null;
  searchTrackHistory=[];
  populatePlayer(result.entry,result.manifest);
  playGlassDisintegration();
  await disintegrate();
  isLocked=false;
  recordEvent('doorway_to_aquarium_transition',result.entry.slug,{selection:[...selected],transition:'disintegration',mode:playerDiscoveryMode});
}

async function onNext() {
  if (isLocked) return;
  isLocked=true; nextButton.disabled=true; playerScreen.classList.add('is-changing'); playGlassBreak('anything',{control:true});
  const previousSlug=currentEntry.slug;
  recordEvent('explore_click',previousSlug,{selection:[...selected]});
  try {
    let result;
    let trackOverride=null;
    if(playerDiscoveryMode==='search'){
      trackOverride=pickDifferentPlayableTrack(currentManifest,currentTrack?.bandcampEmbedTrackId,searchTrackHistory);
      if(trackOverride)result={entry:currentEntry,manifest:currentManifest};
      else if(currentSearchContext?.source==='library'){
        const alternatives=catalogue.filter(entry=>entry.status==='published'&&entry.canonicalArtistId===currentSearchContext.artistId&&entry.slug!==currentEntry.slug);
        const nextEntry=alternatives.find(entry=>!searchTrackHistory.includes(entry.slug))||alternatives[0];
        if(nextEntry)result={entry:nextEntry,manifest:await fetchManifest(nextEntry)};
        else throw new Error('No other playable track by this artist is currently available.');
      }else{
        result=await resolveSearchArtist(currentSearchContext,{excludeReleaseId:currentSearchContext.releaseId});
        currentSearchContext={...currentSearchContext,...result.search};
      }
    }else result=await resolveDiscovery();
    await delay(reducedMotion.matches?0:260);
    populatePlayer(result.entry,result.manifest,{trackOverride});
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
    fetch(`${base}/aquariums.json`,{cache:'no-store'}),fetch(`${base}/artist-search-index.json`,{cache:'no-store'}).catch(()=>null),fetch(`${base}/universe-stats.json`,{cache:'no-store'}).catch(()=>null),
  ]);
  if(!catalogueResponse.ok) throw new Error('The Cosmic Aquaria library could not be opened.');
  catalogue=(await catalogueResponse.json()).aquariums || [];
  if(artistsResponse?.ok){const data=await artistsResponse.json();artists=data.artists||[];artistsById=new Map(artists.map(artist=>[artist.id,artist]));}
  if(statsResponse?.ok)universeStats=await statsResponse.json();
  const params=new URLSearchParams(location.search);
  const searchBand=params.get('searchBand');
  const searchUrl=params.get('searchUrl');
  if(/^\d+$/.test(searchBand||'')&&validBandcampUrl(searchUrl)){
    const searched={source:'bandcamp',bandId:searchBand,bandcampArtistUrl:searchUrl,artistName:'Bandcamp artist'};
    const result=await resolveSearchArtist(searched,{preferredReleaseId:params.get('searchRelease')||'',preferredReleaseType:params.get('searchType')||''});
    playerDiscoveryMode='search';currentSearchContext={...searched,...result.search};searchTrackHistory=[];
    const preferredTrack=(result.manifest.tracks||[]).find(track=>String(track.bandcampEmbedTrackId)===params.get('track'))||null;
    populatePlayer(result.entry,result.manifest,{trackOverride:preferredTrack});showPlayer({push:false});history.replaceState({view:'player'},'',playerUrl(result.entry));return;
  }
  const requestedSelection=normalizeSelection((params.get('categories')||'').split(',').filter(Boolean));
  // A normal homepage entry is always pristine. Only an explicit deep link may
  // arrive with a category selection; session state is retained solely while
  // the listener remains in the active Player flow.
  updateSelection(requestedSelection,false);
  const requested=params.get('release');
  if(requested){
    const entry=catalogue.find(item=>item.slug===requested&&item.status==='published');
    if(entry){
      const searchedArtist=params.get('searchArtist');
      if(searchedArtist&&searchedArtist===entry.canonicalArtistId){playerDiscoveryMode='search';currentSearchContext={source:'library',artistId:searchedArtist,artistName:entry.artist,bandcampArtistUrl:entry.canonicalBandcampUrl||entry.bandcampUrl};}
      else {if(!selected.size)selected=new Set(entry.waters?.length?entry.waters:['anything']);updateSelection(selected,false);}
      const result=await resolveDiscovery(entry);populatePlayer(result.entry,result.manifest);showPlayer({push:false});history.replaceState({view:'player'},'',playerUrl(result.entry));return;
    }
  }
  clearArtistSearch();
  history.replaceState({view:'selection'},'',`${base.replace(/\/$/,'')}/`);
}

async function restoreLocation() {
  const params=new URLSearchParams(location.search);
  const searchBand=params.get('searchBand');
  const searchUrl=params.get('searchUrl');
  if(/^\d+$/.test(searchBand||'')&&validBandcampUrl(searchUrl)){
    try{
      const searched={source:'bandcamp',bandId:searchBand,bandcampArtistUrl:searchUrl,artistName:'Bandcamp artist'};
      const result=await resolveSearchArtist(searched,{preferredReleaseId:params.get('searchRelease')||'',preferredReleaseType:params.get('searchType')||''});
      playerDiscoveryMode='search';currentSearchContext={...searched,...result.search};searchTrackHistory=[];
      const preferredTrack=(result.manifest.tracks||[]).find(track=>String(track.bandcampEmbedTrackId)===params.get('track'))||null;
      populatePlayer(result.entry,result.manifest,{trackOverride:preferredTrack});showPlayer({push:false});return;
    }catch{showSelection({historyMode:'replace'});return;}
  }
  const slug=params.get('release');
  if(!slug){showSelection({historyMode:'none'});return;}
  const entry=catalogue.find(item=>item.slug===slug&&item.status==='published');
  if(!entry){showSelection({historyMode:'replace'});return;}
  const requestedSelection=normalizeSelection((params.get('categories')||'').split(',').filter(Boolean));
  const searchedArtist=params.get('searchArtist');
  if(searchedArtist&&searchedArtist===entry.canonicalArtistId){playerDiscoveryMode='search';currentSearchContext={source:'library',artistId:searchedArtist,artistName:entry.artist,bandcampArtistUrl:entry.canonicalBandcampUrl||entry.bandcampUrl};selected=new Set();}
  else {playerDiscoveryMode='genre';currentSearchContext=null;selected=new Set(requestedSelection.length?requestedSelection:(entry.waters?.length?entry.waters:['anything']));updateSelection(selected,false);}
  try{const manifest=await fetchManifest(entry);populatePlayer(entry,manifest);showPlayer({push:false});}
  catch{showSelection({historyMode:'replace'});}
}

buildVuMeters();
seedCracks();
prepareDirectImpactAudio();
preloadGlassAudio();
updateSoundControls();
document.addEventListener('pointerdown',()=>void activateGlassAudio(),{capture:true,passive:true});
document.addEventListener('keydown',()=>void activateGlassAudio(),{capture:true});
for(const button of categoryButtons) button.addEventListener('click',onCategory);
artistSearchInput.addEventListener('input',onSearchInput);
artistSearchInput.addEventListener('keydown',onSearchKeydown);
artistSearchInput.addEventListener('focus',()=>{if(searchResults.length)renderSearchResults(searchResults);});
searchClear.addEventListener('click',()=>clearArtistSearch({focus:true}));
document.addEventListener('pointerdown',event=>{if(!artistSearch?.contains(event.target))closeSearchResults();},{passive:true});
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
  if(event.source===bandcampFrame.contentWindow&&event.origin==='https://bandcamp.com'&&event.data==='playerinited'&&!meterPlaybackActive)setMeterPlayback(false,{restart:true});
});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){stopBubbleTube();stopVuMeters();if(audioContext?.state==='running')void audioContext.suspend();}
  else if(playerScreen.classList.contains('is-active')){startBubbleTube();startVuMeters();}
});
reducedMotion.addEventListener?.('change',()=>{if(playerScreen.classList.contains('is-active')){startBubbleTube();startVuMeters();layoutTicker();}});
addEventListener('resize',()=>{if(playerScreen.classList.contains('is-active')){startBubbleTube();layoutTicker();}},{passive:true});

window.CosmicGlassAudio=Object.freeze({
  playGlassBreak,
  setMuted:setGlassAudioMuted,
  activate:activateGlassAudio,
  getState(){return {...updateAudioDebug(),activeNodes:glassAudio.activeNodes.size};},
});

window.CosmicVuMeters=Object.freeze({
  setPlaying:setMeterPlayback,
  getState(){return {playback:meterPlaybackActive?'playing':'idle',source:'procedural-transport-coupled',elapsed:meterPlayElapsed,leftAngle:meterChannels[0].angle,rightAngle:meterChannels[1].angle,leftLevel:meterChannels[0].level,rightLevel:meterChannels[1].level,leftTarget:meterChannels[0].target,rightTarget:meterChannels[1].target,leftVelocity:meterChannels[0].velocity,rightVelocity:meterChannels[1].velocity,category:meterProfile?.category||'anything'};},
});

window.CosmicArtistSearch=Object.freeze({
  clear:clearArtistSearch,
  getState(){return {query:searchQuery,mode:selectorMode,selected:selectedSearchArtist?{...selectedSearchArtist}:null,resultCount:searchResults.length,playerMode:playerDiscoveryMode,context:currentSearchContext?{...currentSearchContext}:null};},
});

recordEvent('session_start','discovery-machine',{product:'two-screen-discovery'});
loadInitialData().catch(error=>{machineStatus.textContent=error.message;goButton.disabled=true;});
