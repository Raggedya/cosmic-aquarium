const EVENT_TYPES = new Set([
  'aquarium_open','session_start','object_touch','track_selected','track_play',
  'release_click','bandcamp_click','share_click','share_native_opened','share_complete','share_copy',
  'buy_click','explore_click','aquarium_transition','email_link_click','email_open',
  'aquarium_created','aquarium_published','aquarium_unpublished',
  'doorway_open','drift_anywhere_selected','water_selected','random_destination_selected','doorway_to_aquarium_transition',
]);
const WATERS = new Set(['heavy','dreamy','electronic','quiet','loud','dark','strange']);

const REPORT_TIME_ZONE = 'Australia/Sydney';
const EVENT_LABELS = {
  aquarium_open:'Aquarium visits',session_start:'Visitor sessions',object_touch:'Flowers touched',
  track_selected:'Songs revealed',track_play:'Playback signals',release_click:'Songs released',
  bandcamp_click:'Track links opened on Bandcamp',share_click:'Share button taps',
  share_native_opened:'Native share menus opened',share_complete:'Native shares completed',
  share_copy:'Links copied',buy_click:'Buy Music clicks',explore_click:'Explore clicks',
  aquarium_transition:'Aquarium journeys',email_link_click:'Email links opened',email_open:'Collection emails opened',
  aquarium_created:'Aquariums created',aquarium_published:'Aquariums published',aquarium_unpublished:'Aquariums unpublished',
  doorway_open:'Doorway opens',drift_anywhere_selected:'Drift Anywhere choices',water_selected:'Water choices',
  random_destination_selected:'Random destinations selected',doorway_to_aquarium_transition:'Doorway journeys',
};

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
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

function syncAuthorized(request, env) {
  const header = request.headers.get('authorization') || '';
  return authorized(request,env) || (Boolean(env.SYNC_TOKEN) && header === `Bearer ${env.SYNC_TOKEN}`);
}

