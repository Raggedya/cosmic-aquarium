(() => {
  const root = document.querySelector('.universe-doorway');
  if (!root) return;
  const serviceBase = 'https://cosmic-aquaria.andrewharris501.workers.dev';
  const base = root.dataset.base || '/cosmic-aquarium';
  const field = root.querySelector('.doorway-field');
  const status = root.querySelector('[role=status]');
  const bubbles = [...root.querySelectorAll('.doorway-bubble')];
  const sessionKey = 'cosmic-aquaria:session';
  const sessionId = sessionStorage.getItem(sessionKey) || crypto.randomUUID();
  sessionStorage.setItem(sessionKey, sessionId);

  function recordEvent(eventType, details = {}) {
    const body = JSON.stringify({eventType,aquariumId:'universe-doorway',sessionId,...details});
    try {
      if (navigator.sendBeacon) navigator.sendBeacon(serviceBase + '/api/events', new Blob([body],{type:'application/json'}));
      else fetch(serviceBase + '/api/events',{method:'POST',headers:{'content-type':'application/json'},body,keepalive:true});
    } catch {}
  }
  recordEvent('doorway_open');

  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const bodies = bubbles.map((node,index)=>({node,x:0,y:0,vx:Math.sin(index*2.31)*.032,vy:Math.cos(index*1.73)*.026,phase:index*1.41,radius:node.offsetWidth*.43,cx:0,cy:0,anchor:node.dataset.water==='anywhere'}));
    const measure = () => { bodies.forEach(body=>{body.cx=body.node.offsetLeft;body.cy=body.node.offsetTop;body.radius=body.node.offsetWidth*.43}) };
    measure(); let previous=performance.now();
    const tick = now => { const dt=Math.min(2,Math.max(.5,(now-previous)/16.67));previous=now;bodies.forEach((body,index)=>{const spring=body.anchor?.0015:.0005,amplitude=body.anchor?.0011:.0032;body.vx+=(Math.sin(now*.0003+body.phase)*amplitude-body.x*spring)*dt;body.vy+=(Math.cos(now*.00024+body.phase*1.7)*amplitude-body.y*spring)*dt;body.vx*=Math.pow(.99,dt);body.vy*=Math.pow(.99,dt);const limit=body.anchor?4:14;body.x=Math.max(-limit,Math.min(limit,body.x+body.vx*dt));body.y=Math.max(-limit,Math.min(limit,body.y+body.vy*dt));for(let j=index+1;j<bodies.length;j++){const other=bodies[j],dx=other.cx+other.x-body.cx-body.x,dy=other.cy+other.y-body.cy-body.y,distance=Math.max(1,Math.hypot(dx,dy)),overlap=body.radius+other.radius+3-distance;if(overlap>0){const pressure=Math.min(.012,overlap*.00045),nx=dx/distance,ny=dy/distance;body.vx-=nx*pressure;body.vy-=ny*pressure;other.vx+=nx*pressure;other.vy+=ny*pressure}}body.node.style.setProperty('--drift-x',body.x.toFixed(2)+'px');body.node.style.setProperty('--drift-y',body.y.toFixed(2)+'px')});requestAnimationFrame(tick)};
    requestAnimationFrame(tick); addEventListener('resize',measure,{passive:true});
  }

  bubbles.forEach(button=>button.addEventListener('click',async()=>{
    if(root.classList.contains('is-entering')) return;
    const water=button.dataset.water;
    root.classList.add('is-entering');button.classList.add('is-selected');status.textContent=water==='anywhere'?'Drifting anywhere.':'Entering '+water+' waters.';
    if(navigator.vibrate) navigator.vibrate(9);
    sessionStorage.setItem('cosmic-aquaria:water-scope',water);
    recordEvent(water==='anywhere'?'drift_anywhere_selected':'water_selected',{metadata:{water}});
    let recent=[];try{recent=JSON.parse(sessionStorage.getItem('cosmic-aquaria:recent-aquariums')||'[]')}catch{}
    let destination;
    const params=new URLSearchParams({water,recent:recent.slice(0,8).join(',')});
    const response=await fetch(serviceBase+'/api/aquariums/random?'+params,{cache:'no-store'}).catch(()=>null);
    if(response?.ok) destination=await response.json();
    if(!destination){const catalogueResponse=await fetch(base+'/aquariums.json',{cache:'no-store'}).catch(()=>null);if(catalogueResponse?.ok){const entries=(await catalogueResponse.json()).aquariums||[];const eligible=entries.filter(item=>item.status==='published'&&item.slug&&!recent.includes(item.slug)&&(water==='anywhere'||item.waters?.includes(water)));const fallback=eligible.length?eligible:entries.filter(item=>item.status==='published'&&item.slug&&!recent.includes(item.slug));if(fallback.length)destination=fallback[Math.floor(crypto.getRandomValues(new Uint32Array(1))[0]/4294967296*fallback.length)]}}
    if(!destination){root.classList.remove('is-entering');button.classList.remove('is-selected');status.textContent='The water is still. Please touch another world.';return}
    const destinationId=destination.id||destination.slug;sessionStorage.setItem('cosmic-aquaria:recent-aquariums',JSON.stringify([destination.slug,...recent].filter((v,i,a)=>a.indexOf(v)===i).slice(0,8)));recordEvent('random_destination_selected',{destinationAquariumId:destinationId,metadata:{water}});recordEvent('doorway_to_aquarium_transition',{destinationAquariumId:destinationId,metadata:{water}});
    const target=new URL(destination.aquarium_url||destination.url||location.origin+base+'/'+encodeURIComponent(destination.slug)+'/');target.searchParams.set('water',water);target.searchParams.set('source','doorway');setTimeout(()=>location.assign(target.href),260);
  }));
})();
