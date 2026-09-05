import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const baseUrl = process.argv[2] || 'http://127.0.0.1:8765/cosmic-aquarium/';
const outputDirectory = path.resolve(process.argv[3] || 'artifacts/two-screen-fidelity-v3/breaks');
const categories = ['heavy','dreamy','quiet','electronic','dark','loud','strange','anything'];
const chromeExecutable = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

await fs.mkdir(outputDirectory,{recursive:true});
const browser = await chromium.launch({executablePath:chromeExecutable,headless:true});
const context = await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2});
const page = await context.newPage();
await page.goto(baseUrl,{waitUntil:'networkidle'});

for(const category of categories){
  const button=page.locator(`[data-category="${category}"]`);
  await button.click();
  await page.waitForTimeout(180);
  await button.screenshot({path:path.join(outputDirectory,`${category}.png`)});
  await button.click();
  await page.waitForTimeout(80);
}

await browser.close();
console.log(`Captured ${categories.length} selected-state details in ${outputDirectory}`);
