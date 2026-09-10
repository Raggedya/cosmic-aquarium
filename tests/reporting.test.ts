import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const worker = fs.readFileSync(path.join(root, 'services', 'cosmic-worker', 'src', 'index.js'), 'utf8');
const machine = fs.readFileSync(path.join(root, 'github-pages', 'assets', 'discovery-machine.js'), 'utf8');
const doorway = fs.readFileSync(path.join(root, 'github-pages', 'assets', 'doorway.js'), 'utf8');
const aquarium = fs.readFileSync(path.join(root, 'github-pages', 'assets', 'site.js'), 'utf8');

test('daily discovery report is sent at 7 p.m. Sydney time', () => {
  assert.match(worker, /REPORT_TIME_ZONE = 'Australia\/Sydney'/);
  assert.match(worker, /if \(local\.hour !== 19\) return/);
  assert.match(worker, /sendActivityReport\(env,controller\.scheduledTime\)/);
});

test('report contains the visitor funnel, source attribution and artist discoveries', () => {
  for (const field of ['spinners', 'discoverers', 'aquarium_visitors', 'listeners', 'bandcamp_visitors', 'buyers', 'sharers']) {
    assert.ok(worker.includes(`AS ${field}`), `missing funnel field ${field}`);
  }
  assert.match(worker, /json_extract\(metadata,'\$\.acquisitionSource'\)/);
  assert.match(worker, /event_type='winner_revealed'/);
  assert.match(worker, /Daily discovery report/);
});

test('public experiences preserve privacy-safe acquisition attribution', () => {
  for (const source of [machine, doorway, aquarium]) {
    assert.match(source, /acquisitionSource/);
    assert.match(source, /referrerHost/);
    assert.doesNotMatch(source, /document\.referrer[^\n]*metadata/);
  }
  assert.match(machine, /recordEvent\('reel_spin'/);
  assert.doesNotMatch(machine, /recordEvent\(isSingleReelMode\?'reel_spin':'explore_click'/);
});

test('all live machine events are accepted by the reporting service', () => {
  for (const event of ['artist_selected', 'spin_started', 'spin_completed', 'track_play_started', 'festival_machine_loaded']) {
    assert.ok(worker.includes(`'${event}'`), `worker rejects ${event}`);
  }
});
