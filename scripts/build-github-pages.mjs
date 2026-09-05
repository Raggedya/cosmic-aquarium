import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { classifyWaters, validWaters } from './water-classifier.mjs';

const root = path.resolve(import.meta.dirname,'..');
const pages = path.join(root,'github-pages');
const template = await fs.readFile(path.join(root,'templates','artist-index.html'),'utf8');
const universeTemplate = await fs.readFile(path.join(root,'templates','universe-index.html'),'utf8');
const collectionTemplate = await fs.readFile(path.join(root,'templates','collection-index.html'),'utf8');
const css = await fs.readFile(path.join(root,'app','cosmic-aquarium.css'),'utf8');
const doorwayCss = await fs.readFile(path.join(root,'app','doorway.css'),'utf8');
const collectionCss = await fs.readFile(path.join(root,'app','collection-aquarium.css'),'utf8');
const discoveryCss = await fs.readFile(path.join(root,'app','discovery-machine.css'),'utf8');
const staticScript = await fs.readFile(path.join(pages,'assets','site.js'),'utf8');
const doorwayScript = await fs.readFile(path.join(pages,'assets','doorway.js'),'utf8');
const collectionScript = await fs.readFile(path.join(pages,'assets','collection.js'),'utf8');
const discoveryScript = await fs.readFile(path.join(pages,'assets','discovery-machine.js'),'utf8');
const discoveryCore = await fs.readFile(path.join(pages,'assets','discovery-machine-core.js'),'utf8');
const doorwayAssetNames = ['cosmic-depth.webp','botanical-crown.webp','botanical-garden.webp','world-anywhere.webp','world-heavy.webp','world-dreamy.webp','world-electronic.webp','world-quiet.webp','world-loud.webp','world-dark.webp','world-strange.webp'];
const doorwayAssets = await Promise.all(doorwayAssetNames.map((name) => fs.readFile(path.join(root,'public','doorway',name))));
const discoveryFidelityAssetNames = [
  'selector-chassis.webp','player-chassis-clean.webp','player-chassis-concise-actions-v3.webp',
  'selector-heavy.webp','selector-dreamy.webp','selector-quiet.webp','selector-electronic.webp',
  'selector-dark.webp','selector-loud.webp','selector-strange.webp','selector-anything.webp',
  'selector-dark-broken.webp','selector-bandcamp.webp','selector-go.webp','selector-go-broken.webp',
  'selector-break-heavy.webp','selector-break-dreamy.webp','selector-break-quiet.webp','selector-break-electronic.webp',
  'selector-break-dark.webp','selector-break-loud.webp','selector-break-strange.webp','selector-break-anything.webp',
  'selector-selected-heavy.webp','selector-selected-dreamy.webp','selector-selected-quiet.webp','selector-selected-electronic.webp',
  'selector-selected-dark.webp','selector-selected-loud.webp','selector-selected-strange.webp','selector-selected-anything.webp',
  'player-ticker-shell.webp','player-main-frame.webp','player-share.webp','player-share-blank.webp','player-buy.webp','player-next.webp','player-next-blank.webp','player-footer.webp',
];
const discoveryFidelityAssets = await Promise.all(discoveryFidelityAssetNames.map((name) => fs.readFile(path.join(root,'public','discovery-fidelity',name))));
const glassAudioSourceNames = [
  'glass-plate-crunching.mp3','glass-plate-crunching.ogg',
  'glass-debris-014.mp3','glass-debris-014.ogg',
  'picture-frame-shards.mp3','picture-frame-shards.ogg',
  'glass-shards-moved-07.mp3','glass-shards-moved-07.ogg',
  'metadata.json','LICENSE.md',
];
const glassAudioAssets = await Promise.all(glassAudioSourceNames.map((name) => fs.readFile(path.join(root,'public','audio','glass','source',name))));
const minimumFlowerCount = 10;
const maximumFlowerCount = 14;
const assetHash = createHash('sha256').update(css).update(staticScript).update(doorwayCss).update(doorwayScript).update(collectionCss).update(collectionScript).update(discoveryCss).update(discoveryScript).update(discoveryCore);
doorwayAssets.forEach((asset) => assetHash.update(asset));
discoveryFidelityAssets.forEach((asset) => assetHash.update(asset));
glassAudioAssets.forEach((asset) => assetHash.update(asset));
const assetVersion = assetHash.digest('hex').slice(0,12);
const reset = `*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#001807}body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.visually-hidden{position:fixed;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}button,a{font:inherit}button:focus-visible,a:focus-visible{outline:2px solid #c8b9ff;outline-offset:4px}\n`;
await fs.mkdir(path.join(pages,'assets','flowers'),{recursive:true});
await fs.mkdir(path.join(pages,'assets','skulls'),{recursive:true});
await fs.mkdir(path.join(pages,'assets','glass'),{recursive:true});
await fs.mkdir(path.join(pages,'assets','doorway'),{recursive:true});
await fs.mkdir(path.join(pages,'assets','discovery-fidelity'),{recursive:true});
await fs.mkdir(path.join(pages,'assets','audio','glass','source'),{recursive:true});
await fs.mkdir(path.join(pages,'artists'),{recursive:true});
await fs.mkdir(path.join(pages,'collections'),{recursive:true});
await fs.writeFile(path.join(pages,'assets','site.css'),reset+css);
await fs.writeFile(path.join(pages,'assets','doorway.css'),reset+doorwayCss);
await fs.writeFile(path.join(pages,'assets','collection.css'),reset+collectionCss);
await fs.writeFile(path.join(pages,'assets','discovery-machine.css'),reset+discoveryCss);
for (const name of ['cosmos.png','poppy.png','anemone.png','rose.png','thorn.png']) {
  await fs.copyFile(path.join(root,'public','flowers',name),path.join(pages,'assets','flowers',name));
}
await fs.copyFile(path.join(root,'public','skulls','chrome-skull-silver.png'),path.join(pages,'assets','skulls','chrome-skull-silver.png'));
await fs.copyFile(path.join(root,'public','glass','crystal-flower.png'),path.join(pages,'assets','glass','crystal-flower.png'));
for (const name of doorwayAssetNames) {
  await fs.copyFile(path.join(root,'public','doorway',name),path.join(pages,'assets','doorway',name));
}
for (const name of discoveryFidelityAssetNames) {
  await fs.copyFile(path.join(root,'public','discovery-fidelity',name),path.join(pages,'assets','discovery-fidelity',name));
}
for (const name of glassAudioSourceNames) {
  await fs.copyFile(path.join(root,'public','audio','glass','source',name),path.join(pages,'assets','audio','glass','source',name));
}
await fs.copyFile(path.join(root,'public','discovery.webmanifest'),path.join(pages,'discovery.webmanifest'));
for (const name of ['cosmic-aquaria-qr-standard.png','cosmic-aquaria-qr-branded.png']) {
  try { await fs.copyFile(path.join(root,'public',name),path.join(pages,name)); } catch {}
}
const artistManifestFiles = (await fs.readdir(path.join(pages,'artists')))
  .filter((name) => name.endsWith('.json'))
  .sort();
