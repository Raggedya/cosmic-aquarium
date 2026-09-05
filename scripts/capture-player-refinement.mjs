import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const baseUrl=process.argv[2]||'http://127.0.0.1:8765/cosmic-aquarium/';
const outputDirectory=path.resolve(process.argv[3]||'artifacts/player-refinement');
const chromeExecutable='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sizes=[{width:390,height:844},{width:393,height:852},{width:430,height:932}];

await fs.mkdir(outputDirectory,{recursive:true});
const catalogue=await (await fetch(new URL('aquariums.json',baseUrl))).json();
const published=catalogue.aquariums.filter(entry=>entry.status==='published');
const release=published.find(entry=>entry.slug==='5fingerballad-5fingerballad')||published[0];
const longArtist=[...published].sort((a,b)=>b.artist.length-a.artist.length)[0];
const localManifestDirectory=path.resolve('github-pages/artists');
const manifests=[];
for(const filename of await fs.readdir(localManifestDirectory)){
  if(!filename.endsWith('.json'))continue;
  try{manifests.push(JSON.parse(await fs.readFile(path.join(localManifestDirectory,filename),'utf8')));}catch{}
}
const longTrackManifest=manifests
  .filter(manifest=>manifest.status==='published'&&manifest.tracks?.some(track=>/^\d+$/.test(String(track.bandcampEmbedTrackId||''))))
  .sort((a,b)=>Math.min(...b.tracks.map(track=>track.title?.length||0))-Math.min(...a.tracks.map(track=>track.title?.length||0)))[0];
const longTrack=published.find(entry=>entry.slug===longTrackManifest?.slug)||release;

function playerUrl(entry){
  const url=new URL(baseUrl);
  url.searchParams.set('release',entry.slug);
  url.searchParams.set('categories',entry.waters?.[0]||'anything');
  return url.toString();
}

async function openPlayer(page,entry){
  await page.goto(playerUrl(entry),{waitUntil:'domcontentloaded'});
  await page.locator('.player-screen.is-active').waitFor();
  await page.waitForFunction(()=>document.querySelectorAll('.vu-scale-label').length===22);
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForTimeout(1100);
}

async function setPlaying(page,playing){
  await page.evaluate(value=>window.CosmicVuMeters.setPlaying(value),playing);
  await page.waitForFunction(value=>window.CosmicVuMeters.getState().playback===(value?'playing':'idle'),playing);
}

const browser=await chromium.launch({executablePath:chromeExecutable,headless:true});
const results=[];
for(const [sizeIndex,size] of sizes.entries()){
  const context=await browser.newContext({viewport:size,deviceScaleFactor:1,reducedMotion:'no-preference'});
  const page=await context.newPage();
  const consoleErrors=[];
  page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('api/events'))consoleErrors.push(message.text());});
  await openPlayer(page,release);
  await page.screenshot({path:path.join(outputDirectory,`paused-${size.width}x${size.height}.png`)});

  await setPlaying(page,true);
  await page.waitForTimeout(1700);
  const moderate=await page.evaluate(()=>window.CosmicVuMeters.getState());
  await page.screenshot({path:path.join(outputDirectory,`moderate-${size.width}x${size.height}.png`)});
  await page.screenshot({path:path.join(outputDirectory,`transport-playing-${size.width}x${size.height}.png`)});

  const testDuration=sizeIndex===0?60000:12000;
  const deadline=Date.now()+testDuration;
  const samples=[];
  let strongest=moderate;
  let strongCaptured=false;
  while(Date.now()<deadline){
    const state=await page.evaluate(()=>window.CosmicVuMeters.getState());
    samples.push(state);
    if(Math.max(state.leftAngle,state.rightAngle)>Math.max(strongest.leftAngle,strongest.rightAngle))strongest=state;
    if(!strongCaptured&&Math.max(state.leftAngle,state.rightAngle)>30){
      await page.screenshot({path:path.join(outputDirectory,`strong-peak-${size.width}x${size.height}.png`)});
      strongCaptured=true;
    }
    await page.waitForTimeout(100);
  }
  if(!strongCaptured)await page.screenshot({path:path.join(outputDirectory,`strong-peak-${size.width}x${size.height}.png`)});

  await setPlaying(page,false);
  await page.waitForTimeout(180);
  const releaseState=await page.evaluate(()=>window.CosmicVuMeters.getState());
  await page.screenshot({path:path.join(outputDirectory,`transport-paused-${size.width}x${size.height}.png`)});
  await page.waitForTimeout(1350);
  const settled=await page.evaluate(()=>window.CosmicVuMeters.getState());

  await openPlayer(page,longArtist);
  await page.screenshot({path:path.join(outputDirectory,`long-artist-${size.width}x${size.height}.png`)});
  await openPlayer(page,longTrack);
  await page.screenshot({path:path.join(outputDirectory,`long-track-${size.width}x${size.height}.png`)});

  const metrics=await page.evaluate(()=>({
    viewport:{width:innerWidth,height:innerHeight},
    document:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight},
    meters:[...document.querySelectorAll('.vu-meter')].map(element=>element.getBoundingClientRect().toJSON()),
    transport:document.querySelector('.bandcamp-transport')?.getBoundingClientRect().toJSON(),
    transportPointerEvents:getComputedStyle(document.querySelector('.bandcamp-transport iframe')).pointerEvents,
    visibleCaption:document.querySelector('.transport-hint')?.getBoundingClientRect().width||0,
  }));
  const redSamples=samples.filter(sample=>Math.max(sample.leftLevel,sample.rightLevel)>.72).length;
  const identicalSamples=samples.filter(sample=>Math.abs(sample.leftAngle-sample.rightAngle)<.05).length;
  results.push({
    size,
    testDuration,
    release:release.slug,
    longArtist:longArtist.slug,
    longTrack:longTrack.slug,
    sampleCount:samples.length,
    moderate,strongest,releaseState,settled,
    redFraction:redSamples/Math.max(1,samples.length),
    identicalFraction:identicalSamples/Math.max(1,samples.length),
    angleRange:{
      left:[Math.min(...samples.map(sample=>sample.leftAngle)),Math.max(...samples.map(sample=>sample.leftAngle))],
      right:[Math.min(...samples.map(sample=>sample.rightAngle)),Math.max(...samples.map(sample=>sample.rightAngle))],
    },
    consoleErrors,metrics,
  });
  await context.close();
}

const videoContext=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,recordVideo:{dir:outputDirectory,size:{width:390,height:844}}});
const videoPage=await videoContext.newPage();
await openPlayer(videoPage,release);
const video=videoPage.video();
await setPlaying(videoPage,true);
await videoPage.waitForTimeout(10500);
await setPlaying(videoPage,false);
await videoPage.waitForTimeout(1800);
await videoContext.close();
if(video){
  const target=path.join(outputDirectory,'analogue-ballistics-390x844.webm');
  await fs.rm(target,{force:true});
  await fs.rename(await video.path(),target);
}

await browser.close();
await fs.writeFile(path.join(outputDirectory,'capture-report.json'),`${JSON.stringify(results,null,2)}\n`);
console.log(JSON.stringify(results,null,2));
