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

import { settings } from "../settings";
import { activeQuests, getProgressBarKey, isPluginStopping, progressBars } from "../core/state";
import { updateQuestPill } from "./notifications";

export function createProgressBar(questId: string, userId: string): HTMLElement {
    const key = getProgressBarKey(questId, userId);
    if (progressBars.has(key)) {
        return progressBars.get(key)!;
    }
    const placeholder = document.createElement("div");
    progressBars.set(key, placeholder);
    return placeholder;
}

export function updateProgressBar(questId: string, userId: string, percent: number) {
    if (isPluginStopping) return;
    const key = getProgressBarKey(questId, userId);
    const clampedPercent = Math.min(100, Math.max(0, percent));

    const questData = activeQuests.get(key);
    if (questData) {
        if (clampedPercent > questData.lastProgress) {
            questData.lastProgressAt = Date.now();
            questData.stallWarned = false;
        }
        questData.lastProgress = clampedPercent;
    }
    if (!settings.store.showProgressBar) return;

    // Mirror Discord's optimistic progress so pill and bar show the same percentage.
    const now = Date.now();
    if (
        questData &&
        questData.isProcessing &&
        (!questData.lastProgressUpdate || now - questData.lastProgressUpdate >= 300)
    ) {
        const questName =
            questData.taskType === "WATCH_VIDEO"
                ? "Video Quest"
                : questData.taskType === "PLAY_ON_DESKTOP"
                  ? "Play Quest"
                  : questData.taskType === "STREAM_ON_DESKTOP"
                    ? "Stream Quest"
                    : questData.taskType === "ACHIEVEMENT_IN_ACTIVITY"
                      ? "Activity Quest"
                      : "Quest";

        // Update pill with our calculated quest progress for accuracy
        updateQuestPill(questId, `Completing: ${questName}`, clampedPercent);
        questData.lastProgressUpdate = now;
    }
}

export function removeProgressBar(questId: string, userId: string) {
    const key = getProgressBarKey(questId, userId);
    progressBars.delete(key);
}
