import fs from 'node:fs';
const p='.private/free-market/refresh-latest.json';
const text=fs.existsSync(p)?JSON.stringify((({checkedAt,counts,priceChanges})=>({checkedAt,counts,priceChanges}))(JSON.parse(fs.readFileSync(p,'utf8')))):'No refresh report produced.';
if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,text+'\n');
console.log(text);
const discovery='.private/free-market/discovery-summary.json';
if(fs.existsSync(discovery)){const {sources,newReviewCandidates,failures,valuationImports}=JSON.parse(fs.readFileSync(discovery,'utf8'));const counts=JSON.stringify({discovery:{sources,newReviewCandidates,failures,valuationImports}});if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,counts+'\n');console.log(counts);}
