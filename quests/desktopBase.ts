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
// Discord clamps live optimistic progress just below the target until the server confirms completion.
const DISCORD_PROGRESS_CAP = 0.99;

/**
 * Mirrors Discord's optimistic progress: last reported value plus elapsed
 * heartbeat time, capped at 99% of target, so the pill stays in lockstep.
 */
function getOptimisticProgressSeconds(
    quest: Quest | null | undefined,
    taskKey: string,
    fallbackProgress: number,
    targetSeconds: number
): number {
    if (quest?.userStatus?.completedAt != null) return targetSeconds;

    const taskProgress = quest?.userStatus?.progress?.[taskKey];
    const reported =
        taskProgress?.value ?? quest?.userStatus?.streamProgressSeconds ?? fallbackProgress;
    let progress = typeof reported === "number" ? reported : fallbackProgress;

    const lastBeatAt = taskProgress?.heartbeat?.lastBeatAt;
    if (lastBeatAt != null) {
        const beatMs = new Date(lastBeatAt).valueOf();
        const elapsedSeconds = (Date.now() - beatMs) / 1000;
        if (Number.isFinite(elapsedSeconds) && elapsedSeconds > 0) {
            progress += elapsedSeconds;
        }
    }

    return Math.max(0, Math.min(progress, targetSeconds * DISCORD_PROGRESS_CAP));
}

