import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const scrape=vi.hoisted(()=>vi.fn(async()=>({videoId:'abcdefghijk',text:'[00:00] Hello.'})));
vi.mock('../extension/watch-transcript',()=>({scrapeActiveWatchTranscript:scrape}));
let handler:(message:any,sender:any,reply:(value:any)=>void)=>boolean;
beforeEach(async()=>{vi.resetModules();scrape.mockClear();vi.stubGlobal('chrome',{runtime:{id:'standalone',onMessage:{addListener:(fn:typeof handler)=>{handler=fn;}}}});await import('../extension/background');});
afterEach(()=>vi.unstubAllGlobals());
const send=(message:any,sender:any)=>new Promise<any>(resolve=>handler(message,sender,resolve));
it('binds requests to the YouTube sender and forwards explicit approval only',async()=>{
 const sender={id:'standalone',tab:{id:8,url:'https://www.youtube.com/shorts/abcdefghijk'}};
 await send({type:'TRANSCRIPT_COPY',videoId:'abcdefghijk'},sender);expect(scrape).toHaveBeenLastCalledWith('abcdefghijk',8,false);
 await send({type:'TRANSCRIPT_COPY',videoId:'abcdefghijk',approvedTemporary:true},sender);expect(scrape).toHaveBeenLastCalledWith('abcdefghijk',8,true);
});
it('rejects other origins, extensions and malformed video identifiers',async()=>{
 for(const sender of [{id:'other',tab:{id:8,url:'https://www.youtube.com/watch?v=abcdefghijk'}},{id:'standalone',tab:{id:8,url:'https://example.com/'}}])expect((await send({type:'TRANSCRIPT_COPY'},sender)).error).toBeTruthy();
 expect((await send({type:'TRANSCRIPT_COPY',videoId:'not a video'},{id:'standalone'})).error).toBeTruthy();expect(scrape).not.toHaveBeenCalled();
});
it('ignores every unrelated message type',()=>{
 for(const type of ['DELETE_VIDEO','UPLOAD_MEDIA','UNSUPPORTED_OPERATION'])expect(handler({type},{id:'standalone'},vi.fn())).toBe(false);
 expect(scrape).not.toHaveBeenCalled();
});
