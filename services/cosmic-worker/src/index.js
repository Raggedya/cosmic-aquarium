const EVENT_TYPES = new Set([
  'aquarium_open','session_start','object_touch','track_selected','track_play',
  'share_click','share_complete','share_copy','buy_click','explore_click','aquarium_transition','email_link_click','email_open',
]);

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type,authorization',
  'access-control-max-age': '86400',
};

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {status, headers:{'content-type':'application/json; charset=utf-8',...headers}});
}

function authorized(request, env) {
  const header = request.headers.get('authorization') || '';
  return Boolean(env.ADMIN_TOKEN) && header === `Bearer ${env.ADMIN_TOKEN}`;
}

function clean(value, max = 160) {
  return typeof value === 'string' ? value.trim().slice(0, max) : null;
}

async function readBody(request) {
  try { return await request.json(); } catch { return null; }
}

async function recordEvent(request, env) {
  const body = await readBody(request);
  const eventType = clean(body?.eventType, 48);
  const aquariumId = clean(body?.aquariumId, 96);
  const sessionId = clean(body?.sessionId, 96);
  if (!EVENT_TYPES.has(eventType) || !aquariumId || !sessionId) return json({ok:false,error:'invalid_event'},400,CORS);
  const metadata = body?.metadata && typeof body.metadata === 'object' ? JSON.stringify(body.metadata).slice(0, 3000) : null;
  await env.DB.prepare(`INSERT INTO analytics_event
    (id,event_type,aquarium_id,track_id,batch_id,session_id,source_aquarium_id,destination_aquarium_id,metadata,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(),eventType,aquariumId,clean(body.trackId,128),clean(body.batchId,32),sessionId,clean(body.sourceAquariumId,96),clean(body.destinationAquariumId,96),metadata,new Date().toISOString()).run();
  return json({ok:true},202,CORS);
}

async function recordEmailOpen(url, env) {
  const batchId = clean(url.searchParams.get('batch'),32);
  if (batchId) {
    await env.DB.prepare(`INSERT INTO analytics_event
      (id,event_type,aquarium_id,track_id,batch_id,session_id,source_aquarium_id,destination_aquarium_id,metadata,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(),'email_open','daily-email',null,batchId,'email-'+crypto.randomUUID(),null,null,null,new Date().toISOString()).run();
  }
  return new Response(Uint8Array.from([71,73,70,56,57,97,1,0,1,0,128,0,0,0,0,0,255,255,255,33,249,4,1,0,0,0,0,44,0,0,0,0,1,0,1,0,0,2,2,68,1,0,59]),{headers:{'content-type':'image/gif','cache-control':'no-store, max-age=0'}});
}

async function randomAquarium(url, env) {
  const exclude = clean(url.searchParams.get('exclude'), 96);
  const recent = (url.searchParams.get('recent') || '').split(',').map(value=>value.trim()).filter(Boolean).slice(0,8);
  const exclusions = [exclude,...recent].filter(Boolean);
  const placeholders = exclusions.map(()=>'?').join(',');
  const query = `SELECT id,slug,artist,release_title,aquarium_url FROM aquarium WHERE status='published' AND disabled_at IS NULL${exclusions.length ? ` AND id NOT IN (${placeholders})` : ''} ORDER BY RANDOM() LIMIT 1`;
  const entry = await env.DB.prepare(query).bind(...exclusions).first();
  return entry ? json(entry,200,CORS) : json({error:'no_aquarium_available'},404,CORS);
}

async function syncCatalogue(request, env) {
  const body = await readBody(request);
  const aquariums = Array.isArray(body?.aquariums) ? body.aquariums.slice(0,10000) : [];
  const batch = body?.batch && typeof body.batch === 'object' ? body.batch : null;
  const statements = [];
  for (const item of aquariums) {
    if (!item?.id || !item?.url) continue;
    statements.push(env.DB.prepare(`INSERT INTO aquarium
      (id,slug,artist,release_title,bandcamp_url,aquarium_url,theme,status,daily_batch_id,created_at,published_at,disabled_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULL)
      ON CONFLICT(id) DO UPDATE SET artist=excluded.artist,release_title=excluded.release_title,bandcamp_url=COALESCE(excluded.bandcamp_url,aquarium.bandcamp_url),aquarium_url=excluded.aquarium_url,theme=COALESCE(excluded.theme,aquarium.theme),status=excluded.status,daily_batch_id=COALESCE(excluded.daily_batch_id,aquarium.daily_batch_id),published_at=COALESCE(aquarium.published_at,excluded.published_at)`)
      .bind(item.id,item.slug||item.id,item.artist||'',item.release||'',item.bandcampUrl||null,item.url,item.visualStyle||null,item.status||'published',item.dailyBatchId||null,item.createdAt||new Date().toISOString(),item.publishedAt||new Date().toISOString()));
  }
  if (statements.length) await env.DB.batch(statements);
  if (batch?.id) {
    await env.DB.prepare(`INSERT INTO daily_batch
      (id,batch_date,target_count,status,generated_count,published_count,email_status,created_at,completed_at)
      VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,generated_count=excluded.generated_count,published_count=excluded.published_count,email_status=excluded.email_status,completed_at=excluded.completed_at`)
      .bind(batch.id,batch.batchDate||batch.id,batch.targetCount||20,batch.status||'generation_pending',batch.generatedCount||0,batch.publishedCount||0,batch.emailStatus||'pending',batch.createdAt||new Date().toISOString(),batch.completedAt||null).run();
  }
  return json({ok:true,synced:statements.length,batch:batch?.id||null});
}

