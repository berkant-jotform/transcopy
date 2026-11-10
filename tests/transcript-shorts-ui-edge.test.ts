import {afterEach,expect,it,vi} from 'vitest';
const id='abcdefghijk',other='123456789ab',url=`https://www.youtube.com/shorts/${id}`;
const data={videoId:id,title:'A Short',text:'[00:00] Hello.',cueCount:1};
class Node {
 children:Node[]=[];attrs:Record<string,string>={};dataset:Record<string,string>={};events:Record<string,(event:any)=>void>={};parentElement:Node|null=null;style={setProperty:vi.fn()};focus=vi.fn();dispatchEvent(event:Event){this.events[event.type]?.(event);}isConnected=true;disabled=false;title='';type='';className='';id='';shadow:Node|null=null;private text='';
 get textContent(){return this.text;}set textContent(value:string){this.text=value;this.children=[];}
 getBoundingClientRect(){return {width:40,height:48,left:740,right:780,top:100,bottom:148};}
 append(...nodes:Node[]){for(const node of nodes){node.parentElement=this;this.children.push(node);}}
 attachShadow(){return this.shadow=new Node();}setAttribute(key:string,value:string){this.attrs[key]=value;}
 addEventListener(key:string,value:(event:any)=>void){this.events[key]=value;}remove(){this.isConnected=false;}
}
async function setup(){
 vi.useFakeTimers();vi.resetModules();let visible=true,mutation!:(records?:unknown[])=>void;
 const rail=new Node();const doc={querySelectorAll:()=>visible?[rail]:[],querySelector:()=>null,createElement:()=>new Node(),createElementNS:()=>new Node(),addEventListener:vi.fn(),documentElement:new Node()};
 vi.stubGlobal('window',{innerHeight:900,innerWidth:900,addEventListener:vi.fn()});vi.stubGlobal('document',doc);vi.stubGlobal('location',new URL(url));
 vi.stubGlobal('MutationObserver',class{constructor(fn:typeof mutation){mutation=fn;}observe(){}});
 vi.stubGlobal('ClipboardItem',undefined);const writeText=vi.fn(async()=>{});vi.stubGlobal('navigator',{clipboard:{writeText}});
 const send=vi.fn(async():Promise<any>=>({data}));vi.stubGlobal('chrome',{runtime:{sendMessage:send}});
 await import('../extension/transcript-button');
 const controls=()=>{const host=rail.children.at(-1)!,group=host.shadow!.children[1];return {host,group,icon:group.children[0],text:group.children[1],notice:host.shadow!.children[2]};};
 return {send,writeText,controls,visibility:(value:boolean)=>{visible=value;mutation([{type:'attributes'}]);}};
}
const click=(node:Node)=>node.events.click({stopPropagation(){}});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
it('keeps a new reading status intact when an earlier success timer would expire',async()=>{
 const env=await setup();let finish!:(v:any)=>void;env.send.mockResolvedValueOnce({data}).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const {text,group}=env.controls();click(text);await vi.advanceTimersByTimeAsync(0);expect(text.textContent).toBe('Copied!');
 await vi.advanceTimersByTimeAsync(3000);click(text);await vi.advanceTimersByTimeAsync(1100);
 expect(text.textContent).toBe('Reading…');expect(text.disabled).toBe(true);expect(group.dataset.copyState).toBeUndefined();
 finish({data});await vi.advanceTimersByTimeAsync(0);expect(text.textContent).toBe('Copied!');
});
it('deduplicates rapid clicks and reuses retrieved text after clipboard denial',async()=>{
 const env=await setup();env.writeText.mockRejectedValueOnce(new Error('denied'));const {text}=env.controls();
 click(text);click(text);await vi.advanceTimersByTimeAsync(0);expect(env.send).toHaveBeenCalledTimes(1);expect(text.textContent).toBe('Copy again');
 click(text);await vi.advanceTimersByTimeAsync(0);expect(env.send).toHaveBeenCalledTimes(1);expect(text.textContent).toBe('Copied!');
});
it('does not reuse a background-tab approval prompt after the user swipes to another Short',async()=>{
 const env=await setup();env.send.mockResolvedValue({error:'Allow background recovery',transcriptRecovery:'temporary-watch'});
 click(env.controls().text);await vi.advanceTimersByTimeAsync(0);const approve=env.controls().notice.children[0];expect(approve.textContent).toBe('Open temporary tab & copy');
 vi.stubGlobal('location',new URL(`https://www.youtube.com/shorts/${other}`));click(approve);await vi.advanceTimersByTimeAsync(300);
 expect(env.send).toHaveBeenCalledTimes(1);
});
it('ignores old asynchronous completions after the control is hidden and remounted',async()=>{
 const env=await setup();let finish!:(v:any)=>void;env.send.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const old=env.controls();click(old.text);env.visibility(false);await vi.advanceTimersByTimeAsync(300);expect(old.host.isConnected).toBe(false);
 env.visibility(true);await vi.advanceTimersByTimeAsync(300);const fresh=env.controls();expect(fresh.text.textContent).toBe('Copy transcript');
 finish({data});await vi.advanceTimersByTimeAsync(0);expect(fresh.text.textContent).toBe('Copy transcript');expect(fresh.text.disabled).toBe(false);
});
it('preserves icon copy formatting through explicit recovery approval',async()=>{
 const env=await setup();env.send.mockResolvedValueOnce({error:'Allow recovery',transcriptRecovery:'temporary-watch'}).mockResolvedValueOnce({data});
 click(env.controls().icon);await vi.advanceTimersByTimeAsync(0);click(env.controls().notice.children[0]);await vi.advanceTimersByTimeAsync(0);
 expect(env.send).toHaveBeenLastCalledWith({type:'TRANSCRIPT_COPY',videoId:id,approvedTemporary:true});
 expect(env.writeText).toHaveBeenLastCalledWith(`A Short\nhttps://www.youtube.com/watch?v=${id}\n\n[00:00] Hello.`);
});

