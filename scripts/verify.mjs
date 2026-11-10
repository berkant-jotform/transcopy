import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {crc32} from './zip.mjs';
for(const browser of ['chromium','firefox']){
 const dir=`dist/${browser}`,receipt=JSON.parse(await readFile(`dist/${browser}-receipt.json`,'utf8')),manifest=JSON.parse(await readFile(dir+'/manifest.json','utf8'));
 assert.deepEqual(manifest.permissions,['scripting']);assert.deepEqual(manifest.host_permissions,['https://www.youtube.com/*']);
 assert.equal('key' in manifest,false);assert.equal('externally_connectable' in manifest,false);assert.equal(manifest.version,JSON.parse(await readFile('package.json','utf8')).version);
 for(const file of receipt.files){const bytes=await readFile(dir+'/'+file.path);assert.equal(bytes.length,file.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);}
 const zip=await readFile('dist/'+receipt.archive.path);assert.equal(createHash('sha256').update(zip).digest('hex'),receipt.archive.sha256);
 let pos=0,count=0;while(zip.readUInt32LE(pos)===0x04034b50){
  const compressed=zip.readUInt32LE(pos+18),size=zip.readUInt32LE(pos+22),length=zip.readUInt16LE(pos+26),extra=zip.readUInt16LE(pos+28),name=zip.subarray(pos+30,pos+30+length).toString();
  assert(!name.includes('..')&&!name.startsWith('/'));const start=pos+30+length+extra,bytes=inflateRawSync(zip.subarray(start,start+compressed));assert.equal(bytes.length,size);assert.equal(crc32(bytes),zip.readUInt32LE(pos+14));assert.deepEqual(bytes,await readFile(dir+'/'+name));pos=start+compressed;count++;
 }
 assert.equal(count,receipt.files.length);
 const code=(await readFile(dir+'/background.js','utf8'))+(await readFile(dir+'/transcript-button.js','utf8'));
 for(const forbidden of ['127.0.0.1','nativeMessaging','sk-proj-','studio.youtube.com'])assert(!code.includes(forbidden),forbidden);
 console.log(`${browser}: receipt, ZIP, minimal permissions and isolation verified`);
}
