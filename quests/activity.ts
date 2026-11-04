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

import { rateLimitedPost } from "../core/api";
import { LOG_PREFIX } from "../constants";
import { activeQuests, debugLog, getProgressBarKey, isPluginStopping } from "../core/state";
import { ChannelStore, GuildChannelStore } from "../core/stores";
import { Quest, getTaskConfig, getQuestName } from "../core/types";
import { safeTimeout } from "../core/utils";
import { settings } from "../settings";
import { notify, completeQuestPill, updateQuestPill } from "../ui/notifications";
import { removeProgressBar, updateProgressBar } from "../ui/progressBar";
import { cleanupQuest } from "./manager";
import { initializeQuestProgressBar } from "./questProgress";
import { bypassAchievementInActivity } from "./achievementBypass";
import { emitCompanionEvent, COMPANION_EVENT_CODES } from "../core/events";
import { taskControlRegistry } from "./taskControl";

const MAX_ACTIVITY_ITERATIONS = 3600;
const MAX_TIME = 25 * 60 * 1000; // 25 minute hard cap

const MAX_CONSECUTIVE_HEARTBEAT_ERRORS = 5;
const HEARTBEAT_RETRY_BASE_DELAY_MS = 2000;
const TERMINAL_HEARTBEAT_ATTEMPTS = 3;
const TERMINAL_HEARTBEAT_RETRY_DELAY_MS = 2000;

// Helper to read progress from both Map and object formats
function readProgress(userStatus: any, key: string): number {
    const p = userStatus?.progress;
    const entry = p instanceof Map ? p.get(key) : p?.[key];
    return entry?.value ?? userStatus?.streamProgressSeconds ?? 0;
}

