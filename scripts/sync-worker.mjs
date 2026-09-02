import fs from 'node:fs/promises';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const pages=path.join(root,'github-pages');
const endpoint=process.env.COSMIC_WORKER_URL||'https://cosmic-aquaria.andrewharris501.workers.dev/api/admin/sync';
const token=process.env.COSMIC_WORKER_SYNC_TOKEN;
if(!token) throw new Error('COSMIC_WORKER_SYNC_TOKEN is required.');

const catalogue=JSON.parse(await fs.readFile(path.join(pages,'aquariums.json'),'utf8'));
const artistIndex=JSON.parse(await fs.readFile(path.join(pages,'artists-index.json'),'utf8'));
const collectionIndex=JSON.parse(await fs.readFile(path.join(pages,'collections','index.json'),'utf8'));
const collections=[];
for(const entry of collectionIndex.collections||[]){
  collections.push(JSON.parse(await fs.readFile(path.join(pages,'collections',`${entry.slug}.json`),'utf8')));
}
let batch=null;
if(process.env.BATCH_DATE){
  batch=JSON.parse(await fs.readFile(path.join(root,'automation','batches',`${process.env.BATCH_DATE}.json`),'utf8'));
}
const response=await fetch(endpoint,{
  method:'POST',
  headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
  body:JSON.stringify({aquariums:catalogue.aquariums||[],artists:artistIndex.artists||[],collections,batch,fullReplace:process.env.FULL_REPLACE==='true'}),
});
const result=await response.json().catch(()=>({}));
if(!response.ok) throw new Error(`Universe discovery sync failed: ${response.status} ${JSON.stringify(result)}`);
if(result.synced!==(catalogue.aquariums||[]).length) throw new Error(`Expected ${(catalogue.aquariums||[]).length} Aquariums, received ${result.synced}`);
console.log(`Synced ${result.synced} Aquariums, ${result.artists||0} canonical artists and ${result.collections||0} collections.`);
