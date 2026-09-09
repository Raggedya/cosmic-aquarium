import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {TOURISM_CATEGORIES,TOURISM_STATES,chooseTourismDiscovery,fitDiscoveryName,reelWindow,validateTourismConfig} from '../github-pages/assets/tourism-machine-core.js';
import {REGIONAL_TOURISM_MACHINES} from '../data/tourism/regional-centres.mjs';

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
  assert.match(html,/data-result-location/);
  assert.equal((html.match(/data-action="(?:share|map|info|another)"/g)||[]).length,4);
  for(const label of ['SHARE<br>THIS','VIEW<br>ON MAP','MORE<br>INFO','ANOTHER<br>IDEA'])assert.match(html,new RegExp(label));
  assert.doesNotMatch(html,/SAVE|BANDCAMP|PLAYLIST|ALBUM/);
});

test('tourism machine uses dedicated runtime, assets, route and persistence namespace',async()=>{
  const [html,runtime,build]=await Promise.all([read('templates/tourism-machine.html'),read('github-pages/assets/tourism-machine.js'),read('scripts/build-github-pages.mjs')]);
  assert.match(html,/tourism-machine\.css/);
  assert.match(html,/tourism-machine\.js/);
  assert.match(runtime,/aggits:tourism:\$\{destinationSlug\}:sound-muted/);
  assert.match(runtime,/tourism-data\/\$\{destinationSlug\}\.json/);
  assert.match(runtime,/resultCategory\.textContent/);
  assert.match(runtime,/item\.longDescription\|\|item\.shortDescription/);
  assert.match(runtime,/resultLocation\.textContent/);
  assert.match(build,/renderTourismMachine/);
  assert.match(build,/pages,'tourism','index\.html'/);
  assert.match(build,/for\(const machine of tourismMachines\)validateTourismData\(machine\.config\)/);
});

test('ten additional Victorian regional-centre machines have rich winning-detail data',()=>{
  assert.equal(REGIONAL_TOURISM_MACHINES.length,10);
  assert.deepEqual(REGIONAL_TOURISM_MACHINES.map(machine=>machine.slug),['ballarat','geelong','warrnambool','mildura','shepparton','wangaratta','wodonga','horsham','sale','traralgon']);
  for(const machine of REGIONAL_TOURISM_MACHINES){
    const config=validateTourismConfig(machine.config);
    assert.equal(config.destination.state,'Victoria');
    assert.ok(config.discoveries.length>=8,machine.slug);
    assert.ok(config.tickerFacts.length>=3,machine.slug);
    for(const discovery of config.discoveries){
      assert.ok(discovery.longDescription.length>=80,`${machine.slug}:${discovery.name}`);
      assert.ok(discovery.address&&discovery.locality&&discovery.hours,`${machine.slug}:${discovery.name}`);
      assert.match(discovery.mapUrl,/google\.com\/maps\/search/);
      assert.match(discovery.websiteUrl,/^https:\/\//);
    }
  }
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
  assert.match(css,/perspective\(120px\) rotateX\(-5deg\)/);
  assert.match(css,/\.tourism-actions button::before/);
  assert.match(css,/mix-blend-mode:\s*screen/);
  assert.match(css,/button\.more-info::before[\s\S]*#169b83/);
  assert.match(css,/button:hover:not\(:disabled\)::after/);
  assert.match(css,/button:active:not\(:disabled\)::before/);
  assert.match(html,/class="lever-visual"/);
  assert.doesNotMatch(css,/\.gauge|\.needle/);
});

test('tourism and Artist products use the same extracted three-slot reel engine',async()=>{
  const [runtime,musicRuntime,mechanics,engine,css,html]=await Promise.all([read('github-pages/assets/tourism-machine.js'),read('github-pages/assets/discovery-machine.js'),read('github-pages/assets/machine-mechanics-core.js'),read('github-pages/assets/single-reel-engine.js'),read('app/tourism-machine.css'),read('templates/tourism-machine.html')]);
  assert.match(runtime,/from'.\/machine-mechanics-core\.js'/);
  assert.match(musicRuntime,/from '.\/machine-mechanics-core\.js'/);
  assert.match(runtime,/from'.\/single-reel-engine\.js'/);
  assert.match(musicRuntime,/from '.\/single-reel-engine\.js'/);
  assert.match(engine,/import\{mechanicalCadence\}from'.\/machine-mechanics-core\.js'/);
  assert.match(engine,/duration:2350/);
  assert.match(engine,/reducedMotionDuration:620/);
  assert.match(engine,/single_reel_requires_three_slots/);
  assert.match(engine,/const cadence=mechanicalCadence\(progress,reelIndex\)/);
  assert.match(engine,/strip\.style\.transform=`translate3d/);
  assert.match(runtime,/spinSingleReel\(/);
  assert.match(musicRuntime,/spinSingleReel\(/);
  assert.match(mechanics,/leverResistanceExponent:\.78/);
  assert.match(mechanics,/decelerationRange:190/);
  assert.doesNotMatch(runtime,/renderCylinder|mechanicalReelProgress|playTick|tickSound|slowTickSound/);
  assert.match(runtime,/function tourismReelItem\(discovery\)/);
  assert.match(runtime,/function discoveryForReelItem\(item\)/);
  assert.match(html,/class="reel-rows reel-strip"[\s\S]*<span><\/span><strong>LOADING PLACES<\/strong><span><\/span>/);
  assert.match(css,/\.reel-strip > span:first-child[^{]*\{ transform: perspective\(120px\) rotateX\(-5deg\)/);
  assert.match(css,/grid-template-rows: repeat\(3,1fr\)/);
  assert.match(runtime,/setState\('DECELERATION'/);
  assert.match(runtime,/function stopMotor\(immediate=false\)/);
  assert.match(runtime,/startVolume\*\(1-step\/6\)/);
  assert.match(runtime,/setAudioState\('DECELERATING'\)/);
  assert.match(runtime,/playSample\(reelRatchetAudio,\{volume:\.66,rate:\.96\}\)/);
  assert.match(runtime,/playSample\(reelStopAudio,\{volume:\.72,rate:1\.04\}\)/);
  assert.match(runtime,/await animateReel\(winnerReelItem\)[\s\S]*stopMotor\(\)[\s\S]*await wait\(reducedMotion\.matches\?100:380\)[\s\S]*celebrationSound\(\)/);
  assert.doesNotMatch(runtime,/relaySound|rowCrossing/);
  for(const asset of ['reel-actual-slotmachine-freesound-261346.mp3','reel-ratchet-mixkit-2641.mp3','reel-stop-lock-mixkit-2857.mp3','winner-tonal-bloom-mixkit-3109.mp3'])assert.match(runtime,new RegExp(asset.replaceAll('.','\\.')));
});

test('existing festival machine remains on its original template and runtime',async()=>{
  const festival=await read('templates/festival-machine.html');
  assert.match(festival,/data-machine-content="festival"/);
  assert.match(festival,/assets\/discovery-machine\.js/);
  assert.doesNotMatch(festival,/tourism-machine/);
});