const aquariumRegistry=[];
const canonicalCandidates=new Map();
for (const filename of artistManifestFiles) {
  try {
    const artistManifest = JSON.parse(await fs.readFile(path.join(pages,'artists',filename),'utf8'));
    if (artistManifest.slug && artistManifest.artist) {
      await writeArtist(artistManifest.slug,artistManifest.artist);
      const canonicalBandcampUrl=bandcampArtistRoot(artistManifest.bandcampUrl);
      const canonicalArtistId=canonicalBandcampUrl ? 'bandcamp:'+new URL(canonicalBandcampUrl).hostname.replace(/\.bandcamp\.com$/,'') : 'aquarium:'+artistManifest.slug;
      const registryEntry={
        id:artistManifest.slug,
        slug:artistManifest.slug,
        artist:artistManifest.artist,
        release:artistManifest.releaseTitle || artistManifest.tracks?.[0]?.albumTitle || 'Bandcamp',
        releaseDate:artistManifest.releaseDate || null,
        flowerCount:maximumFlowerCount,
        flowerCountMin:minimumFlowerCount,
        flowerCountMax:maximumFlowerCount,
        trackCount:Array.isArray(artistManifest.tracks) ? artistManifest.tracks.length : 0,
        bandcampUrl:artistManifest.bandcampUrl || null,
        visualStyle:artistManifest.visualStyle || 'cosmic',
        objectType:artistManifest.visualStyle === 'chrome' ? 'skulls' : artistManifest.visualStyle === 'glass' ? 'glass flowers' : 'flowers',
        dailyBatchId:artistManifest.dailyBatchId || null,
        url:'https://raggedya.github.io/cosmic-aquarium/'+encodeURIComponent(artistManifest.slug)+'/',
        status:artistManifest.status || 'published',
        canonicalArtistId,
        canonicalBandcampUrl,
        waters: validWaters(artistManifest.waters).length ? validWaters(artistManifest.waters) : classifyWaters({tags:artistManifest.metadataTags||[],text:`${artistManifest.artist} ${artistManifest.releaseTitle||''}`,seed:artistManifest.slug}),
      };
      aquariumRegistry.push(registryEntry);
      const current=canonicalCandidates.get(canonicalArtistId);
      if(!current || canonicalPreference(registryEntry,current)>0) canonicalCandidates.set(canonicalArtistId,registryEntry);
    }
  } catch (error) {
    console.warn('Skipped invalid artist manifest: ' + filename, error);
  }
}
const canonicalArtists=[...canonicalCandidates.entries()].map(([id,entry])=>({
  id,
  name:entry.artist,
  canonicalName:String(entry.artist).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(),
  bandcampArtistUrl:entry.canonicalBandcampUrl || entry.bandcampUrl,
  aquariumSlug:entry.slug,
  aquariumUrl:entry.url,
  status:entry.status,
  release:entry.release,
  releaseDate:entry.releaseDate,
  trackCount:entry.trackCount,
  visualStyle:entry.visualStyle,
  waters:entry.waters,
  lastUpdated:entry.releaseDate || null,
  memberships:[],
  primaryLocation:null,
  labels:[],
})).sort((a,b)=>a.name.localeCompare(b.name));
await fs.writeFile(path.join(pages,'artists-index.json'),JSON.stringify({schemaVersion:1,generatedAt:new Date().toISOString(),artists:canonicalArtists},null,2)+'\n');
await fs.writeFile(path.join(pages,'aquariums.json'),JSON.stringify({schemaVersion:1,generatedAt:new Date().toISOString(),aquariums:aquariumRegistry},null,2)+'\n');
const canonicalById=new Map(canonicalArtists.map(artist=>[artist.id,artist]));
const collectionSourceDirectory=path.join(root,'automation','collections');
await fs.mkdir(collectionSourceDirectory,{recursive:true});
const collectionFiles=(await fs.readdir(collectionSourceDirectory)).filter(name=>name.endsWith('.json')).sort();
const collectionRegistry=[];
for(const filename of collectionFiles){
  try{
    const source=JSON.parse(await fs.readFile(path.join(collectionSourceDirectory,filename),'utf8'));
    if(!source.slug||!source.name||!source.type) continue;
    const members=[];
    const seen=new Set();
    for(const membership of Array.isArray(source.members)?source.members:[]){
      const artist=canonicalById.get(membership.artistId);
      if(!artist||seen.has(artist.id)) continue;
      seen.add(artist.id);
      members.push({...membership,artistId:artist.id,artistName:artist.name,aquariumSlug:artist.aquariumSlug,aquariumUrl:artist.aquariumUrl,bandcampArtistUrl:artist.bandcampArtistUrl,waters:artist.waters||[],styles:artist.waters||[]});
      artist.memberships.push({id:source.id||source.slug,slug:source.slug,name:source.name,type:source.type,status:source.status||'draft'});
      if(source.type==='location'&&!artist.primaryLocation&&membership.displayEnabled!==false&&['verified','high_confidence'].includes(membership.verificationStatus)) artist.primaryLocation=source.location?.canonicalLocation||source.name;
      if(source.type==='label'&&membership.displayEnabled!==false) artist.labels.push(source.name);
    }
    const collection={...source,schemaVersion:1,members,updatedAt:source.updatedAt||new Date().toISOString()};
    await fs.writeFile(path.join(pages,'collections',source.slug+'.json'),JSON.stringify(collection,null,2)+'\n');
    const directory=path.join(pages,'collections',source.slug);await fs.mkdir(directory,{recursive:true});
    await fs.writeFile(path.join(directory,'index.html'),renderCollection(collection));
    collectionRegistry.push({id:collection.id||collection.slug,slug:collection.slug,name:collection.name,type:collection.type,status:collection.status||'draft',memberCount:members.filter(member=>member.displayEnabled!==false&&['verified','high_confidence'].includes(member.verificationStatus)).length,url:'https://raggedya.github.io/cosmic-aquarium/collections/'+encodeURIComponent(collection.slug)+'/',location:collection.location||null,updatedAt:collection.updatedAt});
  }catch(error){console.warn('Skipped invalid collection manifest: '+filename,error)}
}
for(const water of ['heavy','dreamy','quiet','electronic','dark','loud','strange']){
  const slug='style-'+water;
  const members=canonicalArtists.filter(artist=>artist.status==='published'&&(artist.waters||[]).includes(water)).map(artist=>({
    artistId:artist.id,artistName:artist.name,aquariumSlug:artist.aquariumSlug,aquariumUrl:artist.aquariumUrl,
    bandcampArtistUrl:artist.bandcampArtistUrl,verificationStatus:'verified',verificationScore:1,
    source:'automatic-style-classification',evidence:`Canonical ${water.toUpperCase()} style membership`,displayEnabled:true,
    waters:artist.waters||[],styles:artist.waters||[],
  }));
  const collection={schemaVersion:1,id:'style:'+water,slug,name:water.toUpperCase(),type:'genre',description:`Canonical ${water.toUpperCase()} style doorway.`,status:'published',instruction:'TOUCH AN ARTIST',theme:'cosmic',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),members};
  await fs.writeFile(path.join(pages,'collections',slug+'.json'),JSON.stringify(collection,null,2)+'\n');
  const directory=path.join(pages,'collections',slug);await fs.mkdir(directory,{recursive:true});
  await fs.writeFile(path.join(directory,'index.html'),renderCollection(collection));
  collectionRegistry.push({id:collection.id,slug,name:collection.name,type:collection.type,status:collection.status,memberCount:members.length,url:'https://raggedya.github.io/cosmic-aquarium/collections/'+slug+'/',location:null,updatedAt:collection.updatedAt});
  for(const artist of canonicalArtists.filter(item=>(item.waters||[]).includes(water))) artist.memberships.push({id:collection.id,slug,name:collection.name,type:'genre',status:'published'});
}
await fs.writeFile(path.join(pages,'artists-index.json'),JSON.stringify({schemaVersion:2,generatedAt:new Date().toISOString(),artists:canonicalArtists},null,2)+'\n');
await fs.writeFile(path.join(pages,'collections','index.json'),JSON.stringify({schemaVersion:1,generatedAt:new Date().toISOString(),collections:collectionRegistry},null,2)+'\n');
await fs.writeFile(path.join(pages,'index.html'),renderLanding());
console.log('GitHub Pages shell refreshed for ' + artistManifestFiles.length + ' artist edition(s) and '+collectionRegistry.length+' collection(s).');

