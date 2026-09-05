import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const baseUrl=process.argv[2]||'http://127.0.0.1:4189/cosmic-aquarium/';
const outputDirectory=path.resolve(process.argv[3]||'artifacts/selector-search');
const chromeExecutable='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sizes=[{width:390,height:844},{width:393,height:852},{width:430,height:932}];

await fs.mkdir(outputDirectory,{recursive:true});
const browser=await chromium.launch({executablePath:chromeExecutable,headless:true});
const report=[];

for(const size of sizes){
  const context=await browser.newContext({viewport:size,deviceScaleFactor:1,reducedMotion:'no-preference'});
  const page=await context.newPage();
  const consoleErrors=[];
  page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('/api/events'))consoleErrors.push(message.text());});
  await page.goto(baseUrl,{waitUntil:'domcontentloaded'});
  await page.locator('.selection-screen.is-active').waitFor();
  await page.waitForFunction(()=>window.CosmicArtistSearch&&document.querySelector('.go-key'));
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForTimeout(500);
  await page.screenshot({path:path.join(outputDirectory,`fresh-${size.width}x${size.height}.png`)});

  const input=page.locator('#artist-search-input');
  await input.focus();
  await page.screenshot({path:path.join(outputDirectory,`focused-${size.width}x${size.height}.png`)});
  await input.fill('Aneira');
  await page.locator('.search-result').first().waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({path:path.join(outputDirectory,`typed-${size.width}x${size.height}.png`)});
  const typed=await page.evaluate(()=>({
    state:window.CosmicArtistSearch.getState(),
    disabled:[...document.querySelectorAll('[data-category]')].map(button=>button.disabled),
    selected:[...document.querySelectorAll('[data-category].is-selected')].length,
    goDisabled:document.querySelector('.go-key').disabled,
    mode:document.querySelector('.selection-screen').dataset.mode,
  }));

  await page.locator('.search-result').first().click();
  await page.screenshot({path:path.join(outputDirectory,`selected-${size.width}x${size.height}.png`)});
  const chosen=await page.evaluate(()=>window.CosmicArtistSearch.getState());

  await page.locator('.go-key').click();
  await page.locator('.player-screen.is-active').waitFor({timeout:7000});
  const player=await page.evaluate(()=>({
    artist:document.querySelector('#now-playing-heading')?.textContent,
    buy:document.querySelector('[data-action="buy"]')?.href,
    iframe:document.querySelector('.bandcamp-transport iframe')?.src,
    shareUrl:location.href,
    searchState:window.CosmicArtistSearch.getState(),
  }));
  await page.locator('.change-categories').click();
  await page.locator('.selection-screen.is-active').waitFor();
  const home=await page.evaluate(()=>({
    state:window.CosmicArtistSearch.getState(),
    selected:[...document.querySelectorAll('[data-category].is-selected')].length,
    disabled:[...document.querySelectorAll('[data-category]')].some(button=>button.disabled),
  }));

  await page.waitForTimeout(350);
  await page.screenshot({path:path.join(outputDirectory,`cleared-${size.width}x${size.height}.png`)});
  await page.locator('[data-category="dark"]').click();
  await page.waitForTimeout(220);
  await page.screenshot({path:path.join(outputDirectory,`genre-${size.width}x${size.height}.png`)});

  const layout=await page.evaluate(()=>({
    viewport:{width:innerWidth,height:innerHeight},
    document:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight},
    masthead:document.querySelector('.selector-masthead').getBoundingClientRect().toJSON(),
    search:document.querySelector('.artist-search').getBoundingClientRect().toJSON(),
    grid:document.querySelector('.selection-grid').getBoundingClientRect().toJSON(),
    go:document.querySelector('.go-key').getBoundingClientRect().toJSON(),
    footer:document.querySelector('.selector-footer').getBoundingClientRect().toJSON(),
  }));
  report.push({size,typed,chosen,player,home,layout,consoleErrors});
  await context.close();
}

const smallContext=await browser.newContext({viewport:{width:375,height:667},deviceScaleFactor:1});
const smallPage=await smallContext.newPage();
await smallPage.goto(baseUrl,{waitUntil:'domcontentloaded'});
await smallPage.locator('.selection-screen.is-active').waitFor();
await smallPage.waitForTimeout(500);
await smallPage.screenshot({path:path.join(outputDirectory,'small-iphone-375x667.png')});
await smallContext.close();

await browser.close();
await fs.writeFile(path.join(outputDirectory,'capture-report.json'),`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify(report,null,2));
