import {afterEach,expect,it,vi} from 'vitest';
import {scrapeActiveWatchTranscript,closeTemporaryTranscriptTab} from '../extension/watch-transcript';
const id='abcdefghijk',other='123456789ab';
const short=`https://www.youtube.com/shorts/${id}`,watch=`https://www.youtube.com/watch?v=${id}`;
const snapshot={videoId:id,title:'A Short',language:'en',kind:'authored',source:'transcript-panel',lines:[{startMs:0,text:'Short transcript.'}]};
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
function setup(options:{existing?:boolean;failure?:boolean;navigate?:boolean;load?:boolean;temporaryNavigation?:boolean}={}){
 let scriptReads=0,sourceChanged=false;
 const get=vi.fn(async(tabId:number)=>({id:tabId,url:tabId===8?(sourceChanged?`https://www.youtube.com/shorts/${other}`:short):tabId===10&&options.temporaryNavigation?`https://www.youtube.com/watch?v=${other}`:watch,status:tabId===10&&options.load===false?'loading':'complete'}));
 const query=vi.fn(async()=>options.existing?[{id:9,url:watch}]:[]);
 const create=vi.fn(async()=>({id:10,url:watch,status:'complete'})),remove=vi.fn(async()=>{}),update=vi.fn(async()=>({id:10}));
 const executeScript=vi.fn(async(opts:{target:{tabId:number}})=>{
  scriptReads++;
  if(opts.target.tabId===8)return [{result:{error:'Shorts needs recovery',recovery:'temporary-watch'}}];
  if(options.navigate)sourceChanged=true;
  return [{result:options.failure?{error:'No captions available'}:{snapshot}}];
 });
 vi.stubGlobal('chrome',{tabs:{get,query,create,remove,update},scripting:{executeScript}});
 return {get,query,create,remove,update,executeScript};
}
it('reads a matching existing watch tab automatically, leaving both tabs in place',async()=>{
 const mocks=setup({existing:true});await expect(scrapeActiveWatchTranscript(id,8)).resolves.toMatchObject({text:'[00:00] Short transcript.'});
 expect(mocks.create).not.toHaveBeenCalled();expect(mocks.remove).not.toHaveBeenCalled();
 expect(mocks.executeScript.mock.calls.map(([arg])=>arg.target.tabId)).toEqual([8,9]);
});
it('requires explicit attempt approval when no existing watch tab supplies captions',async()=>{
 const mocks=setup();await expect(scrapeActiveWatchTranscript(id,8)).rejects.toMatchObject({transcriptRecovery:'temporary-watch'});
 expect(mocks.create).not.toHaveBeenCalled();expect(mocks.remove).not.toHaveBeenCalled();
});
it('opens only one approved inactive watch tab and closes only that tab after success',async()=>{
 const mocks=setup();await expect(scrapeActiveWatchTranscript(id,8,true)).resolves.toMatchObject({videoId:id});
 expect(mocks.create).toHaveBeenCalledExactlyOnceWith({url:watch+'&autoplay=0',active:false});
 expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(10);
 expect(mocks.update).toHaveBeenCalledExactlyOnceWith(10,{muted:true});
 expect(mocks.executeScript).toHaveBeenCalledTimes(1);
});
it('closes its temporary tab on caption failure, and refuses copying if the original Short changed',async()=>{
 let mocks=setup({failure:true});await expect(scrapeActiveWatchTranscript(id,8,true)).rejects.toThrow('No captions');expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(10);
 mocks=setup({navigate:true});await expect(scrapeActiveWatchTranscript(id,8,true)).rejects.toThrow('video changed');expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(10);
});
it('preserves a temporary tab that the user navigated elsewhere and does not read its new video',async()=>{
 const mocks=setup({temporaryNavigation:true});await expect(scrapeActiveWatchTranscript(id,8,true)).rejects.toThrow('navigated elsewhere');expect(mocks.remove).not.toHaveBeenCalled();expect(mocks.executeScript).not.toHaveBeenCalled();
});
it('bounds loading and releases the per-tab lock after timeout',async()=>{
 vi.useFakeTimers();const mocks=setup({load:false});
 const result=expect(scrapeActiveWatchTranscript(id,8,true)).rejects.toThrow('too long');
 await vi.advanceTimersByTimeAsync(12500);await result;expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(10);
 const retry=expect(scrapeActiveWatchTranscript(id,8)).rejects.toMatchObject({transcriptRecovery:'temporary-watch'});await vi.advanceTimersByTimeAsync(1);await retry;
});

