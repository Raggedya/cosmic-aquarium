import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root=path.resolve(import.meta.dirname,'..');
const standardTemplate=fs.readFileSync(path.join(root,'templates','artist-machine.html'),'utf8');
const styles=fs.readFileSync(path.join(root,'app','spotify-machine.css'),'utf8');
const runtime=fs.readFileSync(path.join(root,'github-pages','assets','discovery-machine.js'),'utf8');
const build=fs.readFileSync(path.join(root,'scripts','build-github-pages.mjs'),'utf8');
const catalogue=JSON.parse(fs.readFileSync(path.join(root,'data','spotify','artist-discovery.json'),'utf8'));
const dashboard=fs.readFileSync(path.join(root,'desktop','artist_machine_factory_dashboard.py'),'utf8');
const spec=fs.readFileSync(path.join(root,'desktop','ArtistMachineFactory.spec'),'utf8');
const worker=fs.readFileSync(path.join(root,'services','cosmic-worker','src','index.js'),'utf8');

test('Spotify route is rendered from the canonical Standard Machine template',()=>{
  assert.match(build,/function renderSpotifyMachine\(\)[\s\S]*return artistMachineTemplate/);
  assert.match(build,/data-machine-platform="spotify"/);
  assert.match(standardTemplate,/aggits-cabinet\.webp/);
  assert.match(standardTemplate,/aggits-marquee-v2\.webp/);
  assert.match(standardTemplate,/class="meter-bank"/);
  assert.match(standardTemplate,/class="winner-splash"/);
  assert.match(standardTemplate,/class="machine-controls"/);
  assert.doesNotMatch(styles,/canonical-skin|machine-stage|reel-window/);
});

test('proof of concept contains twenty unique track-level Spotify and Bandcamp records',()=>{
  assert.equal(catalogue.records.length,20);
  assert.equal(new Set(catalogue.records.map((record:{id:string})=>record.id)).size,20);
  for(const record of catalogue.records){
    assert.match(record.trackTitle,/\S/);
    assert.match(record.spotifyUri,/^spotify:track:[A-Za-z0-9]+$/);
    assert.match(record.spotifyEmbedUrl,/^https:\/\/open\.spotify\.com\/embed\/track\/[A-Za-z0-9]+/);
    assert.match(record.spotifyOpenUrl,/^https:\/\/open\.spotify\.com\/track\/[A-Za-z0-9]+$/);
    assert.match(record.bandcampUrl,/^https:\/\/[a-z0-9-]+\.bandcamp\.com\/$/);
  }
});

test('Spotify mode uses the exact shared Standard Machine controller and engines',()=>{
  assert.match(runtime,/const isSpotifyMode=machine\?\.dataset\.machinePlatform==='spotify'/);
  assert.match(runtime,/from '\.\/discovery-machine-core\.js/);
  assert.match(runtime,/from '\.\/machine-mechanics-core\.js'/);
  assert.match(runtime,/from '\.\/single-reel-engine\.js'/);
  assert.match(runtime,/spinSingleReel/);
  assert.match(runtime,/leverResistance/);
});

test('the standard single reel has three visible songs and one centre winner',()=>{
  assert.equal((standardTemplate.match(/class="reel"/g)||[]).length,1);
  assert.match(standardTemplate,/class="reel-strip"><span><\/span><strong>LOADING SONGS<\/strong><span><\/span>/);
  assert.match(runtime,/populateSingleReel/);
  assert.match(runtime,/isSpotifyMode\?spotifyReelLabel\(entry\)/);
});

test('official Spotify playback and Bandcamp remain separate Standard Machine actions',()=>{
  assert.match(build,/Official Spotify playback controls/);
  assert.match(build,/encrypted-media/);
  assert.match(standardTemplate,/data-action="play"/);
  assert.match(standardTemplate,/data-action="buy"/);
  assert.match(runtime,/currentEmbedUrl=isSpotifyMode\?validSpotifyUrl\(track\.spotifyEmbedUrl/);
  assert.match(runtime,/currentPurchaseUrl=purchaseUrl/);
  assert.match(runtime,/activateSpotify/);
});

test('Spotify interaction events are emitted and accepted by reporting',()=>{
  for(const event of ['lever_pull','spin_started','spin_completed','artist_selected','panel_opened','spotify_embed_shown','open_spotify_clicked','bandcamp_clicked','spin_again_clicked','panel_closed']){
    assert.ok(runtime.includes(`'${event}'`),`runtime does not emit ${event}`);
    assert.ok(worker.includes(`'${event}'`),`worker rejects ${event}`);
  }
});

test('Spotify and Bandcamp mode remains in the existing desktop executable',()=>{
  assert.match(dashboard,/SpotifyBandcampModeFrame/);
  assert.match(dashboard,/text="SPOTIFY \+ BANDCAMP"/);
  assert.match(dashboard,/_show_primary_mode\("spotify"\)/);
  assert.match(spec,/"spotify_mode"/);
  assert.match(spec,/artist-discovery\.json/);
});

test('generated GitHub Pages route is the Standard Machine with Spotify enabled',()=>{
  const output=fs.readFileSync(path.join(root,'github-pages','spotify','index.html'),'utf8');
  const outputData=JSON.parse(fs.readFileSync(path.join(root,'github-pages','spotify','artist-discovery.json'),'utf8'));
  assert.match(output,/data-machine-mode="artist" data-machine-platform="spotify"/);
  assert.match(output,/\/cosmic-aquarium\/assets\/discovery-machine\.js/);
  assert.match(output,/\/cosmic-aquarium\/assets\/music-machine\/aggits-cabinet\.webp/);
  assert.match(output,/data-player-frame/);
  assert.doesNotMatch(output,/spotify-machine\.js|aggits-spotify-bandcamp-canonical/);
  assert.equal(outputData.records.length,20);
});
