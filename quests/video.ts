import { rateLimitedPost } from "../core/api";
import { LOG_PREFIX } from "../constants";
import { activeQuests, debugLog, getProgressBarKey, isPluginStopping } from "../core/state";
import { getWebpackModules, QuestsStore } from "../core/stores";
import { Quest, QUEST_TASK_TYPES, getTaskConfig, getQuestName } from "../core/types";
import { notify, completeQuestPill, updateQuestPill } from "../ui/notifications";
import { removeProgressBar, updateProgressBar } from "../ui/progressBar";
import { cleanupQuest } from "./manager";
import { initializeQuestProgressBar } from "./questProgress";

const MAX_VIDEO_ITERATIONS = 3600;
// Internal budgets (not user-configurable): each progress post is retried a
// few times, and only sustained failures abort the quest.
const VIDEO_POST_ATTEMPTS = 3;
const VIDEO_POST_RETRY_BASE_MS = 2000;
const MAX_CONSECUTIVE_VIDEO_ERRORS = 10;

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
    const maxFuture = 10;
    const speed = 7;
    const interval = 1;
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
    try {
        const modules = getWebpackModules();
        let apiModule: any = null;
        if (modules && modules.length > 0) {
            apiModule =
                modules.find((x: any) => x?.exports?.Bo?.get)?.exports?.Bo ||
                modules.find((x: any) => x?.exports?.tn?.get)?.exports?.tn ||
                modules.find((x: any) => x?.exports?.HTTP?.get)?.exports?.HTTP;
        }
        const postProgress = async (timestamp: number) => {
            let lastError: unknown = new Error("Video progress post failed");
            for (let attempt = 0; attempt < VIDEO_POST_ATTEMPTS; attempt++) {
                try {
                    if (apiModule) {
                        const res = await apiModule.post({
                            url: `/quests/${quest.id}/video-progress`,
                            body: { timestamp },
                        });
                        return res.body?.completed_at != null;
                    } else {
                        const res = await rateLimitedPost(`/quests/${quest.id}/video-progress`, {
                            timestamp,
                        });
                        return res?.completed_at != null;
                    }
                } catch (e) {
                    lastError = e;
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
            if (!questData || !questData.isProcessing || isPluginStopping) {
                removeProgressBar(quest.id, userId);
                return false;
            }
            const maxAllowed = Math.floor((Date.now() - enrolledAt) / 1000) + maxFuture;
            const diff = maxAllowed - secondsDone;
            const timestamp = secondsDone + speed;
            if (diff >= speed) {
                try {
                    completed = await postProgress(
                        Math.min(secondsNeeded, timestamp + Math.random())
                    );
                    consecutiveErrors = 0;
                    secondsDone = Math.min(secondsNeeded, timestamp);
                    const percent = Math.min(100, (secondsDone / secondsNeeded) * 100);
                    updateProgressBar(quest.id, userId, percent);
                    debugLog(`${LOG_PREFIX} Video progress: ${secondsDone}/${secondsNeeded}`);
                } catch (e) {
                    consecutiveErrors++;
                    console.warn(
                        `${LOG_PREFIX} Video progress error (${consecutiveErrors}/${MAX_CONSECUTIVE_VIDEO_ERRORS}):`,
                        e
                    );
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
            await new Promise((resolve) => setTimeout(resolve, interval * 1000));
        }
        if (!completed) {
            try {
                await postProgress(secondsNeeded);
            } catch (e) {
                console.warn(`${LOG_PREFIX} Final video progress error:`, e);
            }
        }
        updateProgressBar(quest.id, userId, 100);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const verifiedQuest = QuestsStore?.getQuest(quest.id);
        if (completed || verifiedQuest?.userStatus?.completedAt) {
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
