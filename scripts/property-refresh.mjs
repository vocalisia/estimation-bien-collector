import { createHash } from 'node:crypto';
import { canonicalURL } from './property-import.mjs';

export function htmlText(html) {
  return html.replace(/<!--[\s\S]*?-->/g,' ').replace(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ').replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)))
    .replace(/&#(\d+);/g,(_,n)=>Number(n)<=0x10ffff?String.fromCodePoint(Number(n)):' ')
    .replace(/&nbsp;|&thinsp;|&ensp;|&emsp;/g,' ').replace(/&amp;/g,'&').replace(/&rsquo;|&apos;/g,"'")
    .replace(/&egrave;/g,'è').replace(/&eacute;/g,'é').replace(/&ecirc;/g,'ê').replace(/&agrave;/g,'à').replace(/&sup2;/g,'²')
    .replace(/[\u200b-\u200d\ufeff]/g,'').replace(/\s+/g,' ').trim();
}
const number=s=>Number(s.replace(/[’'\s\u202f]/g,'').replace(',','.'));
const amount="([0-9]{1,3}(?:[’'][0-9]{3})+(?:[.,][0-9]{1,2})?|[0-9]{1,3}(?:[ \\u202f][0-9]{3})+(?:[.,][0-9]{1,2})?|[0-9]+(?:[.,][0-9]{1,2})?)";
function values(text,patterns){
  for(const pattern of patterns){
    const nums=[...text.matchAll(new RegExp(pattern,'gi'))].map(m=>number(m[1])).filter(Number.isFinite);
    if(nums.length)return [...new Set(nums)];
  }
  return [];
}
export function extractListingFacts(html,previous,contract={}) {
  const fail=(reason,details)=>({state:'review',reason,...(details?{details}: {})});
  if(contract.identityToken&&!htmlText(html).includes(contract.identityToken))return fail('IDENTITY_NOT_CONFIRMED');
  const canonical=html.match(/<link\b(?=[^>]*\brel=["']canonical["'])[^>]*\bhref=["']([^"']+)/i)?.[1];
  if((!canonical||canonicalURL(canonical)!==canonicalURL(previous.source))&&!(contract.identityToken&&htmlText(html).includes(contract.identityToken)))return fail('CANONICAL_MISMATCH');
  const raw=(html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]||html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1]||html)
    .replace(/<(?:header|nav|footer)\b[^>]*>[\s\S]*?<\/(?:header|nav|footer)>/gi,' ')
    .split(/Nos biens similaires|Biens similaires|Objets similaires|Ces biens pourraient|Vous pourriez aussi|Nos autres biens|Propriétés similaires/i)[0];
  let text=htmlText(raw).split(/Nos biens similaires|Biens similaires|Objets similaires|Ces biens pourraient|Vous pourriez aussi|Nos autres biens|Propriétés similaires/i)[0];
  const heading=htmlText(raw.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||'');
  const inactiveBadge=/<(?:span|div|p|strong)\b[^>]*>\s*(?:vendu|réservé|retiré|sold|reserved)\s*<\//iu.test(raw);
  if(inactiveBadge||/(?:^|[^\p{L}])(?:vendu|réservé|retiré|sold|reserved)(?:$|[^\p{L}])/iu.test(heading)||/Vente sur plans|vendu(?:e)? sur plans|chantier (?:est )?en cours|en cours de construction/i.test(text))return fail('NOT_EXISTING_ACTIVE_OFFER');
  const town=({5586:'Lausanne',5938:'Yverdon-les-Bains',5724:'Nyon',5721:'Gland',6621:'Genève'})[previous.municipalityId];
  if(!town||!text.slice(0,1800).includes(town))return fail('LOCATION_NOT_CONFIRMED');
  if(contract.locationPattern&&!new RegExp(contract.locationPattern,'iu').test(text))return fail('LOCATION_NOT_CONFIRMED');
  if(contract.activePattern&&!new RegExp(contract.activePattern,'iu').test(text))return fail('ACTIVE_OFFER_NOT_CONFIRMED');
  // Read labels, not bare m² or a sum of balconies/parking. The first labelled
  // price is the primary asking price; smaller annex prices never substitute it.
  const prices=values(contract.priceFromBody?htmlText(html):text,contract.pricePattern?[contract.pricePattern]:[`(?:Prix\\s*(?:[\\u200b-\\u200d]|\\s)*de vente|Prix de l'objet|Prix:)\\s*(?:CHF\\s*)?${amount}`,`CHF\\s*${amount}(?=\\s*(?:[.–-]|CHF|[A-Za-zÉ]|$))`,`Prix\\s+${amount}\\.-`]);
  const surfaces=values(text,contract.surfacePattern?[contract.surfacePattern]:[`Surface nette habitable\\s*:?\\s*[~≈]?\\s*${amount}\\s*m`,`Surface habitable nette\\s*:?\\s*[~≈]?\\s*${amount}\\s*m`,`Surface habitable(?:\\s*\\(m2\\))?\\s*:?\\s*(?:d['’]environ\\s*)?[~≈]?\\s*${amount}\\s*m`,`Surface habitable(?:\\s*\\(m2\\))?\\s*:?\\s*[~≈]?\\s*${amount}(?=\\s+(?:Nombre|Surface|Année|Prix|Chambre|m))`,`SURFACE HAB\\.\\s*${amount}\\s*M`,`([0-9]+(?:[.,][0-9]+)?)\\s*m\\s*[²2]\\s+Surface habitable`]);
  const rooms=values(text,contract.roomsPattern?[contract.roomsPattern]:[`(?:Nombre de pièces|Nb de pièces|Nbr de pièces|Pièce\\(s\\))\\s*:?\\s*([0-9]+(?:[.,][0-9]+)?)`,`Pièces\\s*([0-9]+(?:[.,][0-9]+)?)\\s+Rooms`,`Pièces\\s*:?\\s*([0-9]+(?:[.,][0-9]+)?)`,`([0-9]+(?:[.,][0-9]+)?)\\s+Pièces`]);
  if(prices.length!==1||!surfaces.length||surfaces.some(s=>Math.abs(s-surfaces[0])>0.11)||!rooms.length||rooms.length>1)return fail('MISSING_OR_AMBIGUOUS_FACTS',{prices,surfaces,rooms});
  const facts={price:prices[0],surface:surfaces[0],rooms:rooms[0]};
  if(facts.price<10000||facts.price>100000000||facts.surface<10||facts.surface>10000||facts.rooms<1)return fail('INVALID_NUMERIC_FACTS');
  return {state:'active',facts};
}
export function planRefresh(previous,response,now=new Date(),contract={}) {
  const base={observationId:previous.id,checkedAt:now.toISOString()};
  if([404,410].includes(response.status))return {...base,state:'unavailable',reason:'HTTP_'+response.status};
  if(response.status!==200||typeof response.html!=='string')return {...base,state:'error',reason:'HTTP_'+response.status};
  const parsed=extractListingFacts(response.html,previous,contract);
  if(parsed.state!=='active')return {...base,...parsed};
  if(Math.abs(parsed.facts.surface-previous.surface)>0.11||parsed.facts.rooms!==previous.rooms)return {...base,state:'review',reason:'PHYSICAL_FACTS_CHANGED'};
  if(Math.abs(parsed.facts.price/previous.price-1)>0.25)return {...base,state:'review',reason:'LARGE_PRICE_CHANGE_REQUIRES_REVIEW'};
  const active={...base,state:'active',verifiedAt:now.toISOString(),contentSHA256:createHash('sha256').update(response.html).digest('hex')};
  if(parsed.facts.price===previous.price)return active;
  // Retain the same physical identity and every previous price version. Daily
  // confirmations are kept in the checks table, not duplicated in this history.
  const observation={...previous,price:parsed.facts.price,date:now.toISOString().slice(0,10),observedAt:now.toISOString(),listingStatus:'active'};
  delete observation.lastVerifiedAt;delete observation.refreshManaged;
  observation.id=createHash('sha256').update(JSON.stringify([previous.propertyKey,previous.source,observation.observedAt,observation.price,observation.surface,observation.rooms])).digest('hex');
  return {...active,observation,observationId:observation.id};
}
export function robotsAllows(body,url,agent='EstimationBienResearchBot') {
  const groups=[];let group=null,hasRules=false;
  for(const raw of body.split(/\r?\n/)){
    const line=raw.replace(/#.*$/,'').trim(),m=line.match(/^([^:]+):\s*(.*)$/);if(!m)continue;
    const key=m[1].toLowerCase(),value=m[2].trim();
    if(key==='user-agent'){
      if(!group||hasRules){group={agents:[],rules:[]};groups.push(group);hasRules=false;}group.agents.push(value.toLowerCase());
    }else if(group&&['allow','disallow'].includes(key)){hasRules=true;if(value)group.rules.push({allow:key==='allow',pattern:value});}
  }
  const specific=groups.filter(g=>g.agents.some(a=>a!=='*'&&agent.toLowerCase().includes(a))),chosen=specific.length?specific:groups.filter(g=>g.agents.includes('*'));
  const path=new URL(url).pathname+new URL(url).search;
  const matches=chosen.flatMap(g=>g.rules).filter(r=>{const p=r.pattern.replace(/[.+?^{}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*');return new RegExp('^'+p).test(path);}).sort((a,b)=>b.pattern.length-a.pattern.length||Number(b.allow)-Number(a.allow));
  return matches[0]?.allow??true;
}
