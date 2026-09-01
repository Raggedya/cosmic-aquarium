import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { classifyWaters, validWaters, WATERS } from '../scripts/water-classifier.mjs';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('the universe root is the doorway while artist routes remain direct', async () => {
  const [root, artistRoute] = await Promise.all([read('app/page.tsx'), read('app/[slug]/page.tsx')]);
  assert.match(root, /UniverseDoorway/);
  assert.match(artistRoute, /CosmicAquarium/);
  assert.doesNotMatch(artistRoute, /UniverseDoorway/);
});

test('doorway uses real accessible controls and canonical copy', async () => {
  const [component, template] = await Promise.all([
    read('src/features/universe-doorway/UniverseDoorway.tsx'),
    read('templates/universe-index.html'),
  ]);
  for (const phrase of ['COSMIC', 'AQUARIA', 'DRIFT', 'ANYWHERE', 'TOUCH SOMETHING.', 'Let the Music find you']) {
    assert.ok(component.includes(phrase) || template.includes(phrase), phrase);
  }
  assert.doesNotMatch(component, /ENTER WITHOUT KNOWING/);
  assert.doesNotMatch(template, /ENTER WITHOUT KNOWING/);
  assert.doesNotMatch(template, /doorway-footer"><span/);
  assert.doesNotMatch(component, /<span>TOUCH SOMETHING<\/span>/);
  assert.equal((template.match(/class="doorway-bubble doorway-bubble--/g) || []).length, 8);
  assert.match(template, /<button[^>]+data-water="anywhere"/);
  assert.match(component, /aria-label=/);
});

test('doorway motion is reduced-motion safe and softly collision aware', async () => {
  const [css, runtime, component, template] = await Promise.all([
    read('app/doorway.css'),
    read('github-pages/assets/doorway.js'),
    read('src/features/universe-doorway/UniverseDoorway.tsx'),
    read('templates/universe-index.html'),
  ]);
  assert.match(css, /prefers-reduced-motion\s*:\s*reduce/);
  assert.match(runtime, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/);
  assert.match(runtime, /overlap/);
  assert.match(runtime, /requestAnimationFrame/);
  assert.match(runtime, /body\.cx=body\.node\.offsetLeft/);
  assert.match(runtime, /body\.cy=body\.node\.offsetTop/);
  assert.match(runtime, /amplitude=body\.anchor\?\.0011:\.0032/);
  assert.match(runtime, /limit=body\.anchor\?4:14/);
  assert.equal((component.match(/size: 177/g) || []).length, 5);
  assert.equal((component.match(/size: 168/g) || []).length, 2);
  assert.equal((template.match(/--bubble-size:177px/g) || []).length, 5);
  assert.equal((template.match(/--bubble-size:168px/g) || []).length, 2);
});

test('doorway introduces the hero before the surrounding worlds rise into place', async () => {
  const css = await read('app/doorway.css');
  assert.match(css, /doorway-anchor-arrive 1\.9s/);
  assert.match(css, /doorway-orbit-arrive var\(--arrival-duration, 17\.92s\)/);
  assert.match(css, /--arrival-delay: 3s/);
  assert.match(css, /--arrival-duration: 17\.35s/);
  assert.match(css, /--arrival-duration: 19\.45s/);
  assert.match(css, /--arrival-duration: 16\.95s/);
  assert.match(css, /--arrival-delay: 4\.35s/);
  assert.match(css, /cubic-bezier\(\.24, \.42, \.28, 1\)/);
  assert.match(css, /translate: var\(--arrival-x, 0px\) 112vh/);
  assert.match(css, /--arrival-x: -22px/);
  assert.doesNotMatch(css, /arrival-settle-x/);
  assert.doesNotMatch(css, /translate:[^;]+-[1-9][0-9]*px/);
  assert.match(css, /100% \{ translate: 0 0; opacity: 1; \}/);
  assert.match(css, /prefers-reduced-motion[\s\S]+opacity: 1; translate: none/);
});

test('water classification is multi-label, valid and deterministic', () => {
  assert.deepEqual(classifyWaters({tags:['shoegaze','ambient'] as never[],text:'ethereal'}), ['dreamy','quiet']);
  const first = classifyWaters({seed:'same release'});
  assert.deepEqual(first, classifyWaters({seed:'same release'}));
  assert.ok(first.length >= 1 && first.length <= 2);
  assert.ok(first.every(value => WATERS.includes(value)));
  assert.deepEqual(validWaters(['dreamy','nope','dreamy','dark']), ['dreamy','dark']);
});

test('random discovery is fair, published-only, water-aware and falls back safely', async () => {
  const worker = await read('services/cosmic-worker/src/index.js');
  assert.match(worker, /status='published'/);
  assert.match(worker, /disabled_at IS NULL/);
  assert.match(worker, /INNER JOIN aquarium_water/);
  assert.match(worker, /ORDER BY RANDOM\(\) LIMIT 1/);
  assert.match(worker, /fallbackFrom/);
});

test('Explore Another retains only ephemeral water scope', async () => {
  const [reactRuntime, staticRuntime] = await Promise.all([
    read('src/features/cosmic-aquarium/CosmicAquarium.tsx'),
    read('github-pages/assets/site.js'),
  ]);
  for (const runtime of [reactRuntime, staticRuntime]) {
    assert.match(runtime, /cosmic-aquaria:water-scope/);
    assert.match(runtime, /water=/);
    assert.match(runtime, /source.*explore/);
    assert.doesNotMatch(runtime, /localStorage/);
  }
});

test('worker supports water administration, doorway analytics and destination health', async () => {
  const [worker, migration] = await Promise.all([
    read('services/cosmic-worker/src/index.js'),
    read('services/cosmic-worker/migrations/0002_aquarium_waters.sql'),
  ]);
  for (const event of ['doorway_open','drift_anywhere_selected','water_selected','random_destination_selected','doorway_to_aquarium_transition']) assert.ok(worker.includes(event));
  assert.match(worker, /setAquariumWaters/);
  assert.match(worker, /verifyDestinations/);
  assert.match(worker, /waterCounts/);
  assert.match(migration, /PRIMARY KEY \(aquarium_id, water\)/);
});

test('universe QR remains separate from artist QR and points to the canonical root', async () => {
  const generator = await read('scripts/generate_universe_qr.py');
  const artistGenerator = await read('scripts/create_artist.py');
  assert.match(generator, /https:\/\/raggedya\.github\.io\/cosmic-aquarium\//);
  assert.match(generator, /ERROR_CORRECT_H/);
  assert.match(generator, /cosmic-aquaria-qr-standard\.png/);
  assert.match(generator, /cosmic-aquaria-qr-branded\.png/);
  assert.match(artistGenerator, /cosmic-aquarium-qr\.png/);
});
