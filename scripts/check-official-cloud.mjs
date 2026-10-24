import fs from 'node:fs';
import {neon} from '@neondatabase/serverless';
import {validateOfficialReference,compareOfficialReference} from './official-reference-check.mjs';
const summary={sources:0,unchanged:0,changed:0,failures:0,statisticalImports:0};
try {
 const connection=process.env.PROPERTY_REFRESH_DATABASE_URL;if(!connection)throw Error('NO_CONNECTION');
 const sql=neon(connection);
 const config=(await sql.query('SELECT payload FROM valuation_refresh_config WHERE id=1'))[0]?.payload;
 const sources=config?.officialSources;
 if(!Array.isArray(sources)||sources.length<1||sources.length>4)throw Error('NO_OFFICIAL_CONFIGURATION');
 for(const source of sources){summary.sources++;
  try {
   const url=validateOfficialReference(source);
   const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(15000)});
   if(response.status!==200)throw Error('SOURCE_UNAVAILABLE');
   const reader=response.body.getReader(),chunks=[];let bytes=0;
   try {for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>2000000){await reader.cancel();throw Error('SOURCE_TOO_LARGE');}chunks.push(part.value);}}
   finally {reader.releaseLock();}
   summary[compareOfficialReference(Buffer.concat(chunks),source)]++;
  }catch {summary.failures++;}
 }
}catch {summary.failures++;}
fs.mkdirSync('.private/free-market',{recursive:true});
fs.writeFileSync('.private/free-market/official-summary.json',JSON.stringify(summary));
console.log(JSON.stringify({official:summary}));
if(summary.changed||summary.failures)process.exitCode=1;
