import {extensionApi} from '../lib/browser-api';
import {scrapeActiveWatchTranscript} from './watch-transcript';
import {watchVideoId} from '../lib/transcript-copy';
extensionApi().runtime.onMessage.addListener((message,sender,reply)=>{
  if(message?.type!=='TRANSCRIPT_COPY')return false;
  void (async()=>{
    if(sender.id!==extensionApi().runtime.id)throw new Error('Use the Transcopy controls on YouTube.');
    if(sender.tab&&(typeof sender.tab.id!=='number'||!watchVideoId(sender.tab.url||'')))throw new Error('Copy only from a YouTube video tab.');
    if(message.videoId!==undefined&&(typeof message.videoId!=='string'||!/^[\w-]{11}$/.test(message.videoId)))throw new Error('Choose a YouTube video first.');
    return scrapeActiveWatchTranscript(message.videoId,sender.tab?.id,message.approvedTemporary===true);
  })().then(data=>reply({data})).catch(error=>reply({error:error instanceof Error?error.message:'The transcript could not be read.',...(error.transcriptRecovery==='temporary-watch'?{transcriptRecovery:'temporary-watch'}:{})}));
  return true;
});
