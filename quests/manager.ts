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

import { DataStore } from "@api/index";
import { UserStore } from "@webpack/common";
import { LOG_PREFIX, SAVED_QUESTS_KEY } from "../constants";
import { accountReady, getOwner, keyFor, loadOwned } from "../core/account";
import { settings } from "../settings";
import {
    activeQuests,
    cleanupFunctions,
    debugLog,
    getProgressBarKey,
    taskFailureCounts,
} from "../core/state";
import { suppressConsole, restoreConsole } from "../core/utils";
import { QuestsStore } from "../core/stores";
import { discordApiGet, rateLimitedPost } from "../core/api";
import {
    ALL_TASK_TYPES,
    SavedQuestState,
    isVideoTask,
    getTaskConfig,
    resolveApplicationId,
    getQuestName,
} from "../core/types";
import { clearQuestTimers } from "../core/utils";
import { showQuestConflictModal } from "../ui/modals";
import { notify, createQuestPill, completeQuestPill } from "../ui/notifications";
import { removeProgressBar } from "../ui/progressBar";
import { completeActivityQuest } from "./activity";
import { completePlayQuest } from "./play";
import { completeStreamQuest } from "./stream";
import { completeVideoQuest } from "./video";
import { taskControlRegistry } from "./taskControl";
import { emitCompanionEvent, COMPANION_EVENT_CODES } from "../core/events";
import {
    assessQuestRunnability,
    questBlocker,
    recordOutcome,
    QuestOutcome,
    summarizeRun,
    summarizeSharedGameQuests,
    isQuestExpired,
    UNAUTOMATABLE_KEYS,
} from "./questRunnability";
export const SAVED_STATE_KEY = SAVED_QUESTS_KEY;

export const SAVED_STATE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const autoStartedQuests = new Set<string>();

export const questOutcomes = new Map<string, QuestOutcome>();
export const orbFilterSkipped = new Set<string>();
export const consentSkipped = new Set<string>();

const BLACKLISTED_QUEST_ID = "1412491570820812933";

type SessionEndListener = (session: { id: string }) => void;
const sessionEndListeners = new Set<SessionEndListener>();

export function onSessionEnded(listener: SessionEndListener): () => void {
    sessionEndListeners.add(listener);
    return () => {
        sessionEndListeners.delete(listener);
    };
}

function emitSessionEnded(questId: string) {
    if (sessionEndListeners.size === 0) return;
    for (const listener of Array.from(sessionEndListeners)) {
        try {
            listener({ id: questId });
        } catch (e) {
            debugLog(`${LOG_PREFIX} Session listener error:`, e);
        }
    }
}

export const isAutoStarted = (questId: string) => autoStartedQuests.has(questId);

export function isRunning(questId: string): boolean {
    for (const data of activeQuests.values()) {
        if (data.questId === questId && data.isProcessing) return true;
    }
    return false;
}

export function isAnyRunning(): boolean {
    for (const data of activeQuests.values()) {
        if (data.isProcessing) return true;
    }
    return false;
}

export function getRunningPercent(questId: string): number | null {
    for (const data of activeQuests.values()) {
        if (data.questId === questId && data.isProcessing && data.targetProgress > 0) {
            return Math.min(100, Math.round((data.lastProgress / data.targetProgress) * 100));
        }
    }
    return null;
}

export function resetResume() {
    autoStartedQuests.clear();
}

