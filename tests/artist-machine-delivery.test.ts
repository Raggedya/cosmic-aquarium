import assert from 'node:assert/strict';
import test from 'node:test';

import worker from '../services/cosmic-worker/src/index.js';

const deliveryId='0f82a95d-a164-4e89-9704-296074f37931';

function database(delivery:Record<string,unknown>|null=null){
  const writes:Array<{sql:string;values:unknown[]}>=[];
  return {
    writes,
    prepare(sql:string){
      return {
        bind(...values:unknown[]){
          return {
            async first(){
              if(sql.includes('COUNT(*)'))return {total:0};
              if(sql.includes('SELECT * FROM artist_machine_delivery')||sql.includes('SELECT status FROM artist_machine_delivery'))return delivery;
              return null;
            },
            async run(){writes.push({sql,values});return {success:true}}
          };
        }
      };
    }
  };
}

test('Cloudflare registers a private one-time artist delivery without sending early',async()=>{
  const db=database();
  const response=await worker.fetch(new Request('https://worker.example/api/artist-machine-deliveries',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({
      artistSlug:'chime',artistName:'CHIME',email:'artist@example.com',
      publicUrl:'https://raggedya.github.io/cosmic-aquarium/artist/chime/',
    }),
  }),{DB:db},{});
  const result=await response.json() as {ok:boolean;id:string};
  assert.equal(response.status,201);
  assert.equal(result.ok,true);
  assert.match(result.id,/^[0-9a-f-]{36}$/);
  assert.equal(db.writes.length,1);
  assert.match(db.writes[0].sql,/INSERT INTO artist_machine_delivery/);
  assert.ok(!db.writes[0].values.includes('sent'));
});

test('Cloudflare emails the live link only after a successful publication is confirmed',async()=>{
  const db=database({
    id:deliveryId,artist_slug:'chime',artist_name:'CHIME',email:'artist@example.com',
    public_url:'https://raggedya.github.io/cosmic-aquarium/artist/chime/',status:'pending',
  });
  const requests:Array<{url:string;init?:RequestInit}>=[];
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=String(input);requests.push({url,init});
    if(url.includes('/automation/artist-machines/chime.json'))return Response.json({artistSlug:'chime',artistName:'CHIME'});
    if(url.includes('/public/artist-machine-media/chime/qr-card.png'))return new Response(new Uint8Array([137,80,78,71]),{status:200});
    if(url==='https://api.resend.com/emails')return Response.json({id:'resend-message-id'},{status:200});
    return Response.json({}, {status:404});
  };
  try{
    const response=await worker.fetch(new Request(`https://worker.example/api/artist-machine-deliveries/${deliveryId}/send`,{
      method:'POST',headers:{'content-type':'application/json',authorization:'Bearer sync-secret'},body:JSON.stringify({publicationId:'34800000000'}),
    }),{DB:db,SYNC_TOKEN:'sync-secret',RESEND_API_KEY:'secret',REPORT_FROM_EMAIL:'AGGITS <delivery@example.com>'},{});
    const result=await response.json() as {ok:boolean;status:string};
    assert.equal(response.status,202);
    assert.deepEqual(result,{ok:true,status:'sent'});
    const resend=requests.find(item=>item.url==='https://api.resend.com/emails');
    assert.ok(resend);
    const body=JSON.parse(String(resend.init?.body));
    assert.deepEqual(body.to,['artist@example.com']);
    assert.match(body.text,/https:\/\/raggedya\.github\.io\/cosmic-aquarium\/artist\/chime\//);
    assert.equal(body.attachments[0].filename,'chime-aggits-qr.png');
    assert.equal(body.attachments[0].content,'iVBORw==');
    assert.ok(db.writes.some(item=>item.sql.includes('UPDATE artist_machine_delivery')&&item.values.includes('sent')));
  }finally{
    globalThis.fetch=originalFetch;
  }
});

test('delivery sending rejects callers without the deployment secret',async()=>{
  const db=database({id:deliveryId,status:'pending'});
  const response=await worker.fetch(new Request(`https://worker.example/api/artist-machine-deliveries/${deliveryId}/send`,{
    method:'POST',headers:{'content-type':'application/json'},body:'{}',
  }),{DB:db,SYNC_TOKEN:'sync-secret'},{});
  assert.equal(response.status,401);
  assert.equal(db.writes.length,0);
});

test('the opaque receipt exposes delivery status but no address',async()=>{
  const db=database({id:deliveryId,status:'sent',email:'artist@example.com'});
  const response=await worker.fetch(new Request(`https://worker.example/api/artist-machine-deliveries/${deliveryId}`),{DB:db},{});
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{ok:true,status:'sent'});
});
