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
import {
    activeQuests,
    cleanupFunctions,
    debugLog,
    getProgressBarKey,
    isPluginStopping,
    taskFailureCounts,
} from "../core/state";
import { findFluxDispatcher, getWebpackModules, QuestsStore } from "../core/stores";
import { Quest, resolveApplicationId, resolveApplicationName, getQuestName } from "../core/types";
import { notify, completeQuestPill, updateQuestPill } from "../ui/notifications";
import { removeProgressBar, updateProgressBar } from "../ui/progressBar";
import { cleanupQuest } from "./manager";
import { initializeQuestProgressBar } from "./questProgress";
import { settings } from "../settings";

export interface DesktopQuestConfig {
    taskName: string;
    questType: string;
    progressKey: string;
    spoofLabel: string;
    defaultQuestName: string;
    getStoreModule: (modules: any[]) => any;
    spoofStore: (
        store: any,
        applicationId: string,
        pid: number,
        gameData?: any
    ) => { realFunc: any; fakeData: any };
    dispatchEvent: string;
    restoreStore: (store: any, realFunc: any) => void;
    getProgressFromQuest: (quest: Quest, lastFallback: number) => number;
    getProgressFromHeartbeat: (data: any, lastFallback: number) => number;
}

const DESKTOP_MODULE_LOOKUP_ATTEMPTS = 3;
const DESKTOP_MODULE_LOOKUP_RETRY_MS = 2000;
const DESKTOP_MAX_RUNTIME_BUFFER_MS = 15 * 60 * 1000;
const DESKTOP_HARD_CAP_MS = 25 * 60 * 1000;
const HEARTBEAT_TIMEOUT_MS = 90 * 1000;
const MAX_CONSECUTIVE_FAILURES = 5;

interface WatchdogVerdict {
    message: string;
    reason: string;
}

interface HeartbeatWatchdogOptions {
    questName: string;
    graceMs: number;
    maxConsecutiveFailures: number;
    setTimer: (fn: () => void, ms: number) => number;
    clearTimer: (id: number) => void;
    onFailureNoted: (message: string) => void;
    onGiveUp: (verdict: WatchdogVerdict) => void;
}

class HeartbeatWatchdog {
    private readonly options: HeartbeatWatchdogOptions;
    private timer: number | null = null;
    private beatCount = 0;
    private failedBeats = 0;
    private consecutiveFailures = 0;
    private lastFailure: string | null = null;
    private settled = false;

    constructor(options: HeartbeatWatchdogOptions) {
        this.options = options;
    }

    get beats(): number {
        return this.beatCount;
    }

    start(): void {
        this.arm();
    }

    beat(): void {
        if (this.settled) return;
        this.beatCount++;
        this.consecutiveFailures = 0;
        this.arm();
    }

    fail(why: string): void {
        if (this.settled) return;
        this.failedBeats++;
        this.consecutiveFailures++;
        this.lastFailure = why;

        const { questName, maxConsecutiveFailures } = this.options;
        if (this.consecutiveFailures >= maxConsecutiveFailures) {
            this.giveUp({
                message: `[Task] Discord's heartbeat for "${questName}" failed ${this.consecutiveFailures} times in a row: ${why}. Giving up rather than waiting out the watchdog.`,
                reason: `Discord could not report progress (${why})`,
            });
            return;
        }

        this.options.onFailureNoted(
            `[Task] Discord's heartbeat for "${questName}" failed (${this.consecutiveFailures}/${maxConsecutiveFailures}): ${why}`,
        );

        if (this.beatCount > 0) this.arm();
    }

    stop(): void {
        this.settled = true;
        this.disarm();
    }

    private arm(): void {
        this.disarm();
        this.timer = this.options.setTimer(() => {
            this.timer = null;
            this.giveUp(this.silenceVerdict());
        }, this.options.graceMs);
    }

    private disarm(): void {
        if (this.timer != null) this.options.clearTimer(this.timer);
        this.timer = null;
    }

    private giveUp(verdict: WatchdogVerdict): void {
        if (this.settled) return;
        this.settled = true;
        this.disarm();
        this.options.onGiveUp(verdict);
    }