export function cancelAll() {
    const entries = Array.from(activeQuests.entries());
    for (const [, data] of entries) {
        try {
            cancelQuest(data.questId, data.userId);
        } catch (e) {
            debugLog(`${LOG_PREFIX} cancelAll error:`, e);
        }
    }
    autoStartedQuests.clear();
    taskControlRegistry.cancelAll();
}
export function cleanupQuest(questId: string, userId: string) {
    const key = getProgressBarKey(questId, userId);
    clearQuestTimers(questId, userId);
    const cleanups = cleanupFunctions.get(key);
    if (cleanups) {
        cleanups.forEach((fn) => {
            try {
                fn();
            } catch (e) {
                console.warn(`${LOG_PREFIX} Cleanup function error:`, e);
            }
        });
        cleanupFunctions.delete(key);
    }
    activeQuests.delete(key);
    autoStartedQuests.delete(questId);
    removeProgressBar(questId, userId);
    removeSavedQuestState(questId).catch((e) => {
        console.warn(`${LOG_PREFIX} Failed to remove saved state:`, e);
    });
    emitSessionEnded(questId);
    const control = taskControlRegistry.get(questId);
    if (control) {
        taskControlRegistry.release(questId, control.generation);
    }
}
export function cancelQuest(questId: string, userId: string) {
    const key = getProgressBarKey(questId, userId);
    const questData = activeQuests.get(key);
    if (questData) {
        questData.isProcessing = false;
        completeQuestPill(questId, "Quest automation cancelled", "cancelled");
        notify("Stopped", "Quest automation stopped", "cancel", questId);
        cleanupQuest(questId, userId);
    }
    // Also pause in task control registry
    taskControlRegistry.pause(questId);
}
function getRunningNonVideoQuestId(): string | null {
    for (const [, data] of activeQuests.entries()) {
        if (data.isProcessing && !isVideoTask(data.taskType)) {
            return data.questId;
        }
    }
    return null;
}
function canRunInParallel(newTaskType: string): {
    canRun: boolean;
    conflictQuestId: string | null;
} {
    if (isVideoTask(newTaskType)) {
        return { canRun: true, conflictQuestId: null };
    }
    const conflictId = getRunningNonVideoQuestId();
    if (conflictId) {
        return { canRun: false, conflictQuestId: conflictId };
    }
    return { canRun: true, conflictQuestId: null };
}
async function saveQuestState(questId: string, taskType: string) {
    try {
        const key = keyFor(SAVED_STATE_KEY);
        const saved: SavedQuestState[] = key
            ? ((await DataStore.get(key)) as SavedQuestState[] | undefined) ||
              (await loadOwned<SavedQuestState[]>(SAVED_STATE_KEY)) ||
              []
            : [];
        const existing = saved.findIndex((s) => s.questId === questId);
        const entry: SavedQuestState = { questId, taskType, startedAt: Date.now() };
        if (existing >= 0) {
            saved[existing] = entry;
        } else {
            saved.push(entry);
        }
        if (key) await DataStore.set(key, saved);
    } catch (e) {
        console.warn(`${LOG_PREFIX} Failed to save quest state:`, e);
    }
}
async function removeSavedQuestState(questId: string) {
    try {
        const key = keyFor(SAVED_STATE_KEY);
        if (!key) return;
        const saved: SavedQuestState[] =
            ((await DataStore.get(key)) as SavedQuestState[] | undefined) ||
            (await loadOwned<SavedQuestState[]>(SAVED_STATE_KEY)) ||
            [];
        const filtered = saved.filter((s) => s.questId !== questId);
        await DataStore.set(key, filtered);
    } catch (e) {
        console.warn(`${LOG_PREFIX} Failed to remove saved quest state:`, e);
    }
}
export async function clearSavedQuestStates() {
    try {
        const key = keyFor(SAVED_STATE_KEY);
        if (key) await DataStore.set(key, []);
        else await DataStore.set(SAVED_STATE_KEY, []);
        debugLog(`${LOG_PREFIX} Cleared all saved quest states`);
    } catch (e) {
        console.warn(`${LOG_PREFIX} Failed to clear saved quest states:`, e);
    }
}
export async function checkAndResumeQuests() {
    if (!settings.store.autoResumeAfterReload) return;
    if (!accountReady() && getOwner() == null) {
        debugLog(`${LOG_PREFIX} Resume deferred: no account owner yet`);
        return;
    }
    try {
        const saved: SavedQuestState[] =
            (await loadOwned<SavedQuestState[]>(SAVED_STATE_KEY)) || [];
        if (saved.length === 0) return;
        debugLog(`${LOG_PREFIX} Found ${saved.length} saved quest(s), attempting resume...`);
        let resumedNonVideo = false;
        for (const entry of saved) {
            const quest = QuestsStore?.getQuest(entry.questId);
            if (!quest) {
                debugLog(
                    `${LOG_PREFIX} Quest ${entry.questId} no longer available, removing saved state`
                );
                await removeSavedQuestState(entry.questId);
                continue;
            }
            if (quest.userStatus?.completedAt) {
                debugLog(
                    `${LOG_PREFIX} Quest ${entry.questId} already completed, removing saved state`
                );
                await removeSavedQuestState(entry.questId);
                continue;
            }
            if (Date.now() - entry.startedAt > SAVED_STATE_MAX_AGE_MS) {
                debugLog(
                    `${LOG_PREFIX} Quest ${entry.questId} saved state expired, removing saved state`
                );
                await removeSavedQuestState(entry.questId);
                continue;
            }
            if (!isVideoTask(entry.taskType)) {
                let conflict = resumedNonVideo;
                if (!conflict) {
                    for (const [, data] of activeQuests.entries()) {
                        if (data.isProcessing && !isVideoTask(data.taskType)) {
                            conflict = true;
                            break;
                        }
                    }
                }
                if (conflict) {
                    debugLog(
                        `${LOG_PREFIX} Quest ${entry.questId} skipped on resume (parallel conflict), keeping saved state`
                    );
                    continue;
                }
                resumedNonVideo = true;
            }
            const expiresAt = quest.config?.expiresAt ?? quest.expiresAt;
            if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
                debugLog(`${LOG_PREFIX} Quest ${entry.questId} expired, removing saved state`);
                await removeSavedQuestState(entry.questId);
                continue;
            }
            const questName = getQuestName(quest);
            notify("Resuming Quest", `Auto-resuming: ${questName}`, "info");
            await new Promise((r) => setTimeout(r, 1000));
            await startQuest(entry.questId);
        }
    } catch (e) {
        console.warn(`${LOG_PREFIX} Failed to check saved quests:`, e);
    }
}
export type StartQuestResult = "started" | "cancelled" | "invalid" | "conflict" | "error";

