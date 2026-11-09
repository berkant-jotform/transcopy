# Privacy

Transcopy does not operate a backend, upload transcripts, collect analytics or store browsing history. It does not read cookies through an extension API or extract credentials.

When you click a copy button, it reads the current video's title and captions, then writes the selected format to your clipboard. If clipboard access fails, the result remains in that page's memory for a retry. Changing videos or closing the page discards it.

For Shorts recovery, it can inspect a matching existing YouTube watch tab. A new muted background watch tab opens only after you approve that attempt. That tab is closed afterwards unless you navigate it elsewhere. Browser or extension shutdown can interrupt this cleanup.

Requests to YouTube use the browser's existing signed-in session where applicable. YouTube can record those page/media requests under its own policies. No third-party transcript/AI services are used.

The scripting permission enables caption retrieval from YouTube's page. Host access is limited to www.youtube.com. Clipboard writing happens through a user action; clipboard content is not read by this extension.
