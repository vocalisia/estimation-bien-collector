import {createHash} from 'node:crypto';

// A changed workbook requires a new statistical review, never a silent overwrite.
export function validateOfficialReference(source) {
 const u=new URL(source.url);
 if(u.protocol!=='https:'||u.hostname!=='statistique.ge.ch'||u.port||u.username||u.password||u.search||u.hash||!/^\/(?:statistique\/)?tel\/domaines\/05\/05_05\/T_05_05_1_[34]_03\.xlsx$/.test(u.pathname)||!/^[a-f0-9]{64}$/.test(source.sha256))throw Error('UNAPPROVED_OFFICIAL_REFERENCE');
 return u;
}
export function compareOfficialReference(bytes,source) {
 validateOfficialReference(source);
 if(!Buffer.isBuffer(bytes)||bytes.length<100||bytes.length>2000000||bytes[0]!==0x50||bytes[1]!==0x4b)throw Error('INVALID_WORKBOOK');
 return createHash('sha256').update(bytes).digest('hex')===source.sha256?'unchanged':'changed';
}