export async function acceptQuestById(questId: string): Promise<{
    ok: boolean;
    reason?: string;
    retryAt?: number;
}> {
    try {
        // location is a discord-defined surface id; changing it breaks enrollment
        await rateLimitedPost(`/quests/${questId}/enroll`, { location: 2 });
        // store takes a moment to reflect enrollment before callers read it
        await new Promise((r) => setTimeout(r, 1500));
        // re-read from store to confirm enrollment succeeded
        const orig = suppressConsole("log", "warn");
        let enrolled = false;
        try {
            const updated = QuestsStore?.getQuest?.(questId);
            enrolled = !!updated?.userStatus?.enrolledAt;
        } finally {
            restoreConsole(orig);
        }
        if (!enrolled) {
            return { ok: false, reason: "Enrollment not confirmed in store" };
        }
        return { ok: true };
    } catch (e: any) {
        const status = e?.status ?? e?.response?.status;
        if (status === 404) {
            return { ok: false, reason: e?.message ?? "Quest not found" };
        }
        if (status === 403) {
            return { ok: false, reason: e?.message ?? "Quest locked" };
        }
        if (status === 429) {
            const retryAfter = e?.retryAfter ?? 30_000;
            return {
                ok: false,
                reason: "Rate limited",
                retryAt: Date.now() + retryAfter,
            };
        }
        return { ok: false, reason: e?.message ?? "Enroll failed" };
    }
}

