import {extensionApi} from '../lib/browser-api';
import {copyTranscriptFromClick,watchVideoId,type CopiedTranscript} from '../lib/transcript-copy';

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
  if(host?.isConnected&&host.parentElement===target)return;
  // Shorts recycle their action rails. Invalidate an old mounted control before moving.
  if(host)discardControl();
  host=document.createElement('span');host.id='transcopy';host.dataset.build=extensionApi().runtime.getManifest?.()?.version||'unknown';
  const shadow=host.attachShadow({mode:'open'}),style=document.createElement('style');
  style.textContent=`:host{display:inline-flex;position:relative;align-items:center;margin-left:8px;flex-shrink:0;font:500 14px Roboto,Arial,sans-serif}:host([data-shorts]){margin:0;width:0;height:40px;flex:0 0 0;align-self:center;z-index:2100}:host([data-shorts]) .split{position:absolute;left:10px;top:0}.split{display:inline-flex;align-items:stretch;border-radius:22px;border:1px solid #a99ade66;background:var(--yt-spec-badge-chip-background,#27252f);overflow:hidden}button{font:inherit;display:inline-flex;align-items:center;justify-content:center;white-space:nowrap;border:0;background:transparent;color:var(--yt-spec-text-primary,#eee);padding:0 11px;height:36px;cursor:pointer}.with-source{width:34px;padding:0;border-right:1px solid #a99ade44;flex-shrink:0}.plain{padding-left:9px}button:hover{background:#8271bb33}button:focus-visible{outline:2px solid #b4a1ff;outline-offset:-3px}button:disabled{cursor:progress;opacity:.7}svg{width:18px;height:18px;color:#b5a1ff}output{position:absolute;top:calc(100% + 7px);right:0;width:230px;max-width:80vw;padding:10px 12px;border-radius:12px;background:#22202e;color:#eee;border:1px solid #8e7dbc77;font:12px/1.5 Roboto,Arial,sans-serif;box-shadow:0 4px 14px #0003;z-index:2100}:host([data-shorts]) output{left:10px;right:auto;top:auto;bottom:calc(100% + 7px)}output .recover{display:block;white-space:normal;height:auto;min-height:36px;margin-top:8px;padding:8px 10px;background:#8271bb44;border-radius:8px;text-align:left}output:empty{display:none}.split[data-copy-state=success]{border-color:#75d8ba}`;
  if(shorts)host.dataset.shorts='true';
  const group=document.createElement('span');group.className='split';group.setAttribute('role','group');group.setAttribute('aria-label','Copy transcript');
  const source=document.createElement('button');source.type='button';source.className='with-source';source.title='Copy transcript with video title and link';source.setAttribute('aria-label',source.title);
  const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 3v-3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1m1 5h12M6 13h5m3 0h4');path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.7');path.setAttribute('stroke-linecap','round');icon.append(path);source.append(icon);
  const plain=document.createElement('button');plain.type='button';plain.className='plain';plain.title='Copy only the transcript with timestamps';plain.setAttribute('aria-label','Copy transcript with timestamps');plain.textContent='Copy transcript';
  output=document.createElement('output');output.setAttribute('role','status');
  function copy(event:MouseEvent,includeSource:boolean,approvedTemporary=false){
    event.stopPropagation();
    const requested=watchVideoId(location.href),token=epoch,notice=output,node=host;
    const current=()=>token===epoch&&watchVideoId(location.href)===requested&&node?.isConnected;
    if(!requested||inFlight)return;
    if(feedbackTimer!==undefined){clearTimeout(feedbackTimer);feedbackTimer=undefined;}
    delete group.dataset.copyState;group.setAttribute('aria-busy','true');
    inFlight=true;source.disabled=plain.disabled=true;plain.textContent='Reading…';notice!.textContent='Reading captions from this video…';
    const load=async()=>{
      if(cached?.videoId===requested)return cached;
      const response=await extensionApi().runtime.sendMessage({type:'TRANSCRIPT_COPY',videoId:requested,...(approvedTemporary?{approvedTemporary:true}:{})});
      if(response?.error)throw Object.assign(new Error(response.error),{transcriptRecovery:response.transcriptRecovery});
      if(token!==epoch||watchVideoId(location.href)!==requested||response?.data?.videoId!==requested)throw new Error('The video changed. Click Copy transcript again.');
      return response.data as CopiedTranscript;
    };
    void copyTranscriptFromClick(load,value=>{if(current())cached=value;},includeSource).then(value=>{
      if(!current())return;
      cached=null;plain.textContent='Copied!';group.dataset.copyState='success';notice!.textContent=`${includeSource?'Title, link and ':''}${value.cueCount} timestamped lines copied.`;
      feedbackTimer=setTimeout(()=>{if(current()){notice!.textContent='';plain.textContent='Copy transcript';delete group.dataset.copyState;}},4000);
    }).catch(error=>{if(current()){
      plain.textContent=cached?'Copy again':'Try again';notice!.textContent=error instanceof Error?error.message:'This transcript could not be copied.';
      if((error as {transcriptRecovery?:string})?.transcriptRecovery==='temporary-watch'){
        const approve=document.createElement('button');approve.type='button';approve.textContent='Open temporary tab & copy';approve.className='recover';
        approve.title='Open a background regular-watch tab for this video, read captions, then close that tab';
        approve.addEventListener('click',event=>{event.stopPropagation();if(current())copy(event,includeSource,true);else schedule();});notice!.append(approve);
      }
    }})
      .finally(()=>{if(current()){inFlight=false;source.disabled=plain.disabled=false;group.setAttribute('aria-busy','false');}});
  }
  group.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' ')event.stopPropagation();});
  source.addEventListener('click',event=>copy(event,true));plain.addEventListener('click',event=>copy(event,false));
  group.append(source,plain);shadow.append(style,group,output);target.append(host);
}
function schedule(){if(!scheduled){scheduled=true;setTimeout(mount,250);}}
document.addEventListener('yt-navigate-finish',schedule);
new MutationObserver((records=[])=>{if(records.some(record=>record.type==='attributes')||location.href!==lastUrl||((location.pathname==='/watch'||location.pathname.startsWith('/shorts/'))&&!host?.isConnected))schedule();}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['is-active','active']});
window.addEventListener('resize',schedule,{passive:true});
mount();
