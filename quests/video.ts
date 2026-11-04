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
import { getWebpackModules, QuestsStore } from "../core/stores";
import { Quest, QUEST_TASK_TYPES, getTaskConfig, getQuestName } from "../core/types";
import { notify, completeQuestPill, updateQuestPill } from "../ui/notifications";
import { removeProgressBar, updateProgressBar } from "../ui/progressBar";
import { cleanupQuest } from "./manager";
import { initializeQuestProgressBar } from "./questProgress";
import { emitCompanionEvent, COMPANION_EVENT_CODES } from "../core/events";

const MAX_VIDEO_ITERATIONS = 3600;
const MAX_CONSECUTIVE_VIDEO_ERRORS = 10;
const MAX_TIME = 25 * 60 * 1000; // 25 minute hard cap

const rnd = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min;

export async function completeVideoQuest(quest: Quest, userId: string): Promise<boolean> {
    const taskConfig = getTaskConfig(quest);
    const taskName = (QUEST_TASK_TYPES.VIDEO as readonly string[]).find(
        (x) => taskConfig?.tasks?.[x] != null
    );
    if (!taskName) {
        notify("Error", "Invalid video quest configuration", "error", quest.id);
        return false;
    }
    const secondsNeeded = taskConfig!.tasks[taskName].target;
    if (!secondsNeeded || secondsNeeded <= 0) {
        notify("Error", "Invalid quest duration", "error", quest.id);
        return false;
    }
    const freshQuest = QuestsStore?.getQuest(quest.id);
    if (freshQuest?.userStatus?.completedAt) {
        notify("Already Completed", "This quest was already completed!", "info", quest.id);
        return true;
    }
    let secondsDone = quest.userStatus?.progress?.[taskName]?.value ?? 0;
    const enrolledAtRaw = quest.userStatus?.enrolledAt;
    const enrolledAt = enrolledAtRaw ? new Date(enrolledAtRaw).getTime() : Date.now();
    if (isNaN(enrolledAt)) {
        console.warn(`${LOG_PREFIX} Invalid enrolledAt, using current time`);
    }
    let completed = false;
    const key = getProgressBarKey(quest.id, userId);
    const questName = getQuestName(quest, "Video Quest");
    updateQuestPill(quest.id, `Spoofing video for ${questName}`, 0);
    initializeQuestProgressBar(quest.id, userId);

    emitCompanionEvent({
        code: COMPANION_EVENT_CODES.TASK_STARTED,
        category: "task",
        level: "info",
        message: `Started ${taskName} task for "${questName}".`,
        questId: quest.id,
        questName,
        taskType: taskName,
    });

    try {
        let iterations = 0;
        let consecutiveErrors = 0;
        const startTime = Date.now();
        while (iterations++ < MAX_VIDEO_ITERATIONS) {
            const questData = activeQuests.get(key);
            if (!questData || !questData.isProcessing || isPluginStopping) {
                removeProgressBar(quest.id, userId);
                return false;
            }
            if (Date.now() - startTime > MAX_TIME) {
                debugLog(`${LOG_PREFIX} Video quest timed out after 25m`);
                notify("Quest Timeout", "Video quest timed out after 25 minutes", "error", quest.id);
                cleanupQuest(quest.id, userId);
                return false;
            }
            const maxAllowed = Math.floor((Date.now() - enrolledAt) / 1000) + 10;
            const diff = maxAllowed - secondsDone;
            const timestamp = secondsDone + 7;
            if (diff >= 7) {
                try {
                    completed = await rateLimitedPost(`/quests/${quest.id}/video-progress`, {
                        timestamp: Math.min(secondsNeeded, timestamp + Math.random()),
                    });
                    consecutiveErrors = 0;
                    secondsDone = Math.min(secondsNeeded, timestamp);
                    const percent = Math.min(100, (secondsDone / secondsNeeded) * 100);
                    updateProgressBar(quest.id, userId, percent);
                    debugLog(`${LOG_PREFIX} Video progress: ${secondsDone}/${secondsNeeded}`);

                    emitCompanionEvent({
                        code: COMPANION_EVENT_CODES.HEARTBEAT_SUCCESS,
                        category: "network",
                        level: "info",
                        message: `Video progress: ${secondsDone}/${secondsNeeded}`,
                        questId: quest.id,
                        questName,
                        taskType: taskName,
                    });
                } catch (e) {
                    consecutiveErrors++;
                    console.warn(
                        `${LOG_PREFIX} Video progress error (${consecutiveErrors}/${MAX_CONSECUTIVE_VIDEO_ERRORS}):`,
                        e
                    );
                    emitCompanionEvent({
                        code: COMPANION_EVENT_CODES.HEARTBEAT_FAILURE,
                        category: "network",
                        level: "warning",
                        message: `Video progress failed (${consecutiveErrors}/${MAX_CONSECUTIVE_VIDEO_ERRORS})`,
                        questId: quest.id,
                        questName,
                        taskType: taskName,
                    });
                    if (consecutiveErrors >= MAX_CONSECUTIVE_VIDEO_ERRORS) {
                        notify(
                            "Quest Error",
                            "Video progress keeps failing. Your progress was likely saved - try again later.",
                            "error",
                            quest.id
                        );
                        cleanupQuest(quest.id, userId);
                        return false;
                    }
                }
            }
            if (timestamp >= secondsNeeded) break;
            // Discord's player cadence: 7-9.5s (matches official client)
            await new Promise((resolve) => setTimeout(resolve, rnd(7000, 9500)));
        }
        if (!completed) {
            try {
                await rateLimitedPost(`/quests/${quest.id}/video-progress`, {
                    timestamp: secondsNeeded,
                });
            } catch (e) {
                console.warn(`${LOG_PREFIX} Final video progress error:`, e);
            }
        }
        updateProgressBar(quest.id, userId, 100);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const verifiedQuest = QuestsStore?.getQuest(quest.id);
        if (completed || verifiedQuest?.userStatus?.completedAt) {
            emitCompanionEvent({
                code: COMPANION_EVENT_CODES.TASK_COMPLETED,
                category: "task",
                level: "success",
                message: `Video quest "${questName}" completed!`,
                questId: quest.id,
                questName,
                taskType: taskName,
            });
            completeQuestPill(quest.id, `${questName} Completed!`, "success");
            cleanupQuest(quest.id, userId);
            return true;
        } else {
            notify(
                "Progress Saved",
                "Try clicking Auto Complete again to finish.",
                "info",
                quest.id
            );
            cleanupQuest(quest.id, userId);
            return false;
        }
    } catch (error: any) {
        console.error(`${LOG_PREFIX} Video quest error:`, error);
        emitCompanionEvent({
            code: COMPANION_EVENT_CODES.TASK_FAILED,
            category: "task",
            level: "error",
            message: `Video quest "${questName}" failed: ${error?.message}`,
            questId: quest.id,
            questName,
            taskType: taskName,
        });
        notify(
            "Quest Error",
            "An error occurred. Your progress was likely saved - try again.",
            "error",
            quest.id
        );
        cleanupQuest(quest.id, userId);
        return false;
    }
}
