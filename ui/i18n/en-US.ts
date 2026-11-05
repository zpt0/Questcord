/*
 * Questcord, a Vencord plugin that automates Discord Quests
 * Copyright (c) 2026 zpt0
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import type { UiMessages } from "./types";

export const messages: UiMessages = {
    autoComplete: "Auto Complete",
    addToQueue: "Add to queue",
    startQuestFirst: "Start quest first",
    removeFromQueue: "Remove from queue",
    queued: "Queued ✓",
    cancel: "Cancel",
    queue: "Queue",
    queueCount: "Queue ({count})",
    runFirst: "Run first",
    videos: "Videos",
    games: "Games",
    questsCount: "Quests ({count})",
    noQuestsTitle: "No quests queued yet.",
    noQuestsHint: 'Use "Add to queue" on a quest.',
    remove: "Remove",
    clearQueue: "Clear Queue",
    runAutomatically: "Run queued quests automatically",
    paused: "Paused",
    collecting: "Collecting your Orbs...",
    gettingReady: "Getting ready...",
    nothingToRun: "Nothing to run",
    statusRunning: "Running{percent}",
    statusWaiting: "Waiting",
    statusAccepting: "Accepting...",
    statusUnavailable: "Unavailable",
    queueAria: "Quest queue",
    summaryFinished: "finished",
    summaryBlocked: "blocked",
    summaryFiltered: "filtered (Orb-only)",
    summaryFailed: "failed",
    unsupported: "Unsupported",
    unsupportedAchievementInGame:
        "This quest needs an achievement earned inside the game, which Questcord cannot do.",
    unsupportedAchievementBypassOff:
        "Enable 'Achievement Bypass' in settings to attempt this quest.",
};
