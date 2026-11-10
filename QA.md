# QA and release limits

Transcopy is an independent browser extension for reading and copying existing YouTube captions.

46 standalone automated tests pass, including the browser API namespace adapter. Type checks and both package verifications pass.

Automated tests cover: timestamp/header formatting, authored/automatic language choice, hostile caption hosts, navigation, recycled transcript rows, denied clipboard writes, rapid clicks, stale status timers, stale recovery approvals, remounted controls, duplicate recovery, delayed player readiness, source-tab closure, pending navigation, timeouts, cleanup retries, lost close replies, same-window placement, muted temporary tabs, and sender isolation.

Both browser builds have validated minimal permissions, bundle isolation, ZIP decompression, CRC and SHA-256 receipts. These checks do not prove installed cross-browser behavior.

Standalone installation and live acceptance remain pending. Firefox, Windows, Linux and clean-profile acceptance remain unverified. Safari/mobile support is not part of this release. Firefox permanent installation requires Mozilla signing; no browser-store submission is implied.

No paid provider calls, likes, comments, subscriptions or changes to video content are part of the tests. Synthetic video identifiers and transcript sentences are used in tests; private videos and real user transcripts are excluded.

## 1.0.2 polish

Stable-width split controls, source-copy tooltips, reading/copying/success/error states, light/dark page colors, reduced-motion styling, dismissible feedback and Escape handling. Shorts messages and controls are clamped to the viewport; resizing does not restart retrieval. Extension reload errors tell users to refresh YouTube. Clipboard-retry text remains available after dismissing its notice.

New regression checks cover delayed clipboard completion, notice dismissal with retained retry, viewport fitting during an active request, Escape behavior and lifecycle error explanations. No new permissions, storage, AI services or retrieval routes were added. Visual and installed-browser acceptance for 1.0.2 remains unverified; automated DOM mocks do not prove real YouTube positioning.