it('retries one transient close failure, and closes tabs with a matching pending URL',async()=>{
 const mocks=setup();mocks.get.mockImplementation(async()=>({id:10,url:'',pendingUrl:watch,status:'loading'} as any));mocks.remove.mockRejectedValueOnce(new Error('Temporary failure'));
 await closeTemporaryTranscriptTab(10,id);expect(mocks.remove).toHaveBeenCalledTimes(2);
});
it('does not report success when closing fails, while accepting an already closed tab',async()=>{
 const mocks=setup();mocks.remove.mockRejectedValue(new Error('Denied'));
 await expect(closeTemporaryTranscriptTab(10,id)).rejects.toThrow('could not close');expect(mocks.remove).toHaveBeenCalledTimes(2);
 mocks.get.mockRejectedValue(new Error('No tab with id: 10.'));
 await expect(closeTemporaryTranscriptTab(10,id)).resolves.toBeUndefined();
});
it('preserves tabs when their pending navigation belongs to another video',async()=>{
 const mocks=setup();mocks.get.mockImplementation(async()=>({id:10,url:watch,pendingUrl:`https://www.youtube.com/watch?v=${other}`} as any));
 await closeTemporaryTranscriptTab(10,id);expect(mocks.remove).not.toHaveBeenCalled();
});

it('waits briefly for a loaded temporary page to bind its player, without opening another tab',async()=>{
 vi.useFakeTimers();const mocks=setup();mocks.executeScript.mockResolvedValueOnce([{result:{error:'Player loading',loading:true}}] as any);
 const result=scrapeActiveWatchTranscript(id,8,true);await vi.advanceTimersByTimeAsync(500);await expect(result).resolves.toMatchObject({videoId:id});
 expect(mocks.create).toHaveBeenCalledTimes(1);expect(mocks.executeScript).toHaveBeenCalledTimes(2);expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(10);
});
it('cleans up if the original Short tab closes during loading',async()=>{
 const mocks=setup();let reads=0;mocks.get.mockImplementation(async(tabId:number)=>{if(tabId===8&&++reads>4)throw new Error('No tab with id: 8.');return {id:tabId,url:tabId===8?short:watch,status:'complete'};});
 await expect(scrapeActiveWatchTranscript(id,8,true)).rejects.toThrow('No tab');expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(10);
});
it('accepts a completed close when Chrome loses both close replies',async()=>{
 const mocks=setup();let reads=0;mocks.get.mockImplementation(async()=>{if(++reads===3)throw new Error('No tab with id: 10.');return {id:10,url:watch,status:'complete'};});mocks.remove.mockRejectedValue(new Error('Reply lost'));
 await expect(closeTemporaryTranscriptTab(10,id)).resolves.toBeUndefined();expect(mocks.remove).toHaveBeenCalledTimes(2);
});
it('rejects duplicate recovery requests while one temporary transcript is being read',async()=>{
 vi.useFakeTimers();const mocks=setup();let finish!:(value:any)=>void;mocks.executeScript.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const first=scrapeActiveWatchTranscript(id,8,true);await vi.advanceTimersByTimeAsync(0);
 await expect(scrapeActiveWatchTranscript(id,8,true)).rejects.toThrow('already being copied');expect(mocks.create).toHaveBeenCalledTimes(1);
 finish([{result:{snapshot}}]);await first;expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(10);
});
it('creates the temporary tab in the source window even if another window becomes current',async()=>{
 const mocks=setup();mocks.get.mockImplementation(async(tabId:number)=>({id:tabId,url:tabId===8?short:watch,status:'complete',windowId:42}));
 await scrapeActiveWatchTranscript(id,8,true);expect(mocks.create).toHaveBeenCalledExactlyOnceWith({url:watch+'&autoplay=0',active:false,windowId:42});
});
