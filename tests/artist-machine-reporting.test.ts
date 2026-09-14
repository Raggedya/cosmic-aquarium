import assert from 'node:assert/strict';
import test from 'node:test';

import worker from '../services/cosmic-worker/src/index.js';

function reportingDatabase(){
  const batches:Array<Array<{sql:string;values:unknown[]}>>=[];
  return {
    batches,
    prepare(sql:string){
      return {
        sql,
        values:[] as unknown[],
        bind(...values:unknown[]){
          return {
            sql,values,
            async first(){
              if(sql.includes("event_type='session_start'"))return {total:1};
              if(sql.includes('COUNT(DISTINCT CASE'))return {visitors:1,spinners:1,discoverers:1,aquarium_visitors:0,listeners:1,bandcamp_visitors:1,buyers:1,sharers:1};
              return null;
            },
            async all(){
              if(sql.includes('FROM artist_machine_inventory m'))return {results:[{
                slug:'chime',artist_name:'CHIME',public_url:'https://raggedya.github.io/cosmic-aquarium/artist/chime/',song_count:36,
                opens:2,visitors:1,spins:3,reveals:3,plays:1,bandcamp_clicks:1,buy_clicks:1,shares:1,loves:1,
              }]};
              if(sql.includes("aquarium_id LIKE 'artist-machine:%'"))return {results:[{slug:'chime',track:'Goretunnel',reveals:2,visitors:1}]};
              return {results:[]};
            },
          };
        },
      };
    },
    async batch(statements:Array<{sql:string;values:unknown[]}>){batches.push(statements);return statements.map(()=>({success:true}));},
  };
}

test('authenticated catalogue sync registers every published Artist Machine',async()=>{
  const db=reportingDatabase();
  const response=await worker.fetch(new Request('https://worker.example/api/admin/artist-machines/sync',{
    method:'POST',
    headers:{authorization:'Bearer sync-secret','content-type':'application/json'},
    body:JSON.stringify({fullReplace:true,machines:[{
      artistSlug:'chime',artistName:'CHIME',songCount:36,
      publicUrl:'https://raggedya.github.io/cosmic-aquarium/artist/chime/',
    }]}),
  }),{DB:db,SYNC_TOKEN:'sync-secret'},{});
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{ok:true,synced:1});
  assert.equal(db.batches.length,1);
  assert.equal(db.batches[0].length,2);
  assert.match(db.batches[0][1].sql,/INSERT INTO artist_machine_inventory/);
});

test('activity report returns per-band metrics and top tracks',async()=>{
  const db=reportingDatabase();
  const response=await worker.fetch(new Request('https://worker.example/api/admin/activity-report',{
    headers:{authorization:'Bearer admin-secret'},
  }),{DB:db,ADMIN_TOKEN:'admin-secret'},{});
  assert.equal(response.status,200);
  const report=await response.json() as {artistMachines:Array<Record<string,unknown>>};
  assert.equal(report.artistMachines.length,1);
  assert.equal(report.artistMachines[0].artist_name,'CHIME');
  assert.equal(report.artistMachines[0].spins,3);
  assert.deepEqual(report.artistMachines[0].topTracks,[{track:'Goretunnel',reveals:2,visitors:1}]);
});
