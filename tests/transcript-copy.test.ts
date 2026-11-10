import {afterEach,expect,it,vi} from 'vitest';
import {copyTranscriptFromClick,formatTranscript,watchVideoId,type TranscriptSnapshot} from '../lib/transcript-copy';
import {readWatchTranscript,scrapeWatchTranscript,scrapeActiveWatchTranscript} from '../extension/watch-transcript';
const id='abcdefghijk',other='123456789ab',url=`https://www.youtube.com/watch?v=${id}`;
const snapshot:TranscriptSnapshot={videoId:id,title:'A public video',language:'en',kind:'authored',source:'caption-track',lines:[{startMs:0,text:'Hello, world.'},{startMs:12340,text:'Keep the words & punctuation.'}]};
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it('copies readable timestamps, hour marks, unicode and repeated spoken words without AI rewriting',()=>{
  const value=formatTranscript({...snapshot,lines:[{startMs:3723000,text:'One hour later.'},{startMs:12340,text:'Again.'},{startMs:0,text:'Merhaba, dünya! & <hello>'},{startMs:12340,text:'Again.'},{startMs:14000,text:'Again.'}]},id);
  expect(value.text).toBe('[00:00] Merhaba, dünya! & <hello>\n[00:12] Again.\n[00:14] Again.\n[01:02:03] One hour later.');
  expect(value.cueCount).toBe(4);
});
it('rejects wrong-video, empty and unusable captions',()=>{
  expect(()=>formatTranscript(snapshot,other)).toThrow('video changed');
  expect(()=>formatTranscript({...snapshot,lines:[{startMs:NaN,text:'No fabricated timing'}]},id)).toThrow('No timestamped');
  expect(watchVideoId('https://studio.youtube.com/video/'+id+'/edit')).toBeNull();
  expect(watchVideoId('https://evil.example/watch?v='+id)).toBeNull();expect(watchVideoId(url)).toBe(id);
});
it('starts copying in the click gesture while the transcript promise is still pending',async()=>{
  let resolve!:(value:ReturnType<typeof formatTranscript>)=>void;
  const data=new Promise<ReturnType<typeof formatTranscript>>(r=>{resolve=r;});
  class Item {constructor(public data:Record<string,Promise<Blob>>) {}}
  const write=vi.fn(async(items:Item[])=>{expect(await (await items[0].data['text/plain']).text()).toBe(formatTranscript(snapshot,id).text);});
  vi.stubGlobal('ClipboardItem',Item);vi.stubGlobal('navigator',{clipboard:{write}});
  const pending=copyTranscriptFromClick(()=>data);
  expect(write).toHaveBeenCalledTimes(1);
  resolve(formatTranscript(snapshot,id));await expect(pending).resolves.toMatchObject({videoId:id});
});
it('retains text when clipboard access is denied and propagates retrieval errors without blank copying',async()=>{
  class Item {constructor(public data:Record<string,Promise<Blob>>) {void data['text/plain'].catch(()=>{});}}
  vi.stubGlobal('ClipboardItem',Item);vi.stubGlobal('navigator',{clipboard:{write:vi.fn(async()=>{throw new Error('denied');})}});
  const ready=vi.fn();await expect(copyTranscriptFromClick(async()=>formatTranscript(snapshot,id),ready)).rejects.toThrow('transcript is ready');expect(ready).toHaveBeenCalledTimes(1);
  await expect(copyTranscriptFromClick(async()=>{throw new Error('No captions');})).rejects.toThrow('No captions');
});
function page(tracks:unknown[]=[],rows:{time:string;text:string}[]=[]) {
  vi.stubGlobal('location',new URL(url));
  vi.stubGlobal('window',{ytInitialPlayerResponse:{videoDetails:{videoId:id,title:'A video'},captions:{playerCaptionsTracklistRenderer:{captionTracks:tracks}}}});
  vi.stubGlobal('document',{title:'A video - YouTube',body:{},getElementById:()=>null,querySelector:(selector:string)=>selector==='ytd-transcript-footer-renderer'?{textContent:'English (auto-generated)'}:null,querySelectorAll:(selector:string)=>selector.includes('transcript-segment')?rows.map(row=>({querySelector:(q:string)=>({textContent:q.includes('Timestamp')?row.time:row.text})})):[]});
}
const track=(languageCode:string,kind?:string)=>({languageCode,kind,baseUrl:`https://www.youtube.com/api/timedtext?lang=${languageCode}${kind?'&kind='+kind:''}`});
it('prefers authored English, fetches only the track already exposed by this video and leaves words alone',async()=>{
  page([track('es'),track('en','asr'),track('en')]);
  const fetcher=vi.fn(async(_url:unknown)=>new Response(JSON.stringify({events:[{tStartMs:12340,segs:[{utf8:'Hello & '},{utf8:'world.'}]}]})));vi.stubGlobal('fetch',fetcher);
  const value=await readWatchTranscript(id);
  expect(value.snapshot).toMatchObject({videoId:id,language:'en',kind:'authored',lines:[{startMs:12340,text:'Hello & world.'}]});
  const called=String(fetcher.mock.calls[0][0]);expect(called).toContain('fmt=json3');expect(called).not.toContain('kind=asr');
});
it('supports non-English captions and does not request automatic translation',async()=>{
  page([track('tr','asr')]);vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({events:[{tStartMs:0,segs:[{utf8:'Merhaba!'}]}]}))));
  expect((await readWatchTranscript(id)).snapshot).toMatchObject({language:'tr',kind:'automatic'});
});
it('falls back to the displayed transcript when direct caption requests are blocked',async()=>{
  page([track('en')],[{time:'1:02',text:'Native transcript text.'}]);vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:403})));
  expect((await readWatchTranscript(id)).snapshot).toMatchObject({source:'transcript-panel',kind:'as-shown',lines:[{startMs:62000,text:'Native transcript text.'}]});
});
it('rejects stale player data and never uses an arbitrary caption host',async()=>{
  page([{...track('en'),baseUrl:'https://evil.example/api/timedtext'}],[{time:'0:01',text:'Native text.'}]);const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  expect((await readWatchTranscript(id)).snapshot?.source).toBe('transcript-panel');expect(fetcher).not.toHaveBeenCalled();
  vi.stubGlobal('window',{ytInitialPlayerResponse:{videoDetails:{videoId:other}}});expect((await readWatchTranscript(id)).error).toContain('loading');
});
it('gives a bounded useful failure when YouTube supplies no transcript',async()=>{
  vi.useFakeTimers();page();
  const result=readWatchTranscript(id);await vi.advanceTimersByTimeAsync(7100);
  expect((await result).error).toContain('YouTube did not provide a transcript');
});
function chromeTab(after=url) {
  let reads=0;const get=vi.fn(async(_id:number)=>({id:8,url:++reads>1?after:url}));
  const executeScript=vi.fn(async(_options:unknown)=>[{result:{snapshot}}]);
  vi.stubGlobal('chrome',{tabs:{get,query:vi.fn(async()=>[{id:8,url}])},scripting:{executeScript}});
  return {get,executeScript};
}
it('binds the copy to the tab and video and refuses navigation during retrieval',async()=>{
  chromeTab();await expect(scrapeActiveWatchTranscript()).resolves.toMatchObject({text:formatTranscript(snapshot,id).text});
  chromeTab(`https://www.youtube.com/watch?v=${other}`);await expect(scrapeWatchTranscript(8,id)).rejects.toThrow('video changed');
});
it('copies from an existing watch page without opening tabs or making extension-side network requests',async()=>{
  const mocks=chromeTab();const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  await scrapeActiveWatchTranscript(id,8);expect(mocks.executeScript).toHaveBeenCalledTimes(1);expect(fetcher).not.toHaveBeenCalled();expect('create' in chrome.tabs).toBe(false);
});
it('collects recycled transcript rows even if the native panel starts at the bottom, then restores its scroll',async()=>{
  vi.useFakeTimers();page();let position=300;
  const scroller={clientHeight:100,scrollHeight:400,get scrollTop(){return position;},set scrollTop(value:number){position=Math.max(0,Math.min(300,value));},parentElement:null};
  const body={};
  const row=()=>({parentElement:scroller,querySelector:(selector:string)=>({textContent:selector.includes('Timestamp')?`0:0${Math.floor(position/100)}`:`Part ${Math.floor(position/100)}`})});
  vi.stubGlobal('getComputedStyle',()=>({overflowY:'auto'}));
  vi.stubGlobal('document',{body,title:'A video',getElementById:()=>null,querySelector:(selector:string)=>selector.includes('transcript-segment')?row():null,querySelectorAll:(selector:string)=>selector.includes('transcript-segment')?[row()]:[]});
  const pending=readWatchTranscript(id);await vi.advanceTimersByTimeAsync(2000);
  const result=await pending;expect(result.error).toBeUndefined();
  expect(formatTranscript(result.snapshot!,id).text).toBe('[00:00] Part 0\n[00:01] Part 1\n[00:02] Part 2\n[00:03] Part 3');
  expect(position).toBe(300);
});
