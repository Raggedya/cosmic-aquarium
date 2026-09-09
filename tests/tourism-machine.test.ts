import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {TOURISM_CATEGORIES,TOURISM_STATES,chooseTourismDiscovery,fitDiscoveryName,reelWindow,validateTourismConfig} from '../github-pages/assets/tourism-machine-core.js';

const read=(file:string)=>readFile(new URL(`../${file}`,import.meta.url),'utf8');

test('tourism machine is an isolated public product with the approved structural hierarchy',async()=>{
  const html=await read('templates/tourism-machine.html');
  assert.match(html,/data-tourism-machine/);
  assert.match(html,/data-machine-state="READY"/);
  assert.equal((html.match(/class="tourism-reel"/g)||[]).length,1);
  assert.doesNotMatch(html,/needle|gauge|data-meter/);
  assert.match(html,/data-result-panel/);
  assert.match(html,/data-title-tagline/);
  assert.match(html,/data-result-placeholder><span data-ticker/);
  assert.match(html,/data-result-category/);
  assert.equal((html.match(/data-action="(?:share|map|info|another)"/g)||[]).length,4);
  for(const label of ['SHARE<br>THIS','VIEW<br>ON MAP','MORE<br>INFO','ANOTHER<br>IDEA'])assert.match(html,new RegExp(label));
  assert.doesNotMatch(html,/SAVE|BANDCAMP|PLAYLIST|ALBUM/);
});

test('tourism machine uses dedicated runtime, assets, route and persistence namespace',async()=>{
  const [html,runtime,build]=await Promise.all([read('templates/tourism-machine.html'),read('github-pages/assets/tourism-machine.js'),read('scripts/build-github-pages.mjs')]);
  assert.match(html,/tourism-machine\.css/);
  assert.match(html,/tourism-machine\.js/);
  assert.match(runtime,/aggits:tourism:bendigo:sound-muted/);
  assert.match(runtime,/tourism-data\/bendigo\.json/);
  assert.match(runtime,/resultCategory\.textContent/);
  assert.match(runtime,/km from you/);
  assert.match(build,/renderTourismMachine/);
  assert.match(build,/pages,'tourism','index\.html'/);
  assert.match(build,/validateTourismData\(tourismData\)/);
});

test('tourism state, selection and long-name fitting are deterministic and generic',()=>{
  assert.deepEqual(TOURISM_STATES,['READY','LEVER_PULLED','SPINNING','DECELERATION','RESULT']);
  for(const category of ['SEE','DO','EAT','DRINK','SHOP','NATURE','HISTORY','WEIRD','DAY_TRIP'])assert.ok(TOURISM_CATEGORIES.includes(category));
  const items=[
    {id:'one',name:'Lake Weeroona',category:'NATURE'},
    {id:'two',name:'Central Deborah Gold Mine',category:'HISTORY'},
    {id:'three',name:'Bendigo Joss House Temple',category:'HISTORY'},
  ];
  const zero={getRandomValues(array:Uint32Array){array[0]=0;return array}} as Crypto;
  assert.equal(chooseTourismDiscovery(items,['one'],zero)?.id,'two');
  assert.equal(reelWindow(items,'two',5)[2].id,'two');
  assert.equal(fitDiscoveryName('Lake Weeroona'),'short');
  assert.equal(fitDiscoveryName('Central Deborah Gold Mine'),'medium');
});

test('mock Bendigo configuration validates and contains the milestone examples',async()=>{
  const value=JSON.parse(await read('data/tourism/bendigo.json'));
  const config=validateTourismConfig(value);
  assert.equal(config.status,'mock');
  assert.equal(config.destination.name,'Bendigo');
  assert.ok(config.discoveries.length>=10);
  for(const name of ['Bendigo Art Gallery','Central Deborah Gold Mine','Golden Dragon Museum','Lake Weeroona','The Great Stupa','Bendigo Tramways','Bendigo Botanic Gardens','The Dispensary','Balgownie Estate','Castlemaine'])assert.ok(config.discoveries.some((item:{name:string})=>item.name===name),name);
});

test('tourism presentation is responsive, dormant-first and uses four equal actions',async()=>{
  const [css,html]=await Promise.all([read('app/tourism-machine.css'),read('templates/tourism-machine.html')]);
  assert.match(css,/aspect-ratio:\s*762\/1280/);
  assert.match(css,/data-machine-state="READY"\] \.tourism-reel/);
  assert.match(css,/grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css,/prefers-reduced-motion:\s*reduce/);
  assert.match(css,/perspective:\s*760px/);
  assert.match(css,/transform-style:\s*preserve-3d/);
  assert.match(css,/\.tourism-actions button::before/);
  assert.match(css,/button:active:not\(:disabled\)::before/);
  assert.match(html,/class="lever-visual"/);
  assert.doesNotMatch(css,/\.gauge|\.needle/);
});

test('tourism reel uses continuous cylindrical motion and mechanically ordered audio',async()=>{
  const runtime=await read('github-pages/assets/tourism-machine.js');
  assert.match(runtime,/function renderCylinder\(/);
  assert.match(runtime,/Math\.sin\(radians\)\*radius/);
  assert.match(runtime,/rotateX\(/);
  assert.match(runtime,/requestAnimationFrame\(frame\)/);
  assert.match(runtime,/setState\('DECELERATION'/);
  assert.match(runtime,/distance=travel\*\(1\.003-/);
  assert.match(runtime,/await animateReel\(winner\);clearInterval\(factTimer\);stopMotor\(\);play\(lockSound/);
  assert.match(runtime,/play\(dingSound[\s\S]*renderResult\(winner\);setState\('RESULT'/);
  for(const asset of ['reel-ratchet-mixkit-2641.mp3','reel-actual-slotmachine-freesound-261346.mp3','reel-stop-lock-mixkit-2857.mp3','reel-stop-gear-mixkit-2858.mp3','winner-tonal-bloom-mixkit-3109.mp3'])assert.match(runtime,new RegExp(asset.replaceAll('.','\\.')));
});

test('existing festival machine remains on its original template and runtime',async()=>{
  const festival=await read('templates/festival-machine.html');
  assert.match(festival,/data-machine-content="festival"/);
  assert.match(festival,/assets\/discovery-machine\.js/);
  assert.doesNotMatch(festival,/tourism-machine/);
});