export async function startQuest(
    questId: string,
    opts: { toggle?: boolean; prompt?: boolean; auto?: boolean } = {}
): Promise<StartQuestResult> {
    if (!QuestsStore) {
        notify("Error", "Stores not initialized", "error");
        return "error";
    }
    const userId = UserStore.getCurrentUser()?.id;
    if (!userId) {
        notify("Error", "Could not get current user", "error");
        return "error";
    }
    const key = getProgressBarKey(questId, userId);
    if (activeQuests.has(key)) {
        const questData = activeQuests.get(key)!;
        if (questData.isProcessing) {
            if (opts.toggle === false) return "started";
            cancelQuest(questId, userId);
            return "cancelled";
        }
    }
    try {
        const origConsole = suppressConsole("log", "warn");
        let quest: any;
        try {
            quest = QuestsStore.getQuest(questId);
        } finally {
            restoreConsole(origConsole);
        }
        if (!quest) {
            notify("Error", "Quest not found", "error");
            return "invalid";
        }
        if (quest.userStatus?.completedAt) {
            notify("Already Completed", "This quest is already completed", "info");
            return "invalid";
        }
        if (!quest.userStatus?.enrolledAt) {
            let enrollFailed = false;
            let enrollmentErrorMessage = "";
            try {
                notify("Enrolling...", "Accepting quest automatically...", "info");
                await rateLimitedPost(`/quests/${questId}/enroll`, { location: 2 });
                await new Promise((r) => setTimeout(r, 1500));
                const origConsole2 = suppressConsole("log", "warn");
                try {
                    quest = QuestsStore.getQuest(questId);
                } finally {
                    restoreConsole(origConsole2);
                }
                if (!quest) {
                    notify(
                        "Enrollment Failed",
                        "Please click 'Accept Quest' manually in Discord first!",
                        "error"
                    );
                    return "error";
                }
            } catch (enrollError: any) {
                const status = enrollError?.status ?? enrollError?.response?.status;
                const message = enrollError?.message ?? "";
                const errorBody = enrollError?.body ?? "";
                console.error(
                    `${LOG_PREFIX} Auto-enroll failed: status=${status} message="${message}" body="${errorBody}"`
                );
                enrollFailed = true;
                enrollmentErrorMessage = message || errorBody || `HTTP ${status ?? "unknown"}`;
                // 404 means the quest doesn't exist anymore - don't retry, just fail
                if (status === 404) {
                    notify(
                        "Quest Not Found",
                        "This quest is no longer available. It may have expired or been removed.",
                        "error"
                    );
                    return "invalid";
                }
                if (status === 403) {
                    notify(
                        "Quest Locked",
                        "You don't have access to this quest. It may require a subscription or game ownership.",
                        "error"
                    );
                    return "invalid";
                }
            }
            if (enrollFailed || !quest.userStatus?.enrolledAt) {
                notify(
                    "Enrollment Required",
                    enrollmentErrorMessage
                        ? `Could not auto-enroll: ${enrollmentErrorMessage}`
                        : "Please click 'Accept Quest' manually in Discord first!",
                    "error"
                );
                return "conflict";
            }
        }
        // Check if quest is blacklisted
        if (questId === BLACKLISTED_QUEST_ID) {
            notify("Quest Skipped", "This quest is blacklisted", "error", questId);
            recordOutcome(questOutcomes, questId, "blocked");
            return "invalid";
        }

        // Check expiry using Discord's own accessor when available
        if (isQuestExpired(QuestsStore, quest)) {
            notify("Quest Expired", "This quest has expired", "error");
            recordOutcome(questOutcomes, questId, "blocked");
            return "invalid";
        }

        // Assess runnability (centralized logic with questBlocker)
        const isDesktopApp = typeof (window as any).DiscordNative !== "undefined";
        const runnability = assessQuestRunnability(quest, isDesktopApp);
        const blockReason = questBlocker(runnability);

        if (blockReason) {
            debugLog(`${LOG_PREFIX} ${blockReason}`);
            notify("Quest Skipped", blockReason, "info", questId);
            recordOutcome(questOutcomes, questId, "blocked");
            return "invalid";
        }

        const { detected, keys } = runnability;
        if (!detected) {
            notify(
                "Unknown Quest Type",
                "Could not determine quest type. Try accepting the quest manually first.",
                "error",
                questId
            );
            recordOutcome(questOutcomes, questId, "blocked");
            return "invalid";
        }

        const taskName = detected.keyName;
        const finalTaskConfig = getTaskConfig(quest);

        const localAppId = resolveApplicationId(quest);

        if (!localAppId && (taskName === "PLAY_ON_DESKTOP" || taskName === "STREAM_ON_DESKTOP")) {
            try {
                debugLog(
                    `${LOG_PREFIX} applicationId missing from local quest, fetching from API...`
                );
                const apiResp = await discordApiGet(`/quests/${questId}`);
                const apiQuest = apiResp?.body ?? apiResp;
                const apiAppId = resolveApplicationId(apiQuest);
                if (apiAppId) {
                    debugLog(`${LOG_PREFIX} Resolved applicationId from API: ${apiAppId}`);
                    if (!quest.config) quest.config = {} as any;
                    if (!quest.config.application) quest.config.application = {} as any;
                    quest.config.application.id = apiAppId;
                    quest.config.application.name =
                        apiQuest?.config?.application?.name ??
                        apiQuest?.config?.applicationName ??
                        apiQuest?.application?.name ??
                        quest.config.application.name;
                } else {
                    console.warn(
                        `${LOG_PREFIX} API also missing applicationId. Quest will likely fail.`
                    );
                    console.warn(`${LOG_PREFIX} API quest keys:`, Object.keys(apiQuest ?? {}));
                    console.warn(
                        `${LOG_PREFIX} API quest.config:`,
                        JSON.stringify(apiQuest?.config ?? {}, null, 2)
                    );
                }
            } catch (e) {
                console.warn(`${LOG_PREFIX} Failed to fetch applicationId from API:`, e);
            }
        }

        const { canRun, conflictQuestId } = canRunInParallel(taskName);
        if (!canRun && conflictQuestId) {
            if (opts.prompt === false) return "conflict";
            const shouldSwitch = await showQuestConflictModal(conflictQuestId, questId);
            if (shouldSwitch) {
                const runningUserId = UserStore.getCurrentUser()?.id;
                if (runningUserId) {
                    cancelQuest(conflictQuestId, runningUserId);
                }
            } else {
                return "conflict";
            }
        }

        const targetProgress = finalTaskConfig?.tasks?.[taskName]?.target || 0;
        const questName = getQuestName(quest);
        activeQuests.set(key, {
            questId,
            userId,
            taskType: taskName,
            isProcessing: true,
            timeoutIds: [],
            intervalIds: [],
            lastProgress: 0,
            targetProgress,
            lastProgressAt: Date.now(),
            stallWarned: false,
        });
        await saveQuestState(questId, taskName);
        createQuestPill(questId, questName);
        if (opts.auto === true) autoStartedQuests.add(questId);
        let success = false;
        try {
            switch (taskName) {
                case "WATCH_VIDEO":
                case "WATCH_VIDEO_ON_MOBILE":
                case "WATCH_VIDEO_ON_DESKTOP":
                    success = await completeVideoQuest(quest, userId);
                    break;
                case "PLAY_ON_DESKTOP":
                    if (isDesktopApp) {
                        success = await completePlayQuest(quest, userId);
                    } else {
                        notify(
                            "Desktop Required",
                            "This quest requires Discord desktop app",
                            "error",
                            questId
                        );
                        cleanupQuest(questId, userId);
                        return "invalid";
                    }
                    break;
                case "STREAM_ON_DESKTOP":
                    if (isDesktopApp) {
                        success = await completeStreamQuest(quest, userId);
                    } else {
                        notify(
                            "Desktop Required",
                            "This quest requires Discord desktop app",
                            "error",
                            questId
                        );
                        cleanupQuest(questId, userId);
                        return "invalid";
                    }
                    break;
                case "ACHIEVEMENT_IN_ACTIVITY":
                    if (settings.store.enableAchievementBypass) {
                        success = await completeActivityQuest(quest, userId);
                    } else {
                        consentSkipped.add(questId);
                        notify(
                            "Achievement Bypass Off",
                            "Enable 'Achievement Bypass' in settings to attempt this quest.",
                            "info",
                            questId
                        );
                        cleanupQuest(questId, userId);
                        return "invalid";
                    }
                    break;
                case "PLAY_ACTIVITY":
                    success = await completeActivityQuest(quest, userId);
                    break;
                default:
                    console.warn(`${LOG_PREFIX} Unknown task type: ${taskName}`);
                    notify("Unknown Quest Type", `Unsupported task: ${taskName}`, "error", questId);
                    cleanupQuest(questId, userId);
                    return "invalid";
            }
        } catch (taskError) {
            console.error(`${LOG_PREFIX} Task execution error:`, taskError);
            success = false;
        }

        if (success) {
            recordOutcome(questOutcomes, questId, "completed");
        } else {
            recordOutcome(questOutcomes, questId, "failed");
        }
        return "started";
    } catch (error) {
        console.error(`${LOG_PREFIX} startQuest error:`, error);
        notify("Quest Error", "An unexpected error occurred", "error", questId);
        cleanupQuest(questId, userId);
        return "error";
    }
}

