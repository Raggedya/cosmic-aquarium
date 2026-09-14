import fs from 'node:fs/promises';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const token=String(process.env.COSMIC_WORKER_SYNC_TOKEN||'').trim();
const endpoint=String(process.env.COSMIC_WORKER_URL||'https://cosmic-aquaria.andrewharris501.workers.dev').replace(/\/$/,'');
if(!token)throw new Error('COSMIC_WORKER_SYNC_TOKEN is required.');

const registry=JSON.parse(await fs.readFile(path.join(root,'github-pages','artist-machines.json'),'utf8'));
const artists=Array.isArray(registry.artists)?registry.artists:[];
const machines=artists.map(item=>({
  artistSlug:item.artistSlug,
  artistName:item.artistName,
  publicUrl:`https://raggedya.github.io/cosmic-aquarium/artist/?artist=${encodeURIComponent(item.artistSlug)}`,
  songCount:Number(item.songCount||0),
}));
const response=await fetch(`${endpoint}/api/admin/artist-machines/sync`,{
  method:'POST',
  headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
  body:JSON.stringify({machines,fullReplace:true}),
});
const result=await response.json().catch(()=>({}));
if(!response.ok||!result.ok)throw new Error(`Artist Machine reporting sync failed (${response.status}).`);
console.log(`Synced ${Number(result.synced||0)} Artist Machines into reporting.`);
