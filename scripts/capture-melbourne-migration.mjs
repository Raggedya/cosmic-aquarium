import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const baseUrl=process.argv[2]||'http://127.0.0.1:8765/';
const output=path.resolve(process.argv[3]||'artifacts/melbourne-universe');
const sizes=[{width:390,height:844},{width:393,height:852},{width:430,height:932}];
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
const report=[];

for(const size of sizes){
  const page=await browser.newPage({viewport:size,deviceScaleFactor:1});
  const consoleErrors=[];
  page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('/api/events'))consoleErrors.push(message.text());});
  await page.goto(baseUrl,{waitUntil:'networkidle'});
  const catalogue=await page.evaluate(async()=>await (await fetch('./aquariums.json')).json());
  await page.locator('#artist-search-input').fill('Julia');
  await page.waitForSelector('.search-result');
  const disabled=await page.locator('.glass-key:disabled').count();
  await page.screenshot({path:path.join(output,`search-${size.width}x${size.height}.png`)});
  await page.locator('.search-result').first().click();
  const goEnabled=await page.locator('.go-key').isEnabled();
  await page.locator('.search-clear').click();
  await page.locator('[data-category="strange"]').click();
  await page.locator('.go-key').click();
  await page.waitForSelector('.player-screen.is-active');
  await page.waitForTimeout(1700);
  const player=await page.evaluate(()=>(
    {
      artist:document.querySelector('#now-playing-heading')?.textContent,
      ticker:document.querySelector('.ticker-copy')?.textContent,
      share:Boolean(document.querySelector('[data-action="share"]')),
      buy:Boolean(document.querySelector('[data-action="buy"]')),
      next:Boolean(document.querySelector('[data-action="next"]')),
      width:document.documentElement.scrollWidth,
      height:document.documentElement.scrollHeight,
    }
  ));
  await page.screenshot({path:path.join(output,`player-${size.width}x${size.height}.png`)});
  report.push({size,catalogueUniverse:catalogue.universe,catalogueCount:catalogue.aquariums.length,searchDisabledGenres:disabled,searchGoEnabled:goEnabled,player,consoleErrors});
  await page.close();
}
await browser.close();
await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