export async function completeActivityQuest(quest: Quest, userId: string): Promise<boolean> {
    const taskConfig = getTaskConfig(quest);
    const taskName = taskConfig?.tasks?.PLAY_ACTIVITY ? "PLAY_ACTIVITY" : "ACHIEVEMENT_IN_ACTIVITY";
    const targetNeeded = taskConfig?.tasks?.[taskName]?.target;

    if (taskName === "ACHIEVEMENT_IN_ACTIVITY") {
        if (settings.store.enableAchievementBypass) {
            debugLog(`${LOG_PREFIX} Attempting achievement bypass for ${quest.id}`);
            emitCompanionEvent({
                code: COMPANION_EVENT_CODES.BYPASS_STARTED,
                category: "bypass",
                level: "info",
                message: `Achievement bypass started for "${getQuestName(quest)}"`,
                questId: quest.id,
                questName: getQuestName(quest),
                taskType: taskName,
            });
            const success = await bypassAchievementInActivity(quest);
            if (success) {
                const questName = getQuestName(quest, "Activity Quest");
                emitCompanionEvent({
                    code: COMPANION_EVENT_CODES.BYPASS_SUCCEEDED,
                    category: "bypass",
                    level: "success",
                    message: `Achievement bypass succeeded for "${questName}"`,
                    questId: quest.id,
                    questName,
                    taskType: taskName,
                });
                notify("Achievement Complete", `${questName} completed via bypass`, "success", quest.id);
                return true;
            }
            emitCompanionEvent({
                code: COMPANION_EVENT_CODES.BYPASS_FAILED,
                category: "bypass",
                level: "error",
                message: `Achievement bypass failed for "${getQuestName(quest)}"`,
                questId: quest.id,
                questName: getQuestName(quest),
                taskType: taskName,
            });
            notify("Bypass Failed", "Achievement bypass failed. Check console for details.", "error", quest.id);
            return false;
        }
        notify(
            "Unsupported Quest",
            "This quest requires completing in-game achievements. Enable 'Achievement Bypass' in settings to attempt automation.",
            "error",
            quest.id
        );
        return false;
    }
    if (!targetNeeded || targetNeeded <= 0) {
        notify("Error", "Invalid quest configuration", "error", quest.id);
        return false;
    }
    const questName = getQuestName(quest, "Activity Quest");
    updateQuestPill(quest.id, `Completing: ${questName}`, 0);
    initializeQuestProgressBar(quest.id, userId);
    try {
        const privateChannels = ChannelStore.getSortedPrivateChannels();
        const guilds = Object.values(GuildChannelStore.getAllGuilds() ?? {}) as any[];
        const channelId =
            privateChannels?.[0]?.id ??
            guilds.find((x: any) => x != null && x.VOCAL?.length > 0)?.VOCAL?.[0]?.channel?.id;
        if (!channelId) {
            notify("Quest Error", "No voice channel found", "error", quest.id);
            removeProgressBar(quest.id, userId);
            cleanupQuest(quest.id, userId);
            return false;
        }
        const streamKey = `call:${channelId}:1`;
        const key = getProgressBarKey(quest.id, userId);
        const heartbeatMode =
            (settings.store as { activityHeartbeat?: string }).activityHeartbeat ?? "fast";
        const [minInterval, maxInterval] =
            heartbeatMode === "official"
                ? [58, 62]
                : heartbeatMode === "balanced"
                  ? [18, 22]
                  : [0.8, 1.5];
        let iterations = 0;
        let consecutiveErrors = 0;
        let cur = readProgress(quest.userStatus, taskName);
        const startTime = Date.now();

        emitCompanionEvent({
            code: COMPANION_EVENT_CODES.TASK_STARTED,
            category: "task",
            level: "info",
            message: `Started ${taskName} task for "${questName}".`,
            questId: quest.id,
            questName,
            taskType: taskName,
        });

        let control = taskControlRegistry.get(quest.id);
        if (!control) {
            control = taskControlRegistry.create(quest.id);
        }
        const generation = control.generation;
        taskControlRegistry.markStarted(quest.id, generation);
        const signal = taskControlRegistry.signalFor(quest.id, generation);

        while (iterations++ < MAX_ACTIVITY_ITERATIONS) {
            const questData = activeQuests.get(key);
            if (!questData || !questData.isProcessing || isPluginStopping) {
                removeProgressBar(quest.id, userId);
                return false;
            }
            if (!taskControlRegistry.isActive(quest.id, generation)) {
                removeProgressBar(quest.id, userId);
                return false;
            }
            if (Date.now() - startTime > MAX_TIME) {
                debugLog(`${LOG_PREFIX} Activity quest timed out after 25m`);
                notify("Quest Timeout", "Activity quest timed out after 25 minutes", "error", quest.id);
                cleanupQuest(quest.id, userId);
                return false;
            }
            try {
                const res = await rateLimitedPost(`/quests/${quest.id}/heartbeat`, {
                    stream_key: streamKey,
                    terminal: false,
                }, () => taskControlRegistry.isActive(quest.id, generation), signal ?? undefined);
                consecutiveErrors = 0;
                const reported = res?.progress?.[taskName]?.value ?? res?.progress?.PLAY_ACTIVITY?.value;
                if (typeof reported === "number") {
                    cur = reported;
                }
                const percent =
                    targetNeeded > 0
                        ? Math.min(99, Math.floor((cur / targetNeeded) * 100))
                        : 0;
                updateProgressBar(quest.id, userId, percent);

                emitCompanionEvent({
                    code: COMPANION_EVENT_CODES.HEARTBEAT_SUCCESS,
                    category: "network",
                    level: "info",
                    message: `Activity progress: ${cur}/${targetNeeded}`,
                    questId: quest.id,
                    questName,
                    taskType: taskName,
                });

                if (cur >= targetNeeded) {
                    for (let attempt = 0; attempt < TERMINAL_HEARTBEAT_ATTEMPTS; attempt++) {
                        try {
                            await rateLimitedPost(`/quests/${quest.id}/heartbeat`, {
                                stream_key: streamKey,
                                terminal: true,
                            }, () => taskControlRegistry.isActive(quest.id, generation), signal ?? undefined);
                            break;
                        } catch (e) {
                            if (attempt >= TERMINAL_HEARTBEAT_ATTEMPTS - 1) {
                                console.warn(
                                    `${LOG_PREFIX} Terminal heartbeat failed (quest may still be complete):`,
                                    e
                                );
                            } else {
                                await new Promise((resolve) =>
                                    setTimeout(resolve, TERMINAL_HEARTBEAT_RETRY_DELAY_MS)
                                );
                            }
                        }
                    }
                    break;
                }
            } catch (e) {
                consecutiveErrors++;
                if (consecutiveErrors >= MAX_CONSECUTIVE_HEARTBEAT_ERRORS) {
                    emitCompanionEvent({
                        code: COMPANION_EVENT_CODES.HEARTBEAT_GIVE_UP,
                        category: "network",
                        level: "error",
                        message: `Activity heartbeat gave up after ${consecutiveErrors} failures`,
                        questId: quest.id,
                        questName,
                        taskType: taskName,
                    });
                    notify("Quest Error", "Failed to complete activity", "error", quest.id);
                    removeProgressBar(quest.id, userId);
                    cleanupQuest(quest.id, userId);
                    return false;
                }
                emitCompanionEvent({
                    code: COMPANION_EVENT_CODES.HEARTBEAT_FAILURE,
                    category: "network",
                    level: "warning",
                    message: `Activity heartbeat failed (${consecutiveErrors}/${MAX_CONSECUTIVE_HEARTBEAT_ERRORS})`,
                    questId: quest.id,
                    questName,
                    taskType: taskName,
                });
                debugLog(
                    `${LOG_PREFIX} Activity heartbeat failed (${consecutiveErrors}/${MAX_CONSECUTIVE_HEARTBEAT_ERRORS}), retrying…`,
                    e
                );
                const backoffMs =
                    HEARTBEAT_RETRY_BASE_DELAY_MS * consecutiveErrors +
                    Math.floor(Math.random() * 500);
                await new Promise((resolve) => setTimeout(resolve, backoffMs));
                continue;
            }
            const dynamicInterval = minInterval + Math.random() * (maxInterval - minInterval);
            const shouldContinue = await taskControlRegistry.waitForDelay(quest.id, generation, dynamicInterval * 1000);
            if (!shouldContinue) {
                removeProgressBar(quest.id, userId);
                return false;
            }
        }
        updateProgressBar(quest.id, userId, 100);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        emitCompanionEvent({
            code: COMPANION_EVENT_CODES.TASK_COMPLETED,
            category: "task",
            level: "success",
            message: `Activity quest "${questName}" completed!`,
            questId: quest.id,
            questName,
            taskType: taskName,
        });
        completeQuestPill(quest.id, `${questName} Completed!`, "success");
        taskControlRegistry.release(quest.id, generation);
        cleanupQuest(quest.id, userId);
        return true;
    } catch (e) {
        console.error(`${LOG_PREFIX} Activity quest error:`, e);
        const errMsg = e instanceof Error ? e.message : String(e);
        emitCompanionEvent({
            code: COMPANION_EVENT_CODES.TASK_FAILED,
            category: "task",
            level: "error",
            message: `Activity quest "${questName}" failed: ${errMsg}`,
            questId: quest.id,
            questName,
            taskType: taskName,
        });
        notify("Quest Error", "Failed to complete activity", "error", quest.id);
        removeProgressBar(quest.id, userId);
        cleanupQuest(quest.id, userId);
        return false;
    }
}
