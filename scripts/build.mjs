import {build} from 'esbuild';
import {mkdir,readFile,writeFile,readdir,rm,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {makeZip} from './zip.mjs';
const {version}=JSON.parse(await readFile('package.json','utf8'));
const sha=data=>createHash('sha256').update(data).digest('hex');
await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});
for(const browser of ['chromium','firefox']){
 const dir=`dist/${browser}`;await mkdir(dir+'/icons',{recursive:true});
 await build({entryPoints:{background:'extension/background.ts','transcript-button':'extension/transcript-button.ts'},outdir:dir,bundle:true,format:'iife',target:browser==='firefox'?'firefox140':'chrome120',platform:'browser',minify:true,legalComments:'none'});
 const manifest={manifest_version:3,name:'Transcopy',version,description:'Copy timestamped transcripts directly from YouTube videos and Shorts. No AI, accounts or backend.',permissions:['scripting'],host_permissions:['https://www.youtube.com/*'],icons:{16:'icons/icon-16.png',32:'icons/icon-32.png',48:'icons/icon-48.png',128:'icons/icon-128.png'},background:browser==='firefox'?{scripts:['background.js']}:{service_worker:'background.js'},content_scripts:[{matches:['https://www.youtube.com/*'],js:['transcript-button.js'],run_at:'document_idle'}],content_security_policy:{extension_pages:"script-src 'self'; object-src 'none'; connect-src 'none'"},...(browser==='firefox'?{browser_specific_settings:{gecko:{id:'transcopy@berkant-jotform.github.io',strict_min_version:'140.0',data_collection_permissions:{required:['none']}}}}:{minimum_chrome_version:'120'})};
 await writeFile(dir+'/manifest.json',JSON.stringify(manifest,null,2)+'\n');
 await copyFile('LICENSE',dir+'/LICENSE');
 await writeFile(dir+'/INSTALL.md',`# Transcopy ${version}\n\n${browser==='firefox'?'Temporary developer installation: open about:debugging#/runtime/this-firefox, choose Load Temporary Add-on, and select manifest.json. Permanent installation requires Mozilla signing.':'Extract this ZIP into a permanent folder. Open your browser Extensions page, enable Developer mode, choose Load unpacked, and select this folder.'}\n\nRefresh YouTube. Click Copy transcript for timestamped words; click its icon to include the title and link. No app or server is needed.\n\nHelp: https://github.com/berkant-jotform/transcopy\n`);
 for(const size of [16,32,48,128])await copyFile(`assets/icon-${size}.png`,`${dir}/icons/icon-${size}.png`);
 const files=[];for(const name of ['background.js','transcript-button.js','manifest.json','LICENSE','INSTALL.md',...[16,32,48,128].map(size=>`icons/icon-${size}.png`)])files.push([name,await readFile(dir+'/'+name)]);
 const archive=`dist/transcopy-${browser}-${version}.zip`;await writeFile(archive,makeZip(files));
 await writeFile(`dist/${browser}-receipt.json`,JSON.stringify({version,browser,files:files.map(([path,bytes])=>({path,bytes:bytes.length,sha256:sha(bytes)})),archive:{path:archive.split('/').at(-1),sha256:sha(await readFile(archive))}},null,2)+'\n');
 console.log(`${browser}: ${files.length} files, ${(await readFile(archive)).length} bytes`);
}
