// Bounded updater. Cloud mode uses a dedicated, restricted database role.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { canonicalURL } from './property-import.mjs';
import { planRefresh, robotsAllows } from './property-refresh.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');process.chdir(root);
const args=process.argv.slice(2);let onlySource;
const sourceOption=args.indexOf('--source');if(sourceOption!==-1){onlySource=canonicalURL(args[sourceOption+1]);if(!onlySource)throw Error('Invalid source');args.splice(sourceOption,2);}
if(args.some(a=>!['--apply','--fixtures','--cloud'].includes(a)))throw Error('Options: --apply [--fixtures | --cloud] [--source approved-URL]');
const apply=args.includes('--apply'),fixtures=args.includes('--fixtures'),cloud=args.includes('--cloud');if((apply||cloud)&&fixtures)throw Error('Fixture writes or cloud fixtures forbidden');
const reportDirectory=path.join(root,'.private/free-market');fs.mkdirSync(reportDirectory,{recursive:true});
const lock=path.join(reportDirectory,'property-refresh.lock');let handle;
try{handle=fs.openSync(lock,'wx');}catch{throw Error('Another refresh is running or a stale lock needs operator review');}
try{
 const now=new Date();
 const {neon}=cloud?await import('@neondatabase/serverless'):await import('../.private/neon-driver/package/index.mjs');
 const connection=cloud?process.env.PROPERTY_REFRESH_DATABASE_URL:parseEnv(fs.readFileSync('.private/production.env','utf8')).DATABASE_URL;
 if(!connection)throw Error('Dedicated database connection absent');
 const sql=neon(connection);
 const configuration=cloud?(await sql.query('SELECT payload FROM valuation_refresh_config WHERE id=1'))[0]?.payload:null;
 const policies=cloud?configuration?.policies:JSON.parse(fs.readFileSync('database/property-sources.json','utf8')).sources;
 const manifest=cloud?configuration?.manifest:JSON.parse(fs.readFileSync('database/property-refresh.json','utf8'));
 if(!Array.isArray(policies)||!manifest)throw Error('Refresh configuration absent');
 if(!Array.isArray(manifest.listings)||manifest.listings.length>64)throw Error('Manifest exceeds64 explicit listings');
 if(onlySource&&!manifest.listings.some(c=>c.source===onlySource))throw Error('Source is not in the reviewed manifest');
 const reviewedSources=manifest.listings.map(c=>canonicalURL(c.source)).filter(Boolean);
 const rows=fixtures?JSON.parse(fs.readFileSync('.private/free-market/refresh-baseline-20261018.json','utf8')).rows:(await sql.query("SELECT payload FROM valuation_property_observations WHERE payload->>'source' IN (SELECT jsonb_array_elements_text($1::jsonb))",[JSON.stringify(reviewedSources)])).map(r=>r.payload);
 const fixtureIndex=fixtures?JSON.parse(fs.readFileSync('.private/free-market/refresh-fixture-index.json','utf8')):[];
 const robots=new Map(),lastRequest=new Map(),results=[];
 const fetchPage=async url=>{
   const origin=new URL(url).origin,delay=Math.max(800,robots.get(origin)?.delay||0);
   const remaining=delay-(Date.now()-(lastRequest.get(origin)||0));
   if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));
   lastRequest.set(origin,Date.now());
   const r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(15000),headers:{Accept:'text/html,text/plain;q=0.8','User-Agent':'EstimationBienResearchBot/1.0 (+https://estimation-bien.ch/sources)'}});
   // Redirects need review; never follow an unexpected origin or generic index.
   if(r.status!==200)return {status:r.status};
   if(!/text\/(?:html|plain)/i.test(r.headers.get('content-type')||''))throw Error('Unexpected content type');
   const reader=r.body.getReader(),chunks=[];let bytes=0;
   for(;;){const{done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>2000000){await reader.cancel();throw Error('Response exceeds2MB');}chunks.push(value);}
   return {status:r.status,html:Buffer.concat(chunks).toString('utf8')};
 };
 for(const contract of manifest.listings.filter(c=>!onlySource||c.source===onlySource)){
   const source=canonicalURL(contract.source),policy=policies.find(p=>p.id===contract.sourcePolicyId);
   const versions=rows.filter(o=>o.source===source&&o.nature==='Annonce').sort((a,b)=>(b.observedAt||b.date).localeCompare(a.observedAt||a.date));
   const previous=versions[0];
   const approved=source&&policy?.status==='approved'&&policy.costCHF===0&&policy.commercialReuse===true&&policy.allowedSources?.includes(source)&&policy.allowedSources.length<=12&&new URL(source).origin===policy.origin;
   if(!previous){results.push({source,state:'skipped',reason:'NOT_IMPORTED'});continue;}
   let result;
   if(!approved||!/^\d{4}-\d{2}-\d{2}$/.test(policy.validThrough)||new Date(policy.validThrough+'T23:59:59Z')<now){result={state:'review',reason:approved?'SOURCE_POLICY_EXPIRED':'SOURCE_POLICY_REVOKED',observationId:previous.id,checkedAt:now.toISOString()};}
   else try{
     let response;
     if(fixtures){const i=fixtureIndex.find(i=>i.source===source);response=i?.key?JSON.parse(fs.readFileSync(reportDirectory+'/refresh-page-'+i.key+'.json','utf8')):{status:0};}
     else{
       const origin=new URL(source).origin;
       if(!robots.has(origin)){
         const r=await fetchPage(origin+'/robots.txt');
         if(r.status!==200&&r.status!==404)throw Error('Robots unavailable');
         const body=r.status===404?'':r.html,delays=[...body.matchAll(/^Crawl-delay:\s*([0-9.]+)/gmi)].map(m=>Number(m[1])*1000);
         const delay=Math.max(800,...delays);if(delay>60000)throw Error('Crawl delay requires an operator schedule');
         robots.set(origin,{body,delay});
       }
       if(!robotsAllows(robots.get(origin).body,source))throw Error('Robots excludes this URL');
       response=await fetchPage(source);
     }
     result=planRefresh(previous,response,now,contract);
   }catch(e){result={state:'error',reason:e.message,observationId:previous.id,checkedAt:now.toISOString()};}
   if(apply){
     const queries=[];
     if(result.observation){const o=result.observation;queries.push(sql.query('INSERT INTO valuation_property_observations(id,canton,municipality_id,property_type,observed_at,lat,lon,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) ON CONFLICT(id) DO NOTHING',[o.id,o.canton,o.municipalityId,o.propertyType,o.date,o.lat,o.lon,JSON.stringify(o)]));}
     const expires=result.verifiedAt?new Date(Math.min(Date.parse(result.verifiedAt)+7*86400000,Date.parse(policy.validThrough+'T23:59:59Z'))).toISOString():null;
     queries.push(sql.query(`INSERT INTO valuation_property_checks(source,property_key,observation_id,checked_at,verified_at,expires_at,state,detail)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) ON CONFLICT(source) DO UPDATE SET
       observation_id=EXCLUDED.observation_id,checked_at=EXCLUDED.checked_at,state=EXCLUDED.state,detail=EXCLUDED.detail,
       verified_at=CASE WHEN EXCLUDED.state='error' THEN valuation_property_checks.verified_at ELSE EXCLUDED.verified_at END,
       expires_at=CASE WHEN EXCLUDED.state='error' THEN valuation_property_checks.expires_at ELSE EXCLUDED.expires_at END
       WHERE valuation_property_checks.checked_at<=EXCLUDED.checked_at`,[source,previous.propertyKey,result.observationId,result.checkedAt,result.verifiedAt||null,expires,result.state,JSON.stringify({reason:result.reason||null,contentSHA256:result.contentSHA256||null})]));
     await sql.transaction(queries);
   }
   results.push({source,...result,observation:result.observation?{id:result.observation.id,oldPrice:previous.price,price:result.observation.price}:undefined});
   if(results.length%10===0)console.log(JSON.stringify({checked:results.length,total:onlySource?1:manifest.listings.length}));
 }
 const report={checkedAt:now.toISOString(),mode:apply?'apply':fixtures?'fixtures':'dry-run',dataCostCHF:0,counts:results.reduce((a,r)=>(a[r.state]=(a[r.state]||0)+1,a),{}),priceChanges:results.filter(r=>r.observation).length,results};
 const filename='refresh-'+now.toISOString().replace(/[:.]/g,'-')+'.json';fs.writeFileSync(path.join(reportDirectory,filename),JSON.stringify(report,null,2));fs.writeFileSync(path.join(reportDirectory,'refresh-latest.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({checkedAt:report.checkedAt,mode:report.mode,counts:report.counts,priceChanges:report.priceChanges,report:filename}));
 // A cloud run that cannot see an explicitly imported manifest item is incomplete.
 if(results.some(r=>r.state==='error'||cloud&&r.state==='skipped'))process.exitCode=2;
}finally{fs.closeSync(handle);fs.unlinkSync(lock);}
