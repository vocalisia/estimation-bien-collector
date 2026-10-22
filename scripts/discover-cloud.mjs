import fs from 'node:fs';import{neon}from'@neondatabase/serverless';import{extractDiscovery}from'./property-discovery.mjs';import{robotsAllows}from'./property-refresh.mjs';
const summary={sources:0,newReviewCandidates:0,failures:0,valuationImports:0};
try{
 const url=process.env.PROPERTY_REFRESH_DATABASE_URL;if(!url)throw Error('NO_CONNECTION');const sql=neon(url);
 const payload=(await sql.query('SELECT payload FROM valuation_refresh_config WHERE id=1'))[0]?.payload;
 const sources=payload?.discovery?.sources;if(!Array.isArray(sources)||sources.length>4)throw Error('NO_DISCOVERY_CONFIGURATION');
 const known=[...(payload.manifest?.listings||[]).map(x=>x.source),...(payload.discovery.excludedSources||[]),...(await sql.query('SELECT source FROM valuation_discovery_candidates')).map(x=>x.source)];
 if(known.length>1200)throw Error('REVIEW_QUEUE_FULL');
 async function read(url,type){const r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(15000),headers:{Accept:type,'User-Agent':'EstimationBienResearchBot/1.0 (+https://estimation-bien.ch/sources)'}});if(r.status!==200)throw Error('SOURCE_UNAVAILABLE');const reader=r.body.getReader(),chunks=[];let bytes=0;try{for(;;){const v=await reader.read();if(v.done)break;bytes+=v.value.length;if(bytes>1000000){await reader.cancel();throw Error('SOURCE_TOO_LARGE');}chunks.push(v.value);}}finally{reader.releaseLock();}return Buffer.concat(chunks).toString('utf8');}
 for(const source of sources){summary.sources++;try{
  // Validate the private approval before issuing any request.
  extractDiscovery(source.format==='agency-html-v1'?'':'[]',source,known);
  const robots=await read(source.origin+'/robots.txt','text/plain');if(!robotsAllows(robots,source.index))throw Error('ROBOTS_DENIED');
  const delays=[...robots.matchAll(/^Crawl-delay:\s*([0-9.]+)/gmi)].map(x=>Number(x[1])*1000);const delay=Math.max(1000,...delays);if(delay>60000)throw Error('CRAWL_DELAY_REQUIRES_REVIEW');await new Promise(r=>setTimeout(r,delay));
  const candidates=extractDiscovery(await read(source.index,source.format==='agency-html-v1'?'text/html':'application/json'),source,known);
  for(const c of candidates){const result=await sql.query('INSERT INTO valuation_discovery_candidates(source,source_policy_id,reference,municipality_hint) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING source',[c.source,c.sourcePolicyId,c.reference,c.municipalityHint]);summary.newReviewCandidates+=result.length;known.push(c.source);}
 }catch{summary.failures++;}}
}catch{summary.failures++;}
fs.mkdirSync('.private/free-market',{recursive:true});fs.writeFileSync('.private/free-market/discovery-summary.json',JSON.stringify(summary));
console.log(JSON.stringify(summary));if(summary.failures)process.exitCode=1;