/**
 * Retry quests that were skipped because Achievement Bypass was off.
 * Call this when the setting is turned on.
 */
export function retryConsentSkipped(): number {
    let restored = 0;
    for (const id of consentSkipped) {
        if (!questOutcomes.has(id)) continue;
        questOutcomes.delete(id);
        restored++;
    }
    consentSkipped.clear();
    return restored;
}

/**
 * Retry quests that were filtered out by Orb-only setting.
 * Call this when the setting is turned off.
 */
export function retryOrbFilterSkipped(): number {
    let restored = 0;
    for (const id of orbFilterSkipped) {
        if (!questOutcomes.has(id)) continue;
        questOutcomes.delete(id);
        restored++;
    }
    orbFilterSkipped.clear();
    return restored;
}

/**
 * Get a summary of the current run outcomes.
 */
export function getRunSummary(): ReturnType<typeof summarizeRun> {
    return summarizeRun(questOutcomes);
}

/**
 * Get shared game quest deduplication lines for the wrap-up.
 */
export function getSharedGameQuestLines(): string[] {
    const tasks: Array<{ appId: string | number; name: string; type: string }> = [];
    for (const [, data] of activeQuests.entries()) {
        if (data.taskType === "PLAY_ON_DESKTOP") {
            const q = QuestsStore?.getQuest(data.questId);
            if (q) {
                const appId = resolveApplicationId(q);
                if (appId) {
                    tasks.push({ appId, name: getQuestName(q), type: "GAME" });
                }
            }
        }
    }
    return summarizeSharedGameQuests(tasks);
}
