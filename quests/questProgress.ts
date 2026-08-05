import { settings } from "../settings";
import { createProgressBar, getDiscordProgressPercent, updateProgressBar } from "../ui/progressBar";

/** Initialize progress bar for a quest if settings allow */
export function initializeQuestProgressBar(questId: string, userId: string): void {
    if (!settings.store.showProgressBar) return;
    createProgressBar(questId, userId);
    setTimeout(() => {
        const initialPercent = getDiscordProgressPercent(questId);
        if (initialPercent !== null) {
            updateProgressBar(questId, userId, initialPercent);
        }
    }, 100);
}
