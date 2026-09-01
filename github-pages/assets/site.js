(() => {
  const viewportTimers = new Set();

  function syncVisibleViewport() {
    const viewport = window.visualViewport;
    const visibleHeight = Math.max(window.innerHeight || 0, viewport?.height || 0);
    const visibleTop = Math.max(0, viewport?.offsetTop || 0);
    document.documentElement.style.setProperty('--aquarium-height', Math.ceil(visibleHeight) + 'px');
    document.documentElement.style.setProperty('--viewport-top', Math.round(visibleTop) + 'px');
  }

  function settleVisibleViewport() {
    syncVisibleViewport();
    viewportTimers.forEach(timer => clearTimeout(timer));
    viewportTimers.clear();
    [60, 240, 720, 1500].forEach(delay => {
      const timer = setTimeout(() => {
        syncVisibleViewport();
        viewportTimers.delete(timer);
      }, delay);
      viewportTimers.add(timer);
    });
  }

  settleVisibleViewport();
  window.addEventListener('pageshow', settleVisibleViewport);
  window.addEventListener('resize', settleVisibleViewport, { passive: true });
  window.addEventListener('orientationchange', settleVisibleViewport, { passive: true });
  window.visualViewport?.addEventListener('resize', syncVisibleViewport, { passive: true });
  window.visualViewport?.addEventListener('scroll', syncVisibleViewport, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') settleVisibleViewport();
  });

  const root = document.querySelector('.cosmic-aquarium');
  const slug = document.documentElement.dataset.artist || 'immigrant-union';
  const version = document.documentElement.dataset.version || 'current';
  const base = location.hostname.endsWith('github.io') ? '/cosmic-aquarium' : '';
  const serviceBase = 'https://cosmic-aquaria.andrewharris501.workers.dev';
  const baseSpecies = ['cosmos','anemone','poppy','cosmos','poppy','anemone','anemone','cosmos','poppy','cosmos'];
  const styleSpecies = {
    cosmic: baseSpecies,
    crimson: ['rose','rose','rose','rose','rose','rose','rose','rose','rose','rose'],
    paper: ['cosmos','cosmos','anemone','cosmos','cosmos','anemone','cosmos','anemone','cosmos','cosmos'],
    thorn: ['rose','rose','rose','rose','rose','rose','rose','rose','rose','rose'],
    violet: ['anemone','cosmos','anemone','cosmos','anemone','cosmos','anemone','cosmos','anemone','cosmos'],
    neon: ['cosmos','anemone','cosmos','anemone','cosmos','anemone','cosmos','anemone','cosmos','anemone'],
    desert: ['poppy','cosmos','poppy','poppy','cosmos','poppy','poppy','cosmos','poppy','poppy']
  };
  const depths = ['near','far','mid','near','near','far','mid','foreground','far','mid'];
  const positions = [
    [13,30,118,24,-9,34,-42],[78,19,66,31,-18,-49,29],[83,43,98,27,-4,-72,24],
    [20,61,132,35,-24,43,-28],[88,79,108,23,-12,-38,-52],[8,84,74,38,-29,64,-19],
    [52,38,158,33,-20,-27,39],[-5,48,210,42,-15,44,18],[57,73,55,29,-22,30,-55],
    [48,91,96,26,-8,58,-37]
  ];
  let manifest;
  let selectedButton;
  let trackDeck = [];
  const field = root.querySelector('.creature-field');
  const player = root.querySelector('.living-player');
  const status = root.querySelector('[role="status"]');
  const titlePrompt = document.querySelector('.cosmic-title p');
  const shareAction = root.querySelector('.aquarium-action--share');
  const buyAction = root.querySelector('.aquarium-action--buy');
  const exploreAction = root.querySelector('.aquarium-action--explore');
  const analyticsSession = sessionId();

  player.querySelector('.player-membrane').addEventListener('animationstart',event => {
    if (event.animationName !== 'player-flower-drift-away') return;
    titlePrompt.textContent = 'TOUCH SOMETHING.';
    announce('Touch another flower.');
  });

  fetch(base + '/artists/' + encodeURIComponent(slug) + '.json?v=' + encodeURIComponent(version), { cache: 'no-store' })
    .then(response => {
      if (!response.ok) throw new Error('Artist manifest unavailable');
      return response.json();
    })
    .then(data => {
      manifest = data;
      root.dataset.theme = styleSpecies[data.visualStyle] ? data.visualStyle : 'cosmic';
      document.querySelector('.cosmic-title h1').textContent = data.artist.toUpperCase();
      document.title = 'Cosmic Aquaria — ' + data.artist;
      configureBuyAction(data);
      renderCreatures();
  recordEvent('session_start');
  recordEvent('aquarium_open');
  if (new URLSearchParams(location.search).get('source') === 'daily-email') recordEvent('email_link_click');
      announce(data.artist + '. The flower garden is awake.');
    })
    .catch(() => announce('This Cosmic Aquaria edition is not available yet.'));

  function renderCreatures() {
    field.replaceChildren();
    positions.forEach((values,index) => {
      const [x,y,size,duration,delay,travelX,travelY] = values;
      const species = (styleSpecies[root.dataset.theme] || baseSpecies)[index];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'creature creature--' + species + ' depth--' + depths[index];
      button.setAttribute('aria-label','Catch this unknown song flower');
      button.style.cssText = '--x:'+x+'%;--y:'+y+'%;--size:'+size+'px;--duration:'+duration+'s;--delay:'+delay+'s;--travel-x:'+travelX+'px;--travel-y:'+travelY+'px;--hue:'+(190+index*16)+';--i:'+index;
      button.innerHTML = '<span class="creature-hitbox" aria-hidden="true"></span><img src="'+base+'/assets/flowers/'+species+'.png" alt="" draggable="false">';
      button.addEventListener('pointerdown',event => {
        event.preventDefault();
        catchFlower(button,index,event.clientX,event.clientY);
      });
      button.addEventListener('click',event => {
        if (event.detail === 0) catchFlower(button,index,x,y);
      });
      field.append(button);
    });
  }

  function safeBandcampUrl(value) {
    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase();
      return url.protocol === 'https:' && (host === 'bandcamp.com' || host.endsWith('.bandcamp.com')) ? url.href : null;
    } catch {
      return null;
    }
  }

  function configureBuyAction(data) {
    const destination = data.commerceAvailable === true ? safeBandcampUrl(data.commerceUrl) : null;
    if (!destination) return;
    buyAction.href = destination;
    buyAction.setAttribute('aria-label','Buy music or merchandise from ' + data.artist + ' on Bandcamp');
    buyAction.hidden = false;
  }

  function readStoredIds(key) {
    try {
      const stored = JSON.parse(sessionStorage.getItem(key) || '[]');
      return Array.isArray(stored) ? stored.filter(id => typeof id === 'string') : [];
    } catch {
      return [];
    }
  }

  function sessionId() {
    const key = 'cosmic-aquaria:session';
    try {
      const existing = sessionStorage.getItem(key);
      if (existing) return existing;
      const created = globalThis.crypto?.randomUUID?.() || ('session-' + Date.now() + '-' + Math.random().toString(16).slice(2));
      sessionStorage.setItem(key,created);
      return created;
    } catch { return 'session-' + Date.now(); }
  }

  function recordEvent(eventType, details = {}) {
    const payload = JSON.stringify({eventType,aquariumId:slug,batchId:manifest?.dailyBatchId||null,sessionId:analyticsSession,...details});
    try {
      if (navigator.sendBeacon) navigator.sendBeacon(serviceBase + '/api/events',new Blob([payload],{type:'application/json'}));
      else fetch(serviceBase + '/api/events',{method:'POST',headers:{'content-type':'application/json'},body:payload,keepalive:true}).catch(()=>{});
    } catch {}
  }

  function randomUnit() {
    if (globalThis.crypto?.getRandomValues) {
      const value = new Uint32Array(1);
      globalThis.crypto.getRandomValues(value);
      return value[0] / 0x100000000;
    }
    return Math.random();
  }

  function shuffle(ids) {
    const shuffled = [...new Set(ids.filter(Boolean))];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(randomUnit() * (index + 1));
      [shuffled[index],shuffled[swapIndex]] = [shuffled[swapIndex],shuffled[index]];
    }
    return shuffled;
  }

  function refillTrackDeck() {
    const allIds = [...new Set(manifest.tracks.map(track => track.id).filter(Boolean))];
    const recent = readStoredIds('cosmic-aquaria:recent-tracks:' + slug).filter(id => allIds.includes(id));
    const recentSet = new Set(recent);
    trackDeck = [
      ...shuffle(allIds.filter(id => !recentSet.has(id))),
      ...shuffle(allIds.filter(id => recentSet.has(id)))
    ];
    if (trackDeck.length > 1 && trackDeck[0] === recent[0]) {
      const alternativeIndex = trackDeck.findIndex(id => id !== recent[0]);
      if (alternativeIndex > 0) [trackDeck[0],trackDeck[alternativeIndex]] = [trackDeck[alternativeIndex],trackDeck[0]];
    }
  }

  function nextShuffledTrack() {
    const deckKey = 'cosmic-aquaria:track-deck:' + slug;
    const validIds = new Set(manifest.tracks.map(track => track.id));
    if (!trackDeck.length) trackDeck = readStoredIds(deckKey).filter(id => validIds.has(id));
    if (!trackDeck.length) refillTrackDeck();
    const trackId = trackDeck.shift();
    try { sessionStorage.setItem(deckKey, JSON.stringify(trackDeck)); } catch {}
    return manifest.tracks.find(track => track.id === trackId) || null;
  }

  function rememberTrack(trackId) {
    const key = 'cosmic-aquaria:recent-tracks:' + slug;
    try {
      const prior = readStoredIds(key);
      sessionStorage.setItem(key, JSON.stringify([trackId,...prior.filter(id => id !== trackId)].slice(0,12)));
    } catch {}
  }

  function catchFlower(button,index,clientX,clientY) {
    if (!manifest || !manifest.tracks || !manifest.tracks.length) return;
    const track = nextShuffledTrack();
    if (!track) return;
    recordEvent('object_touch',{trackId:track.id});
    if (navigator.vibrate) navigator.vibrate(10);
    root.style.setProperty('--touch-x',(clientX / innerWidth * 100)+'%');
    root.style.setProperty('--touch-y',(clientY / innerHeight * 100)+'%');
    root.classList.add('is-capturing');
    button.classList.add('is-touched');
    announce('Flower caught. Its light is reorganising.');
    setTimeout(() => {
      root.classList.remove('is-capturing');
      button.classList.remove('is-touched');
      openTrack(button,track);
    },430);
  }

  function openTrack(button,track) {
    selectedButton?.classList.remove('is-selected');
    selectedButton = button;
    button.classList.add('is-selected');
    root.classList.add('has-player');
    player.hidden = false;
    player.classList.remove('is-active');
    void player.offsetHeight;
    player.classList.add('is-active');
    titlePrompt.textContent = 'A SONG FOUND IN THE DARK';
    root.style.setProperty('--player-accent',track.accent || '#b9a7ff');
    player.querySelector('.player-membrane').src = button.querySelector('img').src;
    player.querySelector('.player-copy p').textContent = [track.albumTitle,track.year].filter(Boolean).join(' · ');
    player.querySelector('.player-copy h2').textContent = track.title || 'Discover on Bandcamp';
    player.querySelector('.player-copy span').textContent = track.artist || manifest.artist;
    player.querySelector('.organic-progress b').textContent = track.duration || '';
    const iframe = player.querySelector('iframe');
    const stream = player.querySelector('.bandcamp-stream');
    const unavailable = player.querySelector('.stream-unavailable');
    if (/^\d+$/.test(track.bandcampEmbedTrackId || '')) {
      iframe.src = 'https://bandcamp.com/EmbeddedPlayer/track='+encodeURIComponent(track.bandcampEmbedTrackId)+'/size=small/bgcol=07101f/linkcol=b9a7ff/tracklist=false/artwork=none/transparent=true/';
      stream.hidden = false;
      unavailable.hidden = true;
    } else {
      iframe.removeAttribute('src');
      stream.hidden = true;
      unavailable.hidden = false;
    }
    player.querySelector('.bandcamp-link').href = track.bandcampUrl || manifest.bandcampUrl;
    rememberTrack(track.id);
    recordEvent('track_selected',{trackId:track.id});
    announce((track.title || 'A song') + ' by ' + (track.artist || manifest.artist) + '.');
    if (navigator.vibrate) navigator.vibrate([8,34,12]);
  }

  player.querySelector('.release-current').addEventListener('click',() => {
    player.hidden = true;
    player.classList.remove('is-active');
    root.classList.remove('has-player');
    selectedButton?.classList.remove('is-selected');
    selectedButton = null;
    titlePrompt.textContent = 'TOUCH SOMETHING.';
    announce('The song returned to the aquarium. Touch another flower.');
    if (navigator.vibrate) navigator.vibrate(7);
  });

  addEventListener('keydown',event => {
    if (event.key === 'Escape' && !player.hidden) player.querySelector('.release-current').click();
  });

  shareAction.addEventListener('click',async () => {
    recordEvent('share_click');
    const shareData = {title:'Cosmic Aquaria — ' + (manifest?.artist || slug),text:'Enter this Cosmic Aquaria music discovery.',url:location.href};
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        recordEvent('share_complete');
        announce('Aquarium shared.');
      } else {
        await navigator.clipboard.writeText(location.href);
        recordEvent('share_copy');
        announce('Aquarium link copied.');
      }
    } catch (error) {
      if (error?.name !== 'AbortError') announce('Sharing is unavailable on this device.');
    }
  });

  exploreAction.addEventListener('click',async () => {
    exploreAction.disabled = true;
    recordEvent('explore_click');
    try {
      const recentKey = 'cosmic-aquaria:recent-aquariums';
      const recent = readStoredIds(recentKey);
      let destination;
      const serviceResponse = await fetch(serviceBase + '/api/aquariums/random?exclude=' + encodeURIComponent(slug) + '&recent=' + encodeURIComponent(recent.join(',')),{cache:'no-store'}).catch(()=>null);
      if (serviceResponse?.ok) destination = await serviceResponse.json();
      if (!destination) {
        const response = await fetch(base + '/aquariums.json', {cache:'no-store'});
        if (!response.ok) throw new Error('Aquarium registry unavailable');
        const entries = (await response.json()).aquariums || [];
        const eligible = entries.filter(entry => entry.status === 'published' && entry.slug !== slug && !recent.includes(entry.slug));
        const pool = eligible.length ? eligible : entries.filter(entry => entry.status === 'published' && entry.slug !== slug);
        if (!pool.length) throw new Error('No other Aquarium is available');
        destination = pool[Math.floor(randomUnit() * pool.length)];
      }
      try { sessionStorage.setItem(recentKey,JSON.stringify([slug,destination.slug,...recent].filter((value,index,array)=>array.indexOf(value)===index).slice(0,6))); } catch {}
      recordEvent('aquarium_transition',{sourceAquariumId:slug,destinationAquariumId:destination.id||destination.slug});
      location.assign(destination.url||destination.aquarium_url);
    } catch {
      exploreAction.disabled = false;
      announce('Another Aquarium is not available just now.');
    }
  });

  buyAction.addEventListener('click',() => recordEvent('buy_click'));

  function announce(message) { status.textContent = message; }
})();
