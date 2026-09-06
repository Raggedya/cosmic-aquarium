import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const baseUrl = process.argv[2] || 'http://127.0.0.1:4189/cosmic-aquarium/';
const outputDirectory = path.resolve(process.argv[3] || 'artifacts/top-fidelity');
const chromeExecutable = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sizes = [{ width: 390, height: 844 }, { width: 393, height: 852 }, { width: 430, height: 932 }];

await fs.mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch({ executablePath: chromeExecutable, headless: true });
const report = [];

for (const size of sizes) {
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  const errors = [];
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().includes('/api/events')) errors.push(message.text());
  });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('.selection-screen.is-active').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(450);

  const fullName = `corrected-${size.width}x${size.height}.png`;
  await page.screenshot({ path: path.join(outputDirectory, fullName) });
  await page.locator('.selector-masthead').screenshot({ path: path.join(outputDirectory, `header-100-${size.width}x${size.height}.png`) });
  await page.locator('.artist-search').screenshot({ path: path.join(outputDirectory, `search-100-${size.width}x${size.height}.png`) });

  const input = page.locator('#artist-search-input');
  await input.fill('Aneira');
  await page.locator('.search-result').first().waitFor();
  const interaction = await page.evaluate(() => ({
    query: document.querySelector('#artist-search-input')?.value,
    mode: document.querySelector('.selection-screen')?.dataset.mode,
    genresDisabled: [...document.querySelectorAll('[data-category]')].every(button => button.disabled),
    visibleResults: [...document.querySelectorAll('.search-result')].length,
    soundInMasthead: Boolean(document.querySelector('.selector-masthead .sound-toggle')),
  }));

  const measurements = await page.evaluate(() => {
    const rect = selector => document.querySelector(selector)?.getBoundingClientRect().toJSON();
    const masthead = rect('.selector-masthead');
    const search = rect('.artist-search');
    const grid = rect('.selection-grid');
    const logo = rect('.selector-masthead .bandcamp-wordmark');
    const tagline = rect('.selector-masthead small');
    const icon = rect('.search-icon');
    const input = rect('#artist-search-input');
    const menu = rect('.search-menu');
    return {
      viewport: { width: innerWidth, height: innerHeight },
      document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      masthead,
      search,
      grid,
      logo,
      tagline,
      icon,
      input,
      menu,
      headerSearchGap: search.y - (masthead.y + masthead.height),
      searchGridGap: grid.y - (search.y + search.height),
      leftAlignmentDelta: search.x - masthead.x,
      rightAlignmentDelta: (masthead.x + masthead.width) - (search.x + search.width),
    };
  });
  report.push({ size, measurements, interaction, errors });
  await context.close();

  const retinaContext = await browser.newContext({ viewport: size, deviceScaleFactor: 2, reducedMotion: 'no-preference' });
  const retinaPage = await retinaContext.newPage();
  await retinaPage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await retinaPage.locator('.selection-screen.is-active').waitFor();
  await retinaPage.evaluate(() => document.fonts.ready);
  await retinaPage.waitForTimeout(350);
  await retinaPage.locator('.selector-masthead').screenshot({ path: path.join(outputDirectory, `header-200-${size.width}x${size.height}.png`), scale: 'device' });
  await retinaPage.locator('.artist-search').screenshot({ path: path.join(outputDirectory, `search-200-${size.width}x${size.height}.png`), scale: 'device' });
  await retinaContext.close();
}

await browser.close();
await fs.writeFile(path.join(outputDirectory, 'measurements.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
