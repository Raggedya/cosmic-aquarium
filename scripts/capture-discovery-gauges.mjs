import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const baseUrl = process.argv[2] || 'http://127.0.0.1:8765/cosmic-aquarium/';
const outputDirectory = path.resolve(process.argv[3] || 'artifacts/dual-needle-gauges');
const chromeExecutable = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sizes = [{width:390,height:844},{width:393,height:852},{width:430,height:932}];

await fs.mkdir(outputDirectory,{recursive:true});
const browser = await chromium.launch({executablePath:chromeExecutable,headless:true});
const catalogue = await (await fetch(new URL('aquariums.json',baseUrl))).json();
const published = catalogue.aquariums.filter((entry)=>entry.status==='published');
const release = published.find((entry)=>entry.artist.length>=7&&entry.artist.length<=16) || published[0];
const longRelease = [...published].sort((a,b)=>b.artist.length-a.artist.length)[0];
const results=[];

function playerUrl(entry){
  const url=new URL(baseUrl);
  url.searchParams.set('release',entry.slug);
  url.searchParams.set('categories',entry.waters?.[0]||'anything');
  return url.toString();
}

for(const size of sizes){
  const context=await browser.newContext({viewport:size,deviceScaleFactor:1,reducedMotion:'no-preference'});
  const page=await context.newPage();
  const consoleErrors=[];
  page.on('console',(message)=>{if(message.type()==='error'&&!message.text().includes('api/events'))consoleErrors.push(message.text());});
  await page.goto(playerUrl(release),{waitUntil:'domcontentloaded'});
  await page.locator('.player-screen.is-active').waitFor();
  await page.waitForFunction(()=>document.querySelectorAll('.vu-scale-label').length===22);
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForTimeout(1000);
  await page.screenshot({path:path.join(outputDirectory,`paused-${size.width}x${size.height}.png`)});

  await page.locator('.bandcamp-transport iframe').focus();
  await page.waitForFunction(()=>window.CosmicVuMeters?.getState?.().playback==='playing');
  await page.waitForTimeout(1000);
  const first=await page.evaluate(()=>window.CosmicVuMeters.getState());
  await page.waitForTimeout(420);
  const second=await page.evaluate(()=>window.CosmicVuMeters.getState());
  await page.screenshot({path:path.join(outputDirectory,`playing-${size.width}x${size.height}.png`)});

  const peakDeadline=Date.now()+9000;
  let peak=second;
  while(Date.now()<peakDeadline){
    peak=await page.evaluate(()=>window.CosmicVuMeters.getState());
    if(Math.max(peak.leftAngle,peak.rightAngle)>34)break;
    await page.waitForTimeout(110);
  }
  await page.screenshot({path:path.join(outputDirectory,`peak-${size.width}x${size.height}.png`)});

  await page.evaluate(()=>window.CosmicVuMeters.setPlaying(false));
  await page.waitForFunction(()=>window.CosmicVuMeters?.getState?.().playback==='idle');
  await page.waitForTimeout(1550);
  const settled=await page.evaluate(()=>window.CosmicVuMeters.getState());

  await page.goto(playerUrl(longRelease),{waitUntil:'domcontentloaded'});
  await page.locator('.player-screen.is-active').waitFor();
  await page.waitForFunction(()=>document.querySelectorAll('.vu-scale-label').length===22);
  await page.waitForTimeout(900);
  await page.screenshot({path:path.join(outputDirectory,`long-name-${size.width}x${size.height}.png`)});
  const metrics=await page.evaluate(()=>({
    viewport:{width:innerWidth,height:innerHeight},
    document:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight},
    meterRow:document.querySelector('.vu-meter-row')?.getBoundingClientRect().toJSON(),
    meters:[...document.querySelectorAll('.vu-meter')].map((element)=>element.getBoundingClientRect().toJSON()),
    artist:document.querySelector('#now-playing-heading')?.getBoundingClientRect().toJSON(),
    release:document.querySelector('.release-line')?.getBoundingClientRect().toJSON(),
    transport:document.querySelector('.bandcamp-transport')?.getBoundingClientRect().toJSON(),
  }));
  results.push({size,release:release.slug,longRelease:longRelease.slug,first,second,peak,settled,independent:first.leftAngle!==first.rightAngle,moving:first.leftAngle!==second.leftAngle||first.rightAngle!==second.rightAngle,consoleErrors,metrics});
  await context.close();
}

const videoContext=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,recordVideo:{dir:outputDirectory,size:{width:390,height:844}}});
const videoPage=await videoContext.newPage();
await videoPage.goto(playerUrl(release),{waitUntil:'domcontentloaded'});
await videoPage.locator('.player-screen.is-active').waitFor();
await videoPage.waitForFunction(()=>document.querySelectorAll('.vu-scale-label').length===22);
await videoPage.evaluate(()=>document.fonts.ready);
const video=videoPage.video();
await videoPage.locator('.bandcamp-transport iframe').focus();
await videoPage.waitForTimeout(6000);
await videoPage.evaluate(()=>window.CosmicVuMeters.setPlaying(false));
await videoPage.waitForTimeout(1600);
await videoContext.close();
if(video){const target=path.join(outputDirectory,'needle-motion-390x844.webm');await fs.rm(target,{force:true});await fs.rename(await video.path(),target);}

await browser.close();
await fs.writeFile(path.join(outputDirectory,'capture-report.json'),`${JSON.stringify(results,null,2)}\n`);
console.log(JSON.stringify(results,null,2));
