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
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { RestAPI } from "@webpack/common";
import { activeQuests, debugLog, getProgressBarKey, isPluginStopping } from "../core/state";
import { QuestsStore } from "../core/stores";
import { Quest, QUEST_TASK_TYPES, getTaskConfig, getQuestName } from "../core/types";
import { getErrorStatus, isTerminalQuestError, TerminalQuestError } from "../core/questLogic";
import { notify, completeQuestPill, updateQuestPill } from "../ui/notifications";
import { removeProgressBar, updateProgressBar } from "../ui/progressBar";
import { cleanupQuest } from "./manager";
import { initializeQuestProgressBar } from "./questProgress";
import { createScopedLogger } from "../foundation/core/logging";

const log = createScopedLogger("quests/video");

const MAX_VIDEO_ITERATIONS = 3600;
const VIDEO_POST_ATTEMPTS = 3;
const VIDEO_POST_RETRY_BASE_MS = 2000;
const MAX_CONSECUTIVE_VIDEO_ERRORS = 5;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function responseBody(response: unknown): Record<string, unknown> | null {
    if (!isRecord(response)) return null;
    if (isRecord(response.body)) return response.body;
    if (isRecord(response.response) && isRecord(response.response.body)) {
        return response.response.body;
    }
    return null;
}

function responseStatusRecord(body: Record<string, unknown>): Record<string, unknown> | null {
    for (const key of ["user_status", "userStatus", "quest_user_status", "questUserStatus"]) {
        if (isRecord(body[key])) return body[key] as Record<string, unknown>;
    }
    if (isRecord(body.quest)) return responseStatusRecord(body.quest);
    return null;
}

