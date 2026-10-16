# Changelog

## [1.3.2]

- Dev dependency updates: @types/node 26.6.5, @vitest/coverage-v8 5.0.3, eslint 10.12.0, prettier 3.9.10, typescript 6.0.3, typescript-eslint 8.71.1, vitest 5.0.3
- TypeScript capped at 6.x (typescript-eslint 8.71.1 peer range is `>=4.8.4 <6.1.0`); the TypeScript 7 major is now ignored by Dependabot so the dependency PR stays green
- Dependabot now bundles every dependency update into a single pull request
- No functional changes

## [1.3.1]

- Fix duplicate "Queue added" bubble: central notification dedup guard suppresses identical notifications fired twice from any source, and the "Now running" toast is skipped when the run directly follows a manual queue add
- Progress spinner slowed down (1s → 1.5s per rotation)

## [1.3.0]

- New Quest Queue: add quests with the + Queue tile button, auto-accept and complete them one at a time with Videos-first / Games-first preference, enable/pause and list management in settings
- Per-account data isolation: saved resume states and queue are namespaced per Discord user with legacy migration, account switching (LOGOUT / CONNECTION_OPEN) stops runs and clears state instead of leaking
- Userplugin build fix: stylesheet loaded via `?managed` (`managedStyle`) instead of a plain CSS import
- Activity heartbeat setting: fast (~1s, previous behaviour) / balanced (~20s) / official (~60s)
- GPU-accelerated progress bar (`transform: scaleX` + `will-change`) and `prefers-reduced-motion` support
- Quest manager now reports `started | cancelled | invalid | conflict | error` results with `toggle` / `prompt` / `auto` options for queue control, plus session-ended notifications

## [1.2.0]

- Support the new Discord quest design: quest tiles now carry section suffixes (e.g. `-featured`, `-ending-soon`, `-orb`), the Auto Complete button, progress tracking and conflict modal handle both suffixed and legacy tile ids

## [1.1.5]

- Autolink bare URLs in update-modal release notes (trailing sentence punctuation excluded) and open release links in the external browser

## [1.1.4]

- Fix update modal showing raw markdown in one line: release notes are now rendered as real markdown (bold headings, paragraphs, lists, inline code, clickable links) with proper line breaks

## [1.1.3]

- Update system ported 1:1 from Clonecord: proper update modal (Current → New, rendered release notes) with Not Now / Discord / Update Now buttons instead of the progress pill
- Update check now runs once on startup (dismiss checked before fetching, silent on failure), 30-minute polling removed
- New "View Releases" link and manual "Check for Updates" button in settings
- Removed unused `checkForUpdate` helper

## [1.1.2]

- Dev dependency updates: vitest 5.0.1, @vitest/coverage-v8 5.0.1, typescript-eslint 8.70.0, @types/node 26.6.2, @types/react 19.3.0 (pinned via npm override for the exact peer requirement in @vencord/discord-types)
- No functional changes

## [1.1.1]

- Fix duplicated version/update block in plugin settings (removed redundant `versionInfo` component setting, the custom settings panel already shows it)

## [1.1.0]

- Unified API retry policy: GET requests now retry on 429/5xx/network errors with `Retry-After` support, exponential backoff and jitter; auth errors (401/403) fail fast
- Quest enrollment now uses the rate-limited API path instead of a raw single attempt
- New opt-in setting `autoRestartStalled` (default off): restarts stalled quest automation at most once per quest, otherwise keeps the previous stall notification
- Progress tracking no longer depends on the visible progress bar setting, so stall detection works even with the bar hidden
- Activity quests tolerate transient heartbeat failures (5 attempts with backoff) and retry the terminal heartbeat (3 attempts) instead of aborting on the first error
- Video quests retry each progress post (3 attempts with backoff) and only abort after sustained failures
- Desktop quests retry store/dispatcher lookup (3 attempts) and time out if the server reports no progress within the expected duration plus buffer
- Quest resume after reload drops saved states older than 7 days and skips conflicting non-video quests instead of prompting
- New "Clear Saved Quests" button in settings to discard saved resume states

## [1.0.2]

- Update pill now resolves markdown link syntax (`[text](url)` → visible text) and code backticks, so release notes no longer show literal markdown in the preview

## [1.0.1]

- Dev dependency updates: eslint 10.9.1, typescript-eslint 8.68.0, @types/node 26.4.0, @vencord/discord-types 1.0.2, vitest 4.1.11, @vitest/coverage-v8 4.1.11
- No functional changes

## [1.0.0]

- Questcord initial release as a standalone plugin
- Full settings panel with customizable pill position (top/bottom x left/center/right)
- Customizable accent color with live hex input and color swatch preview
- Toggle controls for notifications, progress bar, auto-resume, and auto-dismiss popups
- Notification duration slider
- Debug mode toggle
