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
  const field = root.querySelector('.creature-field');
  const player = root.querySelector('.living-player');
  const status = root.querySelector('[role="status"]');
  const titlePrompt = document.querySelector('.cosmic-title p');

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
      renderCreatures();
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

  function catchFlower(button,index,clientX,clientY) {
    if (!manifest || !manifest.tracks || !manifest.tracks.length) return;
    if (navigator.vibrate) navigator.vibrate(10);
    root.style.setProperty('--touch-x',(clientX / innerWidth * 100)+'%');
    root.style.setProperty('--touch-y',(clientY / innerHeight * 100)+'%');
    root.classList.add('is-capturing');
    button.classList.add('is-touched');
    announce('Flower caught. Its light is reorganising.');
    setTimeout(() => {
      root.classList.remove('is-capturing');
      button.classList.remove('is-touched');
      openTrack(button,manifest.tracks[(index * 7) % manifest.tracks.length]);
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

  function announce(message) { status.textContent = message; }
})();