it('makes errors dismissible without losing the saved clipboard retry',async()=>{
 const env=await setup();env.writeText.mockRejectedValueOnce(new Error('denied'));
 click(env.controls().text);await vi.advanceTimersByTimeAsync(0);
 const {notice,group,text}=env.controls();expect(group.dataset.copyState).toBe('error');
 const close=notice.children.find(node=>node.className==='dismiss')!;expect(close.attrs['aria-label']).toBe('Dismiss message');
 click(close);expect(notice.textContent).toBe('');expect(text.textContent).toBe('Copy transcript');expect(text.focus).toHaveBeenCalled();
 click(text);await vi.advanceTimersByTimeAsync(0);expect(env.send).toHaveBeenCalledTimes(1);expect(text.textContent).toBe('Copied!');
});
it('shows a copying stage while the clipboard is still writing',async()=>{
 const env=await setup();let finish!:()=>void;env.writeText.mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve;}));
 click(env.controls().text);await vi.advanceTimersByTimeAsync(0);
 expect(env.controls().text.textContent).toBe('Copying…');expect(env.controls().text.disabled).toBe(true);
 finish();await vi.advanceTimersByTimeAsync(0);expect(env.controls().notice.textContent).toBe('1 timestamped line copied.');
});
it('keeps Shorts feedback within the viewport and refits without invalidating a request',async()=>{
 const env=await setup();const {host}=env.controls();expect(host.style.setProperty).toHaveBeenCalledWith('--control-left','-8px');
 expect(env.controls().notice.style.setProperty).toHaveBeenCalledWith('--notice-left','-102px');
 let finish!:(v:any)=>void;env.send.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 click(env.controls().text);env.visibility(true);await vi.advanceTimersByTimeAsync(300);
 expect(env.controls().host).toBe(host);finish({data});await vi.advanceTimersByTimeAsync(0);expect(env.controls().text.textContent).toBe('Copied!');
});
it('Escape dismisses completed messages but does not hide an ongoing copy',async()=>{
 const env=await setup();const {host,text,notice}=env.controls();const event={key:'Escape',stopPropagation:vi.fn()};
 click(text);host.shadow!.events.keydown(event);expect(text.textContent).toBe('Reading…');
 await vi.advanceTimersByTimeAsync(0);host.shadow!.events.keydown(event);expect(notice.textContent).toBe('');expect(text.textContent).toBe('Copy transcript');
});
