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

import { LOG_PREFIX } from "../constants";
import { activeQuests, debugLog } from "./state";
import { QuestsStore } from "./stores";
import { getQuestName } from "./types";
import { notify } from "../ui/notifications";

export const STALL_CHECK_INTERVAL_MS = 60_000;
export const DEFAULT_STALL_TIMEOUT_MS = 10 * 60_000;

// Internal fixed limit: at most one automatic restart per quest.
// The on/off toggle lives in settings (default off); the cap itself is not configurable.
export const MAX_STALL_RESTARTS = 1;

let watchdogInterval: ReturnType<typeof setInterval> | null = null;
const restartCounts = new Map<string, number>();

export interface StallWatchdogOptions {
    shouldAutoRestart?: () => boolean;
    onRestart?: (questId: string) => void;
}

export function resetStallRestartCounts(): void {
    restartCounts.clear();
}

export interface StallCheckResult {
    questId: string;
    stalledForMs: number;
    stillOpen: boolean;
}

export function findStalledQuests(
    now: number = Date.now(),
    stallTimeoutMs: number = DEFAULT_STALL_TIMEOUT_MS
): StallCheckResult[] {
    const stalled: StallCheckResult[] = [];
    for (const [, data] of activeQuests.entries()) {
        if (!data.isProcessing || data.stallWarned) continue;
        if (data.lastProgress >= 100) continue;
        const idleFor = now - (data.lastProgressAt || now);
        if (idleFor < stallTimeoutMs) continue;

        let stillOpen = true;
        try {
            const quest = QuestsStore?.getQuest?.(data.questId);
            if (quest?.userStatus?.completedAt) stillOpen = false;
        } catch {
            stillOpen = true;
        }
        if (!stillOpen) continue;

        stalled.push({ questId: data.questId, stalledForMs: idleFor, stillOpen });
    }
    return stalled;
}

export function checkStallsOnce(
    stallTimeoutMs: number = DEFAULT_STALL_TIMEOUT_MS,
    options: StallWatchdogOptions = {}
): number {
    const stalled = findStalledQuests(Date.now(), stallTimeoutMs);
    for (const { questId, stalledForMs } of stalled) {
        const data = [...activeQuests.values()].find((d) => d.questId === questId);
        if (data) data.stallWarned = true;
        const mins = Math.max(1, Math.round(stalledForMs / 60_000));
        const name = getQuestName({ id: questId } as any, "Quest");
        const restarts = restartCounts.get(questId) ?? 0;
        if (
            options.shouldAutoRestart?.() === true &&
            options.onRestart &&
            restarts < MAX_STALL_RESTARTS
        ) {
            restartCounts.set(questId, restarts + 1);
            debugLog(
                `${LOG_PREFIX} Stall detected for quest ${questId} (${mins}m without progress) — restarting`
            );
            notify(
                "Restarting Quest",
                `${name}: no progress for ~${mins}m. Restarting automation…`,
                "info",
                questId
            );
            try {
                const result = options.onRestart(questId) as unknown;
                if (result instanceof Promise) {
                    result.catch((e) => {
                        console.warn(`${LOG_PREFIX} Stall restart failed:`, e);
                    });
                }
            } catch (e) {
                console.warn(`${LOG_PREFIX} Stall restart failed:`, e);
            }
            continue;
        }
        debugLog(`${LOG_PREFIX} Stall detected for quest ${questId} (${mins}m without progress)`);
        notify(
            "Quest Stalled?",
            `${name}: no progress for ~${mins}m. Discord may have changed the quest API — check console.`,
            "error",
            questId
        );
    }
    return stalled.length;
}

export function startStallWatchdog(
    stallTimeoutMs: number = DEFAULT_STALL_TIMEOUT_MS,
    options: StallWatchdogOptions = {}
): void {
    stopStallWatchdog();
    watchdogInterval = setInterval(() => {
        try {
            checkStallsOnce(stallTimeoutMs, options);
        } catch (e) {
            console.warn(`${LOG_PREFIX} Stall watchdog error:`, e);
        }
    }, STALL_CHECK_INTERVAL_MS);
}

export function stopStallWatchdog(): void {
    if (watchdogInterval) {
        clearInterval(watchdogInterval);
        watchdogInterval = null;
    }
}
