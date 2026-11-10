# Security

Report security problems through the repository's private vulnerability-reporting option if available. If it is unavailable, contact the repository owner privately; do not post credentials, private video links, transcripts or personal browser data in a public issue.

Do not disable browser protections to install this project. Developer packages are not store-signed releases. Inspect the source and permissions before loading them.

The background process accepts only its own extension's transcript messages, binds retrieval to the originating YouTube tab and video, and rejects unrelated actions. It exposes only transcript-copy operations. Caption requests are restricted to YouTube timed-text URLs and do not request translated tracks.

YouTube page scripts can observe or interfere with MAIN-world retrieval. The extension uses that context only to read the page's own player/caption data; no private credentials enter it. Video identity is rechecked before returning text. Like any client tool, this cannot guarantee the truth of text provided by a compromised website.
