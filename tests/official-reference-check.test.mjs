import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateOfficialReference,compareOfficialReference} from '../scripts/official-reference-check.mjs';
const bytes=Buffer.concat([Buffer.from('PK'),Buffer.alloc(110)]);
const source={url:'https://statistique.ge.ch/statistique/tel/domaines/05/05_05/T_05_05_1_4_03.xlsx',sha256:createHash('sha256').update(bytes).digest('hex')};
test('only the bounded primary official workbook paths are allowed',()=>{
 assert.doesNotThrow(()=>validateOfficialReference(source));
 assert.doesNotThrow(()=>validateOfficialReference({...source,url:source.url.replace('/statistique/tel/','/tel/')}));
 for(const url of ['http://statistique.ge.ch/test.xlsx','https://evil.example/test.xlsx',source.url+'?token=private','https://statistique.ge.ch@evil.example/test.xlsx','https://statistique.ge.ch:8443/test.xlsx'])assert.throws(()=>validateOfficialReference({...source,url}));
});
test('unchanged and revised binary sources remain separate states',()=>{
 assert.equal(compareOfficialReference(bytes,source),'unchanged');
 assert.equal(compareOfficialReference(Buffer.concat([bytes,Buffer.from('revision')]),source),'changed');
});
test('an error page or oversized response cannot confirm an official source',()=>{
 for(const body of [Buffer.from('<html>Error</html>'),Buffer.alloc(2000001),Buffer.from('PK')])assert.throws(()=>compareOfficialReference(body,source));
});