function finiteNumber(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getResponseProgress(response: unknown, taskName: string): number | null {
    const body = responseBody(response);
    if (!body) return null;
    const status = responseStatusRecord(body) ?? body;
    const progress = status.progress ?? body.progress;
    if (!isRecord(progress) || !isRecord(progress[taskName])) return null;
    return finiteNumber((progress[taskName] as Record<string, unknown>).value);
}

function getResponseCompleted(response: unknown): boolean {
    const body = responseBody(response);
    if (!body) return false;
    const status = responseStatusRecord(body) ?? body;
    for (const record of [status, body]) {
        if (record.completed_at != null || record.completedAt != null) return true;
    }
    return false;
}

function summarizeError(error: unknown): string {
    return `status=${getErrorStatus(error) ?? "?"} body=${JSON.stringify(
        (error as any)?.body ?? (error as any)?.response?.body ?? (error as any)?.message ?? ""
    ).slice(0, 300)}`;
}

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

    let progress = quest.userStatus?.progress?.[taskName]?.value ?? 0;
    let submittedProgress = progress;
    // Discord only credits progress near real elapsed time; trickle it in small steps.
    const maxFuture = 10;
    const speed = 7;
    const enrolledAtRaw = quest.userStatus?.enrolledAt;
    const enrolledAt = enrolledAtRaw ? new Date(enrolledAtRaw).getTime() : Date.now();
    if (isNaN(enrolledAt)) log.warn("Invalid enrolledAt, using current time");

    let completed = false;
    const key = getProgressBarKey(quest.id, userId);
    const questName = getQuestName(quest, "Video Quest");
    updateQuestPill(quest.id, `Spoofing video for ${questName}`, 0);
    initializeQuestProgressBar(quest.id, userId);

    try {
        const postProgress = async (timestamp: number): Promise<unknown> => {
            let lastError: unknown = new Error("Video progress post failed");
            for (let attempt = 0; attempt < VIDEO_POST_ATTEMPTS; attempt++) {
                try {
                    return await RestAPI.post({
                        url: `/quests/${quest.id}/video-progress`,
                        body: { timestamp },
                    });
                } catch (error) {
                    lastError = error;
                    if (isTerminalQuestError(error)) {
                        throw new TerminalQuestError(
                            `Discord rejected video progress for ${questName}: ${summarizeError(error)}`
                        );
                    }
                    if (attempt < VIDEO_POST_ATTEMPTS - 1) {
                        const backoffMs =
                            VIDEO_POST_RETRY_BASE_MS * (attempt + 1) +
                            Math.floor(Math.random() * 500);
                        await new Promise((resolve) => setTimeout(resolve, backoffMs));
                    }
                }
            }
            throw lastError;
        };

        let iterations = 0;
        let consecutiveErrors = 0;
        while (iterations++ < MAX_VIDEO_ITERATIONS) {
            const questData = activeQuests.get(key);
            if (!questData?.isProcessing || isPluginStopping) {
                removeProgressBar(quest.id, userId);
                return false;
            }

            const refreshed = QuestsStore?.getQuest(quest.id);
            if (refreshed?.userStatus?.completedAt) {
                completed = true;
                break;
            }
            if (refreshed) {
                const refreshedProgress = finiteNumber(
                    refreshed.userStatus?.progress?.[taskName]?.value
                );
                if (refreshedProgress != null) progress = Math.max(progress, refreshedProgress);
                if (progress >= secondsNeeded) break;
            }

            const maxAllowed = Math.max(
                submittedProgress,
                Math.floor((Date.now() - enrolledAt) / 1000) + maxFuture
            );
            const timestamp = Math.min(
                secondsNeeded,
                maxAllowed,
                submittedProgress + speed + Math.random()
            );
            if (timestamp <= submittedProgress + 0.01) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
                continue;
            }

            try {
                const response = await postProgress(timestamp);
                consecutiveErrors = 0;
                submittedProgress = Math.max(submittedProgress, timestamp);
                const responseProgress = getResponseProgress(response, taskName);
                if (responseProgress != null) progress = Math.max(progress, responseProgress);
                if (getResponseCompleted(response)) completed = true;
                progress = Math.min(secondsNeeded, Math.max(progress, submittedProgress));
                updateProgressBar(quest.id, userId, (progress / secondsNeeded) * 100);
                debugLog(`Video progress: ${Math.floor(progress)}/${secondsNeeded}`);
                if (completed || progress >= secondsNeeded) break;
            } catch (error) {
                consecutiveErrors++;
                log.warn(
                    `Video progress error (${consecutiveErrors}/${MAX_CONSECUTIVE_VIDEO_ERRORS}): ${summarizeError(error)}`
                );
                if (
                    error instanceof TerminalQuestError ||
                    consecutiveErrors >= MAX_CONSECUTIVE_VIDEO_ERRORS
                ) {
                    notify(
                        "Quest Error",
                        error instanceof TerminalQuestError
                            ? error.message
                            : "Discord kept rejecting video progress. Please accept the quest again manually.",
                        "error",
                        quest.id
                    );
                    cleanupQuest(quest.id, userId);
                    return false;
                }
                await new Promise((resolve) => setTimeout(resolve, 3000));
                continue;
            }

            await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        if (!completed) {
            try {
                const response = await postProgress(secondsNeeded);
                if (getResponseCompleted(response)) completed = true;
            } catch (error) {
                log.warn(`Final video progress error: ${summarizeError(error)}`);
            }
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
        const verifiedQuest = QuestsStore?.getQuest(quest.id);
        if (completed || verifiedQuest?.userStatus?.completedAt) {
            completeQuestPill(quest.id, `${questName} Completed!`, "success");
            cleanupQuest(quest.id, userId);
            return true;
        }

        notify(
            "Progress Saved",
            "Discord has not confirmed completion yet. Try Auto Complete again shortly.",
            "info",
            quest.id
        );
        cleanupQuest(quest.id, userId);
        return false;
    } catch (error) {
        log.error(`Video quest error: ${summarizeError(error)}`);
        notify(
            "Quest Error",
            error instanceof TerminalQuestError
                ? error.message
                : "Video automation failed. Your progress may still be saved - try again.",
            "error",
            quest.id
        );
        cleanupQuest(quest.id, userId);
        return false;
    }
}
