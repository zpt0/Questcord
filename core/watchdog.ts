import { LOG_PREFIX } from "../constants";
import { activeQuests, debugLog } from "./state";
import { QuestsStore } from "./stores";
import { getQuestName } from "./types";
import { notify } from "../ui/notifications";

export const STALL_CHECK_INTERVAL_MS = 60_000;
export const DEFAULT_STALL_TIMEOUT_MS = 10 * 60_000;

let watchdogInterval: ReturnType<typeof setInterval> | null = null;

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

export function checkStallsOnce(stallTimeoutMs: number = DEFAULT_STALL_TIMEOUT_MS): number {
    const stalled = findStalledQuests(Date.now(), stallTimeoutMs);
    for (const { questId, stalledForMs } of stalled) {
        const data = [...activeQuests.values()].find((d) => d.questId === questId);
        if (data) data.stallWarned = true;
        const mins = Math.max(1, Math.round(stalledForMs / 60_000));
        const name = getQuestName({ id: questId } as any, "Quest");
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

export function startStallWatchdog(stallTimeoutMs: number = DEFAULT_STALL_TIMEOUT_MS): void {
    stopStallWatchdog();
    watchdogInterval = setInterval(() => {
        try {
            checkStallsOnce(stallTimeoutMs);
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
