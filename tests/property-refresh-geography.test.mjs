import test from 'node:test';
import assert from 'node:assert/strict';
import { extractListingFacts, planRefresh } from '../scripts/property-refresh.mjs';

const source = 'https://agency.example/sale/unit-2';
const base = {id:'old',propertyKey:'agency:2',source,price:800000,surface:80,rooms:3.5,municipalityId:5724,nature:'Annonce'};
function page(town='Nyon',ref='UNIT-2') {
 return `<link rel="canonical" href="${source}"><main><h1>Appartement</h1><p>Vente Ref. ${ref}</p><p>Localité ${town} Prix de vente 800'000 CHF</p><p>Pièces 3.5 Surface habitable 80 m²</p></main>`;
}
test('refresh supports the three approved municipalities',()=>{
 for(const [municipalityId,town] of [[5724,'Nyon'],[5721,'Gland'],[6621,'Genève']]){
  assert.equal(extractListingFacts(page(town),{...base,municipalityId}).state,'active');
 }
});
test('a required identity must hold even when the canonical URL still matches',()=>{
 assert.equal(extractListingFacts(page('Nyon','UNIT-3'),base,{identityToken:'UNIT-2'}).state,'review');
});
test('explicit primary municipality evidence prevents an agency footer from qualifying a neighbour',()=>{
 const html=page('Givrins').replace('</main>','<footer>Agency Nyon</footer></main>');
 assert.equal(extractListingFacts(html,base,{locationPattern:'Localité\\s+Nyon\\s+Prix de vente'}).state,'review');
});
test('related Cardis-style suggestions cannot supply another price or living area',()=>{
 const html=page().replace('</main>',"<h2>Nos biens similaires</h2><p>Prix de vente 400'000 CHF Pièces 2.5 Surface habitable 40 m²</p></main>");
 assert.deepEqual(extractListingFacts(html,base).facts,{price:800000,surface:80,rooms:3.5});
});
test('a reviewed label after the amount can establish a declared living area',()=>{
 const html=page().replace('Surface habitable 80 m²','80 m² habitables');
 assert.equal(extractListingFacts(html,base,{surfacePattern:'([0-9.]+)\\s*m²\\s+habitables'}).facts.surface,80);
});
test('a missing sale marker cannot refresh an active listing when a marker is required',()=>{
 assert.equal(extractListingFacts(page().replace('Vente Ref.','Location Ref.'),base,{activePattern:'Vente\\s+Ref\\.'}).state,'review');
});
test('bounded capture validation still rejects disappeared or reserved listings',()=>{
 assert.equal(planRefresh(base,{status:410},new Date()).state,'unavailable');
 assert.equal(extractListingFacts(page().replace('<h1>Appartement','<h1>Réservé Appartement'),base).state,'review');
});
