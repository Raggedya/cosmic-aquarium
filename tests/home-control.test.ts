import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('aquarium home control preserves the brand mark for 15 seconds before activating', async () => {
  const runtime = await readFile(path.resolve('github-pages', 'assets', 'site.js'), 'utf8');
  const template = await readFile(path.resolve('templates', 'artist-index.html'), 'utf8');
  const reactExperience = await readFile(path.resolve('src', 'features', 'cosmic-aquarium', 'CosmicAquarium.tsx'), 'utf8');

  assert.match(template, /class="cosmic-home-control"/);
  assert.match(template, /href="\{\{BASE\}\}\/"/);
  assert.match(template, /aria-label="Return to Cosmic Aquaria home"/);
  assert.match(template, /aria-hidden="true" tabindex="-1"/);
  assert.match(runtime, /setTimeout\(\(\) => \{/);
  assert.match(runtime, /\},15000\)/);
  assert.match(runtime, /homeControl\.classList\.add\('is-home'\)/);
  assert.match(runtime, /removeAttribute\('aria-hidden'\)/);
  assert.match(runtime, /clearTimeout\(homeControlTimer\)/);
  assert.match(reactExperience, /setHomeControlActive\(true\), 15000/);
  assert.match(reactExperience, /return \(\) => window\.clearTimeout\(timer\)/);
  assert.match(reactExperience, /window\.location\.assign\('\/'\)/);
});

test('home transition stays within the original circular footprint and supports reduced motion', async () => {
  const styles = await readFile(path.resolve('app', 'cosmic-aquarium.css'), 'utf8');
  assert.match(styles, /\.cosmic-home-control\s*\{[\s\S]*?width: 44px;[\s\S]*?height: 44px;/);
  assert.match(styles, /\.cosmic-mark\s*\{[\s\S]*?width: 24px;[\s\S]*?height: 24px;/);
  assert.match(styles, /\.cosmic-home-control\.is-home \.cosmic-home-label \{ opacity: 1;/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*transition-duration: \.16s !important;/);
  assert.doesNotMatch(styles, /cosmic-home[^}]*animation:/);
});