async function writeArtist(slug,artist){
  const directory=path.join(pages,slug);
  await fs.mkdir(directory,{recursive:true});
  await fs.writeFile(path.join(directory,'index.html'),render(slug,artist));
}
function render(slug,artist){
  return template.replaceAll('{{SLUG}}',escapeAttribute(slug)).replaceAll('{{ARTIST}}',escapeHtml(artist)).replaceAll('{{ARTIST_UPPER}}',escapeHtml(artist.toUpperCase())).replaceAll('{{BASE}}','/cosmic-aquarium').replaceAll('{{ASSET_VERSION}}',assetVersion);
}
function renderLanding(){
  return universeTemplate.replaceAll('{{BASE}}','/cosmic-aquarium').replaceAll('{{ASSET_VERSION}}',assetVersion);
}
function renderCollection(collection){
  return collectionTemplate.replaceAll('{{SLUG}}',escapeAttribute(collection.slug)).replaceAll('{{NAME}}',escapeHtml(String(collection.name).toUpperCase())).replaceAll('{{INSTRUCTION}}',escapeHtml(collection.instruction||'TOUCH AN ARTIST')).replaceAll('{{BASE}}','/cosmic-aquarium').replaceAll('{{ASSET_VERSION}}',assetVersion);
}
function bandcampArtistRoot(value){
  try{const url=new URL(String(value||''));const host=url.hostname.toLowerCase().replace(/^www\./,'');return url.protocol==='https:'&&host.endsWith('.bandcamp.com')&&host!=='bandcamp.com'?'https://'+host+'/':null}catch{return null}
}
function canonicalPreference(candidate,current){
  const published=value=>value.status==='published'?1:0;
  return published(candidate)-published(current)||(candidate.trackCount||0)-(current.trackCount||0)||String(current.releaseDate||'').localeCompare(String(candidate.releaseDate||''));
}
function escapeHtml(value){return String(value).replace(/[&<>]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[char]));}
function escapeAttribute(value){return escapeHtml(value).replaceAll('"','&quot;');}
