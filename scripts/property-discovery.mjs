import {canonicalURL} from './property-import.mjs';
// Discovery records are URLs to review, never valuation observations.
export function discoveryIdentity(url,origin){
 const canonical=canonicalURL(url);if(!canonical)return null;const u=new URL(canonical);
 if(u.origin!==origin||u.port||u.search)return null;
 const ref=/^\/fr\/acheter\/[^/]+$/.test(u.pathname)?u.pathname.match(/(?:-|\/)(\d{6,16})$/)?.[1]:u.pathname.match(/^\/immobilien\/(\d{6,16})fr-[a-z0-9-]+\/$/)?.[1];return ref?{url:canonical,reference:ref}:null;
}
export function extractDiscovery(body,source,known=[],now=new Date()){
 if(!['agency-json-v1','agency-html-v1'].includes(source.format)||source.status!=='approved'||source.scope!=='urls-only-review'||source.costCHF!==0||!source.assessmentNote||!source.termsReviewed)throw Error('UNAPPROVED_DISCOVERY_SOURCE');
 const day=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
 if(!day(source.reviewedOn)||!day(source.validThrough)||new Date(source.reviewedOn)>now||new Date(source.validThrough+'T23:59:59Z')<now)throw Error('DISCOVERY_APPROVAL_EXPIRED');
 const u=new URL(source.index);if(u.protocol!=='https:'||u.origin!==source.origin||u.username||u.password||u.port||!Number.isInteger(source.maxCandidates)||source.maxCandidates<1||source.maxCandidates>8)throw Error('INVALID_DISCOVERY_SCOPE');
 const rows=source.format==='agency-json-v1'?JSON.parse(body):body.split(/<div class="casawp-property">/).slice(1).map(card=>{const href=card.match(/<a\s+href="([^"<>]+)"\s*>\s*<\/a>/)?.[1],id=discoveryIdentity(href,source.origin);return id?{href,reference:id.reference,status:'active',city:null}:null;}).filter(Boolean);
 if(!Array.isArray(rows)||rows.length>1000)throw Error('INVALID_INVENTORY');
 const seen=new Set(known.map(x=>discoveryIdentity(x,source.origin)?.reference).filter(Boolean)),out=[];
 for(const r of rows){
  if(!r||r.status!=='active'||source.format==='agency-json-v1'&&!['Yverdon-les-Bains','Lausanne'].includes(r.city))continue;
  const id=discoveryIdentity(r.href,source.origin);if(!id||String(r.reference)!==id.reference||seen.has(id.reference))continue;
  seen.add(id.reference);out.push({source:id.url,sourcePolicyId:source.id,reference:id.reference,municipalityHint:r.city==='Lausanne'?5586:r.city==='Yverdon-les-Bains'?5938:null,status:'pending',reason:'UNVERIFIED_LOCATION_SURFACE_IDENTITY_AND_RIGHTS'});
 }
 return out.sort((a,b)=>(b.municipalityHint===5938)-(a.municipalityHint===5938)).slice(0,source.maxCandidates);
}
