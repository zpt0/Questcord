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

import { QuestData } from "./types";
// discord ids are numeric, so ":" can't collide inside a quest or user id
const KEY_SEPARATOR = ":";
export let activeQuests = new Map<string, QuestData>();
export let progressBars = new Map<string, HTMLElement>();
export let cleanupFunctions = new Map<string, Array<() => void>>();
export let isPluginStopping = false;
export function setPluginStopping(value: boolean) {
    isPluginStopping = value;
}
export function getProgressBarKey(questId: string, userId: string): string {
    return `${questId}${KEY_SEPARATOR}${userId}`;
}
export function parseProgressBarKey(key: string): { questId: string; userId: string } | null {
    const parts = key.split(KEY_SEPARATOR);
    if (parts.length !== 2) return null;
    return { questId: parts[0], userId: parts[1] };
}
let _settingsStore: any = null;
export function initDebug(settingsStore: any) {
    _settingsStore = settingsStore;
}
export function debugLog(...args: any[]) {
    if (_settingsStore?.debugMode) console.log(...args);
}