async function overview(env) {
  const totals = await env.DB.prepare(`SELECT
    (SELECT COUNT(*) FROM aquarium WHERE status='published' AND disabled_at IS NULL) AS published_aquariums,
    (SELECT COUNT(*) FROM analytics_event WHERE created_at >= datetime('now','-1 day')) AS events_today,
    (SELECT COUNT(*) FROM analytics_event WHERE event_type='aquarium_open' AND created_at >= datetime('now','-1 day')) AS opens_today,
    (SELECT COUNT(*) FROM analytics_event WHERE event_type='track_selected' AND created_at >= datetime('now','-1 day')) AS tracks_today,
    (SELECT COUNT(*) FROM analytics_event WHERE event_type LIKE 'share_%' AND created_at >= datetime('now','-1 day')) AS shares_today,
    (SELECT COUNT(*) FROM analytics_event WHERE event_type='buy_click' AND created_at >= datetime('now','-1 day')) AS buy_clicks_today,
    (SELECT COUNT(*) FROM analytics_event WHERE event_type='explore_click' AND created_at >= datetime('now','-1 day')) AS explores_today`).first();
  const batches = await env.DB.prepare(`SELECT * FROM daily_batch ORDER BY batch_date DESC LIMIT 30`).all();
  const aquariums = await env.DB.prepare(`SELECT a.id,a.artist,a.release_title,a.aquarium_url,a.status,
    SUM(CASE WHEN e.event_type='aquarium_open' THEN 1 ELSE 0 END) AS opens,
    SUM(CASE WHEN e.event_type='track_selected' THEN 1 ELSE 0 END) AS tracks,
    SUM(CASE WHEN e.event_type LIKE 'share_%' THEN 1 ELSE 0 END) AS shares,
    SUM(CASE WHEN e.event_type='buy_click' THEN 1 ELSE 0 END) AS buy_clicks,
    SUM(CASE WHEN e.event_type='explore_click' THEN 1 ELSE 0 END) AS explores
    FROM aquarium a LEFT JOIN analytics_event e ON e.aquarium_id=a.id GROUP BY a.id ORDER BY opens DESC LIMIT 100`).all();
  return json({totals,batches:batches.results,aquariums:aquariums.results});
}

async function recordEmailDelivery(request, env) {
  const body = await readBody(request);
  const batchId = clean(body?.batchId, 32);
  const status = clean(body?.status, 32);
  if (!batchId || !['pending','sent','failed','resent'].includes(status)) return json({ok:false,error:'invalid_delivery'},400);
  const timestamp = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO email_delivery
      (id,batch_id,recipient,status,provider_id,failure_reason,created_at,sent_at)
      VALUES (?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(),batchId,clean(body?.recipient,320)||'',status,clean(body?.providerId,160),clean(body?.failureReason,800),timestamp,['sent','resent'].includes(status)?timestamp:null),
    env.DB.prepare(`UPDATE daily_batch SET email_status=? WHERE id=?`).bind(status,batchId),
  ]);
  return json({ok:true,batchId,status});
}

async function setAquariumStatus(request, env, id, status) {
  const now = new Date().toISOString();
  const result = await env.DB.prepare(`UPDATE aquarium SET status=?,disabled_at=? WHERE id=?`)
    .bind(status,status === 'disabled' ? now : null,id).run();
  return json({ok:true,id,status,changed:result.meta?.changes||0});
}

