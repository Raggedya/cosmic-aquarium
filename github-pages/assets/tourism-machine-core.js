export const TOURISM_STATES=Object.freeze(['READY','LEVER_PULLED','SPINNING','DECELERATION','RESULT']);
export const TOURISM_CATEGORIES=Object.freeze(['SEE','DO','EAT','DRINK','SHOP','NATURE','HISTORY','WEIRD','DAY_TRIP']);

export function secureRandomIndex(length,cryptoApi=globalThis.crypto){
  if(!Number.isInteger(length)||length<=0)return -1;
  if(cryptoApi?.getRandomValues){
    const ceiling=0x100000000-(0x100000000%length),value=new Uint32Array(1);
    do cryptoApi.getRandomValues(value);while(value[0]>=ceiling);
    return value[0]%length;
  }
  return Math.floor(Math.random()*length);
}

export function chooseTourismDiscovery(items,recentIds=[],cryptoApi=globalThis.crypto){
  const valid=validateDiscoveries(items),recent=new Set(recentIds.map(String));
  const fresh=valid.filter(item=>!recent.has(item.id)),pool=fresh.length?fresh:valid;
  return pool[secureRandomIndex(pool.length,cryptoApi)]||null;
}

export function pushTourismHistory(history,id,limit=5){
  return [id,...history].filter((value,index,all)=>value&&all.indexOf(value)===index).slice(0,limit);
}

export function reelWindow(items,centreId,size=5){
  const valid=validateDiscoveries(items);
  if(!valid.length)return [];
  const centre=Math.max(0,valid.findIndex(item=>item.id===centreId));
  const radius=Math.floor(size/2),output=[];
  for(let offset=-radius;offset<=radius;offset++)output.push(valid[(centre+offset+valid.length)%valid.length]);
  return output;
}

export function validateDiscoveries(value){
  if(!Array.isArray(value))return [];
  const seen=new Set();
  return value.filter(item=>{
    const valid=Boolean(item&&typeof item.id==='string'&&item.id.trim()&&typeof item.name==='string'&&item.name.trim()&&TOURISM_CATEGORIES.includes(item.category));
    if(!valid||seen.has(item.id))return false;
    seen.add(item.id);return true;
  });
}

export function validateTourismConfig(value){
  if(!value||value.schemaVersion!==1||!value.destination?.name||!value.destination?.machineTitle)throw new Error('Invalid tourism destination configuration.');
  const discoveries=validateDiscoveries(value.discoveries);
  if(!discoveries.length)throw new Error('The tourism machine needs at least one valid discovery.');
  return {...value,discoveries,tickerFacts:Array.isArray(value.tickerFacts)?value.tickerFacts.filter(item=>typeof item==='string'&&item.trim()):[]};
}

export function fitDiscoveryName(name){
  const length=String(name||'').trim().length;
  return length>31?'long':length>22?'medium':'short';
}
