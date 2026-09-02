(()=>{
  'use strict';
  const root=document.querySelector('.collection-aquarium');
  if(!root)return;
  const slug=document.documentElement.dataset.collection||'';
  const base=root.dataset.base||'';
  const field=root.querySelector('.collection-field');
  const reveal=root.querySelector('.collection-reveal');
  const status=root.querySelector('[role="status"]');
  const flowers=[base+'/assets/flowers/anemone.png',base+'/assets/flowers/cosmos.png',base+'/assets/flowers/poppy.png'];
  let selected=null;
  const random=()=>{const value=new Uint32Array(1);crypto.getRandomValues(value);return value[0]/0x100000000};
  const shuffle=items=>{const copy=[...items];for(let i=copy.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]]}return copy};
  fetch(base+'/collections/'+encodeURIComponent(slug)+'.json',{cache:'no-store'})
    .then(response=>{if(!response.ok)throw new Error('Collection unavailable');return response.json()})
    .then(collection=>{
      const seen=new Set();
      const members=collection.members.filter(member=>member.displayEnabled!==false&&['verified','high_confidence'].includes(member.verificationStatus)&&member.artistId&&member.aquariumSlug&&!seen.has(member.artistId)&&(seen.add(member.artistId)||true));
      const count=matchMedia('(max-width:430px)').matches?10:14;
      shuffle(members).slice(0,count).forEach((member,index)=>{
        const button=document.createElement('button');button.type='button';button.className='collection-object';button.setAttribute('aria-label','Discover this unknown artist');
        button.style.left=(10+(index*37)%80)+'%';button.style.top=(18+(index*23)%64)+'%';button.style.animationDelay=(-(index*2.7))+'s';button.style.animationDuration=(24+(index%5)*3)+'s';button.style.transform='scale('+(0.66+(index%4)*.11)+')';
        const image=document.createElement('img');image.src=flowers[index%flowers.length];image.alt='';image.draggable=false;button.append(image);button.onclick=()=>show(member);field.append(button);
      });
      status.textContent=collection.name+'. '+members.length+' artists are waiting to be discovered.';
    }).catch(()=>{status.textContent='This collection is not available just now.'});
  function show(member){selected=member;reveal.querySelector('h2').textContent=member.artistName;reveal.hidden=false;status.textContent='You found '+member.artistName+'. Enter their Aquarium.';navigator.vibrate?.(9)}
  reveal.querySelector('.collection-release').onclick=()=>{selected=null;reveal.hidden=true};
  reveal.querySelector('.collection-enter').onclick=()=>{if(!selected)return;const target=new URL(selected.aquariumUrl,location.href);target.searchParams.set('source','collection');target.searchParams.set('parent',base+'/collections/'+slug+'/');location.assign(target.href)};
})();
