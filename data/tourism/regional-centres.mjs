const VERIFIED_ON='2026-09-09';
const CABINET_IMAGE='../assets/tourism-machine/bendigo-tourism-cabinet-reference.jpg';

const slugify=value=>String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const mapUrl=(name,locality)=>`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name}, ${locality}, Victoria`)}`;

function discovery(destination,region,sourceUrl,[name,category,shortDescription,longDescription,address,locality=destination,distanceKm=0,hours='Check current opening details',tags=[]]){
  return {
    id:slugify(`${destination}-${name}`),name,category,shortDescription,longDescription,
    image:CABINET_IMAGE,address,locality,region,latitude:null,longitude:null,
    websiteUrl:sourceUrl,mapUrl:mapUrl(name,locality),distanceKm,hours,tags,
    source:sourceUrl,lastVerified:VERIFIED_ON,
  };
}

function machine({slug,name,region,radiusKm,slogan,sourceUrl,facts,discoveries}){
  return {
    slug,
    config:{
      schemaVersion:1,status:'regional-preview',
      destination:{name,region,state:'Victoria',country:'Australia',radiusKm,machineTitle:`Things To Do In ${name}`,tagline:'Spin • Explore • Be Surprised',slogan},
      tickerFacts:facts,
      discoveries:discoveries.map(item=>discovery(name,region,sourceUrl,item)),
    },
  };
}

export const REGIONAL_TOURISM_MACHINES=Object.freeze([
  machine({
    slug:'ballarat',name:'Ballarat',region:'Central Highlands',radiusKm:45,slogan:'Gold stories. Creative spirit.',sourceUrl:'https://www.visitballarat.com.au/explore',
    facts:['Ballarat is one of Victoria’s great gold-rush cities.','Lake Wendouree has a popular six-kilometre circuit.','The city combines heritage streets, contemporary art and cool-climate gardens.'],
    discoveries:[
      ['Sovereign Hill','HISTORY','Walk into an immersive gold-rush township.','Pan for gold, explore working trades and descend on a mine tour inside Ballarat’s celebrated living museum.','Bradshaw Street','Ballarat',3.2,'Tue–Sun; check session times',['gold rush','living museum']],
      ['Ballarat Wildlife Park','NATURE','Meet Australian wildlife among open gum trees.','See free-roaming kangaroos, koalas, wombats and conservation presentations at this family-run wildlife park.','250 Fussell Street','Ballarat',4.1,'Daily 9am–5pm',['wildlife','family']],
      ['Lake Wendouree','NATURE','Walk, ride or pause beside Ballarat’s city lake.','Follow the six-kilometre foreshore circuit past boatsheds, birdlife, playgrounds and waterside places to eat.','Wendouree Parade','Lake Wendouree',2.2,'Open public space',['lake','walk']],
      ['Ballarat Botanical Gardens','NATURE','Explore one of Australia’s notable cool-climate gardens.','See mature trees, seasonal displays, the Robert Clark Conservatory and the Prime Ministers Avenue beside Lake Wendouree.','Wendouree Parade','Lake Wendouree',4.0,'Daily; check conservatory hours',['gardens','heritage']],
      ['Eureka Centre','HISTORY','Explore the stories and legacy of Eureka.','Interactive exhibitions place the 1854 Eureka Stockade in its social, political and cultural context.','102 Stawell Street South','Eureka',3.2,'Check current opening hours',['history','democracy']],
      ['Art Gallery of Ballarat','SEE','Visit Australia’s oldest and largest regional art gallery.','Discover Australian art, changing exhibitions and the creative history of Ballarat in the heart of the city.','40 Lydiard Street North','Ballarat',0.4,'Daily; check exhibition hours',['art','culture']],
      ['Ballarat Tramway Museum','DO','Ride a century-old tram beside Lake Wendouree.','Historic tramcars run through the gardens precinct, with a display hall preserving Ballarat’s tramway story.','Wendouree Parade','Lake Wendouree',4.1,'Check running days',['tram','heritage']],
      ['Kryal Castle','WEIRD','Enter a theatrical medieval adventure park.','Explore castle grounds, demonstrations and family experiences inspired by knights, myths and medieval spectacle.','121 Forbes Road','Leigh Creek',9.8,'Check event calendar',['family','medieval']],
    ],
  }),
  machine({
    slug:'geelong',name:'Geelong',region:'Geelong and The Bellarine',radiusKm:45,slogan:'Bay views. Bold stories.',sourceUrl:'https://www.visitgeelongbellarine.com.au/things-to-do',
    facts:['Geelong’s north-facing waterfront looks across Corio Bay.','More than one hundred painted bollards line the waterfront trail.','The city is a gateway to the Bellarine Peninsula and You Yangs.'],
    discoveries:[
      ['Eastern Beach Reserve','NATURE','Swim, picnic and promenade on Corio Bay.','The 1930s waterfront reserve combines lawns, sea baths, a children’s pool and an Art Deco promenade close to the city.','95 Eastern Beach Road','Geelong',1.2,'Open public space',['waterfront','swimming']],
      ['Geelong Bollard Trail','SEE','Meet colourful characters along the waterfront.','More than one hundred painted timber bollards interpret people and stories from Geelong’s history on a bayside walk.','Eastern Beach Road','Geelong',0.8,'Open public trail',['public art','walk']],
      ['National Wool Museum','HISTORY','Discover the fibre that shaped Geelong.','Inside an 1872 bluestone woolstore, exhibitions explore wool, industry, textiles and the people behind the region’s growth.','26 Moorabool Street','Geelong',0.4,'Check current opening hours',['museum','industry']],
      ['Geelong Botanic Gardens','NATURE','Wander historic gardens beside Eastern Park.','Established in 1851, the gardens pair heritage plantings with contemporary Australian collections and sheltered lawns.','Podbury Drive','East Geelong',2.1,'Daily',['gardens','heritage']],
      ['Geelong Gallery','SEE','See Australian art in the cultural precinct.','The gallery presents significant Australian paintings, works on paper and changing exhibitions near Johnstone Park.','55 Little Malop Street','Geelong',0.3,'Check current exhibitions',['art','culture']],
      ['Little Malop Street','EAT','Follow Geelong’s lively dining and laneway strip.','Street art, small bars, restaurants and performance spaces make this compact precinct an easy evening discovery.','Little Malop Street','Geelong',0.2,'Venue hours vary',['food','laneways']],
      ['You Yangs Regional Park','NATURE','Climb granite ridges for broad western views.','Walking and mountain-bike trails rise through native woodland to viewpoints over the volcanic plains and Corio Bay.','Turntable Drive','Little River',28.0,'Daylight access; check park advice',['hiking','views']],
      ['Bellarine Rail Trail','DO','Cycle from the city toward the Bellarine.','A shared trail follows the former railway corridor through open country, linking Geelong with towns toward Queenscliff.','Swanston Street','South Geelong',1.5,'Open public trail',['cycling','rail trail']],
    ],
  }),
  machine({
    slug:'warrnambool',name:'Warrnambool',region:'Great Ocean Road',radiusKm:50,slogan:'Wild coast. Deep stories.',sourceUrl:'https://www.visitvictoria.com/Regions/Great-Ocean-Road/Destinations/Warrnambool.aspx',
    facts:['Warrnambool overlooks the Southern Ocean on Eastern Maar Country.','Winter visitors may see southern right whales near Logan’s Beach.','The city’s maritime history is shaped by the dramatic Shipwreck Coast.'],
    discoveries:[
      ['Flagstaff Hill Maritime Village','HISTORY','Step into Warrnambool’s maritime past.','A recreated nineteenth-century port and museum tells stories of the Shipwreck Coast, trade, navigation and life by the sea.','89 Merri Street','Warrnambool',1.0,'Check museum and evening-show times',['maritime','museum']],
      ['Logans Beach Whale Platform','NATURE','Scan the winter ocean for southern right whales.','A purpose-built viewing platform overlooks a recognised calving area; sightings are seasonal and never guaranteed.','Logans Beach Road','Warrnambool',4.4,'Open; best during whale season',['whales','coast']],
      ['Tower Hill Wildlife Reserve','NATURE','Explore a volcanic crater rich with wildlife.','Walking tracks cross wetlands and woodland inside an inactive volcano where emus, koalas and kangaroos are often seen.','105 Lake View Road','Tower Hill',14.0,'Open public reserve',['volcano','wildlife']],
      ['Deep Blue Hot Springs','DO','Soak in geothermal mineral waters by the coast.','A sequence of open-air bathing pools offers a restorative experience fed by naturally heated mineral water.','Worm Bay Road','Warrnambool',2.2,'Bookings recommended',['hot springs','wellness']],
      ['Lake Pertobe Adventure Playground','DO','Make room for a lively family stop.','Playgrounds, lawns, paths and waterways fill a large recreational precinct between the city and the beach.','Pertobe Road','Warrnambool',1.4,'Open public space',['family','playground']],
      ['Warrnambool Botanic Gardens','NATURE','Pause among elegant nineteenth-century gardens.','Curving paths, lawns, mature trees and a lily pond create a quiet green retreat designed in the Guilfoyle tradition.','24 Botanic Road','Warrnambool',1.3,'Daily',['gardens','heritage']],
      ['Thunder Point Coastal Reserve','NATURE','Watch the coast from dramatic rocky lookouts.','Short paths reveal islands, reefs and broad Southern Ocean views, especially atmospheric near sunset.','MacDonald Street','Warrnambool',3.0,'Open public reserve',['coast','sunset']],
      ['Warrnambool Art Gallery','SEE','Explore art connected to place and community.','The regional gallery presents historical and contemporary exhibitions in Warrnambool’s central cultural precinct.','26 Liebig Street','Warrnambool',0.3,'Check current opening hours',['art','culture']],
    ],
  }),
  machine({
    slug:'mildura',name:'Mildura',region:'Sunraysia',radiusKm:120,slogan:'River life. Outback light.',sourceUrl:'https://www.visitvictoria.com/mildura',
    facts:['Mildura is a Murray River oasis on the edge of the outback.','The region is known for citrus, grapes, food and long river sunsets.','Ancient Mungo landscapes lie beyond the irrigated river country.'],
    discoveries:[
      ['Mildura Riverfront','NATURE','Walk beside the Murray in the heart of town.','Riverbank paths connect lawns, water play, historic wharves and sunset views along Mildura’s revitalised waterfront.','Hugh King Drive','Mildura',1.0,'Open public space',['river','walk']],
      ['Paddle Vessel Rothbury','DO','Cruise the Murray on a historic paddle vessel.','Depart from Mildura Wharf for a slow river journey shaped by red gums, locks and the rhythm of paddle-wheel travel.','Mildura Wharf','Mildura',0.8,'Check cruise schedule',['paddle steamer','river']],
      ['Mildura Arts Centre','SEE','Combine gallery, theatre and heritage gardens.','The precinct brings visual art, performance, Rio Vista Historic House and sculpture into one river-adjacent cultural stop.','199 Cureton Avenue','Mildura',1.8,'Check exhibition and performance hours',['art','heritage']],
      ['Orange World','DO','Tour a working citrus property by tractor train.','Learn how Sunraysia fruit is grown, taste seasonal produce and explore the orchard just across the Murray.','93 Link Road','Mourquong',8.5,'Tours scheduled; check before visiting',['citrus','farm']],
      ['Australian Inland Botanic Gardens','NATURE','See plants from dry regions around the world.','Native and exotic collections thrive in a distinctive inland landscape spanning the New South Wales–Victoria border country.','1183 River Road','Mourquong',12.0,'Check seasonal opening hours',['gardens','outback']],
      ['Perry Sandhills','NATURE','Walk across sculpted red sand near Wentworth.','Wind-shaped dunes reveal layers of natural and cultural history and glow strongly in late-afternoon light.','Old Renmark Road','Wentworth',34.0,'Open public landscape',['sandhills','sunset']],
      ['Mungo National Park','DAY_TRIP','Journey into an ancient World Heritage landscape.','Lake Mungo’s lunettes preserve exceptional environmental and cultural records; plan carefully and respect access guidance.','Arumpo Road','Mungo',110.0,'Plan ahead; road conditions vary',['world heritage','culture']],
      ['Pink Lakes','DAY_TRIP','Seek shifting colour in Murray-Sunset country.','Salt lakes around the remote Pink Lakes precinct can take on vivid tones depending on water, algae, salt and light.','Pink Lakes Road','Murray-Sunset',110.0,'Remote trip; check park conditions',['salt lakes','outback']],
    ],
  }),
  machine({
    slug:'shepparton',name:'Shepparton',region:'Goulburn Valley',radiusKm:45,slogan:'Big flavours. Colourful culture.',sourceUrl:'https://www.visitvictoria.com/regions/the-goulburn/destinations/shepparton',
    facts:['Shepparton sits in one of Australia’s major food-producing regions.','Kaiela, the Goulburn River, connects communities across the valley.','Public art, orchards and multicultural food shape the city’s identity.'],
    discoveries:[
      ['Shepparton Art Museum','SEE','Explore contemporary art beside Victoria Park Lake.','SAM’s striking building presents Australian ceramics, First Nations art and changing exhibitions with elevated lake views.','530 Wyndham Street','Shepparton',1.0,'Check current opening hours',['art','ceramics']],
      ['Moooving Art','WEIRD','Find a colourful herd across the city.','More than ninety life-sized fibreglass cows turn Shepparton’s dairy story into a playful public-art trail.','Wyndham Street','Shepparton',0.5,'Free public art',['public art','dairy']],
      ['Victoria Park Lake','NATURE','Walk and picnic beside a central urban lake.','Shared paths, lawns, wetlands and views of SAM create an easy outdoor circuit close to central Shepparton.','Wyndham Street','Shepparton',1.1,'Open public space',['lake','walk']],
      ['Australian Botanic Gardens Shepparton','NATURE','See native landscapes shaped on a former tip site.','Distinct gardens, wetlands and lookout paths interpret Australian plants and local environmental renewal.','Botanic Gardens Avenue','Kialla',5.4,'Open public gardens',['native plants','walk']],
      ['Kaiela Arts','SEE','Connect with Aboriginal art from the Kaiela Dungala region.','The Aboriginal-owned art centre supports artists and shares contemporary work grounded in culture, Country and community.','530 Wyndham Street','Shepparton',1.0,'Check gallery hours',['First Nations','art']],
      ['MOVE Museum','HISTORY','Discover transport, motoring and local collections.','The Museum of Vehicle Evolution brings together historic vehicles, bicycles and regional stories in a large modern museum.','7723 Goulburn Valley Highway','Kialla',7.0,'Check current opening hours',['transport','museum']],
      ['Aquamoves','DO','Swim or unwind beside Victoria Park Lake.','Indoor and outdoor pools, fitness facilities and family aquatic spaces make this a practical active stop.','25 Tom Collins Drive','Shepparton',1.3,'Session hours vary',['swimming','family']],
      ['Dookie Rail Trail','DO','Ride through open Goulburn Valley farmland.','A regional shared trail follows the former railway corridor around Dookie with broad views, seasonal crops and big skies.','Mary Street','Dookie',30.0,'Open public trail',['cycling','rail trail']],
    ],
  }),
  machine({
    slug:'wangaratta',name:'Wangaratta',region:'High Country',radiusKm:60,slogan:'River country. High-country flavour.',sourceUrl:'https://www.visitwangaratta.com.au/See-Do',
    facts:['The Ovens and King rivers meet near Wangaratta.','The city is a gateway to the King Valley and Milawa gourmet region.','Rail trails link Wangaratta with valleys, vineyards and historic towns.'],
    discoveries:[
      ['Ovens River Precinct','NATURE','Walk through riverside parkland close to town.','Paths, lawns and shady riverbanks bring Wangaratta’s outdoor lifestyle into the centre of the city.','Faithfull Street','Wangaratta',0.8,'Open public space',['river','walk']],
      ['Wangaratta Art Gallery','SEE','See contemporary exhibitions in a regional gallery.','The gallery presents visual art, touring shows and work connected to North East Victoria’s creative communities.','56 Ovens Street','Wangaratta',0.2,'Check exhibition hours',['art','culture']],
      ['Bullawah Cultural Trail','HISTORY','Follow stories of Aboriginal culture and Country.','A riverside interpretive trail shares cultural knowledge and the continuing connections of local Traditional Owners.','Merriwa Park','Wangaratta',0.7,'Open public trail',['First Nations','walk']],
      ['Murray to Mountains Rail Trail','DO','Cycle from Wangaratta into the High Country.','A sealed regional trail links farmland, food towns and former railway stations on routes toward Bright and Beechworth.','Wangaratta Trailhead','Wangaratta',1.0,'Open public trail',['cycling','rail trail']],
      ['Warby-Ovens National Park','NATURE','Walk granite hills above river red-gum country.','The park combines rocky ranges, woodland, wetlands and broad views west of Wangaratta.','Booth Road','Warby',24.0,'Check park conditions',['hiking','national park']],
      ['Milawa Gourmet Region','EAT','Taste produce at the gateway to the King Valley.','Cheese, wine, bakeries and farm-gate experiences cluster around a compact village food region.','Milawa-Bobinawarrah Road','Milawa',17.0,'Venue hours vary',['food','wine']],
      ['King Valley','DRINK','Explore a valley shaped by family winemakers.','Italian heritage, vineyards, mountain scenery and cellar doors make the valley an easy food-and-wine day trip.','Wangaratta-Whitfield Road','Whitfield',50.0,'Cellar-door hours vary',['wine','valley']],
      ['Ned Kelly Discovery Hub','HISTORY','Revisit the Kelly story at Glenrowan.','Interactive interpretation places the final siege within the landscape, people and contested history of the district.','Gladstone Street','Glenrowan',16.0,'Daily; check current hours',['bushranger','history']],
    ],
  }),
  machine({
    slug:'wodonga',name:'Wodonga',region:'Albury Wodonga',radiusKm:50,slogan:'Two cities. One river country.',sourceUrl:'https://www.wodonga.vic.gov.au/Activities-Attractions/See-and-do',
    facts:['Wodonga shares a cross-border destination with Albury.','More than eighty kilometres of pathways connect the city and surrounding hills.','The Murray River, Lake Hume and High Country are all close at hand.'],
    discoveries:[
      ['Bonegilla Migrant Experience','HISTORY','Walk through Australia’s post-war migration history.','Block 19 preserves buildings and personal stories from the reception centre that welcomed more than 300,000 migrants.','132 Bonegilla Road','Bonegilla',13.5,'Check current opening hours',['migration','heritage']],
      ['Hyphen Wodonga Library Gallery','SEE','Pair contemporary art with a welcoming civic space.','Exhibitions, collections and creative programs sit inside Wodonga’s central library-gallery building.','126 Hovell Street','Wodonga',0.4,'Check current opening hours',['art','library']],
      ['Gateway Village','SEE','Meet artists and makers beside the Murray.','Studios, galleries, performance spaces and markets occupy a cultural precinct on Gateway Island.','Lincoln Causeway','Wodonga',4.0,'Studio hours vary',['artists','markets']],
      ['Crossing Place Trail','HISTORY','Follow sculpture and stories beside the Murray.','Public artworks by Aboriginal artists connect river landscape, culture and the historic crossing between two cities.','Gateway Island','Wodonga',4.2,'Open public trail',['First Nations','sculpture']],
      ['High Country Rail Trail','DO','Cycle beside farmland and Lake Hume.','The trail follows former railway country east of Wodonga, with long water views and links toward Old Tallangatta.','Whytes Road','Bandiana',6.5,'Open public trail',['cycling','lake']],
      ['Lake Hume','NATURE','Find wide water and High Country horizons.','The reservoir supports boating, fishing, swimming and shoreline picnics against a changing mountain backdrop.','Lake Hume Tourist Road','Bonegilla',14.0,'Check water and park conditions',['lake','boating']],
      ['Belvoir Park','DO','Enjoy a family park around Sumsion Gardens.','Playgrounds, paths, lawns and water views create an easy all-ages stop close to central Wodonga.','Huon Street','Wodonga',1.1,'Open public space',['family','park']],
      ['Huon Hill','NATURE','Climb for views over Wodonga and the valleys.','Walking and driving access lead to elevated lookouts across the Murray River, Lake Hume and surrounding ranges.','Kenneth Watson Drive','Wodonga',8.0,'Daylight visit recommended',['lookout','walk']],
    ],
  }),
  machine({
    slug:'horsham',name:'Horsham',region:'Wimmera',radiusKm:55,slogan:'Big sky. Ancient country.',sourceUrl:'https://www.visitvictoria.com/regions/grampians/destinations/horsham.aspx',
    facts:['Horsham is known as the Capital of the Wimmera.','The Wimmera River curves through parks and wetlands in the city.','Gariwerd and Mount Arapiles rise beyond the surrounding plains.'],
    discoveries:[
      ['Wimmera River Walk','NATURE','Follow the river through parks and wetlands.','A relaxed urban trail passes river red gums, bridges, bird habitat and picnic areas close to Horsham’s centre.','Barnes Boulevard','Horsham',1.2,'Open public trail',['river','walk']],
      ['Horsham Regional Art Gallery','SEE','See Australian photography and regional art.','The gallery’s collection and changing exhibitions explore photography, place and contemporary creative practice.','80 Wilson Street','Horsham',0.2,'Check current opening hours',['art','photography']],
      ['Horsham Botanic Gardens','NATURE','Walk through a Guilfoyle-designed civic garden.','Curving paths, mature trees and open lawns offer a shady pause near the Wimmera River.','Firebrace Street','Horsham',0.8,'Open public gardens',['gardens','heritage']],
      ['Mount Arapiles','DO','Walk beneath one of Australia’s celebrated climbing cliffs.','The quartzite escarpment rises sharply from the Wimmera plains, offering lookouts, walking tracks and internationally known climbing.','Centenary Park Road','Natimuk',32.0,'Check park and climbing advice',['climbing','views']],
      ['Grampians Gariwerd','DAY_TRIP','Explore sandstone ranges and living culture.','Walking tracks, waterfalls, wildlife and Aboriginal cultural places make Gariwerd a powerful day trip south-east of Horsham.','Northern Grampians Road','Halls Gap',35.0,'Check closures and conditions',['national park','culture']],
      ['Little Desert National Park','NATURE','Discover heathlands alive with seasonal wildflowers.','Tracks cross mallee and woodland habitats west of Horsham, rewarding patient walkers and birdwatchers.','Nhill–Harrow Road','Dimboola',38.0,'Check park conditions',['wildflowers','birdlife']],
      ['Public Art and Heritage Trail','HISTORY','Read Horsham through buildings, murals and sculpture.','A self-guided city route links heritage architecture with public artworks and stories of the Wimmera.','Firebrace Street','Horsham',0.3,'Open public trail',['heritage','public art']],
      ['Wimmera Silo Art Trail','DAY_TRIP','Drive through a monumental outdoor gallery.','Large-scale portraits transform grain silos across north-west Victoria, connecting small towns through art and landscape.','Western Highway','Rupanyup',48.0,'Plan a daylight road trip',['silo art','road trip']],
    ],
  }),
  machine({
    slug:'sale',name:'Sale',region:'Central Gippsland',radiusKm:55,slogan:'Lakes, rivers and a cultural heart.',sourceUrl:'https://www.visitgippsland.com.au/destinations/central-gippsland/sale',
    facts:['Sale’s nineteenth-century canal linked the town with the Gippsland Lakes.','Wetlands, rivers and lakes surround the city.','Heritage architecture and a strong arts precinct sit beside the historic port.'],
    discoveries:[
      ['Port of Sale','HISTORY','Stroll a historic inland port and canal.','Boardwalks, boats and cultural venues line the waterway that connected Sale with the Gippsland Lakes and the sea.','100 Foster Street','Sale',0.6,'Open public precinct',['port','heritage']],
      ['Gippsland Art Gallery','SEE','Explore regional and Australian art by the water.','The gallery presents changing exhibitions and a significant collection inside the modern Port of Sale cultural precinct.','70 Foster Street','Sale',0.5,'Check current opening hours',['art','gallery']],
      ['Sale Common Wetlands','NATURE','Walk a boardwalk through internationally important wetlands.','Reed beds, river red gums and open water support abundant birdlife on the edge of town.','South Gippsland Highway','Sale',3.2,'Open; seasonal conditions vary',['wetlands','birdlife']],
      ['Lake Guthridge','NATURE','Circle a landscaped lake near central Sale.','A level path links Lake Guthridge and Lake Guyatt through gardens, lawns and bird habitat.','Foster Street','Sale',1.1,'Open public space',['lake','walk']],
      ['Sale Botanic Gardens','NATURE','Pause among mature trees beside Lake Guthridge.','Historic plantings, lawns and nearby fauna enclosures make this an easy, accessible city stop.','Guthridge Parade','Sale',1.4,'Open public gardens',['gardens','family']],
      ['Historic Swing Bridge','HISTORY','See one of Australia’s earliest movable bridges.','The wrought-iron bridge was engineered to swing open for river traffic travelling between Sale and the Latrobe River.','Swing Bridge Drive','Longford',6.0,'Public site; opening demonstrations vary',['bridge','engineering']],
      ['Gippsland Armed Forces Museum','HISTORY','Discover Gippsland’s military and aviation stories.','Aircraft models, uniforms, photographs and personal records connect the region with service history and nearby RAAF Base East Sale.','West Sale Aerodrome','Fulham',8.5,'Limited opening days; check first',['military','aviation']],
      ['Ninety Mile Beach','DAY_TRIP','Reach an immense ribbon of Gippsland coast.','Long open beaches, dunes and Bass Strait horizons are accessible from coastal towns south-east of Sale.','Shoreline Drive','Golden Beach',40.0,'Check beach conditions',['beach','coast']],
    ],
  }),
  machine({
    slug:'traralgon',name:'Traralgon',region:'Latrobe Valley',radiusKm:55,slogan:'Gippsland energy. Forest escapes.',sourceUrl:'https://www.visitgippsland.com.au/destinations/central-gippsland/traralgon',
    facts:['Traralgon is Gippsland’s largest urban centre.','Its broad streets preserve gold-rush-era architecture.','Forests, mountains, lakes and historic towns are within easy day-trip range.'],
    discoveries:[
      ['Gippsland Performing Arts Centre','SEE','Catch theatre, music and touring performance.','A contemporary venue in the city centre anchors Traralgon’s live-performance and community arts calendar.','32 Kay Street','Traralgon',0.3,'Check performance schedule',['theatre','music']],
      ['Victory Park','NATURE','Pause in a leafy civic park beside the creek.','Gardens, paths, memorials and mature trees provide a green break close to Traralgon’s shops and heritage streets.','Princes Highway','Traralgon',0.5,'Open public park',['park','walk']],
      ['Traralgon Railway Reservoir','NATURE','Walk around a restored wetland reserve.','A short loop passes open water and revegetated habitat where local birdlife gathers close to town.','Hickox Street','Traralgon',2.4,'Open public reserve',['wetlands','birdlife']],
      ['Traralgon Farmers Market','SHOP','Taste produce from across Gippsland.','Regular market days bring growers, bakers and makers together in the heart of the regional city.','Kay Street','Traralgon',0.3,'Selected Saturdays; check calendar',['market','produce']],
      ['Latrobe Regional Gallery','SEE','Explore regional art in nearby Morwell.','One of eastern Victoria’s major public galleries presents exhibitions, collections and creative programs.','138 Commercial Road','Morwell',13.5,'Check current opening hours',['art','gallery']],
      ['Tarra-Bulga National Park','DAY_TRIP','Walk beneath cool-temperate rainforest giants.','Fern gullies, mountain ash and suspension-bridge walks create a lush contrast to the open Latrobe Valley.','Grand Ridge Road','Balook',34.0,'Check park conditions',['rainforest','hiking']],
      ['Walhalla Historic Township','DAY_TRIP','Follow a narrow valley into gold-mining history.','Heritage buildings, mountain scenery, mine tours and a narrow-gauge railway make Walhalla a memorable Gippsland excursion.','Main Road','Walhalla',45.0,'Attraction times vary',['gold rush','railway']],
      ['Morwell Centenary Rose Garden','NATURE','Wander among thousands of roses.','Formal beds near the town centre create a colourful seasonal display maintained as a major community garden.','Avondale Road','Morwell',13.0,'Open public garden',['roses','garden']],
    ],
  }),
]);
