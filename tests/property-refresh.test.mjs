import test from 'node:test';
import assert from 'node:assert/strict';
import { extractListingFacts, planRefresh, robotsAllows } from '../scripts/property-refresh.mjs';
const source='https://agency.example/sale/unit-1';
const previous={id:'old',kind:'property',propertyKey:'agency:1',source,sourcePolicyId:'agency',price:800000,surface:80,rooms:3.5,municipalityId:5938,date:'2026-10-01',nature:'Annonce',listingStatus:'active',propertyType:'Appartement',canton:'VD'};
const html=(price="800'000")=>`<link rel="canonical" href="${source}"><main><h1>Appartement</h1><p>1400 Yverdon-les-Bains</p><p>Prix de vente CHF ${price}.-</p><p>Pièce(s) 3.5</p><p>Surface habitable nette 80 m²</p><h2>Biens similaires</h2><p>CHF 200'000 Surface habitable 20 m²</p></main>`;
const now=new Date('2026-10-19T08:00:00Z');
test('extracts the primary listing and excludes related-property facts',()=>{
 const r=extractListingFacts(html(),previous);assert.deepEqual(r.facts,{price:800000,surface:80,rooms:3.5});assert.equal(r.state,'active');
});
test('does not substitute a weighted surface or a mismatched canonical',()=>{
 assert.equal(extractListingFacts(html().replace('Surface habitable nette','Surface pondérée'),previous).state,'review');
 assert.equal(extractListingFacts(html().replace(source,'https://agency.example/'),previous).state,'review');
});
test('unchanged active facts only refresh verification, without duplicating observations',()=>{
 const r=planRefresh(previous,{status:200,html:html()},now);assert.equal(r.state,'active');assert.equal(r.observation,undefined);assert.equal(r.observationId,'old');
});
test('a confirmed price change creates a dated version with the same physical key',()=>{
 const r=planRefresh(previous,{status:200,html:html("790'000")},now);assert.equal(r.observation.price,790000);assert.equal(r.observation.propertyKey,'agency:1');assert.equal(r.observation.observedAt,now.toISOString());assert.notEqual(r.observation.id,'old');
});
test('surface or room changes require review rather than silently reusing identity',()=>{
 assert.equal(planRefresh(previous,{status:200,html:html().replace('nette 80','nette 95')},now).state,'review');
 assert.equal(planRefresh(previous,{status:200,html:html().replace('Pièce(s) 3.5','Pièce(s) 5.5')},now).state,'review');
});
test('404 is unavailable, never a confirmed sale; server failures do not refresh evidence',()=>{
 const missing=planRefresh(previous,{status:404},now);assert.equal(missing.state,'unavailable');assert.equal(missing.observation,undefined);
 const outage=planRefresh(previous,{status:503},now);assert.equal(outage.state,'error');assert.equal(outage.verifiedAt,undefined);
});
test('sold, reserved or future construction cannot refresh an active comparator',()=>{
 for(const marker of ['Vendu','Réservé','Vente sur plans'])assert.equal(planRefresh(previous,{status:200,html:html().replace('<h1>Appartement','<h1>'+marker+' Appartement')},now).state,'review');
 assert.equal(planRefresh(previous,{status:200,html:html().replace('</h1>','</h1><span>Réservé</span>')},now).state,'review');
});
test('a same-day return to a previous price is a new event, not an old version ID',()=>{
 const first=planRefresh(previous,{status:200,html:html("790'000")},now).observation;
 const second=planRefresh(first,{status:200,html:html("780'000")},new Date('2026-10-19T09:00:00Z')).observation;
 const third=planRefresh(second,{status:200,html:html("790'000")},new Date('2026-10-19T10:00:00Z')).observation;
 assert.notEqual(first.id,third.id);assert.equal(third.price,first.price);
});
test('robots follows the longest rule and source-specific group',()=>{
 const body='User-agent: *\nDisallow: /private/\nAllow: /private/public/\nUser-agent: GPTBot\nDisallow: /';
 assert.equal(robotsAllows(body,'https://agency.example/sale/1'),true);assert.equal(robotsAllows(body,'https://agency.example/private/1'),false);assert.equal(robotsAllows(body,'https://agency.example/private/public/1'),true);
});
test('a parking price cannot silently replace the apartment price',()=>{
 const mixed=html().replace("Prix de vente CHF 800'000.-","Prix de vente CHF 70'000.- place de parc</p><p>Prix de vente CHF 800'000.- appartement");
 assert.equal(planRefresh(previous,{status:200,html:mixed},now).state,'review');
});
test('a suspicious price jump is held for review, never written automatically',()=>{
 assert.equal(planRefresh(previous,{status:200,html:html("80'000'000")},now).state,'review');
});
