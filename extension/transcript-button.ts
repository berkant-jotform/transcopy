import {extensionApi} from '../lib/browser-api';
import {copyTranscriptFromClick,transcriptCopyError,watchVideoId,type CopiedTranscript} from '../lib/transcript-copy';

let host:HTMLElement|null=null,output:HTMLElement|null=null;
let currentId:string|null=null,cached:CopiedTranscript|null=null,inFlight=false,scheduled=false,epoch=0,lastUrl='';
let feedbackTimer:ReturnType<typeof setTimeout>|undefined;
function discardControl(){
  epoch++;cached=null;inFlight=false;
  if(feedbackTimer!==undefined){clearTimeout(feedbackTimer);feedbackTimer=undefined;}
  host?.remove();host=null;output=null;
}

export function transcriptButtonTarget(doc:Document,shorts:boolean):Element|null {
  if(!shorts)return doc.querySelector('ytd-watch-metadata #top-level-buttons-computed');
  // Current Shorts extracts its bottom square icon beneath Remix outside the reel and drops is-active.
  // Keep copying beside bottom square icon beneath Remix, away from the video and action rail.
  const visible=(element:Element)=>{const r=element.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.top<window.innerHeight;};
  const rails=[...doc.querySelectorAll('ytd-shorts pivot-button-view-model')].filter(visible);
  if(rails.length===1)return rails[0];
  if(rails.length>1)return null;
  return null;
}
function mount() {
  scheduled=false;lastUrl=location.href;
  const id=watchVideoId(location.href),shorts=location.pathname.startsWith('/shorts/');
  if(id!==currentId){discardControl();currentId=id;}
  if(!id||(!shorts&&location.pathname!=='/watch')){if(host)discardControl();return;}
  const target=transcriptButtonTarget(document,shorts);
  if(!target){if(host)discardControl();return;}
  if(host?.isConnected&&host.parentElement===target){host.dispatchEvent(new Event('transcopy-fit'));return;}
  // Shorts recycle their action rails. Invalidate an old mounted control before moving.
  if(host)discardControl();
  host=document.createElement('span');host.id='transcopy';host.dataset.build=extensionApi().runtime.getManifest?.()?.version||'unknown';
  const shadow=host.attachShadow({mode:'open'}),style=document.createElement('style');
  style.textContent=`
:host{display:inline-flex;position:relative;align-items:center;margin-left:8px;flex-shrink:0;font:500 14px Roboto,Arial,sans-serif;color-scheme:light dark}
:host([data-shorts]){margin:0;width:0;height:40px;flex:0 0 0;align-self:center;z-index:2100}
:host([data-shorts]) .split{position:absolute;left:var(--control-left,10px);top:0}
.split{display:inline-flex;align-items:stretch;border-radius:22px;border:1px solid #a99ade66;background:var(--yt-spec-badge-chip-background,#27252f);overflow:hidden;transition:border-color .16s,box-shadow .16s}
button{font:inherit;display:inline-flex;align-items:center;justify-content:center;white-space:nowrap;border:0;background:transparent;color:var(--yt-spec-text-primary,#eee);padding:0 11px;height:36px;cursor:pointer;touch-action:manipulation}
.with-source{width:34px;padding:0;border-right:1px solid #a99ade44;flex-shrink:0}.plain{padding-left:9px;min-width:112px;box-sizing:border-box;gap:6px}
button:hover{background:#8271bb26}button:focus-visible{outline:2px solid #a28be8;outline-offset:-3px}button:disabled{cursor:progress;opacity:.8}
svg{width:18px;height:18px;color:#a28be8}
.split[aria-busy=true] .plain:before{content:'';width:11px;height:11px;border:2px solid #a99ade55;border-top-color:#a28be8;border-radius:50%;animation:spin .8s linear infinite}
.split[data-copy-state=success]{border-color:#53b99b;box-shadow:0 0 0 2px #53b99b18}
.split[data-copy-state=error]{border-color:#c89b59}
output{position:absolute;top:calc(100% + 7px);left:var(--notice-left,auto);right:0;width:250px;max-width:calc(100vw - 40px);box-sizing:border-box;padding:12px 34px 12px 12px;border-radius:12px;background:var(--yt-spec-base-background,#22202e);color:var(--yt-spec-text-primary,#eee);border:1px solid #8e7dbc77;font:12px/1.5 Roboto,Arial,sans-serif;box-shadow:0 5px 20px #0003;z-index:2100;overflow-wrap:anywhere}
:host([data-shorts]) output{left:var(--notice-left,10px);right:auto;top:auto;bottom:calc(100% + 7px)}
output .recover{display:block;white-space:normal;height:auto;min-height:36px;margin-top:10px;padding:8px 10px;background:#8271bb26;border:1px solid #a99ade55;border-radius:8px;text-align:left;width:100%}
output .dismiss{position:absolute;right:4px;top:4px;width:26px;height:26px;padding:0;border-radius:50%;font-size:18px;line-height:1}
output:empty{display:none}
@keyframes spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.split{transition:none}.split[aria-busy=true] .plain:before{animation:none;border-color:#a28be8}}
`;

  if(shorts)host.dataset.shorts='true';
  const group=document.createElement('span');group.className='split';group.setAttribute('role','group');group.setAttribute('aria-label','Copy transcript');
  const source=document.createElement('button');source.type='button';source.className='with-source';source.title='Copy transcript with video title and link';source.setAttribute('aria-label',source.title);
  const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M9 7V3h12v14h-4M3 7h14v14H3zM7 12h6m-6 4h6');path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.7');path.setAttribute('stroke-linecap','round');icon.append(path);source.append(icon);
  const plain=document.createElement('button');plain.type='button';plain.className='plain';plain.title='Copy only the transcript with timestamps';plain.setAttribute('aria-label','Copy transcript with timestamps');plain.textContent='Copy transcript';
  output=document.createElement('output');output.setAttribute('role','status');output.setAttribute('aria-live','polite');output.setAttribute('aria-atomic','true');
  function fit(){
    const rect=nodeBounds();if(!rect)return;
    const width=Math.min(250,window.innerWidth-40);
    output?.style.setProperty('--notice-left',`${Math.max(12-rect.left,Math.min(shorts?10:rect.width-width,window.innerWidth-12-rect.left-width))}px`);
    if(shorts)host?.style.setProperty('--control-left',`${Math.max(12-rect.left,Math.min(10,window.innerWidth-12-rect.left-156))}px`);
  }
  function nodeBounds(){const rect=host?.getBoundingClientRect();return rect&&Number.isFinite(rect.left)&&Number.isFinite(window.innerWidth)?rect:null;}
  function dismiss(){
    if(inFlight)return;
    if(feedbackTimer!==undefined){clearTimeout(feedbackTimer);feedbackTimer=undefined;}
    output!.textContent='';plain.textContent='Copy transcript';delete group.dataset.copyState;
  }
  function addDismiss(){
    const close=document.createElement('button');close.type='button';close.className='dismiss';close.textContent='×';close.title='Dismiss message';close.setAttribute('aria-label','Dismiss message');
    close.addEventListener('click',event=>{event.stopPropagation();dismiss();plain.focus();});output!.append(close);fit();
  }
  function copy(event:MouseEvent,includeSource:boolean,approvedTemporary=false){
    event.stopPropagation();
    const requested=watchVideoId(location.href),token=epoch,notice=output,node=host;
    const current=()=>token===epoch&&watchVideoId(location.href)===requested&&node?.isConnected;
    if(!requested||inFlight)return;
    if(feedbackTimer!==undefined){clearTimeout(feedbackTimer);feedbackTimer=undefined;}
    delete group.dataset.copyState;group.setAttribute('aria-busy','true');
    inFlight=true;source.disabled=plain.disabled=true;plain.textContent='Reading…';notice!.textContent=approvedTemporary?'Reading captions in a temporary tab. It will close when finished…':'Reading captions from this video…';fit();
    const load=async()=>{
      if(cached?.videoId===requested)return cached;
      const response=await extensionApi().runtime.sendMessage({type:'TRANSCRIPT_COPY',videoId:requested,...(approvedTemporary?{approvedTemporary:true}:{})});
      if(response?.error)throw Object.assign(new Error(response.error),{transcriptRecovery:response.transcriptRecovery});
      if(token!==epoch||watchVideoId(location.href)!==requested||response?.data?.videoId!==requested)throw new Error('The video changed. Click Copy transcript again.');
      return response.data as CopiedTranscript;
    };
    void copyTranscriptFromClick(load,value=>{if(current()){cached=value;plain.textContent='Copying…';notice!.textContent='Copying the transcript to your clipboard…';}},includeSource).then(value=>{
      if(!current())return;
      cached=null;plain.textContent='Copied!';group.dataset.copyState='success';notice!.textContent=`${includeSource?'Title, link and ':''}${value.cueCount} ${value.cueCount===1?'timestamped line':'timestamped lines'} copied.`;addDismiss();
      feedbackTimer=setTimeout(()=>{if(current()){notice!.textContent='';plain.textContent='Copy transcript';delete group.dataset.copyState;}},4000);
    }).catch(error=>{if(current()){
      group.dataset.copyState='error';plain.textContent=cached?'Copy again':'Try again';notice!.textContent=transcriptCopyError(error);
      if((error as {transcriptRecovery?:string})?.transcriptRecovery==='temporary-watch'){
        const approve=document.createElement('button');approve.type='button';approve.textContent='Open temporary tab & copy';approve.className='recover';
        approve.title='Open a background regular-watch tab for this video, read captions, then close that tab';
        approve.addEventListener('click',event=>{event.stopPropagation();if(current())copy(event,includeSource,true);else schedule();});notice!.append(approve);
      }
      addDismiss();
    }})
      .finally(()=>{if(current()){inFlight=false;source.disabled=plain.disabled=false;group.setAttribute('aria-busy','false');}});
  }
  shadow.addEventListener('keydown',raw=>{const event=raw as KeyboardEvent;if(event.key==='Enter'||event.key===' ')event.stopPropagation();if(event.key==='Escape'&&!inFlight){event.stopPropagation();dismiss();plain.focus();}});
  source.addEventListener('click',event=>copy(event,true));plain.addEventListener('click',event=>copy(event,false));
  group.append(source,plain);shadow.append(style,group,output);target.append(host);host.addEventListener('transcopy-fit',fit);fit();
}
function schedule(){if(!scheduled){scheduled=true;setTimeout(mount,250);}}
document.addEventListener('yt-navigate-finish',schedule);
new MutationObserver((records=[])=>{if(records.some(record=>record.type==='attributes')||location.href!==lastUrl||((location.pathname==='/watch'||location.pathname.startsWith('/shorts/'))&&!host?.isConnected))schedule();}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['is-active','active']});
window.addEventListener('resize',schedule,{passive:true});
mount();
