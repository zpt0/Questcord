/*!
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
import { createProgressBar, getDiscordProgressPercent, updateProgressBar } from "../ui/progressBar";

/** Initialize progress bar for a quest if settings allow */
export function initializeQuestProgressBar(questId: string, userId: string): void {
    if (!settings.store.showProgressBar) return;
    createProgressBar(questId, userId);
    setTimeout(() => {
        const initialPercent = getDiscordProgressPercent(questId);
        if (initialPercent !== null) {
            updateProgressBar(questId, userId, initialPercent);
        }
    }, 100);
}
