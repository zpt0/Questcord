# Changelog

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
