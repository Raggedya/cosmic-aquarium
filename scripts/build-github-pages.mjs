import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { classifyWaters, validWaters } from './water-classifier.mjs';

const root = path.resolve(import.meta.dirname,'..');
const pages = path.join(root,'github-pages');
const template = await fs.readFile(path.join(root,'templates','artist-index.html'),'utf8');
const universeTemplate = await fs.readFile(path.join(root,'templates','universe-index.html'),'utf8');
const css = await fs.readFile(path.join(root,'app','cosmic-aquarium.css'),'utf8');
const doorwayCss = await fs.readFile(path.join(root,'app','doorway.css'),'utf8');
const staticScript = await fs.readFile(path.join(pages,'assets','site.js'),'utf8');
const doorwayScript = await fs.readFile(path.join(pages,'assets','doorway.js'),'utf8');
const minimumFlowerCount = 10;
const maximumFlowerCount = 14;
const assetVersion = createHash('sha256').update(css).update(staticScript).update(doorwayCss).update(doorwayScript).digest('hex').slice(0,12);
const reset = `*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#000}body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.visually-hidden{position:fixed;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}button,a{font:inherit}button:focus-visible,a:focus-visible{outline:2px solid #c8b9ff;outline-offset:4px}\n`;
await fs.mkdir(path.join(pages,'assets','flowers'),{recursive:true});
await fs.mkdir(path.join(pages,'assets','skulls'),{recursive:true});
await fs.mkdir(path.join(pages,'assets','glass'),{recursive:true});
await fs.mkdir(path.join(pages,'artists'),{recursive:true});
await fs.writeFile(path.join(pages,'assets','site.css'),reset+css);
await fs.writeFile(path.join(pages,'assets','doorway.css'),reset+doorwayCss);
for (const name of ['cosmos.png','poppy.png','anemone.png','rose.png','thorn.png']) {
  await fs.copyFile(path.join(root,'public','flowers',name),path.join(pages,'assets','flowers',name));
}
await fs.copyFile(path.join(root,'public','skulls','chrome-skull-silver.png'),path.join(pages,'assets','skulls','chrome-skull-silver.png'));
await fs.copyFile(path.join(root,'public','glass','crystal-flower.png'),path.join(pages,'assets','glass','crystal-flower.png'));
for (const name of ['cosmic-aquaria-qr-standard.png','cosmic-aquaria-qr-branded.png']) {
  try { await fs.copyFile(path.join(root,'public',name),path.join(pages,name)); } catch {}
}
const artistManifestFiles = (await fs.readdir(path.join(pages,'artists')))
  .filter((name) => name.endsWith('.json'))
  .sort();
const aquariumRegistry=[];
for (const filename of artistManifestFiles) {
  try {
    const artistManifest = JSON.parse(await fs.readFile(path.join(pages,'artists',filename),'utf8'));
    if (artistManifest.slug && artistManifest.artist) {
      await writeArtist(artistManifest.slug,artistManifest.artist);
      aquariumRegistry.push({
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
        waters: validWaters(artistManifest.waters).length ? validWaters(artistManifest.waters) : classifyWaters({tags:artistManifest.metadataTags||[],text:`${artistManifest.artist} ${artistManifest.releaseTitle||''}`,seed:artistManifest.slug}),
      });
    }
  } catch (error) {
    console.warn('Skipped invalid artist manifest: ' + filename, error);
  }
}
await fs.writeFile(path.join(pages,'aquariums.json'),JSON.stringify({schemaVersion:1,generatedAt:new Date().toISOString(),aquariums:aquariumRegistry},null,2)+'\n');
await fs.writeFile(path.join(pages,'index.html'),renderLanding());
console.log('GitHub Pages shell refreshed for ' + artistManifestFiles.length + ' artist edition(s).');

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
function escapeHtml(value){return String(value).replace(/[&<>]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[char]));}
function escapeAttribute(value){return escapeHtml(value).replaceAll('"','&quot;');}
