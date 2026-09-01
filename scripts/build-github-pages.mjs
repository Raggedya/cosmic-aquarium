import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = path.resolve(import.meta.dirname,'..');
const pages = path.join(root,'github-pages');
const template = await fs.readFile(path.join(root,'templates','artist-index.html'),'utf8');
const css = await fs.readFile(path.join(root,'app','cosmic-aquarium.css'),'utf8');
const staticScript = await fs.readFile(path.join(pages,'assets','site.js'),'utf8');
const minimumFlowerCount = 10;
const maximumFlowerCount = 14;
const assetVersion = createHash('sha256').update(css).update(staticScript).digest('hex').slice(0,12);
const reset = `*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#000}body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.visually-hidden{position:fixed;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}button,a{font:inherit}button:focus-visible,a:focus-visible{outline:2px solid #c8b9ff;outline-offset:4px}\n`;
await fs.mkdir(path.join(pages,'assets','flowers'),{recursive:true});
await fs.mkdir(path.join(pages,'artists'),{recursive:true});
await fs.writeFile(path.join(pages,'assets','site.css'),reset+css);
for (const name of ['cosmos.png','poppy.png','anemone.png','rose.png','thorn.png']) {
  await fs.copyFile(path.join(root,'public','flowers',name),path.join(pages,'assets','flowers',name));
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
        dailyBatchId:artistManifest.dailyBatchId || null,
        url:'https://raggedya.github.io/cosmic-aquarium/'+encodeURIComponent(artistManifest.slug)+'/',
        status:artistManifest.status || 'published',
      });
    }
  } catch (error) {
    console.warn('Skipped invalid artist manifest: ' + filename, error);
  }
}
await fs.writeFile(path.join(pages,'aquariums.json'),JSON.stringify({schemaVersion:1,generatedAt:new Date().toISOString(),aquariums:aquariumRegistry},null,2)+'\n');
await fs.writeFile(path.join(pages,'index.html'),renderLanding(aquariumRegistry));
console.log('GitHub Pages shell refreshed for ' + artistManifestFiles.length + ' artist edition(s).');

async function writeArtist(slug,artist){
  const directory=path.join(pages,slug);
  await fs.mkdir(directory,{recursive:true});
  await fs.writeFile(path.join(directory,'index.html'),render(slug,artist));
}
function render(slug,artist){
  return template.replaceAll('{{SLUG}}',escapeAttribute(slug)).replaceAll('{{ARTIST}}',escapeHtml(artist)).replaceAll('{{ARTIST_UPPER}}',escapeHtml(artist.toUpperCase())).replaceAll('{{BASE}}','/cosmic-aquarium').replaceAll('{{ASSET_VERSION}}',assetVersion);
}
function renderLanding(registry){
  const published=registry.filter(item=>item.status==='published').length;
  const message=published ? published+' living Aquarium'+(published===1?' is':'s are')+' currently published.' : 'The library is ready for its first Aquarium.';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#07071d"><title>Cosmic Aquaria</title><style>*{box-sizing:border-box}html,body{height:100%;margin:0}body{display:grid;place-items:center;background:radial-gradient(circle at 50% 42%,#17103b,#07071d 58%,#02030b);color:#f5f3fb;font-family:Inter,system-ui;text-align:center}main{padding:36px}i{display:block;width:46px;height:46px;margin:0 auto 28px;border:1px solid #8d88aa;border-radius:50%;font-style:normal;line-height:43px;color:#aaa4c8}h1{margin:0;padding-left:.32em;font-size:15px;font-weight:500;letter-spacing:.32em}p{margin:16px 0 0;color:#9993ad;font-size:10px;letter-spacing:.12em}</style></head><body><main><i>✧</i><h1>COSMIC AQUARIA</h1><p>${message}</p></main></body></html>`;
}
function escapeHtml(value){return String(value).replace(/[&<>]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[char]));}
function escapeAttribute(value){return escapeHtml(value).replaceAll('"','&quot;');}
