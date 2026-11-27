# Changelog

## [0.1.1] - 2026-11-27

### Fixed

- Added a support-invite guard so accounts already in the support server are never sent to the invite, even if a stored flag says otherwise.
- Membership is checked against Discord's guild list (`1508481905291558942`) instead of localStorage, and is re-evaluated on `CONNECTION_OPEN` once Discord has loaded the guild list.

### Changed

- New `supportServer.ts` with `checkSupportServerMembership()` and `canOpenSupportInvite()`, wired into startup, `CONNECTION_OPEN` and shutdown.
- Plugin version constant unified with the release tag sequence at `0.1.1`.

## [0.1.0]

- Initial release of Questcord, a Vencord plugin that automates Discord Quests.
- Progress pills with Clonecord-style variants (glass/solid/minimal), SVG icons, close buttons, elapsed timers and stack limits.
- Shared Foundation: author/favorite/source buttons, toast logger, patch status and manual update panel.
