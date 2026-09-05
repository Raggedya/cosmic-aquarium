import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('the player returns to category selection without creating a third screen', async () => {
  const runtime = await readFile(path.resolve('github-pages', 'assets', 'discovery-machine.js'), 'utf8');
  const template = await readFile(path.resolve('templates', 'universe-index.html'), 'utf8');
  assert.match(template,/class="change-categories"/);
  assert.match(template,/aria-label="Home — choose music categories">Home<\/button>/);
  assert.equal((template.match(/data-screen=/g)||[]).length,2);
  assert.match(runtime,/changeButton\.addEventListener\('click',\(\)=>showSelection\(\)\)/);
  assert.match(runtime,/addEventListener\('popstate'/);
  assert.match(runtime,/history\.pushState/);
});

test('home transition stays within the original circular footprint and supports reduced motion', async () => {
  const styles = await readFile(path.resolve('app', 'cosmic-aquarium.css'), 'utf8');
  assert.match(styles, /\.cosmic-home-control\s*\{[\s\S]*?width: 44px;[\s\S]*?height: 44px;/);
  assert.match(styles, /\.cosmic-mark\s*\{[\s\S]*?width: 24px;[\s\S]*?height: 24px;/);
  assert.match(styles, /\.cosmic-home-control\.is-home \.cosmic-home-label \{ opacity: 1;/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*transition-duration: \.16s !important;/);
  assert.doesNotMatch(styles, /cosmic-home[^}]*animation:/);
});
