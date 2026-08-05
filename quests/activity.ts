import { rateLimitedPost } from "../core/api";
import { LOG_PREFIX } from "../constants";
import { activeQuests, getProgressBarKey, isPluginStopping } from "../core/state";
import { ChannelStore, GuildChannelStore } from "../core/stores";
import { Quest, getTaskConfig, getQuestName } from "../core/types";
import { safeTimeout } from "../core/utils";
import { notify, completeQuestPill, updateQuestPill } from "../ui/notifications";
import { removeProgressBar, updateProgressBar } from "../ui/progressBar";
import { cleanupQuest } from "./manager";
import { initializeQuestProgressBar } from "./questProgress";

const MAX_ACTIVITY_ITERATIONS = 3600;

export async function completeActivityQuest(quest: Quest, userId: string): Promise<boolean> {
    const taskConfig = getTaskConfig(quest);
    const taskName = taskConfig?.tasks?.PLAY_ACTIVITY ? "PLAY_ACTIVITY" : "ACHIEVEMENT_IN_ACTIVITY";
    const targetNeeded = taskConfig?.tasks?.[taskName]?.target;
    if (taskName === "ACHIEVEMENT_IN_ACTIVITY") {
        notify(
            "Unsupported Quest",
            "This quest requires completing in-game achievements. It cannot be automated.",
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
        const minInterval = 0.8;
        const maxInterval = 1.5;
        let iterations = 0;
        while (iterations++ < MAX_ACTIVITY_ITERATIONS) {
            const questData = activeQuests.get(key);
            if (!questData || !questData.isProcessing || isPluginStopping) {
                removeProgressBar(quest.id, userId);
                return false;
            }
            try {
                const res = await rateLimitedPost(`/quests/${quest.id}/heartbeat`, {
                    stream_key: streamKey,
                    terminal: false,
                });
                const progress = res?.progress?.[taskName]?.value ?? 0;
                const percent = targetNeeded > 0 ? Math.min(99, Math.floor((progress / targetNeeded) * 100)) : 0;
                updateProgressBar(quest.id, userId, percent);
                if (progress >= targetNeeded) {
                    try {
                        await rateLimitedPost(`/quests/${quest.id}/heartbeat`, {
                            stream_key: streamKey,
                            terminal: true,
                        });
                    } catch (e) {
                        console.warn(`${LOG_PREFIX} Terminal heartbeat failed (quest may still be complete):`, e);
                    }
                    break;
                }
            } catch {
                notify("Quest Error", "Failed to complete activity", "error", quest.id);
                removeProgressBar(quest.id, userId);
                cleanupQuest(quest.id, userId);
                return false;
            }
            const dynamicInterval = minInterval + Math.random() * (maxInterval - minInterval);
            await new Promise((resolve) =>
                safeTimeout(resolve as () => void, dynamicInterval * 1000, quest.id, userId)
            );
        }
        updateProgressBar(quest.id, userId, 100);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        completeQuestPill(quest.id, `${questName} Completed!`, "success");
        cleanupQuest(quest.id, userId);
        return true;
    } catch (e) {
        console.error(`${LOG_PREFIX} Activity quest error:`, e);
        notify("Quest Error", "Failed to complete activity", "error", quest.id);
        removeProgressBar(quest.id, userId);
        cleanupQuest(quest.id, userId);
        return false;
    }
}
