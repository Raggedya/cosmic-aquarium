(()=>{
  'use strict';
  const root=document.querySelector('.collection-aquarium');
  if(!root)return;
  const slug=document.documentElement.dataset.collection||'';
  const base=root.dataset.base||'';
  const field=root.querySelector('.collection-field');
  const portals=root.querySelector('.collection-portals');
  const reveal=root.querySelector('.collection-reveal');
  const status=root.querySelector('[role="status"]');
  const heading=root.querySelector('.collection-title h1');
  const instruction=root.querySelector('.collection-title p');
  const flowers=[base+'/assets/flowers/anemone.png',base+'/assets/flowers/cosmos.png',base+'/assets/flowers/poppy.png'];
  const waters=['heavy','dreamy','quiet','electronic','dark','loud','strange'];
  let collection=null;
  let selected=null;
  let deck=[];
  let deckIndex=0;
  let activeMembers=[];
  const random=()=>{const value=new Uint32Array(1);crypto.getRandomValues(value);return value[0]/0x100000000};
  const shuffle=items=>{const copy=[...items];for(let i=copy.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]]}return copy};
  const eligible=member=>member.displayEnabled!==false&&['verified','high_confidence'].includes(member.verificationStatus)&&member.artistId&&member.aquariumSlug;
  fetch(base+'/collections/'+encodeURIComponent(slug)+'.json',{cache:'no-store'})
    .then(response=>{if(!response.ok)throw new Error('Collection unavailable');return response.json()})
    .then(value=>{
      collection=value;
      const seen=new Set();
      activeMembers=(value.members||[]).filter(member=>eligible(member)&&!seen.has(member.artistId)&&(seen.add(member.artistId)||true));
      if(value.type==='location')showPortals();else showArtists(activeMembers,null);
      status.textContent=value.name+'. A canonical artist world is waiting to be discovered.';
    }).catch(()=>{status.textContent='This collection is not available just now.'});

  function memberWaters(member){return [...new Set([...(member.waters||[]),...(member.styles||[])].map(value=>String(value).toLowerCase()))]}
  function showPortals(){
    field.hidden=true;portals.hidden=false;portals.replaceChildren();
    const choices=[{id:'anywhere',label:String(collection.location?.city||collection.name).split(',')[0],hero:true},...waters.map(id=>({id,label:id.toUpperCase(),hero:false}))];
    for(const choice of choices){
      const available=choice.hero||activeMembers.some(member=>memberWaters(member).includes(choice.id));
      const button=document.createElement('button');button.type='button';button.className='collection-portal '+(choice.hero?'collection-portal-main':'collection-portal-'+choice.id);
      button.dataset.water=choice.id;button.disabled=!available;button.setAttribute('aria-label',choice.hero?`Discover any artist from ${collection.name}`:`Discover a ${choice.label} artist from ${collection.name}`);
      const image=document.createElement('img');image.src=base+'/assets/doorway/world-'+(choice.hero?'anywhere':choice.id)+'.webp';image.alt='';
      const label=document.createElement('span');label.textContent=choice.label;button.append(image,label);button.onclick=()=>enterWater(choice.id);portals.append(button);
    }
    heading.textContent=collection.name;instruction.textContent='TOUCH AN ARTIST';
  }
  function enterWater(water){
    const filtered=water==='anywhere'?activeMembers:activeMembers.filter(member=>memberWaters(member).includes(water));
    if(!filtered.length)return;
    portals.hidden=true;field.hidden=false;
    instruction.textContent=water==='anywhere'?'TOUCH AN ARTIST':water.toUpperCase()+' · TOUCH AN ARTIST';
    showArtists(filtered,water);
  }
  function showArtists(members,water){
    field.replaceChildren();deck=shuffle(members);deckIndex=0;
    const count=Math.min(matchMedia('(max-width:430px)').matches?10:14,deck.length);
    for(let index=0;index<count;index++)field.append(createObject(nextMember(),index));
    status.textContent=water&&water!=='anywhere'?`${collection.name}. Drifting through ${water}.`:`${collection.name}. Touch an unknown artist object.`;
  }
  function nextMember(){if(!deck.length)return null;if(deckIndex>=deck.length){deck=shuffle(deck);deckIndex=0}return deck[deckIndex++]}
  function createObject(member,index){
    const button=document.createElement('button');button.type='button';button.className='collection-object';button.dataset.artistId=member.artistId;button.setAttribute('aria-label','Discover this unknown artist');
    button.style.left=(8+(index*37)%84)+'%';button.style.top=(17+(index*23)%67)+'%';button.style.animationDelay=(-(index*2.7))+'s';button.style.animationDuration=(25+(index%5)*3)+'s';button.style.setProperty('--object-scale',String(.66+(index%4)*.11));
    const image=document.createElement('img');image.src=flowers[index%flowers.length];image.alt='';image.draggable=false;button.append(image);button.onclick=()=>show(member);return button;
  }
  function show(member){selected=member;reveal.querySelector('h2').textContent=member.artistName;reveal.hidden=false;status.textContent='You found '+member.artistName+'. Enter their canonical Aquarium.';navigator.vibrate?.(9)}
  function replaceSelected(){
    if(!selected)return;const object=field.querySelector(`[data-artist-id="${CSS.escape(selected.artistId)}"]`);const replacement=nextMember();
    if(object&&replacement){const index=[...field.children].indexOf(object);object.replaceWith(createObject(replacement,Math.max(0,index)))}
  }
  reveal.querySelector('.collection-release').onclick=()=>{replaceSelected();selected=null;reveal.hidden=true};
  reveal.querySelector('.collection-enter').onclick=()=>{if(!selected)return;const target=new URL(selected.aquariumUrl,location.href);target.searchParams.set('source','collection');target.searchParams.set('parent',base+'/collections/'+slug+'/');location.assign(target.href)};
})();
