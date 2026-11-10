export type TranscriptLine = {startMs: number; text: string};
export type TranscriptSnapshot = {
  videoId: string; title: string; language: string;
  kind: 'authored' | 'automatic' | 'as-shown';
  source: 'caption-track' | 'transcript-panel';
  lines: TranscriptLine[];
};
export type CopiedTranscript = Omit<TranscriptSnapshot, 'lines'> & {text: string; cueCount: number};

export function watchVideoId(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'www.youtube.com') return null;
    const id = url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.match(/^\/(?:shorts|live)\/([\w-]{11})(?:\/|$)/)?.[1];
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch {return null;}
}

export function formatTranscript(snapshot: TranscriptSnapshot, expectedId: string): CopiedTranscript {
  if (snapshot?.videoId !== expectedId || !Array.isArray(snapshot.lines)) throw new Error('The video changed. Copy from the current video again.');
  if (snapshot.lines.length > 100000) throw new Error('This transcript is too large to copy in one pass.');
  const seen = new Set<string>();
  const lines = snapshot.lines.filter(line => typeof line?.startMs === 'number' && Number.isFinite(line.startMs) && line.startMs >= 0 && typeof line.text === 'string' && line.text.trim())
    .sort((a,b) => a.startMs - b.startMs).flatMap(line => {
      const text = line.text.replace(/\s+/g, ' ').trim(), key = `${line.startMs}:${text}`;
      if (seen.has(key)) return []; seen.add(key);
      const seconds = Math.floor(line.startMs / 1000), hours = Math.floor(seconds / 3600);
      const time = [hours ? String(hours).padStart(2,'0') : '', String(Math.floor(seconds / 60) % 60).padStart(2,'0'), String(seconds % 60).padStart(2,'0')].filter(Boolean).join(':');
      return [`[${time}] ${text}`];
    });
  if (!lines.length) throw new Error('No timestamped transcript is available for this video.');
  const text = lines.join('\n');
  if (text.length > 2000000) throw new Error('This transcript is too large to copy in one pass.');
  return {videoId: snapshot.videoId, title: snapshot.title, language: snapshot.language, kind: snapshot.kind, source: snapshot.source, text, cueCount: lines.length};
}

/** Source headers use a canonical video URL, never the page's tracking/query parameters. */
export function transcriptClipboardText(value: CopiedTranscript, includeSource = false): string {
  if (!includeSource) return value.text;
  if (!/^[\w-]{11}$/.test(value.videoId)) throw new Error('This video could not be identified. Copy again from its page.');
  const title = value.title.replace(/\s+/g, ' ').trim() || 'YouTube video';
  return `${title}\nhttps://www.youtube.com/watch?v=${value.videoId}\n\n${value.text}`;
}

/** Start the clipboard operation in the click gesture, supplying its text asynchronously. */
export async function copyTranscriptFromClick(load: () => Promise<CopiedTranscript>, onReady?: (value: CopiedTranscript) => void, includeSource = false): Promise<CopiedTranscript> {
  const pending = load().then(result => {onReady?.(result); return result;});
  let writing: Promise<void>;
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      const text = pending.then(result => new Blob([transcriptClipboardText(result,includeSource)], {type: 'text/plain'}));
      void text.catch(() => {});
      writing = navigator.clipboard.write([new ClipboardItem({'text/plain': text})]);
    } else {
      writing = pending.then(result => navigator.clipboard.writeText(transcriptClipboardText(result,includeSource)));
    }
  } catch (error) {writing = Promise.reject(error);}
  // Wait for both so a clipboard denial does not discard the retrieved text.
  const [result, copied] = await Promise.allSettled([pending, writing]);
  if (result.status === 'rejected') throw result.reason;
  if (copied.status === 'rejected') throw new Error('The transcript is ready, but your browser blocked clipboard access. Click again to copy the saved text.');
  return result.value;
}

/** Translate extension lifecycle failures into a next step without hiding caption errors. */
export function transcriptCopyError(error: unknown): string {
  const message=error instanceof Error?error.message:'';
  if (/extension context invalidated|receiving end does not exist|could not establish connection/i.test(message))
    return 'Transcopy was updated or disconnected. Refresh this YouTube page, then try copying again.';
  return message || 'The transcript could not be copied. Try again from this video.';
}
