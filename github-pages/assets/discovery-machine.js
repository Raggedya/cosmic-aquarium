import {
  CRACK_VARIANTS, GO_HOLD_MS, DESTRUCTION_MS, SESSION_HISTORY_LIMIT,
  nextSelection, normalizeSelection, chooseRelease, pushHistory, buildShareUrl,
  buildTickerFacts, validBandcampUrl, pickPlayableTrack,
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
const canvas = document.querySelector('.destruction-canvas');
const context = canvas?.getContext('2d');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const workerBase = 'https://cosmic-aquaria.andrewharris501.workers.dev';
const historyKey = 'cosmic-aquaria:discovery-history';
const selectionKey = 'cosmic-aquaria:category-selection';
const sessionKey = 'cosmic-aquaria:analytics-session';

let catalogue = [];
let artistsById = new Map();
let selected = new Set();
let currentEntry = null;
let currentManifest = null;
let currentTrack = null;
let isLocked = false;
let lastImpactAt = 0;
let audioContext = null;

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

function ensureAudioContext() {
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === 'suspended') void audioContext.resume();
  return audioContext;
}

function impactSound(restoring = false) {
  const now = performance.now();
  if (now - lastImpactAt < 42) return;
  lastImpactAt = now;
  try {
    const audio = ensureAudioContext();
    const start = audio.currentTime;
    const master = audio.createGain();
    master.gain.setValueAtTime(restoring ? .08 : .13,start);
    master.gain.exponentialRampToValueAtTime(.001,start + (restoring ? .12 : .24));
    master.connect(audio.destination);

    const snap = audio.createOscillator();
    const snapGain = audio.createGain();
    snap.type = 'triangle';
    snap.frequency.setValueAtTime(restoring ? 520 : 165,start);
    snap.frequency.exponentialRampToValueAtTime(restoring ? 1050 : 68,start + .065);
    snapGain.gain.setValueAtTime(.55,start);
    snapGain.gain.exponentialRampToValueAtTime(.001,start + .085);
    snap.connect(snapGain).connect(master);
    snap.start(start); snap.stop(start + .09);

    const frames = Math.floor(audio.sampleRate * .22);
    const buffer = audio.createBuffer(1,frames,audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index=0;index<frames;index++) data[index] = (Math.random()*2-1) * Math.pow(1-index/frames,restoring?4:2.2);
    const debris = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    filter.type='highpass'; filter.frequency.value = restoring ? 1900 : 950;
    debris.buffer=buffer; debris.connect(filter).connect(master); debris.start(start); debris.stop(start+.22);
  } catch {}
  if (navigator.vibrate) navigator.vibrate(restoring ? 5 : 13);
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
  ensureAudioContext();
  const category = event.currentTarget.dataset.category;
  const wasSelected = selected.has(category);
  updateSelection(nextSelection(selected,category));
  impactSound(wasSelected);
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
  const attempted = new Set();
  if (preferred) attempted.add(preferred.slug);
  for (let attempt=0;attempt<8;attempt++) {
    const entry = attempt===0 && preferred ? preferred : chooseRelease(catalogue,[...selected],[...history,...attempted]);
    if (!entry) break;
    attempted.add(entry.slug);
    try { return {entry,manifest:await fetchManifest(entry)}; }
    catch (error) { recordEvent('track_selected',entry.slug,{result:'skipped',reason:String(error?.message||error)}); }
  }
  throw new Error('No playable release is currently available for this selection.');
}

function formatDuration(value) {
  const match = String(value || '').match(/^(\d{1,3}):(\d{2})$/);
  return match ? `${Number(match[1])}:${match[2]}` : '—:—';
}

function setSpectrumSeed(seed) {
  let number = [...String(seed)].reduce((value,char)=>(value*33+char.charCodeAt(0))>>>0,5381);
  const bars = [...document.querySelectorAll('.spectrum i')];
  const midpoint = (bars.length - 1) / 2;
  bars.forEach((bar,index)=>{
    number = (number * 1664525 + 1013904223) >>> 0;
    const centre = 1 - Math.abs(index-midpoint)/(midpoint+.5);
    const height = Math.round(10 + centre*54 + (number%29));
    bar.style.setProperty('--h',`${Math.min(96,height)}%`);
  });
}

function setFittedText(element, value, longAt, veryLongAt) {
  const text = String(value || '');
  element.textContent = text;
  element.classList.toggle('is-long',text.length > longAt);
  element.classList.toggle('is-very-long',text.length > veryLongAt);
}

