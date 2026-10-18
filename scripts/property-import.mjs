// Operator-only import. Discovery output never becomes a comparable without validation.
import { createHash } from 'node:crypto';
export function canonicalURL(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    for (const k of Array.from(u.searchParams.keys())) if (/^(utm_|gclid$|fbclid$)/i.test(k)) u.searchParams.delete(k);
    u.hash = '';
    return u.href;
  } catch { return null; }
}
function day(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(value + 'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value ? d : null;
}
export function qualifyPropertyCandidate(candidate, policies, now = new Date()) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return { reasons: ['INVALID_RECORD'] };
  const c = candidate, reasons = [], source = canonicalURL(c.source);
  const p = policies.find(p => p.id === c.sourcePolicyId);
  const evidence = p && canonicalURL(p.rightsEvidence);
  if (!source) reasons.push('INVALID_SOURCE_URL');
  if (!p || p.status !== 'approved' || p.costCHF !== 0 || p.commercialReuse !== true || !p.licence || !evidence || !day(p.reviewedOn) || day(p.reviewedOn) > now || !day(p.validThrough) || day(p.validThrough).getTime() + 86400000 <= now.getTime()) reasons.push('SOURCE_NOT_APPROVED_FOR_FREE_COMMERCIAL_REUSE');
  if (p?.reuseBasis === 'limited-factual-analysis' && (p.sourcePermissionGranted !== false || p.scope !== 'numerical-facts-only' || !p.assessmentNote || !Array.isArray(p.allowedSources) || !p.allowedSources.includes(source) || p.allowedSources.length > 12)) reasons.push('OUTSIDE_BOUNDED_FACTUAL_ASSESSMENT');
  if (source && p && new URL(source).origin !== p.origin) reasons.push('SOURCE_ORIGIN_MISMATCH');
  // Crawling today or a CMS dateModified field never refreshes an old asking price.
  const date = day(c.priceDate);
  if (!date || date > now || now.getTime() - date.getTime() > 730 * 86400000) reasons.push('MISSING_OR_EXPIRED_PRICE_DATE');
  if (!['dated-price-document', 'active-offer-observed', 'registered-sale'].includes(c.priceDateBasis) || c.priceDateBasis === 'active-offer-observed' && c.listingStatus !== 'active') reasons.push('UNPROVEN_PRICE_DATE');
  if (!canonicalURL(c.priceEvidence)) reasons.push('MISSING_PRICE_EVIDENCE');
  if (!['Appartement', 'Maison'].includes(c.propertyType)) reasons.push('UNSUPPORTED_PROPERTY_TYPE');
  if (!(c.surfaceBasis === 'habitable-net' || c.nature === 'Annonce' && c.surfaceBasis === 'habitable-declared' && canonicalURL(c.surfaceEvidence)) || c.unitAmbiguous === true) reasons.push('AMBIGUOUS_SURFACE_OR_LOT');
  if (!Number.isFinite(c.surface) || c.surface < 10 || c.surface > 10000 || !Number.isFinite(c.price) || c.price < 10000 || c.price > 100000000 || c.currency !== 'CHF' || c.priceUnit !== 'total') reasons.push('INVALID_PRICE_OR_SURFACE');
  if (!Number.isInteger(c.municipalityId) || c.municipalityId < 1 || !['VD', 'VS', 'FR', 'BE', 'GE', 'ZH', 'BL', 'AG', 'AI', 'AR', 'BS', 'GL', 'GR', 'JU', 'LU', 'NE', 'NW', 'OW', 'SG', 'SH', 'SO', 'SZ', 'TG', 'TI', 'UR', 'ZG'].includes(c.canton) || !(c.locationPrecision === 'building' || c.nature === 'Annonce' && c.locationPrecision === 'municipality') || !canonicalURL(c.locationEvidence) || !Number.isFinite(c.lat) || !Number.isFinite(c.lon) || c.lat < 45.7 || c.lat > 47.9 || c.lon < 5.9 || c.lon > 10.6) reasons.push('UNVERIFIED_PROPERTY_LOCATION');
  if (!(c.marketRegime === 'Marché libre' || c.nature === 'Annonce' && c.marketRegime === 'Offre publique non vérifiée' && c.listingStatus === 'active') || !canonicalURL(c.marketRegimeEvidence)) reasons.push('UNVERIFIED_MARKET_REGIME');
  if (!['Vente', 'Annonce'].includes(c.nature) || c.nature === 'Vente' && (c.priceDateBasis !== 'registered-sale' || c.transactionType !== 'open-market')) reasons.push('UNPROVEN_SALE_PRICE');
  if (c.forcedSale === true || c.bundle === true) reasons.push('FORCED_SALE_OR_BUNDLE');
  if (typeof c.unitKey !== 'string' || !c.unitKey.trim() || c.unitKey.length > 240 || c.unitKey.trim() !== c.unitKey) reasons.push('MISSING_PHYSICAL_UNIT_KEY');
  if (c.rooms !== undefined && (!Number.isFinite(c.rooms) || c.rooms < 1 || c.rooms > 100)) reasons.push('INVALID_ROOMS');
  if (c.buildingYear !== undefined && (!Number.isInteger(c.buildingYear) || c.buildingYear < 1000 || c.buildingYear > now.getUTCFullYear() + 5)) reasons.push('INVALID_BUILDING_YEAR');
  if (c.projectKey !== undefined && (typeof c.projectKey !== 'string' || !/^[a-z0-9][a-z0-9:_-]{0,159}$/i.test(c.projectKey) || !canonicalURL(c.projectEvidence))) reasons.push('UNVERIFIED_PROJECT_GROUP');
  if (c.constructionStage !== undefined && (!['existing', 'under-construction', 'planned'].includes(c.constructionStage) || !canonicalURL(c.constructionEvidence))) reasons.push('UNVERIFIED_CONSTRUCTION_STAGE');
  if (reasons.length) return { reasons };
  const propertyKey = c.unitKey;
  const id = createHash('sha256').update([p.id, source, propertyKey, c.nature, c.priceDate].join('|')).digest('hex');
  return { reasons: [], observation: { kind: 'property', id, propertyKey, propertyType: c.propertyType, surface: c.surface, price: c.price, rooms: c.rooms, buildingYear: c.buildingYear, condition: c.condition, marketRegime: c.marketRegime, canton: c.canton, municipalityId: c.municipalityId, lat: c.lat, lon: c.lon, date: c.priceDate, nature: c.nature, source, publisher: p.publisher, commercialReuse: true, licence: p.licence, surfaceBasis: c.surfaceBasis, surfaceEvidence: c.surfaceEvidence, priceEvidence: c.priceEvidence, priceDateBasis: c.priceDateBasis, locationEvidence: c.locationEvidence, locationPrecision: c.locationPrecision, listingStatus: c.listingStatus, unitIdentity: c.unitIdentity || 'unit', rightsEvidence: p.rightsEvidence, sourcePermissionGranted: p.sourcePermissionGranted, reuseBasis: p.reuseBasis, sourcePolicyId: p.id, projectKey: c.projectKey, projectEvidence: c.projectEvidence, constructionStage: c.constructionStage, constructionEvidence: c.constructionEvidence } };
}
export function preparePropertyImport(candidates, policies, now = new Date()) {
  if (!Array.isArray(candidates) || candidates.length > 500) throw new Error('Import limité à 500 observations.');
  const accepted = [], rejected = [], seen = new Set();
  candidates.forEach((c, index) => {
    const result = qualifyPropertyCandidate(c, policies, now);
    if (result.observation && seen.has(result.observation.id)) result.reasons.push('DUPLICATE_OBSERVATION');
    if (result.reasons.length) rejected.push({ index, source: canonicalURL(c?.source), reasons: result.reasons });
    else { seen.add(result.observation.id); accepted.push(result.observation); }
  });
  return { accepted, rejected };
}
