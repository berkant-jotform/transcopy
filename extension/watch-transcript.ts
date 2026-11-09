import {extensionApi} from '../lib/browser-api';
import {formatTranscript, watchVideoId, type CopiedTranscript, type TranscriptSnapshot, type TranscriptLine} from '../lib/transcript-copy';

/** Runs in the watch page. Uses published player metadata and the native transcript UI only. */
export async function readWatchTranscript(expectedId: string): Promise<{snapshot?: TranscriptSnapshot; error?: string; recovery?: 'temporary-watch'; loading?: boolean}> {
  const id = () => location.hostname === 'www.youtube.com' && (location.pathname === '/watch' ? new URL(location.href).searchParams.get('v') : location.pathname.match(/^\/(?:shorts|live)\/([\w-]{11})(?:\/|$)/)?.[1]);
  const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve,ms));
  const changed = () => id() !== expectedId;
  if (changed()) return {error: 'The video changed. Copy from the current video again.'};
  type Track = {languageCode: string; kind?: string; baseUrl: string};
  type Player = {videoDetails?: {videoId?: string; title?: string}; captions?: {playerCaptionsTracklistRenderer?: {captionTracks?: Track[]}}};
  type VideoPlayer = {getPlayerResponse?: () => Player; getVideoData?: () => {video_id?: string}};
  // Shorts keep neighboring players mounted. Accept metadata only from this exact video.
  const candidates = [document.getElementById('movie_player'), document.getElementById('shorts-player'), ...document.querySelectorAll('#shorts-player, ytd-reel-video-renderer[is-active] .html5-video-player')] as unknown as (VideoPlayer | null)[];
  let player: Player | undefined;
  for (const candidate of candidates) {
    try {
      const response = candidate?.getPlayerResponse?.();
      const identity = candidate?.getVideoData?.()?.video_id || response?.videoDetails?.videoId;
      if (identity === expectedId && response?.videoDetails?.videoId === expectedId) {player = response; break;}
    } catch {}
  }
  if (!player) {
    const initial = (window as unknown as {ytInitialPlayerResponse?: Player}).ytInitialPlayerResponse;
    if (initial?.videoDetails?.videoId === expectedId) player = initial;
  }
  if (!player) return {error: 'This video is still loading. Try Copy transcript again in a moment.', loading:true};
  const title = player?.videoDetails?.title || document.title.replace(/ - YouTube$/, '');
  const tracks = (player?.captions?.playerCaptionsTracklistRenderer?.captionTracks || []).filter(track => {
    try {const u = new URL(track.baseUrl); return u.protocol === 'https:' && ['www.youtube.com','youtube.com'].includes(u.hostname) && u.pathname === '/api/timedtext' && (!u.searchParams.has('v') || u.searchParams.get('v')===expectedId) && !u.searchParams.has('tlang');} catch {return false;}
  });
  const english = tracks.filter(track => /^en(?:-|$)/.test(track.languageCode));
  const language = english.length ? english : tracks.filter(track => track.languageCode === tracks[0]?.languageCode);
  const track = language.find(track => track.kind !== 'asr') || language[0];
  if (track) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(),7000);
    try {
      const url = new URL(track.baseUrl); url.searchParams.set('fmt','json3');
      const response = await fetch(url,{credentials:'include',signal:controller.signal});
      if (response.ok) {
        const raw = await response.text();
        if (raw.length <= 2000000) {
          const data = JSON.parse(raw) as {events?: {tStartMs?: number; segs?: {utf8?: string}[]}[]};
          const lines: TranscriptLine[] = (data.events || []).flatMap(event => {
            const text = (event.segs || []).map(segment => segment.utf8 || '').join('').replace(/\s+/g,' ').trim();
            return text && typeof event.tStartMs === 'number' && Number.isFinite(event.tStartMs) && event.tStartMs >= 0 ? [{startMs:event.tStartMs,text}] : [];
          });
          if (lines.length && !changed()) return {snapshot:{videoId:expectedId,title,language:track.languageCode,kind:track.kind === 'asr' ? 'automatic' : 'authored',source:'caption-track',lines}};
        }
      }
    } catch { /* YouTube may block a direct timed-text response; use its own UI next. */ }
    finally {clearTimeout(timer);}
  }
  if (changed()) return {error: 'The video changed. Copy from the current video again.'};
  if (location.pathname.startsWith('/shorts/')) return {error: 'This Short needs the regular video transcript route.', recovery:'temporary-watch'};
  const selector = 'ytd-transcript-segment-renderer, transcript-segment-view-model';
  const rows = (): TranscriptLine[] => Array.from(document.querySelectorAll(selector)).flatMap(row => {
    const time = row.querySelector('.segment-timestamp, .ytwTranscriptSegmentViewModelTimestamp')?.textContent?.trim();
    const text = row.querySelector('.segment-text, .ytwTranscriptSegmentViewModelText, .ytAttributedStringHost[role="text"]')?.textContent?.replace(/\s+/g,' ').trim();
    if (!time || !text || !/^(?:\d+:)?\d{1,2}:\d{2}(?:[.,]\d+)?$/.test(time)) return [];
    const parts = time.replace(',','.').split(':').map(Number);
    const seconds = parts.length === 3 ? parts[0]*3600+parts[1]*60+parts[2] : parts[0]*60+parts[1];
    return Number.isFinite(seconds) ? [{startMs:Math.round(seconds*1000),text}] : [];
  });
  const opener=document.querySelector<HTMLElement>('ytd-video-description-transcript-section-renderer button');
  if(opener){opener.click();await sleep(250);}
  let lines = rows();
  if (!lines.length) {
    document.querySelector<HTMLElement>('#description-inline-expander #expand')?.click();
    const panelDeadline=Date.now()+7000;
    for (let step=0; step<28 && Date.now()<panelDeadline && !lines.length && !changed(); step++) {
      if (step===0 || step===4) {
        const button = document.querySelector<HTMLElement>('ytd-video-description-transcript-section-renderer button') || Array.from(document.querySelectorAll<HTMLElement>('button')).find(button => /^show transcript$/i.test(button.innerText.trim()));
        button?.click();
      }
      await sleep(250); lines = rows();
    }
  }
  if (changed()) return {error:'The video changed. Copy from the current video again.'};
  if (!lines.length) return {error: 'YouTube did not provide a transcript. Captions may be unavailable or still loading. Try opening Show transcript on this video, then copy again.'};
  const gathered = new Map<string,TranscriptLine>();
  const collect = () => {for (const line of rows()) gathered.set(`${line.startMs}:${line.text}`,line);};
  collect();
  // Detect recycled transcript rows and walk the native scroll pane, never the player or page.
  let scroller = document.querySelector(selector)?.parentElement || null;
  while (scroller && scroller !== document.body && !(scroller.clientHeight > 0 && scroller.scrollHeight > scroller.clientHeight+4 && /auto|scroll/.test(getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement;
  if (scroller && scroller !== document.body) {
    const saved = scroller.scrollTop;
    try {
      scroller.scrollTop = 0; await sleep(150); collect();
      const first = rows()[0];
      if (!first) return {error:'YouTube is still loading transcript rows. Try copying again in a moment.'};
      const key = `${first.startMs}:${first.text}`;
      scroller.scrollTop = scroller.scrollHeight; await sleep(150); collect();
      if (!rows().some(line => `${line.startMs}:${line.text}` === key)) {
        scroller.scrollTop = 0; const deadline = Date.now()+9000;
        let bottomStable = 0;
        while (Date.now()<deadline && !changed()) {
          await sleep(80); collect();
          if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight-2) {if (++bottomStable>=3) break;}
          else {bottomStable=0; scroller.scrollTop += Math.max(120,scroller.clientHeight*.8);}
        }
        if (bottomStable<3) return {error:'This transcript is too long or still loading. Copy stopped rather than returning only part of it. Try again after YouTube finishes loading the transcript.'};
      }
    } finally {if (!changed()) scroller.scrollTop=saved;}
  }
  if (changed()) return {error:'The video changed. Copy from the current video again.'};
  const label = document.querySelector('ytd-transcript-footer-renderer')?.textContent?.trim().slice(0,100) || 'As shown on YouTube';
  return {snapshot:{videoId:expectedId,title,language:label,kind:'as-shown',source:'transcript-panel',lines:[...gathered.values()]}};
}

const pending = new Map<number,Promise<CopiedTranscript>>();
export async function scrapeWatchTranscript(tabId: number, expectedId: string): Promise<CopiedTranscript> {
  if (!/^[\w-]{11}$/.test(expectedId)) throw new Error('Open a YouTube video to copy its transcript.');
  if (pending.has(tabId)) throw new Error('A transcript is already being copied from this tab.');
  const read = (async () => {
    const before = await extensionApi().tabs.get(tabId);
    if (watchVideoId(before.url || '') !== expectedId || (before.pendingUrl && watchVideoId(before.pendingUrl) !== expectedId)) throw new Error('The video changed. Copy from the current video again.');
    const results = await extensionApi().scripting.executeScript({target:{tabId},world:'MAIN',func:readWatchTranscript,args:[expectedId]});
    const after = await extensionApi().tabs.get(tabId);
    if (watchVideoId(after.url || '') !== expectedId || (after.pendingUrl && watchVideoId(after.pendingUrl) !== expectedId)) throw new Error('The video changed. Nothing was copied from the new page.');
    const result = results[0]?.result;
    if (!result?.snapshot) throw Object.assign(new Error(result?.error || 'YouTube did not supply a timestamped transcript.'),{transcriptRecovery:result?.recovery,transcriptLoading:result?.loading===true});
    return formatTranscript(result.snapshot,expectedId);
  })();
  pending.set(tabId,read);
  try {return await read;} finally {pending.delete(tabId);}
}

/** Only closes the tab this attempt created, and preserves deliberate navigation. */
export async function closeTemporaryTranscriptTab(tabId:number,videoId:string):Promise<void> {
  for(let attempt=0;attempt<2;attempt++){
    let current:chrome.tabs.Tab;
    try {current=await extensionApi().tabs.get(tabId);}
    catch(error){
      if(/No tab with id|Invalid tab ID/i.test(error instanceof Error?error.message:String(error)))return;
      throw new Error('Chrome could not check the temporary transcript tab. Close that tab, then try copying again.');
    }
    if(watchVideoId(current.pendingUrl||current.url||'')!==videoId)return;
    try {await extensionApi().tabs.remove(tabId);return;}
    catch { /* Recheck ownership before one bounded close retry. */ }
  }
  // A close may complete even when its reply is lost. Confirm before showing an error.
  try {const current=await extensionApi().tabs.get(tabId);if(watchVideoId(current.pendingUrl||current.url||'')!==videoId)return;}
  catch(error){if(/No tab with id|Invalid tab ID/i.test(error instanceof Error?error.message:String(error)))return;}
  throw new Error('Chrome could not close the temporary transcript tab. Close that tab, then try copying again.');
}

const copying = new Set<number>();
export async function scrapeActiveWatchTranscript(expectedId?: string, senderTabId?: number, approvedTemporary = false): Promise<CopiedTranscript> {
  const tab = senderTabId !== undefined ? await extensionApi().tabs.get(senderTabId) : (await extensionApi().tabs.query({active:true,lastFocusedWindow:true}))[0];
  const id = watchVideoId(tab?.url || '');
  if (typeof tab?.id !== 'number' || !id) throw new Error('Open a YouTube video, then click Copy transcript.');
  if (expectedId !== undefined && expectedId !== id) throw new Error('The video changed. Copy from the current video again.');
  const sourceId=tab.id,shorts=new URL(tab.url!).pathname.startsWith('/shorts/');
  if(copying.has(sourceId))throw new Error('A transcript is already being copied from this tab.');
  copying.add(sourceId);
  let created:number|undefined;
  const stable=async()=>{
    const current=await extensionApi().tabs.get(sourceId);
    if(watchVideoId(current.url||'')!==id||current.pendingUrl&&watchVideoId(current.pendingUrl)!==id)throw new Error('The video changed. Nothing was copied from the new page.');
  };
  try {
    await stable();
    if(!shorts||!approvedTemporary){
      try {return await scrapeWatchTranscript(sourceId,id);}
      catch(error){if(!shorts||(error as {transcriptRecovery?:string}).transcriptRecovery!=='temporary-watch')throw error;}
    }
    await stable();
    // Existing matching watch tabs are read without selecting, navigating or closing them.
    const existing=(await extensionApi().tabs.query({url:'https://www.youtube.com/watch*'})).filter(candidate=>candidate.id!==sourceId&&typeof candidate.id==='number'&&!candidate.pendingUrl&&watchVideoId(candidate.url||'')===id).sort((a,b)=>Number(b.status==='complete')-Number(a.status==='complete')).slice(0,1);
    for(const candidate of existing){
      await stable();
      try {const result=await scrapeWatchTranscript(candidate.id!,id);await stable();return result;}
      catch {await stable();}
    }
    if(!approvedTemporary)throw Object.assign(new Error('YouTube did not expose this Short’s transcript here. Allow a temporary background video tab to read it; your Short stays open. No AI calls.'),{transcriptRecovery:'temporary-watch'});
    await stable();
    const temporary=await extensionApi().tabs.create({url:`https://www.youtube.com/watch?v=${id}&autoplay=0`,active:false,...(typeof tab.windowId==='number'?{windowId:tab.windowId}:{})});
    created=temporary.id;
    if(created===undefined)throw new Error('The temporary transcript tab could not open. Try again.');
    // Only the newly created recovery tab is muted; existing videos stay untouched.
    await extensionApi().tabs.update(created,{muted:true});
    const deadline=Date.now()+12000;
    let loaded=false;
    while(Date.now()<deadline){
      await stable();
      const current=await extensionApi().tabs.get(created);
      if(watchVideoId(current.pendingUrl||current.url||'')!==id)throw new Error('The temporary video tab navigated elsewhere. Nothing was copied.');
      if(current.status==='complete'&&!current.pendingUrl){loaded=true;break;}
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    if(!loaded)throw new Error('YouTube took too long to load the transcript tab. Try again.');
    // Chrome can report a complete document before YouTube binds its player.
    const playerDeadline=Date.now()+2500;
    while(true){
      await stable();
      try {const result=await scrapeWatchTranscript(created,id);await stable();return result;}
      catch(error){
        if(!(error as {transcriptLoading?:boolean}).transcriptLoading||Date.now()>=playerDeadline)throw error;
        await new Promise(resolve=>setTimeout(resolve,200));
      }
    }
  } finally {
    try {if(created!==undefined)await closeTemporaryTranscriptTab(created,id);}
    finally {copying.delete(sourceId);}
  }
}