function getOptimisticPercent(
    optimisticProgress: number,
    reportedProgress: number,
    targetSeconds: number
): number {
    if (reportedProgress >= targetSeconds) return 100;
    // epsilon guards against 0.99 * target rounding down to 98.999…%
    return Math.min(99, Math.floor((optimisticProgress / targetSeconds) * 100 + 1e-6));
}

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
            `[Task] Discord's heartbeat for "${questName}" failed (${this.consecutiveFailures}/${maxConsecutiveFailures}): ${why}`
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
        const reason =
            failed > 0
                ? `No heartbeat from Discord (${failed} failed beat(s))`
                : "No heartbeat from Discord";

        if (this.beatCount === 0) {
            return {
                message:
                    failed > 0
                        ? `[Task] Discord never reported progress for "${questName}". All ${failed} heartbeat(s) it tried failed, the last one ${this.lastFailure}.`
                        : `[Task] Discord never reported progress for "${questName}". It is not accepting the injected process on this client, so there is nothing to wait for.`,
                reason,
            };
        }

        const what =
            failed > 0
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
        console.warn(
            `${LOG_PREFIX} Could not resolve applicationId for "${resolvedName}" — skipping quest.`
        );
        notify("Error", "Could not resolve game application ID", "error", quest.id);
        completeQuestPill(quest.id, `${resolvedName} Failed`, "error");
        removeProgressBar(quest.id, userId);
        cleanupQuest(quest.id, userId);
        taskFailureCounts.set(
            `${config.taskName}:${config.questType}`,
            (taskFailureCounts.get(`${config.taskName}:${config.questType}`) ?? 0) + 1
        );
        return false;
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

                await new Promise((r) => setTimeout(r, 2000));
                const { realFunc } = config.spoofStore(storeLocal, applicationId, pid, gameData);
                await new Promise((r) => setTimeout(r, 1000));
                debugLog(
                    `${LOG_PREFIX} Spoofed ${config.questType}: ${resolvedName} (pid: ${pid}, id: ${applicationId ?? "MISSING"})`
                );

                // RUNNING_GAMES_CHANGE handlers read added/removed unconditionally, so send
                // the full shape; never reuse it for other event types.
                const dispatchGamesChange = () => {
                    if (
                        config.dispatchEvent !== "RUNNING_GAMES_CHANGE" ||
                        !FluxDispatcherLocal?.dispatch
                    ) {
                        return;
                    }
                    try {
                        FluxDispatcherLocal.dispatch({
                            type: "RUNNING_GAMES_CHANGE",
                            games: storeLocal?.getRunningGames?.() ?? [],
                            added: [],
                            removed: [],
                        });
                    } catch (e) {
                        debugLog(`${LOG_PREFIX} Failed to dispatch ${config.dispatchEvent}:`, e);
                    }
                };

                dispatchGamesChange();
                for (const delay of [500, 1500, 3000, 5000]) {
                    setTimeout(() => {
                        if (completed || isPluginStopping) return;
                        dispatchGamesChange();
                    }, delay);
                }

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
                let spoofRestored = false;

                const cleanupSpoof = () => {
                    try {
                        if (updateTicker) clearInterval(updateTicker);
                        if (!spoofRestored) {
                            spoofRestored = true;
                            config.restoreStore(storeLocal, realFunc);
                            dispatchGamesChange();
                        }
                        if (FluxDispatcherLocal) {
                            if (successHandler) {
                                FluxDispatcherLocal.unsubscribe(
                                    "QUESTS_SEND_HEARTBEAT_SUCCESS",
                                    successHandler
                                );
                            }
                            if (failureHandler) {
                                FluxDispatcherLocal.unsubscribe(
                                    "QUESTS_SEND_HEARTBEAT_FAILURE",
                                    failureHandler
                                );
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

                // Small delay before starting to track - Discord may take a moment to register the spoofed game
                await new Promise((r) => setTimeout(r, 2000));

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
                        // QUESTS_SEND_HEARTBEAT_SUCCESS carries the fresh userStatus; prefer it over a stale store read.
                        const progressQuest = data?.userStatus
                            ? { ...(liveQuest ?? quest), userStatus: data.userStatus }
                            : liveQuest;

                        const reportedProgress = Math.floor(
                            config.getProgressFromHeartbeat(
                                { ...data, liveQuest: progressQuest },
                                lastServerProgress
                            )
                        );

                        if (reportedProgress > lastServerProgress) {
                            lastServerProgress = reportedProgress;
                        }

                        const optimisticProgress = getOptimisticProgressSeconds(
                            progressQuest,
                            config.progressKey,
                            lastServerProgress,
                            secondsNeeded
                        );
                        const percent = getOptimisticPercent(
                            optimisticProgress,
                            reportedProgress,
                            secondsNeeded
                        );
                        updateProgressBar(quest.id, userId, percent);
                        debugLog(
                            `${LOG_PREFIX} ${config.questType} progress: ${reportedProgress}/${secondsNeeded} (${percent}%)`
                        );

                        if (reportedProgress >= secondsNeeded) {
                            debugLog(`${LOG_PREFIX} Quest completed!`);
                            // Hold the spoofed process for a randomized tail so it doesn't end exactly at completion.
                            const tailMinutes =
                                (settings.store as { playSessionTail?: number }).playSessionTail ??
                                2;
                            const tailMs =
                                tailMinutes > 0
                                    ? Math.floor(
                                          (0.4 + Math.random() * 0.6) * tailMinutes * 60 * 1000
                                      )
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
                        const details =
                            [
                                status ? `HTTP ${status}` : null,
                                code ? `code ${code}` : null,
                                message ?? null,
                            ]
                                .filter(Boolean)
                                .join(", ") || "unknown error";

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

                        const optimisticProgress = getOptimisticProgressSeconds(
                            liveQuest,
                            config.progressKey,
                            lastServerProgress,
                            secondsNeeded
                        );
                        const percent = getOptimisticPercent(
                            optimisticProgress,
                            liveProgress,
                            secondsNeeded
                        );

                        updateProgressBar(quest.id, userId, percent);

                        if (liveProgress >= secondsNeeded) {
                            if (updateTicker) clearInterval(updateTicker);
                            debugLog(
                                `${LOG_PREFIX} ${config.questType} quest completed on backend!`
                            );
                            const tailMinutes =
                                (settings.store as { playSessionTail?: number }).playSessionTail ??
                                2;
                            const tailMs =
                                tailMinutes > 0
                                    ? Math.floor(
                                          (0.4 + Math.random() * 0.6) * tailMinutes * 60 * 1000
                                      )
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

                // Nudge listeners to re-read RunningGameStore; the override persists until cleanup.
                const respoofInterval = setInterval(() => {
                    try {
                        if (completed || isPluginStopping) {
                            clearInterval(respoofInterval);
                            return;
                        }
                        dispatchGamesChange();
                    } catch (e) {
                        debugLog(`${LOG_PREFIX} Respoof error:`, e);
                    }
                }, 5000);
                cleanups.push(() => clearInterval(respoofInterval));
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
