import {afterEach,expect,it,vi} from 'vitest';
import {transcriptClipboardText,copyTranscriptFromClick,formatTranscript,watchVideoId} from '../lib/transcript-copy';
import {readWatchTranscript} from '../extension/watch-transcript';
const id='abcdefghijk',other='123456789ab';
const value=formatTranscript({videoId:id,title:'A title\nwith spacing',language:'en',kind:'authored',source:'caption-track',lines:[{startMs:0,text:'Hello.'}]},id);
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();vi.resetModules();});
it('keeps plain copying unchanged and adds title plus canonical link only on request',()=>{
 expect(transcriptClipboardText(value)).toBe('[00:00] Hello.');
 expect(transcriptClipboardText(value,true)).toBe(`A title with spacing\nhttps://www.youtube.com/watch?v=${id}\n\n[00:00] Hello.`);
 expect(watchVideoId(`https://www.youtube.com/shorts/${id}?feature=share`)).toBe(id);
});
it('writes the source header through the clipboard path without modifying cached transcript text',async()=>{
 vi.stubGlobal('ClipboardItem',undefined);const writeText=vi.fn(async()=>{});vi.stubGlobal('navigator',{clipboard:{writeText}});
 await copyTranscriptFromClick(async()=>value,undefined,true);
 expect(writeText).toHaveBeenCalledWith(transcriptClipboardText(value,true));expect(value.text).toBe('[00:00] Hello.');
});
function short(playerId=id){
 vi.stubGlobal('location',new URL(`https://www.youtube.com/shorts/${id}`));
 const player={getPlayerResponse:()=>({videoDetails:{videoId:playerId,title:'Short title'},captions:{playerCaptionsTracklistRenderer:{captionTracks:[{languageCode:'en',baseUrl:`https://www.youtube.com/api/timedtext?v=${playerId}&lang=en`}]}}})};
 vi.stubGlobal('window',{ytInitialPlayerResponse:{videoDetails:{videoId:other}}});
 vi.stubGlobal('document',{getElementById:(key:string)=>key==='shorts-player'?player:null,querySelectorAll:()=>[],title:'Short'});
 return vi.fn(async()=>new Response(JSON.stringify({events:[{tStartMs:0,segs:[{utf8:'Short words.'}]}]})));
}
it('reads the matching Shorts player instead of stale metadata from a neighboring video',async()=>{
 const fetcher=short();vi.stubGlobal('fetch',fetcher);
 expect((await readWatchTranscript(id)).snapshot).toMatchObject({videoId:id,title:'Short title',lines:[{text:'Short words.',startMs:0}]});
});
it('refuses neighboring Short captions and stops when the user swipes during retrieval',async()=>{
 let fetcher=short(other);vi.stubGlobal('fetch',fetcher);expect((await readWatchTranscript(id)).error).toContain('loading');expect(fetcher).not.toHaveBeenCalled();
 short();vi.stubGlobal('fetch',async()=>{vi.stubGlobal('location',new URL(`https://www.youtube.com/shorts/${other}`));return new Response(JSON.stringify({events:[{tStartMs:0,segs:[{utf8:'Old words'}]}]}));});
 expect((await readWatchTranscript(id)).error).toContain('changed');
});
it('gives a clear Shorts fallback without opening unrelated transcript panels',async()=>{
 short();vi.stubGlobal('fetch',async()=>new Response('',{status:403}));expect((await readWatchTranscript(id)).recovery).toBe('temporary-watch');
});
// Minimal DOM exercises mounting, split click routing and Shorts navigation without a live browser.
class Node {
 children:Node[]=[];attrs:Record<string,string>={};dataset:Record<string,string>={};events:Record<string,(event:any)=>void>={};parentElement:Node|null=null;isConnected=true;textContent='';disabled=false;title='';type='';className='';id='';shadow:Node|null=null;
 getBoundingClientRect(){return {width:48,height:360,top:100,bottom:460};}
 prepend(node:Node){node.parentElement=this;this.children.unshift(node);}
 append(...nodes:Node[]){for(const node of nodes){node.parentElement=this;this.children.push(node);}}
 attachShadow(){return this.shadow=new Node();}setAttribute(key:string,value:string){this.attrs[key]=value;}
 addEventListener(key:string,value:(event:any)=>void){this.events[key]=value;}remove(){this.isConnected=false;}
 querySelector(){return null;}
}
it('mounts two independent compact controls beside the square icon beneath Remix and routes icon vs text correctly',async()=>{
 const rail=new Node(),reel={querySelector:()=>rail};let mutation!:(...args:any[])=>void;
 const doc={querySelectorAll:(q:string)=>q.includes('pivot-button-view-model')?[rail]:[],querySelector:()=>null,createElement:()=>new Node(),createElementNS:()=>new Node(),addEventListener:vi.fn(),documentElement:new Node()};
 vi.stubGlobal('window',{innerHeight:900,addEventListener:vi.fn()});vi.stubGlobal('document',doc);vi.stubGlobal('location',new URL(`https://www.youtube.com/shorts/${id}`));
 vi.stubGlobal('MutationObserver',class{constructor(fn:typeof mutation){mutation=fn;}observe(){}});
 const writeText=vi.fn(async()=>{});vi.stubGlobal('ClipboardItem',undefined);vi.stubGlobal('navigator',{clipboard:{writeText}});
 const sendMessage=vi.fn(async()=>({data:value}));vi.stubGlobal('chrome',{runtime:{sendMessage}});
 const {transcriptButtonTarget}=await import('../extension/transcript-button');
 // This exact observed layout has no active reel marker; its visible pivot icon is extracted.
 const extracted={querySelectorAll:()=>[rail],querySelector:()=>null} as unknown as Document;
 expect(transcriptButtonTarget(extracted,true)).toBe(rail);
 const hidden={getBoundingClientRect:()=>({width:0,height:0,top:0,bottom:0})};
 expect(transcriptButtonTarget({querySelectorAll:()=>[hidden,rail],querySelector:()=>null} as unknown as Document,true)).toBe(rail);
 expect(transcriptButtonTarget({querySelectorAll:()=>[rail,new Node()],querySelector:()=>null} as unknown as Document,true)).toBeNull();
 expect(transcriptButtonTarget({querySelectorAll:()=>[hidden],querySelector:()=>null} as unknown as Document,true)).toBeNull();
 const host=rail.children[0];expect(host.dataset.shorts).toBe('true');const group=host.shadow!.children[1],icon=group.children[0],text=group.children[1];
 icon.events.click({stopPropagation(){}});await vi.waitFor(()=>expect(text.disabled).toBe(false));expect(writeText).toHaveBeenLastCalledWith(transcriptClipboardText(value,true));
 text.events.click({stopPropagation(){}});await vi.waitFor(()=>expect(text.disabled).toBe(false));expect(writeText).toHaveBeenLastCalledWith(value.text);
 expect(sendMessage).toHaveBeenCalledWith({type:'TRANSCRIPT_COPY',videoId:id});
 vi.useFakeTimers();vi.stubGlobal('location',new URL(`https://www.youtube.com/shorts/${other}`));mutation();await vi.advanceTimersByTimeAsync(250);
 expect(host.isConnected).toBe(false);expect(rail.children).toHaveLength(2);expect(rail.children[1]).not.toBe(host);
});
