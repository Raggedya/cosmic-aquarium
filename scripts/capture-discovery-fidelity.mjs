import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const argumentsMap = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  argumentsMap.set(process.argv[index], process.argv[index + 1]);
}

const baseUrl = argumentsMap.get('--base-url') || 'http://127.0.0.1:8765/cosmic-aquarium/';
const outputDirectory = path.resolve(argumentsMap.get('--output') || 'artifacts/two-screen-fidelity');
const label = argumentsMap.get('--label') || 'current';
const chromeExecutable = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sizes = [
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 430, height: 932 },
];

await fs.mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch({ executablePath: chromeExecutable, headless: true });
const results = [];

for (const size of sizes) {
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('api/events')) consoleErrors.push(message.text());
  });

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(outputDirectory, `${label}-selector-${size.width}x${size.height}.png`) });
  await page.locator('[data-category="dark"]').click();
  await page.waitForTimeout(180);
  await page.screenshot({ path: path.join(outputDirectory, `${label}-selector-dark-${size.width}x${size.height}.png`) });

  await page.locator('[data-category="strange"]').click();
  const transitionStartedAt = Date.now();
  await page.locator('.go-key').click();
  await page.waitForFunction(() => document.querySelector('.player-screen')?.classList.contains('is-active'));
  const goHoldObservedMs = Date.now() - transitionStartedAt;
  const interaction = await page.evaluate(() => ({
    selected: [...document.querySelectorAll('.glass-key.is-selected')].map((element) => element.getAttribute('data-category')),
    playerVisible: document.querySelector('.player-screen')?.classList.contains('is-active'),
    actions: [...document.querySelectorAll('.player-actions [data-action]')].map((element) => element.getAttribute('data-action')),
  }));

  const catalogue = await page.evaluate(async () => (await (await fetch('./aquariums.json')).json()).aquariums);
  const release = catalogue.find((entry) => entry.status === 'published' && entry.waters?.includes('dark')) || catalogue.find((entry) => entry.status === 'published');
  const playerUrl = new URL(baseUrl);
  playerUrl.searchParams.set('release', release.slug);
  playerUrl.searchParams.set('categories', release.waters?.[0] || 'anything');
  await page.goto(playerUrl.toString(), { waitUntil: 'networkidle' });
  await page.locator('.player-screen.is-active').waitFor();
  await page.screenshot({ path: path.join(outputDirectory, `${label}-player-${size.width}x${size.height}.png`) });

  const metrics = await page.evaluate(() => ({
    viewportWidth: innerWidth,
    viewportHeight: innerHeight,
    documentWidth: document.documentElement.scrollWidth,
    documentHeight: document.documentElement.scrollHeight,
    machine: document.querySelector('.discovery-machine')?.getBoundingClientRect().toJSON(),
  }));
  results.push({ size, release: release.slug, goHoldObservedMs, interaction, consoleErrors, metrics });
  await context.close();
}

await browser.close();
await fs.writeFile(path.join(outputDirectory, `${label}-capture-report.json`), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
