# Transcopy

<img src="assets/icon.svg" width="72" height="72" alt="Transcopy transcript-copy icon">

**Copy a YouTube transcript without leaving YouTube.** Regular videos and Shorts, with timestamps and optional title/link attribution.

No AI calls. No API keys. No sign-in service. No local app or server.

## Download

- [Chromium package · v1.0.0](dist/transcopy-chromium-1.0.0.zip) — Chrome, Edge, Brave and other compatible desktop Chromium browsers.
- [Firefox developer package · v1.0.0](dist/transcopy-firefox-1.0.0.zip) — temporary developer installation; Mozilla signing is still required for permanent installation.
- [Source code](https://github.com/berkant-jotform/transcopy/archive/refs/heads/main.zip)

**Release status:** Developer packages, not browser-store releases. The source is OS independent; Windows, macOS and Linux do not need a helper app. Chromium package builds and automated tests pass. Firefox has a separate manifest and build verification; live Firefox acceptance and Mozilla signing are pending. Safari and mobile browsers are not supported by this release.

## Install in Chrome, Edge or Brave

1. Download the Chromium ZIP above and extract it into a permanent folder.
2. Open your browser's Extensions page: `chrome://extensions`, `edge://extensions` or `brave://extensions`.
3. Enable **Developer mode**, choose **Load unpacked**, then select the extracted folder containing `manifest.json`.
4. Open or refresh a YouTube video or Short.

No Terminal commands, Mac app, hosted service or JotStudio installation are needed.

## Use it

The button appears beside the normal video action buttons. In Shorts, it appears immediately right of the small square icon below Remix.

- Click **Copy transcript** to copy just the timestamped words.
- Click the **small icon** to copy the video title and canonical link above the transcript.
- Paste into any editor, chat or document.

Example:

```text
Video title
https://www.youtube.com/watch?v=VIDEO_ID

[00:00] The first spoken sentence.
[00:12] The next sentence.
```

Caption spelling is preserved. This tool does not transcribe audio, rewrite words or translate captions. It prefers original authored English captions, then automatic English captions; if English is unavailable it can use an available original language. Native transcript fallback is copied as shown by YouTube.

## When Shorts needs another route

YouTube sometimes exposes captions in its regular video view but not in Shorts.

1. Transcopy tries the current page.
2. It can read an already-open regular-watch tab for the **same video**, without selecting, navigating, muting or closing that tab.
3. If necessary, it offers **Open temporary tab & copy**. That click approves a background tab for this attempt only.
4. The extension opens a muted background watch tab in the same browser window, reads the transcript, then closes only that new tab before reporting success.

Your Short stays in place. A tab you navigate elsewhere is preserved. If Chrome/Firefox cannot close the temporary tab, a warning tells you what happened. No indefinite retries or paid requests occur.

## Firefox developer installation

1. Extract the Firefox ZIP.
2. Open `about:debugging#/runtime/this-firefox`.
3. Choose **Load Temporary Add-on** and select `manifest.json`.
4. Grant the requested YouTube site access, then refresh YouTube.

This temporary installation ends when Firefox restarts. Permanent Firefox distribution requires [Mozilla signing](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/). This project does not ask you to disable signing or other browser protections. Firefox 140+ is the manifest minimum; live Firefox QA is pending.

Safari requires [Apple-specific packaging and distribution](https://developer.apple.com/documentation/safariservices/safari-web-extensions). A Safari app/store release is not included. Mobile YouTube apps cannot load this extension; mobile browser support has not been established.

## Privacy and permissions

The only extension API permission is **scripting**, with site access limited to `https://www.youtube.com/*`.

- Reads captions/title from the video being copied.
- Uses your browser's normal YouTube session to read media already available to you.
- Writes to the clipboard only after your click.
- Retains retrieved text in memory for a clipboard retry; changing videos clears it.
- Contains no analytics, advertising, provider keys, native messaging, local server, cookie-reading API, remote executable code or transcript-upload service.
- The optional recovery tab makes normal YouTube page requests, subject to YouTube's own session/history behavior.

[Privacy details](PRIVACY.md) · [Security](SECURITY.md)

## Troubleshooting

**No button:** refresh YouTube after installation/reload, confirm site access is enabled, and use a regular `www.youtube.com/watch` or `/shorts/` page. Avoid running both this and another copy of the same JotStudio copier at once.

**Clipboard blocked:** the fetched transcript is held in memory. Click **Copy again** to copy it without retrieving it again.

**No captions:** some videos genuinely have no transcript or access is restricted. This tool cannot invent a transcript or bypass access restrictions. YouTube can also block a caption request or change its layout.

**Temporary tab left open:** a close failure is shown explicitly. Close that tab yourself. Reloading/closing the extension or browser during retrieval can interrupt cleanup; do not reload during an active copy.

**Browser update:** this is a downloadable developer extension. Updates are manual: replace the extracted files, reload the extension, then refresh YouTube. No automatic installation/reloads are performed.

## Build and test

Node.js 24 LTS is recommended. Development uses TypeScript, esbuild and Vitest; runtime packages have no external dependencies.

```sh
npm ci
npm run check
npm test
npm run build
npm run verify
```

Build outputs are under `dist/chromium` and `dist/firefox`, with deterministic ZIPs and SHA-256 receipts. The build script works on Windows, macOS and Linux; it does not require system zip tools. [QA evidence and limits](QA.md).

## Scope

This standalone release contains only the transcript-copy feature. It does not contain the JotStudio app, AI/subtitle preparation, Studio insertion, credentials, job data or private colleague-created tools. It is not affiliated with YouTube or Google.

MIT licensed. See [LICENSE](LICENSE).
