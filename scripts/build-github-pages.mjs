import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { immigrantUnionAlbums, immigrantUnionSongs } from '../src/data/immigrant-union-catalogue.ts';

const root = path.resolve(import.meta.dirname,'..');
const pages = path.join(root,'github-pages');
const template = await fs.readFile(path.join(root,'templates','artist-index.html'),'utf8');
const css = await fs.readFile(path.join(root,'app','cosmic-aquarium.css'),'utf8');
const staticScript = await fs.readFile(path.join(pages,'assets','site.js'),'utf8');
const assetVersion = createHash('sha256').update(css).update(staticScript).digest('hex').slice(0,12);
const reset = `*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#000}body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.visually-hidden{position:fixed;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}button,a{font:inherit}button:focus-visible,a:focus-visible{outline:2px solid #c8b9ff;outline-offset:4px}\n`;
await fs.mkdir(path.join(pages,'assets','flowers'),{recursive:true});
await fs.mkdir(path.join(pages,'artists'),{recursive:true});
await fs.writeFile(path.join(pages,'assets','site.css'),reset+css);
for (const name of ['cosmos.png','poppy.png','anemone.png','rose.png','thorn.png']) {
  await fs.copyFile(path.join(root,'public','flowers',name),path.join(pages,'assets','flowers',name));
}
const manifest = {
  schemaVersion: 1,
  slug: 'immigrant-union',
  artist: 'Immigrant Union',
  bandcampUrl: 'https://immigrantunionmusic.bandcamp.com/',
  commerceAvailable: true,
  commerceUrl: 'https://immigrantunionmusic.bandcamp.com/',
  visualStyle: 'cosmic',
  albums: immigrantUnionAlbums.map(({key,color})=>({key,color})),
  tracks: immigrantUnionSongs,
};
const defaultManifestPath=path.join(pages,'artists','immigrant-union.json');
try {
  const existing = JSON.parse(await fs.readFile(defaultManifestPath,'utf8'));
  if (!existing.visualStyle) {
    existing.visualStyle = 'cosmic';
    await fs.writeFile(defaultManifestPath,JSON.stringify(existing,null,2)+'\n');
  }
} catch {
  await fs.writeFile(defaultManifestPath,JSON.stringify(manifest,null,2)+'\n');
}
const artistManifestFiles = (await fs.readdir(path.join(pages,'artists')))
  .filter((name) => name.endsWith('.json'))
  .sort();
for (const filename of artistManifestFiles) {
  try {
    const artistManifest = JSON.parse(await fs.readFile(path.join(pages,'artists',filename),'utf8'));
    if (artistManifest.slug && artistManifest.artist) {
      await writeArtist(artistManifest.slug,artistManifest.artist);
    }
  } catch (error) {
    console.warn('Skipped invalid artist manifest: ' + filename, error);
  }
}
await fs.writeFile(path.join(pages,'index.html'),render('immigrant-union','Immigrant Union'));
console.log('GitHub Pages shell refreshed for ' + artistManifestFiles.length + ' artist edition(s).');

async function writeArtist(slug,artist){
  const directory=path.join(pages,slug);
  await fs.mkdir(directory,{recursive:true});
  await fs.writeFile(path.join(directory,'index.html'),render(slug,artist));
}
function render(slug,artist){
  return template.replaceAll('{{SLUG}}',escapeAttribute(slug)).replaceAll('{{ARTIST}}',escapeHtml(artist)).replaceAll('{{ARTIST_UPPER}}',escapeHtml(artist.toUpperCase())).replaceAll('{{BASE}}','/cosmic-aquarium').replaceAll('{{ASSET_VERSION}}',assetVersion);
}
function escapeHtml(value){return String(value).replace(/[&<>]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[char]));}
function escapeAttribute(value){return escapeHtml(value).replaceAll('"','&quot;');}
