import {deflateRawSync} from 'node:zlib';
export function crc32(bytes){let crc=0xffffffff;for(const value of bytes){crc^=value;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
export function makeZip(files){
 let offset=0;const chunks=[],directory=[];
 for(const [path,bytes] of files){
  if(!/^[a-zA-Z0-9_./-]+$/.test(path)||path.startsWith('/')||path.split('/').includes('..'))throw new Error('Unsafe archive path');
  const name=Buffer.from(path),data=deflateRawSync(bytes),crc=crc32(bytes),header=Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(8,8);header.writeUInt16LE(33,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(data.length,18);header.writeUInt32LE(bytes.length,22);header.writeUInt16LE(name.length,26);
  const entry=Buffer.alloc(46);entry.writeUInt32LE(0x02014b50);entry.writeUInt16LE(20,4);header.copy(entry,6,4,30);entry.writeUInt32LE(offset,42);
  chunks.push(header,name,data);directory.push(entry,name);offset+=header.length+name.length+data.length;
 }
 const central=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...chunks,central,end]);
}