    private silenceVerdict(): WatchdogVerdict {
        const { questName } = this.options;
        const failed = this.failedBeats;
        const reason = failed > 0
            ? `No heartbeat from Discord (${failed} failed beat(s))`
            : "No heartbeat from Discord";

        if (this.beatCount === 0) {
            return {
                message: failed > 0
                    ? `[Task] Discord never reported progress for "${questName}". All ${failed} heartbeat(s) it tried failed, the last one ${this.lastFailure}.`
                    : `[Task] Discord never reported progress for "${questName}". It is not accepting the injected process on this client, so there is nothing to wait for.`,
                reason,
            };
        }

        const what = failed > 0
            ? `after ${this.beatCount} update(s) and ${failed} failed beat(s), the last one ${this.lastFailure}.`
            : `after ${this.beatCount} update(s).`;
        return {
            message: `[Task] Discord stopped reporting progress for "${questName}" ${what} Giving up instead of idling.`,
            reason,
        };
    }
}

export async function completeDesktopQuest(
    quest: Quest,
    userId: string,
    config: DesktopQuestConfig,
    gameData?: any
): Promise<boolean> {
    const secondsNeeded =
        quest.config?.taskConfig?.tasks?.[config.taskName]?.target ??
        quest.config?.taskConfigV2?.tasks?.[config.taskName]?.target ??
        quest.taskConfig?.tasks?.[config.taskName]?.target ??
        quest.taskConfigV2?.tasks?.[config.taskName]?.target;

    if (!secondsNeeded || secondsNeeded <= 0) {
        notify("Error", "Invalid quest configuration", "error", quest.id);
        return false;
    }

    const failureKey = `${config.taskName}:${config.questType}`;
    const failures = taskFailureCounts.get(failureKey) ?? 0;
    if (failures >= MAX_CONSECUTIVE_FAILURES) {
        notify(
            "Task Skipped",
            `${config.questType} quests abandoned after ${MAX_CONSECUTIVE_FAILURES} consecutive failures.`,
            "error",
            quest.id
        );
        return false;
    }

    const applicationId = resolveApplicationId(quest);
    const resolvedName = resolveApplicationName(quest);

    if (!applicationId) {
        console.warn(`${LOG_PREFIX} Could not resolve applicationId — dumping quest structure:`);
        console.warn(`${LOG_PREFIX} quest keys:`, Object.keys(quest));
        console.warn(`${LOG_PREFIX} quest.config:`, JSON.stringify(quest.config ?? {}, null, 2));
    }

    const currentProgress = config.getProgressFromQuest(quest, 0);
    updateQuestPill(
        quest.id,
        `${config.spoofLabel} ${resolvedName}. Wait ~${Math.ceil((secondsNeeded - currentProgress) / 60)} minutes.`,
        0
    );
    initializeQuestProgressBar(quest.id, userId);

    const pid = Math.floor(Math.random() * 30000) + 1000;
    const key = getProgressBarKey(quest.id, userId);

    return new Promise<boolean>((resolve) => {
        (async () => {
            try {
                let modules: any[] | null = null;
                let storeLocal: any = null;
                let FluxDispatcherLocal: any = null;
                // webpack can still be settling right after startup, so retry the lookup
                for (let attempt = 0; attempt < DESKTOP_MODULE_LOOKUP_ATTEMPTS; attempt++) {
                    modules = getWebpackModules();
                    if (modules && modules.length > 0) {
                        storeLocal = config.getStoreModule(modules);
                        FluxDispatcherLocal = findFluxDispatcher();
                    }
                    if (storeLocal && FluxDispatcherLocal) break;
                    if (attempt < DESKTOP_MODULE_LOOKUP_ATTEMPTS - 1) {
                        debugLog(
                            `${LOG_PREFIX} ${config.questType} store lookup failed (attempt ${attempt + 1}/${DESKTOP_MODULE_LOOKUP_ATTEMPTS}), retrying…`
                        );
                        await new Promise((r) => setTimeout(r, DESKTOP_MODULE_LOOKUP_RETRY_MS));
                    }
                }
                if (!modules || modules.length === 0) {
                    notify("Error", "Webpack not available", "error", quest.id);
                    resolve(false);
                    return;
                }
                if (!storeLocal) {
                    notify("Error", `${config.questType} store not found`, "error", quest.id);
                    resolve(false);
                    return;
                }
                if (!FluxDispatcherLocal) {
                    notify("Error", "FluxDispatcher not found", "error", quest.id);
                    resolve(false);
                    return;
                }

                const { realFunc } = config.spoofStore(
                    storeLocal,
                    applicationId ?? "",
                    pid,
                    gameData
                );
                debugLog(
                    `${LOG_PREFIX} Spoofed ${config.questType}: ${resolvedName} (pid: ${pid}, id: ${applicationId ?? "MISSING"})`
                );

                let lastServerProgress = currentProgress;
                const startTime = Date.now();
                // extra slack past the target; server-side progress can lag what we spoof
                const maxRuntimeMs = Math.min(
                    secondsNeeded * 1000 + DESKTOP_MAX_RUNTIME_BUFFER_MS,
                    DESKTOP_HARD_CAP_MS
                );

                let updateTicker: ReturnType<typeof setInterval> | null = null;
                let successHandler: ((data: any) => void) | null = null;
                let failureHandler: ((data: any) => void) | null = null;
                let watchdog: HeartbeatWatchdog | null = null;
                let completed = false;

                const cleanupSpoof = () => {
                    try {
                        if (updateTicker) clearInterval(updateTicker);
                        config.restoreStore(storeLocal, realFunc);
                        if (FluxDispatcherLocal) {
                            if (successHandler) {
                                FluxDispatcherLocal.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", successHandler);
                            }
                            if (failureHandler) {
                                FluxDispatcherLocal.unsubscribe("QUESTS_SEND_HEARTBEAT_FAILURE", failureHandler);
                            }
                        }
                    } catch (e) {
                        debugLog(`${LOG_PREFIX} Cleanup error:`, e);
                    }
                };

                const finish = (success: boolean) => {
                    if (completed) return;
                    completed = true;
                    cleanupSpoof();
                    watchdog?.stop();
                    removeProgressBar(quest.id, userId);
                    cleanupQuest(quest.id, userId);
                    resolve(success);
                };

                // Heartbeat watchdog - tracks both success and failure
                watchdog = new HeartbeatWatchdog({
                    questName: resolvedName,
                    graceMs: HEARTBEAT_TIMEOUT_MS,
                    maxConsecutiveFailures: MAX_CONSECUTIVE_FAILURES,
                    setTimer: (fn, ms) => setTimeout(fn, ms) as unknown as number,
                    clearTimer: (id) => clearTimeout(id),
                    onFailureNoted: (message) => debugLog(message),
                    onGiveUp: (verdict) => {
                        debugLog(`${LOG_PREFIX} ${verdict.message}`);
                        notify(
                            "Quest Aborted",
                            `${resolvedName}: ${verdict.reason}`,
                            "error",
                            quest.id
                        );
                        const fKey = `${config.taskName}:${config.questType}`;
                        taskFailureCounts.set(fKey, (taskFailureCounts.get(fKey) ?? 0) + 1);
                        finish(false);
                    },
                });
                watchdog.start();

                successHandler = (data: any) => {
                    try {
                        const questData = activeQuests.get(key);
                        if (!questData || !questData.isProcessing || isPluginStopping) {
                            finish(false);
                            return;
                        }
                        if (data?.questId !== quest.id) return;

                        watchdog.beat();

                        const liveQuest = QuestsStore?.getQuest?.(quest.id);
                        const progress = Math.floor(
                            config.getProgressFromHeartbeat(
                                { ...data, liveQuest },
                                lastServerProgress
                            )
                        );

                        if (progress > lastServerProgress) {
                            lastServerProgress = progress;
                        }

                        const percent =
                            progress >= secondsNeeded
                                ? 100
                                : Math.min(99, Math.floor((progress / secondsNeeded) * 100));
                        updateProgressBar(quest.id, userId, percent);
                        debugLog(
                            `${LOG_PREFIX} ${config.questType} progress: ${progress}/${secondsNeeded} (${percent}%)`
                        );

                        if (progress >= secondsNeeded) {
                            debugLog(`${LOG_PREFIX} Quest completed!`);
                            // hold the spoofed process for a randomized tail so the session
                            // doesn't end on the exact second it finishes (configurable via playSessionTail setting)
                            const tailMinutes = (settings.store as { playSessionTail?: number }).playSessionTail ?? 2;
                            const tailMs = tailMinutes > 0
                                ? Math.floor((0.4 + Math.random() * 0.6) * tailMinutes * 60 * 1000)
                                : 0;
                            setTimeout(() => {
                                try {
                                    cleanupSpoof();
                                } catch (e) {
                                    debugLog(`${LOG_PREFIX} tail cleanup error:`, e);
                                }
                            }, tailMs);
                            const questName = getQuestName(quest, config.defaultQuestName);
                            completeQuestPill(quest.id, `${questName} Completed!`, "success");
                            const fKey = `${config.taskName}:${config.questType}`;
                            taskFailureCounts.set(fKey, 0);
                            finish(true);
                        }
                    } catch (e) {
                        console.error(`${LOG_PREFIX} Heartbeat success handler error:`, e);
                    }
                };

                failureHandler = (data: any) => {
                    try {
                        const questData = activeQuests.get(key);
                        if (!questData || !questData.isProcessing || isPluginStopping) {
                            finish(false);
                            return;
                        }
                        if (data?.questId !== quest.id) return;

                        // Extract error details from Discord's failure event
                        const error = data?.error ?? data;
                        const status = error?.status ?? error?.httpStatus;
                        const code = error?.body?.code ?? error?.code;
                        const message = error?.body?.message ?? error?.message;
                        const details = [
                            status ? `HTTP ${status}` : null,
                            code ? `code ${code}` : null,
                            message ?? null,
                        ].filter(Boolean).join(", ") || "unknown error";

                        watchdog.fail(details);
                    } catch (e) {
                        console.error(`${LOG_PREFIX} Heartbeat failure handler error:`, e);
                    }
                };

                // Periodic progress update from quest store (fallback)
                updateTicker = setInterval(() => {
                    try {
                        const questData = activeQuests.get(key);
                        if (!questData || !questData.isProcessing || isPluginStopping) {
                            if (updateTicker) clearInterval(updateTicker);
                            finish(false);
                            return;
                        }

                        if (Date.now() - startTime > maxRuntimeMs) {
                            if (updateTicker) clearInterval(updateTicker);
                            debugLog(
                                `${LOG_PREFIX} ${config.questType} quest timed out after ${Math.round(maxRuntimeMs / 60000)}m`
                            );
                            notify(
                                "Quest Timeout",
                                `${resolvedName} made no server progress in time. Try again later.`,
                                "error",
                                quest.id
                            );
                            const fKey = `${config.taskName}:${config.questType}`;
                            taskFailureCounts.set(fKey, (taskFailureCounts.get(fKey) ?? 0) + 1);
                            finish(false);
                            return;
                        }

                        const liveQuest = QuestsStore?.getQuest?.(quest.id);
                        const liveProgress = Math.floor(
                            config.getProgressFromQuest(liveQuest, lastServerProgress)
                        );

                        if (liveProgress > lastServerProgress) {
                            lastServerProgress = liveProgress;
                        }

                        const elapsed = Math.floor((Date.now() - startTime) / 1000);
                        const estimatedProgress = Math.min(
                            secondsNeeded,
                            Math.max(lastServerProgress, currentProgress + elapsed)
                        );

                        const percent =
                            liveProgress >= secondsNeeded
                                ? 100
                                : Math.min(
                                      99,
                                      Math.floor((estimatedProgress / secondsNeeded) * 100)
                                  );

                        updateProgressBar(quest.id, userId, percent);

                        if (liveProgress >= secondsNeeded) {
                            if (updateTicker) clearInterval(updateTicker);
                            debugLog(
                                `${LOG_PREFIX} ${config.questType} quest completed on backend!`
                            );
                            const tailMinutes = (settings.store as { playSessionTail?: number }).playSessionTail ?? 2;
                            const tailMs = tailMinutes > 0
                                ? Math.floor((0.4 + Math.random() * 0.6) * tailMinutes * 60 * 1000)
                                : 0;
                            setTimeout(() => {
                                try {
                                    cleanupSpoof();
                                } catch (e) {
                                    debugLog(`${LOG_PREFIX} tail cleanup error:`, e);
                                }
                            }, tailMs);
                            const questName = getQuestName(quest, config.defaultQuestName);
                            completeQuestPill(quest.id, `${questName} Completed!`, "success");
                            const fKey = `${config.taskName}:${config.questType}`;
                            taskFailureCounts.set(fKey, 0);
                            finish(true);
                        }
                    } catch (e) {
                        debugLog(`${LOG_PREFIX} updateTicker error:`, e);
                    }
                }, 1000);

                FluxDispatcherLocal.subscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", successHandler);
                FluxDispatcherLocal.subscribe("QUESTS_SEND_HEARTBEAT_FAILURE", failureHandler);
                const cleanups = cleanupFunctions.get(key) || [];
                cleanups.push(cleanupSpoof);
                cleanupFunctions.set(key, cleanups);
            } catch (error: any) {
                console.error(`${LOG_PREFIX} Failed to complete ${config.questType} quest:`, error);
                notify(
                    "Quest Error",
                    `Failed: ${error?.message || "Unknown error"}`,
                    "error",
                    quest.id
                );
                removeProgressBar(quest.id, userId);
                cleanupQuest(quest.id, userId);
                const failureKey = `${config.taskName}:${config.questType}`;
                taskFailureCounts.set(failureKey, (taskFailureCounts.get(failureKey) ?? 0) + 1);
                resolve(false);
            }
        })();
    });
}
