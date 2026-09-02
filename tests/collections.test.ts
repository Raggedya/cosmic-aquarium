import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { canonicalArtistId, isSafeCollectionParent, publishableMembers, shuffledMemberDeck } from '../src/collections/model.ts';
import type { ArtistCollection } from '../src/types/collection.ts';

test('album, track and artist URLs resolve to one canonical artist identity', () => {
  const urls = [
    'https://exampleartist.bandcamp.com/',
    'https://exampleartist.bandcamp.com/album/one',
    'https://exampleartist.bandcamp.com/track/two?from=discover_page',
  ];
  assert.deepEqual(new Set(urls.map(canonicalArtistId)), new Set(['bandcamp:exampleartist']));
});

test('one artist may belong to many parent collections without duplication', () => {
  const shared = {artistId:'bandcamp:one',artistName:'One',aquariumSlug:'one',aquariumUrl:'https://example.test/one/',verificationStatus:'verified' as const,displayEnabled:true};
  const base = {schemaVersion:1 as const,status:'published' as const,instruction:'TOUCH AN ARTIST',theme:'location',createdAt:'2026-01-01',updatedAt:'2026-01-01'};
  const location: ArtistCollection = {...base,id:'location:portland',slug:'portland',name:'Portland',type:'location',members:[shared]};
  const label: ArtistCollection = {...base,id:'label:one',slug:'label-one',name:'Label One',type:'label',members:[shared]};
  const dreamy: ArtistCollection = {...base,id:'genre:dreamy',slug:'dreamy',name:'Dreamy',type:'genre',members:[shared]};
  assert.equal(publishableMembers(location)[0].artistId,publishableMembers(label)[0].artistId);
  assert.equal(publishableMembers(label)[0].artistId,publishableMembers(dreamy)[0].artistId);
});

test('only verified visible artists appear and duplicates are removed', () => {
  const member = {artistId:'bandcamp:one',artistName:'One',aquariumSlug:'one',aquariumUrl:'https://example.test/one/',verificationStatus:'verified' as const,displayEnabled:true};
  const collection: ArtistCollection = {schemaVersion:1,id:'location:one',slug:'one',name:'One',type:'location',status:'published',instruction:'TOUCH AN ARTIST',theme:'location',createdAt:'2026-01-01',updatedAt:'2026-01-01',members:[member,{...member},{...member,artistId:'bandcamp:two',verificationStatus:'probable'}]};
  assert.deepEqual(publishableMembers(collection).map(item=>item.artistId),['bandcamp:one']);
});

test('collection randomisation creates a fair deck rather than a popularity rank', () => {
  const values = [0.8,0.1,0.6]; let index=0;
  const members = ['a','b','c','d'].map(artistId=>({artistId} as never));
  const deck = shuffledMemberDeck(members,()=>values[index++%values.length]);
  assert.equal(new Set(deck.map(item=>item.artistId)).size,4);
  assert.notDeepEqual(deck,members);
});

test('contextual HOME accepts only same-origin collection parents', () => {
  assert.equal(isSafeCollectionParent('/collections/portland/','https://cosmicaquaria.test'),'/collections/portland/');
  assert.equal(isSafeCollectionParent('https://evil.test/collections/portland/','https://cosmicaquaria.test'),null);
  assert.equal(isSafeCollectionParent('/artist/portland/','https://cosmicaquaria.test'),null);
});

test('publishing builds canonical artist and separate collection indexes', async () => {
  const build = await readFile(path.resolve('scripts','build-github-pages.mjs'),'utf8');
  assert.match(build,/artists-index\.json/);
  assert.match(build,/automation','collections/);
  assert.match(build,/canonicalArtistId/);
  assert.match(build,/seen\.has\(artist\.id\)/);
});

test('Explore Another stays inside the parent collection when that was the entry door', async () => {
  const reactExperience = await readFile(path.resolve('src','features','cosmic-aquarium','CosmicAquarium.tsx'),'utf8');
  const staticExperience = await readFile(path.resolve('github-pages','assets','site.js'),'utf8');
  assert.match(reactExperience,/const parentSlug = homeDestination\.match/);
  assert.match(reactExperience,/publishableMembers\(parentCollection\)/);
  assert.match(reactExperience,/set\('parent', homeDestination\)/);
  assert.match(staticExperience,/let collectionSlug = ''/);
  assert.match(staticExperience,/collections\/.*encodeURIComponent\(collectionSlug\).*\.json/);
});