function systemEventStatement(env, eventType, aquariumId, metadata = null, createdAt = new Date().toISOString()) {
  return env.DB.prepare(`INSERT INTO analytics_event
    (id,event_type,aquarium_id,track_id,batch_id,session_id,source_aquarium_id,destination_aquarium_id,metadata,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(),eventType,aquariumId,null,null,'system',null,null,metadata ? JSON.stringify(metadata).slice(0,3000) : null,createdAt);
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
  const requestedWater = clean(url.searchParams.get('water'), 24)?.toLowerCase() || 'anywhere';
  const water = WATERS.has(requestedWater) ? requestedWater : 'anywhere';
  const exclude = clean(url.searchParams.get('exclude'), 96);
  const recent = (url.searchParams.get('recent') || '').split(',').map(value=>value.trim()).filter(Boolean).slice(0,8);
  const exclusions = [exclude,...recent].filter(Boolean);
  const placeholders = exclusions.map(()=>'?').join(',');
  const selection = async selectedWater => {
    const waterJoin = selectedWater === 'anywhere' ? '' : ' INNER JOIN aquarium_water w ON w.aquarium_id=a.id AND w.water=?';
    const query = `SELECT a.id,a.slug,a.artist,a.release_title,a.aquarium_url FROM aquarium a${waterJoin} WHERE a.status='published' AND a.disabled_at IS NULL${exclusions.length ? ` AND a.id NOT IN (${placeholders})` : ''} ORDER BY RANDOM() LIMIT 1`;
    return env.DB.prepare(query).bind(...(selectedWater === 'anywhere' ? [] : [selectedWater]),...exclusions).first();
  };
  let entry = await selection(water);
  let fallbackFrom = null;
  if (!entry && water !== 'anywhere') { fallbackFrom = water; entry = await selection('anywhere'); }
  return entry ? json({...entry,water,fallback_from:fallbackFrom},200,CORS) : json({error:'no_aquarium_available'},404,CORS);
}

async function syncCatalogue(request, env) {
  const body = await readBody(request);
  const aquariums = Array.isArray(body?.aquariums) ? body.aquariums.slice(0,10000) : [];
  const batch = body?.batch && typeof body.batch === 'object' ? body.batch : null;
  const currentRows = await env.DB.prepare('SELECT id,status FROM aquarium').all();
  const current = new Map((currentRows.results || []).map(item=>[item.id,item.status]));
  const statements = [];
  if (body?.fullReplace === true) {
    const ids = [...new Set(aquariums.map(item=>clean(item?.id,96)).filter(Boolean))];
    statements.push(ids.length
      ? env.DB.prepare(`DELETE FROM aquarium WHERE id NOT IN (${ids.map(()=>'?').join(',')})`).bind(...ids)
      : env.DB.prepare('DELETE FROM aquarium'));
  }
  for (const item of aquariums) {
    if (!item?.id || !item?.url) continue;
    const status = item.status === 'disabled' ? 'disabled' : 'published';
    const disabledAt = status === 'disabled' ? (item.disabledAt||new Date().toISOString()) : null;
    statements.push(env.DB.prepare(`INSERT INTO aquarium
      (id,slug,artist,release_title,bandcamp_url,aquarium_url,theme,status,daily_batch_id,created_at,published_at,disabled_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET artist=excluded.artist,release_title=excluded.release_title,bandcamp_url=COALESCE(excluded.bandcamp_url,aquarium.bandcamp_url),aquarium_url=excluded.aquarium_url,theme=COALESCE(excluded.theme,aquarium.theme),status=excluded.status,daily_batch_id=COALESCE(excluded.daily_batch_id,aquarium.daily_batch_id),published_at=COALESCE(aquarium.published_at,excluded.published_at),disabled_at=excluded.disabled_at`)
      .bind(item.id,item.slug||item.id,item.artist||'',item.release||'',item.bandcampUrl||null,item.url,item.visualStyle||null,status,item.dailyBatchId||null,item.createdAt||new Date().toISOString(),item.publishedAt||new Date().toISOString(),disabledAt));
    statements.push(env.DB.prepare("DELETE FROM aquarium_water WHERE aquarium_id=? AND assigned_by='automatic' AND NOT EXISTS (SELECT 1 FROM aquarium_water WHERE aquarium_id=? AND assigned_by='manual')").bind(item.id,item.id));
    for (const water of [...new Set(Array.isArray(item.waters) ? item.waters.map(value=>String(value).toLowerCase()).filter(value=>WATERS.has(value)) : [])]) {
      statements.push(env.DB.prepare("INSERT OR IGNORE INTO aquarium_water (aquarium_id,water,assigned_by,confidence,updated_at) SELECT ?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM aquarium_water WHERE aquarium_id=? AND assigned_by='manual')").bind(item.id,water,'automatic',null,new Date().toISOString(),item.id));
    }
    const priorStatus = current.get(item.id);
    if (!priorStatus) {
      statements.push(systemEventStatement(env,'aquarium_created',item.id,{artist:item.artist||'',release:item.release||''}));
      if (status === 'published') statements.push(systemEventStatement(env,'aquarium_published',item.id));
    } else if (priorStatus !== status) {
      statements.push(systemEventStatement(env,status === 'published' ? 'aquarium_published' : 'aquarium_unpublished',item.id));
    }
  }
  if (statements.length) await env.DB.batch(statements);
  if (batch?.id) {
    await env.DB.prepare(`INSERT INTO daily_batch
      (id,batch_date,target_count,status,generated_count,published_count,email_status,created_at,completed_at)
      VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,generated_count=excluded.generated_count,published_count=excluded.published_count,email_status=excluded.email_status,completed_at=excluded.completed_at`)
      .bind(batch.id,batch.batchDate||batch.id,batch.targetCount||20,batch.status||'generation_pending',batch.generatedCount||0,batch.publishedCount||0,batch.emailStatus||'pending',batch.createdAt||new Date().toISOString(),batch.completedAt||null).run();
  }
  return json({ok:true,synced:aquariums.length,reconciled:body?.fullReplace===true,batch:batch?.id||null});
}

async function overview(env) {
  const totals = await env.DB.prepare(`SELECT
    (SELECT COUNT(*) FROM aquarium WHERE status='published' AND disabled_at IS NULL) AS published_aquariums,
    (SELECT COUNT(*) FROM analytics_event WHERE created_at >= datetime('now','-1 day')) AS events_today,
    (SELECT COUNT(*) FROM analytics_event WHERE event_type='aquarium_open' AND created_at >= datetime('now','-1 day')) AS opens_today,
    (SELECT COUNT(*) FROM analytics_event WHERE event_type='doorway_open' AND created_at >= datetime('now','-1 day')) AS doorway_opens_today,
    (SELECT COUNT(*) FROM analytics_event WHERE event_type='track_selected' AND created_at >= datetime('now','-1 day')) AS tracks_today,
    (SELECT COUNT(*) FROM analytics_event WHERE event_type LIKE 'share_%' AND created_at >= datetime('now','-1 day')) AS shares_today,
    (SELECT COUNT(*) FROM analytics_event WHERE event_type='buy_click' AND created_at >= datetime('now','-1 day')) AS buy_clicks_today,
    (SELECT COUNT(*) FROM analytics_event WHERE event_type='explore_click' AND created_at >= datetime('now','-1 day')) AS explores_today`).first();
  const batches = await env.DB.prepare(`SELECT * FROM daily_batch ORDER BY batch_date DESC LIMIT 30`).all();
  const aquariums = await env.DB.prepare(`SELECT a.id,a.artist,a.release_title,a.aquarium_url,a.status,
    (SELECT GROUP_CONCAT(w.water) FROM aquarium_water w WHERE w.aquarium_id=a.id) AS waters,
    SUM(CASE WHEN e.event_type='aquarium_open' THEN 1 ELSE 0 END) AS opens,
    SUM(CASE WHEN e.event_type='track_selected' THEN 1 ELSE 0 END) AS tracks,
    SUM(CASE WHEN e.event_type LIKE 'share_%' THEN 1 ELSE 0 END) AS shares,
    SUM(CASE WHEN e.event_type='buy_click' THEN 1 ELSE 0 END) AS buy_clicks,
    SUM(CASE WHEN e.event_type='explore_click' THEN 1 ELSE 0 END) AS explores
    FROM aquarium a LEFT JOIN analytics_event e ON e.aquarium_id=a.id GROUP BY a.id ORDER BY opens DESC LIMIT 100`).all();
  const waterCounts = await env.DB.prepare(`SELECT w.water,COUNT(*) AS total FROM aquarium_water w INNER JOIN aquarium a ON a.id=w.aquarium_id WHERE a.status='published' AND a.disabled_at IS NULL GROUP BY w.water ORDER BY w.water`).all();
  return json({totals,batches:batches.results,aquariums:aquariums.results,waterCounts:waterCounts.results||[]});
}

function sydneyParts(value) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-AU',{
    timeZone:REPORT_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23',
  }).formatToParts(value).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
  return {date:`${parts.year}-${parts.month}-${parts.day}`,hour:Number(parts.hour)};
}

function reportWindow(endValue = Date.now()) {
  const end = new Date(endValue);
  return {reportDate:sydneyParts(end).date,start:new Date(end.getTime()-86_400_000).toISOString(),end:end.toISOString()};
}

async function activityReport(env, endValue = Date.now()) {
  const window = reportWindow(endValue);
  const totalsResult = await env.DB.prepare(`SELECT event_type,COUNT(*) AS total
    FROM analytics_event WHERE created_at>=? AND created_at<? GROUP BY event_type ORDER BY event_type`)
    .bind(window.start,window.end).all();
  const totals = Object.fromEntries([...EVENT_TYPES].map(type=>[type,0]));
  for (const row of totalsResult.results || []) totals[row.event_type] = Number(row.total || 0);
  const visitors = await env.DB.prepare(`SELECT COUNT(DISTINCT session_id) AS total FROM analytics_event
    WHERE created_at>=? AND created_at<? AND session_id<>'system' AND event_type='session_start'`)
    .bind(window.start,window.end).first();
  const libraries = await env.DB.prepare(`SELECT a.id,a.artist,a.release_title,a.aquarium_url,a.status,
    COUNT(CASE WHEN e.event_type='aquarium_open' THEN 1 END) AS visits,
    COUNT(CASE WHEN e.event_type='object_touch' THEN 1 END) AS flower_touches,
    COUNT(CASE WHEN e.event_type='track_selected' THEN 1 END) AS songs_revealed,
    COUNT(CASE WHEN e.event_type='release_click' THEN 1 END) AS songs_released,
    COUNT(CASE WHEN e.event_type='bandcamp_click' THEN 1 END) AS bandcamp_clicks,
    COUNT(CASE WHEN e.event_type='share_native_opened' THEN 1 END) AS native_shares,
    COUNT(CASE WHEN e.event_type='share_copy' THEN 1 END) AS copied_shares,
    COUNT(CASE WHEN e.event_type='buy_click' THEN 1 END) AS buy_clicks,
    COUNT(CASE WHEN e.event_type='explore_click' THEN 1 END) AS explores
    FROM aquarium a LEFT JOIN analytics_event e ON e.aquarium_id=a.id AND e.created_at>=? AND e.created_at<?
    GROUP BY a.id ORDER BY visits DESC,a.artist COLLATE NOCASE`)
    .bind(window.start,window.end).all();
  return {...window,uniqueSessions:Number(visitors?.total||0),totals,libraries:libraries.results||[]};
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

function activityReportMessage(report) {
  const eventRows = Object.entries(EVENT_LABELS).map(([type,label])=>`<tr><td style="padding:8px 10px;border-bottom:1px solid #272940">${escapeHtml(label)}</td><td style="padding:8px 10px;border-bottom:1px solid #272940;text-align:right">${Number(report.totals[type]||0)}</td></tr>`).join('');
  const libraryRows = report.libraries.map(item=>`<tr><td style="padding:10px;border-bottom:1px solid #272940"><a href="${escapeHtml(item.aquarium_url)}" style="color:#d9ceff;text-decoration:none">${escapeHtml(item.artist)} — ${escapeHtml(item.release_title)}</a><br><span style="color:#777386;font-size:11px">${escapeHtml(item.status)}</span></td><td style="padding:10px;border-bottom:1px solid #272940;text-align:center">${Number(item.visits||0)}</td><td style="padding:10px;border-bottom:1px solid #272940;text-align:center">${Number(item.flower_touches||0)}</td><td style="padding:10px;border-bottom:1px solid #272940;text-align:center">${Number(item.songs_revealed||0)}</td><td style="padding:10px;border-bottom:1px solid #272940;text-align:center">${Number(item.native_shares||0)+Number(item.copied_shares||0)}</td><td style="padding:10px;border-bottom:1px solid #272940;text-align:center">${Number(item.buy_clicks||0)}</td><td style="padding:10px;border-bottom:1px solid #272940;text-align:center">${Number(item.explores||0)}</td></tr>`).join('');
  const html=`<!doctype html><html><body style="margin:0;background:#060814;color:#f1edf8;font-family:Arial,sans-serif"><div style="max-width:760px;margin:auto;padding:38px 20px"><p style="letter-spacing:.35em;font-size:12px;color:#aba5ba">COSMIC AQUARIA</p><h1 style="font-weight:400;font-size:26px">Daily activity — ${escapeHtml(report.reportDate)}</h1><p style="color:#aaa4b7">The previous 24 hours across the complete Library. Activity is anonymous; no personal visitor details are collected.</p><div style="display:inline-block;padding:14px 18px;margin:8px 0 24px;background:#11152b;border:1px solid #292d48"><strong style="font-size:24px;font-weight:400">${report.uniqueSessions}</strong><br><span style="font-size:12px;color:#aaa4b7">VISITOR SESSIONS</span></div><h2 style="font-size:18px;font-weight:400">All activity types</h2><table role="presentation" style="width:100%;border-collapse:collapse;background:#0a0d20">${eventRows}</table><h2 style="font-size:18px;font-weight:400;margin-top:30px">Every Aquarium</h2><div style="overflow-x:auto"><table role="presentation" style="width:100%;min-width:660px;border-collapse:collapse;background:#0a0d20"><thead><tr style="color:#aaa4b7;font-size:11px"><th style="padding:9px;text-align:left">AQUARIUM</th><th>VISITS</th><th>FLOWERS</th><th>SONGS</th><th>SHARES</th><th>BUY</th><th>EXPLORE</th></tr></thead><tbody>${libraryRows}</tbody></table></div><p style="margin-top:26px;color:#777386;font-size:11px">Share totals distinguish native share menus and copied links in the activity table. iPhone does not reveal which app was chosen from its native share menu.</p></div></body></html>`;
  const text=['COSMIC AQUARIA',`Daily activity — ${report.reportDate}`,'',`Visitor sessions: ${report.uniqueSessions}`,'',...Object.entries(EVENT_LABELS).map(([type,label])=>`${label}: ${Number(report.totals[type]||0)}`),'','EVERY AQUARIUM',...report.libraries.map(item=>`${item.artist} — ${item.release_title}: visits ${item.visits||0}, flowers ${item.flower_touches||0}, songs ${item.songs_revealed||0}, native shares ${item.native_shares||0}, copied links ${item.copied_shares||0}, buy ${item.buy_clicks||0}, explore ${item.explores||0}`)].join('\n');
  return {html,text};
}

async function sendActivityReport(env, endValue = Date.now(), force = false) {
  if (!env.RESEND_API_KEY || !env.OWNER_EMAIL || !env.REPORT_FROM_EMAIL) throw new Error('Activity report email is not configured.');
  const report = await activityReport(env,endValue);
  const existing = await env.DB.prepare('SELECT status FROM activity_report_delivery WHERE report_date=?').bind(report.reportDate).first();
  if (existing?.status === 'sent' && !force) return {ok:true,skipped:true,reportDate:report.reportDate};
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO activity_report_delivery
    (report_date,window_start,window_end,recipient,status,provider_id,failure_reason,created_at,sent_at)
    VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(report_date) DO UPDATE SET window_start=excluded.window_start,window_end=excluded.window_end,recipient=excluded.recipient,status='pending',failure_reason=NULL`)
    .bind(report.reportDate,report.start,report.end,env.OWNER_EMAIL,'pending',null,null,now,null).run();
  const message = activityReportMessage(report);
  const response = await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json','idempotency-key':force?`cosmic-aquaria-activity-${report.reportDate}-${Date.now()}`:`cosmic-aquaria-activity-${report.reportDate}`},body:JSON.stringify({from:env.REPORT_FROM_EMAIL,to:[env.OWNER_EMAIL],subject:`Cosmic Aquaria daily activity — ${report.reportDate}`,html:message.html,text:message.text})});
  const result = await response.json().catch(()=>({}));
  await env.DB.prepare(`UPDATE activity_report_delivery SET status=?,provider_id=?,failure_reason=?,sent_at=? WHERE report_date=?`)
    .bind(response.ok?'sent':'failed',clean(result.id,160),response.ok?null:JSON.stringify(result).slice(0,800),response.ok?new Date().toISOString():null,report.reportDate).run();
  if (!response.ok) throw new Error('Daily activity email failed: '+JSON.stringify(result));
  return {ok:true,skipped:false,reportDate:report.reportDate,providerId:result.id||null};
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
  const current = await env.DB.prepare('SELECT status FROM aquarium WHERE id=?').bind(id).first();
  const update = env.DB.prepare(`UPDATE aquarium SET status=?,disabled_at=? WHERE id=?`).bind(status,status === 'disabled' ? now : null,id);
  const statements = [update];
  if (current?.status && current.status !== status) statements.push(systemEventStatement(env,status === 'published' ? 'aquarium_published' : 'aquarium_unpublished',id,null,now));
  const results = await env.DB.batch(statements);
  const result = results[0];
  return json({ok:true,id,status,changed:result.meta?.changes||0});
}

async function setAquariumWaters(request, env, id) {
  const body = await readBody(request);
  const waters = [...new Set((Array.isArray(body?.waters) ? body.waters : []).map(value=>String(value).toLowerCase()).filter(value=>WATERS.has(value)))];
  if (!waters.length) return json({ok:false,error:'at_least_one_water_required'},400);
  const statements = [env.DB.prepare('DELETE FROM aquarium_water WHERE aquarium_id=?').bind(id)];
  const now = new Date().toISOString();
  for (const water of waters) statements.push(env.DB.prepare('INSERT INTO aquarium_water (aquarium_id,water,assigned_by,confidence,updated_at) VALUES (?,?,?,?,?)').bind(id,water,'manual',null,now));
  await env.DB.batch(statements);
  return json({ok:true,id,waters});
}

async function verifyDestinations(env) {
  const rows = await env.DB.prepare("SELECT id,aquarium_url FROM aquarium WHERE status='published' AND disabled_at IS NULL ORDER BY id LIMIT 250").all();
  const broken = [];
  for (const item of rows.results || []) {
    try {
      const response = await fetch(item.aquarium_url,{method:'HEAD',redirect:'follow'});
      if (!response.ok) broken.push({id:item.id,url:item.aquarium_url,status:response.status});
    } catch { broken.push({id:item.id,url:item.aquarium_url,status:0}); }
  }
  return json({ok:broken.length===0,checked:(rows.results||[]).length,broken});
}

function adminPage() {
  return new Response(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cosmic Aquaria — Owner</title><style>
  *{box-sizing:border-box}body{margin:0;background:#050817;color:#eeeaf8;font:14px Inter,system-ui;padding:32px}main{max-width:1200px;margin:auto}h1{font-weight:400;letter-spacing:.18em}input,select,button{background:#0d1329;color:#eee;border:1px solid #343b59;padding:10px}button{cursor:pointer}#grid,#waterGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin:22px 0}.card,table{background:#090e20;border:1px solid #242a43}.card{padding:18px}.card b{display:block;font-size:26px;font-weight:400}table{width:100%;border-collapse:collapse;margin:18px 0}td,th{padding:10px;border-bottom:1px solid #1e243c;text-align:left}a{color:#c9bbff}.operations,.waterEditor{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}.waterEditor label{font-size:11px;text-transform:uppercase}.waterEditor input{vertical-align:middle}</style></head><body><main><h1>COSMIC AQUARIA</h1><p>Private owner reporting. Metrics are anonymous activity signals, not sales or popularity claims.</p><form id="login"><input id="token" type="password" placeholder="Owner token" autocomplete="current-password"><button>OPEN REPORT</button></form><section id="report" hidden><h2>Universe / Doorway</h2><div class="operations"><a href="https://raggedya.github.io/cosmic-aquarium/">Open live doorway</a><button id="copyDoorway">Copy doorway URL</button><a href="https://raggedya.github.io/cosmic-aquarium/cosmic-aquaria-qr-standard.png" download>Download standard QR</a><a href="https://raggedya.github.io/cosmic-aquarium/cosmic-aquaria-qr-branded.png" download>Download branded QR</a><select id="testWater"><option value="anywhere">ANYWHERE</option><option>HEAVY</option><option>DREAMY</option><option>ELECTRONIC</option><option>QUIET</option><option>LOUD</option><option>DARK</option><option>STRANGE</option></select><button id="testRandom">Test random selection</button><button id="verifyLinks">Verify destination links</button></div><p id="universeStatus"></p><div id="waterGrid"></div><div id="grid"></div><div class="operations"><a href="https://github.com/Raggedya/cosmic-aquarium/actions/workflows/daily-discovery.yml">Rerun daily batch</a><a href="https://github.com/Raggedya/groove-vultures-deep-cuts-fan-challenge/actions/workflows/cosmic-aquaria-daily-email.yml">Resend owner email</a></div><h2>Daily batches</h2><table><thead><tr><th>Date</th><th>Published</th><th>Status</th><th>Email</th></tr></thead><tbody id="batchRows"></tbody></table><h2>Aquariums</h2><table><thead><tr><th>Aquarium</th><th>Waters</th><th>Opens</th><th>Tracks</th><th>Shares</th><th>Buy</th><th>Explore</th><th>Action</th></tr></thead><tbody id="rows"></tbody></table></section></main><script>
  const byId=id=>document.getElementById(id);let ownerToken='';
  byId('login').onsubmit=async e=>{e.preventDefault();ownerToken=byId('token').value;const r=await fetch('/api/admin/overview',{headers:{authorization:'Bearer '+ownerToken}});if(!r.ok)return alert('Owner access was not accepted.');const d=await r.json();byId('report').hidden=false;byId('login').hidden=true;const t=d.totals||{};byId('grid').innerHTML=[['Published',t.published_aquariums],['Doorway opens',t.doorway_opens_today],['Opens today',t.opens_today],['Tracks today',t.tracks_today],['Shares today',t.shares_today],['Buy clicks today',t.buy_clicks_today],['Explore today',t.explores_today]].map(x=>'<div class=card><b>'+Number(x[1]||0)+'</b>'+x[0]+'</div>').join('');byId('waterGrid').innerHTML=(d.waterCounts||[]).map(x=>'<div class=card><b>'+Number(x.total||0)+'</b>'+x.water.toUpperCase()+'</div>').join('');byId('copyDoorway').onclick=()=>navigator.clipboard.writeText('https://raggedya.github.io/cosmic-aquarium/');byId('testRandom').onclick=async()=>{const water=byId('testWater').value.toLowerCase(),response=await fetch('/api/aquariums/random?water='+water);const item=await response.json();byId('universeStatus').textContent=response.ok?'Selected: '+item.artist+' — '+item.release_title:'No eligible Aquarium.'};byId('verifyLinks').onclick=async()=>{byId('universeStatus').textContent='Checking…';const response=await fetch('/api/admin/verify-destinations',{headers:{authorization:'Bearer '+ownerToken}}),result=await response.json();byId('universeStatus').textContent=result.ok?'All '+result.checked+' destinations are working.':result.broken.length+' destination(s) need attention.'};
  for(const b of d.batches||[]){const row=byId('batchRows').insertRow();[b.batch_date,b.published_count+'/'+b.target_count,b.status,b.email_status].forEach(value=>{const cell=row.insertCell();cell.textContent=String(value??'')})}
  for(const a of d.aquariums||[]){const row=byId('rows').insertRow();const link=document.createElement('a');link.href=a.aquarium_url;link.textContent=a.artist+' — '+a.release_title;row.insertCell().append(link);const waterCell=row.insertCell(),editor=document.createElement('div');editor.className='waterEditor';const assigned=String(a.waters||'').split(',');for(const water of ['heavy','dreamy','electronic','quiet','loud','dark','strange']){const label=document.createElement('label'),box=document.createElement('input');box.type='checkbox';box.value=water;box.checked=assigned.includes(water);label.append(box,water);editor.append(label)}const save=document.createElement('button');save.textContent='SAVE';save.onclick=async()=>{const waters=[...editor.querySelectorAll('input:checked')].map(x=>x.value);const response=await fetch('/api/admin/aquariums/'+encodeURIComponent(a.id)+'/waters',{method:'PUT',headers:{authorization:'Bearer '+ownerToken,'content-type':'application/json'},body:JSON.stringify({waters})});if(!response.ok)alert('Choose at least one water.');else alert('Waters saved.')};editor.append(save);waterCell.append(editor);[a.opens,a.tracks,a.shares,a.buy_clicks,a.explores].forEach(value=>{const cell=row.insertCell();cell.textContent=String(value||0)});const button=document.createElement('button');button.textContent=a.status==='disabled'?'REPUBLISH':'DISABLE';button.onclick=async()=>{const action=a.status==='disabled'?'republish':'disable';const response=await fetch('/api/admin/aquariums/'+encodeURIComponent(a.id)+'/'+action,{method:'POST',headers:{authorization:'Bearer '+ownerToken}});if(response.ok)location.reload();else alert('The change could not be saved.')};row.insertCell().append(button)}};
  </script></body></html>`,{headers:{'content-type':'text/html; charset=utf-8'}});
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:CORS});
      if (url.pathname === '/api/health') return json({ok:true,service:'cosmic-aquaria'} ,200,CORS);
      if (url.pathname === '/api/events' && request.method === 'POST') return recordEvent(request,env);
      if (url.pathname === '/api/email/open.gif' && request.method === 'GET') return recordEmailOpen(url,env);
      if (url.pathname === '/api/aquariums/random' && request.method === 'GET') return randomAquarium(url,env);
      if (url.pathname === '/admin' && request.method === 'GET') return adminPage();
      if (url.pathname === '/api/admin/sync' && !syncAuthorized(request,env)) return json({error:'unauthorized'},401);
      if (url.pathname.startsWith('/api/admin/') && url.pathname !== '/api/admin/sync' && !authorized(request,env)) return json({error:'unauthorized'},401);
      if (url.pathname === '/api/admin/sync' && request.method === 'POST') return syncCatalogue(request,env);
      if (url.pathname === '/api/admin/overview' && request.method === 'GET') return overview(env);
      if (url.pathname === '/api/admin/verify-destinations' && request.method === 'GET') return verifyDestinations(env);
      const watersMatch = url.pathname.match(/^\/api\/admin\/aquariums\/([^/]+)\/waters$/);
      if (watersMatch && request.method === 'PUT') return setAquariumWaters(request,env,decodeURIComponent(watersMatch[1]));
      if (url.pathname === '/api/admin/activity-report' && request.method === 'GET') {
        const end = url.searchParams.get('end');
        return json(await activityReport(env,end ? Date.parse(end) : Date.now()));
      }
      if (url.pathname === '/api/admin/activity-report/send' && request.method === 'POST') {
        const body = await readBody(request);
        return json(await sendActivityReport(env,body?.end ? Date.parse(body.end) : Date.now(),body?.force === true));
      }
      if (url.pathname === '/api/admin/email-delivery' && request.method === 'POST') return recordEmailDelivery(request,env);
      const statusMatch = url.pathname.match(/^\/api\/admin\/aquariums\/([^/]+)\/(disable|republish)$/);
      if (statusMatch && request.method === 'POST') return setAquariumStatus(request,env,decodeURIComponent(statusMatch[1]),statusMatch[2] === 'disable' ? 'disabled' : 'published');
      return json({error:'not_found'},404,CORS);
    } catch (error) {
      console.error(error);
      const detail = url.pathname.startsWith('/api/admin/') && authorized(request,env) ? String(error?.stack || error).slice(0,2000) : undefined;
      return json({error:'internal_error',detail},500,CORS);
    }
  },
  async scheduled(controller, env, context) {
    const local = sydneyParts(new Date(controller.scheduledTime));
    if (local.hour !== 19) return;
    context.waitUntil(sendActivityReport(env,controller.scheduledTime));
  },
};