function populatePlayer(entry, manifest) {
  const track = pickPlayableTrack(manifest);
  if (!track) throw new Error('no_playable_track');
  currentEntry=entry; currentManifest=manifest; currentTrack=track;
  const artistEntry = artistsById.get(entry.canonicalArtistId) || {};
  setFittedText(document.querySelector('#now-playing-heading'),manifest.artist,17,25);
  setFittedText(document.querySelector('.release-title'),manifest.releaseTitle || track.albumTitle || 'BANDCAMP RELEASE',20,32);
  setFittedText(document.querySelector('.track-title'),track.title,20,32);
  document.querySelector('.duration').textContent = formatDuration(track.duration);
  document.querySelector('.ticker-track span').textContent = buildTickerFacts(manifest,entry,artistEntry);
  document.querySelector('.bandcamp-transport iframe').src = `https://bandcamp.com/EmbeddedPlayer/track=${encodeURIComponent(track.bandcampEmbedTrackId)}/size=small/bgcol=001a08/linkcol=67ff7b/tracklist=false/artwork=none/transparent=true/`;
  buyLink.href = validBandcampUrl(manifest.bandcampUrl);
  buyLink.setAttribute('aria-label',`Buy ${manifest.releaseTitle || 'this release'} by ${manifest.artist} on Bandcamp`);
  shareButton.setAttribute('aria-label',`Share ${manifest.releaseTitle || track.title} by ${manifest.artist}`);
  setSpectrumSeed(track.id || track.bandcampEmbedTrackId);
  const history = pushHistory(readJson(historyKey,[]),entry.slug,SESSION_HISTORY_LIMIT);
  sessionStorage.setItem(historyKey,JSON.stringify(history));
  playerStatus.textContent = `Now playing ${track.title}, from ${manifest.releaseTitle}, by ${manifest.artist}.`;
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
  if (push) history.pushState({view:'player'},'',playerUrl());
}

function showSelection({historyMode='push'}={}) {
  isLocked=false;
  goButton.classList.remove('is-broken');
  selectionScreen.classList.add('is-active');
  playerScreen.classList.remove('is-active');
  playerScreen.setAttribute('aria-hidden','true');
  selectionScreen.setAttribute('aria-hidden','false');
  document.querySelector('.bandcamp-transport iframe').src='about:blank';
  currentEntry=currentManifest=currentTrack=null;
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
  isLocked=true; updateSelection(selected,false); goButton.classList.add('is-broken'); impactSound(false);
  machineStatus.textContent='The glass is giving way.';
  recordEvent('doorway_open','discovery-machine',{source:'go_pressed',selection:[...selected]});
  const discovery=resolveDiscovery();
  const [,result]=await Promise.all([delay(GO_HOLD_MS),discovery]).catch(error=>[null,{error}]);
  if(result?.error){isLocked=false;goButton.classList.remove('is-broken');updateSelection(selected,false);machineStatus.textContent=result.error.message;return;}
  populatePlayer(result.entry,result.manifest);
  await disintegrate();
  isLocked=false;
  recordEvent('doorway_to_aquarium_transition',result.entry.slug,{selection:[...selected],transition:'disintegration'});
}

async function onNext() {
  if (isLocked) return;
  isLocked=true; nextButton.disabled=true; playerScreen.classList.add('is-changing'); impactSound(false);
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
  const [catalogueResponse,artistsResponse]=await Promise.all([
    fetch(`${base}/aquariums.json`,{cache:'no-store'}),fetch(`${base}/artists-index.json`,{cache:'no-store'}).catch(()=>null),
  ]);
  if(!catalogueResponse.ok) throw new Error('The Cosmic Aquaria library could not be opened.');
  catalogue=(await catalogueResponse.json()).aquariums || [];
  if(artistsResponse?.ok){const data=await artistsResponse.json();artistsById=new Map((data.artists||[]).map(artist=>[artist.id,artist]));}
  const params=new URLSearchParams(location.search);
  const requestedSelection=normalizeSelection((params.get('categories')||'').split(',').filter(Boolean));
  updateSelection(requestedSelection.length?requestedSelection:readJson(selectionKey,[]),false);
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
for(const button of categoryButtons) button.addEventListener('click',onCategory);
goButton.addEventListener('click',()=>void onGo());
nextButton.addEventListener('click',()=>void onNext());
shareButton.addEventListener('click',()=>void onShare());
buyLink.addEventListener('click',()=>recordEvent('buy_click',currentEntry?.slug,{url:buyLink.href}));
changeButton.addEventListener('click',()=>showSelection());
addEventListener('popstate',()=>void restoreLocation());
document.addEventListener('visibilitychange',()=>{if(document.hidden&&audioContext?.state==='running')void audioContext.suspend();});

recordEvent('session_start','discovery-machine',{product:'two-screen-discovery'});
loadInitialData().catch(error=>{machineStatus.textContent=error.message;goButton.disabled=true;});
