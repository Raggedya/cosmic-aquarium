import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root=path.resolve(import.meta.dirname,'..');
const template=fs.readFileSync(path.join(root,'templates','spotify-machine.html'),'utf8');
const styles=fs.readFileSync(path.join(root,'app','spotify-machine.css'),'utf8');
const runtime=fs.readFileSync(path.join(root,'github-pages','assets','spotify-machine.js'),'utf8');
const catalogue=JSON.parse(fs.readFileSync(path.join(root,'data','spotify','artist-discovery.json'),'utf8'));
const canonical=fs.readFileSync(path.join(root,'public','music-machine','aggits-spotify-bandcamp-canonical.png'));
const dashboard=fs.readFileSync(path.join(root,'desktop','artist_machine_factory_dashboard.py'),'utf8');
const spec=fs.readFileSync(path.join(root,'desktop','ArtistMachineFactory.spec'),'utf8');
const worker=fs.readFileSync(path.join(root,'services','cosmic-worker','src','index.js'),'utf8');

test('canonical Spotify jukebox artwork remains an exact 1024 by 1536 image layer',()=>{
  assert.equal(canonical.toString('ascii',1,4),'PNG');
  assert.equal(canonical.readUInt32BE(16),1024);
  assert.equal(canonical.readUInt32BE(20),1536);
  assert.match(template,/aggits-spotify-bandcamp-canonical\.png/);
  assert.match(styles,/aspect-ratio:2\/3/);
  assert.doesNotMatch(styles,/background-image:[^;]*canonical/);
});

test('proof of concept contains twenty unique verified-format Spotify and Bandcamp records',()=>{
  assert.equal(catalogue.records.length,20);
  assert.equal(new Set(catalogue.records.map((record:{id:string})=>record.id)).size,20);
  assert.ok(catalogue.records.filter((record:{spotifyUri:string})=>record.spotifyUri.startsWith('spotify:track:')).length>=19);
  for(const record of catalogue.records){
    assert.match(record.spotifyUri,/^spotify:(?:artist|track):[A-Za-z0-9]+$/);
    assert.match(record.spotifyEmbedUrl,/^https:\/\/open\.spotify\.com\/embed\/(?:artist|track)\/[A-Za-z0-9]+/);
    assert.match(record.spotifyOpenUrl,/^https:\/\/open\.spotify\.com\/(?:artist|track)\/[A-Za-z0-9]+$/);
    assert.match(record.bandcampUrl,/^https:\/\/[a-z0-9-]+\.bandcamp\.com\/$/);
  }
});

test('Spotify experience reuses the shared mechanical selection engines',()=>{
  assert.match(runtime,/from '\.\/discovery-machine-core\.js/);
  assert.match(runtime,/from '\.\/machine-mechanics-core\.js'/);
  assert.match(runtime,/from '\.\/single-reel-engine\.js'/);
  assert.match(runtime,/createShuffleBag/);
  assert.match(runtime,/spinSingleReel/);
  assert.match(runtime,/leverResistance/);
});

test('result opens an official Spotify embed and preserves a separate Bandcamp action',()=>{
  assert.match(template,/<iframe[^>]+allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"/);
  assert.match(template,/data-action="bandcamp"/);
  assert.match(template,/data-action="spotify"/);
  assert.match(runtime,/frame\.src=record\.spotifyEmbedUrl/);
  assert.match(runtime,/bandcampLink,current\.bandcampUrl/);
  assert.match(runtime,/spotifyLink,current\.spotifyOpenUrl/);
  assert.match(styles,/data-machine-state="PANEL_OPENING"/);
  assert.match(styles,/translateY\(-105%\)/);
});

test('all requested interaction events are emitted and accepted by reporting',()=>{
  for(const event of ['lever_pull','spin_started','spin_completed','artist_selected','panel_opened','spotify_embed_shown','open_spotify_clicked','bandcamp_clicked','spin_again_clicked','panel_closed']){
    assert.ok(runtime.includes(`'${event}'`),`runtime does not emit ${event}`);
    assert.ok(worker.includes(`'${event}'`),`worker rejects ${event}`);
  }
});

test('Spotify and Bandcamp mode is integrated into the existing desktop executable',()=>{
  assert.match(dashboard,/SpotifyBandcampModeFrame/);
  assert.match(dashboard,/text="SPOTIFY \+ BANDCAMP"/);
  assert.match(dashboard,/_show_primary_mode\("spotify"\)/);
  assert.match(spec,/"spotify_mode"/);
  assert.match(spec,/artist-discovery\.json/);
});

test('generated GitHub Pages route uses the same functional runtime',()=>{
  const output=fs.readFileSync(path.join(root,'github-pages','spotify','index.html'),'utf8');
  const outputData=JSON.parse(fs.readFileSync(path.join(root,'github-pages','spotify','artist-discovery.json'),'utf8'));
  assert.match(output,/\/cosmic-aquarium\/assets\/spotify-machine\.js/);
  assert.match(output,/\/cosmic-aquarium\/assets\/music-machine\/aggits-spotify-bandcamp-canonical\.png/);
  assert.equal(outputData.records.length,20);
});