function adminPage() {
  return new Response(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cosmic Aquaria — Owner</title><style>
  *{box-sizing:border-box}body{margin:0;background:#050817;color:#eeeaf8;font:14px Inter,system-ui;padding:32px}main{max-width:1100px;margin:auto}h1{font-weight:400;letter-spacing:.18em}input,button{background:#0d1329;color:#eee;border:1px solid #343b59;padding:10px}button{cursor:pointer}#grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:28px 0}.card,table{background:#090e20;border:1px solid #242a43}.card{padding:18px}.card b{display:block;font-size:26px;font-weight:400}table{width:100%;border-collapse:collapse;margin:18px 0}td,th{padding:10px;border-bottom:1px solid #1e243c;text-align:left}a{color:#c9bbff}.operations{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}</style></head><body><main><h1>COSMIC AQUARIA</h1><p>Private owner reporting. Metrics are anonymous activity signals, not sales or popularity claims.</p><form id="login"><input id="token" type="password" placeholder="Owner token" autocomplete="current-password"><button>OPEN REPORT</button></form><section id="report" hidden><div id="grid"></div><div class="operations"><a href="https://github.com/Raggedya/cosmic-aquarium/actions/workflows/daily-discovery.yml">Rerun daily batch</a><a href="https://github.com/Raggedya/groove-vultures-deep-cuts-fan-challenge/actions/workflows/cosmic-aquaria-daily-email.yml">Resend owner email</a></div><h2>Daily batches</h2><table><thead><tr><th>Date</th><th>Published</th><th>Status</th><th>Email</th></tr></thead><tbody id="batchRows"></tbody></table><h2>Aquariums</h2><table><thead><tr><th>Aquarium</th><th>Opens</th><th>Tracks</th><th>Shares</th><th>Buy clicks</th><th>Explore</th><th>Action</th></tr></thead><tbody id="rows"></tbody></table></section></main><script>
  const byId=id=>document.getElementById(id);let ownerToken='';
  byId('login').onsubmit=async e=>{e.preventDefault();ownerToken=byId('token').value;const r=await fetch('/api/admin/overview',{headers:{authorization:'Bearer '+ownerToken}});if(!r.ok)return alert('Owner access was not accepted.');const d=await r.json();byId('report').hidden=false;byId('login').hidden=true;const t=d.totals||{};byId('grid').innerHTML=[['Published',t.published_aquariums],['Opens today',t.opens_today],['Tracks today',t.tracks_today],['Shares today',t.shares_today],['Buy clicks today',t.buy_clicks_today],['Explore today',t.explores_today]].map(x=>'<div class=card><b>'+Number(x[1]||0)+'</b>'+x[0]+'</div>').join('');
  for(const b of d.batches||[]){const row=byId('batchRows').insertRow();[b.batch_date,b.published_count+'/'+b.target_count,b.status,b.email_status].forEach(value=>{const cell=row.insertCell();cell.textContent=String(value??'')})}
  for(const a of d.aquariums||[]){const row=byId('rows').insertRow();const link=document.createElement('a');link.href=a.aquarium_url;link.textContent=a.artist+' — '+a.release_title;row.insertCell().append(link);[a.opens,a.tracks,a.shares,a.buy_clicks,a.explores].forEach(value=>{const cell=row.insertCell();cell.textContent=String(value||0)});const button=document.createElement('button');button.textContent=a.status==='disabled'?'REPUBLISH':'DISABLE';button.onclick=async()=>{const action=a.status==='disabled'?'republish':'disable';const response=await fetch('/api/admin/aquariums/'+encodeURIComponent(a.id)+'/'+action,{method:'POST',headers:{authorization:'Bearer '+ownerToken}});if(response.ok)location.reload();else alert('The change could not be saved.')};row.insertCell().append(button)}};
  </script></body></html>`,{headers:{'content-type':'text/html; charset=utf-8'}});
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:CORS});
    if (url.pathname === '/api/health') return json({ok:true,service:'cosmic-aquaria'} ,200,CORS);
    if (url.pathname === '/api/events' && request.method === 'POST') return recordEvent(request,env);
    if (url.pathname === '/api/email/open.gif' && request.method === 'GET') return recordEmailOpen(url,env);
    if (url.pathname === '/api/aquariums/random' && request.method === 'GET') return randomAquarium(url,env);
    if (url.pathname === '/admin' && request.method === 'GET') return adminPage();
    if (url.pathname.startsWith('/api/admin/') && !authorized(request,env)) return json({error:'unauthorized'},401);
    if (url.pathname === '/api/admin/sync' && request.method === 'POST') return syncCatalogue(request,env);
    if (url.pathname === '/api/admin/overview' && request.method === 'GET') return overview(env);
    if (url.pathname === '/api/admin/email-delivery' && request.method === 'POST') return recordEmailDelivery(request,env);
    const statusMatch = url.pathname.match(/^\/api\/admin\/aquariums\/([^/]+)\/(disable|republish)$/);
    if (statusMatch && request.method === 'POST') return setAquariumStatus(request,env,decodeURIComponent(statusMatch[1]),statusMatch[2] === 'disable' ? 'disabled' : 'published');
    return json({error:'not_found'},404,CORS);
  },
};
