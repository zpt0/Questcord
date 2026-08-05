import { LOG_PREFIX } from "../constants";
import {
    activeQuests,
    cleanupFunctions,
    debugLog,
    getProgressBarKey,
    isPluginStopping,
} from "../core/state";
import { findFluxDispatcher, getWebpackModules, QuestsStore } from "../core/stores";
import { Quest, resolveApplicationId, resolveApplicationName, getQuestName } from "../core/types";
import { notify, completeQuestPill, updateQuestPill } from "../ui/notifications";
import { removeProgressBar, updateProgressBar } from "../ui/progressBar";
import { cleanupQuest } from "./manager";
import { initializeQuestProgressBar } from "./questProgress";

export interface DesktopQuestConfig {
    taskName: string;
    questType: string;
    progressKey: string;
    spoofLabel: string;
    defaultQuestName: string;
    getStoreModule: (modules: any[]) => any;
    spoofStore: (store: any, applicationId: string, pid: number) => { realFunc: any; fakeData: any };
    dispatchEvent: string;
    restoreStore: (store: any, realFunc: any) => void;
    getProgressFromQuest: (quest: Quest, lastFallback: number) => number;
    getProgressFromHeartbeat: (data: any, lastFallback: number) => number;
}

export async function completeDesktopQuest(
    quest: Quest,
    userId: string,
    config: DesktopQuestConfig
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
                const modules = getWebpackModules();
                if (!modules || modules.length === 0) {
                    notify("Error", "Webpack not available", "error", quest.id);
                    resolve(false);
                    return;
                }
                const storeLocal = config.getStoreModule(modules);
                const FluxDispatcherLocal = findFluxDispatcher();

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

                const { realFunc } = config.spoofStore(storeLocal, applicationId ?? "", pid);
                debugLog(
                    `${LOG_PREFIX} Spoofed ${config.questType}: ${resolvedName} (pid: ${pid}, id: ${applicationId ?? "MISSING"})`
                );

                let lastServerProgress = currentProgress;
                const startTime = Date.now();

                const updateTicker = setInterval(() => {
                    try {
                        const questData = activeQuests.get(key);
                        if (!questData || !questData.isProcessing || isPluginStopping) {
                            clearInterval(updateTicker);
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
                                : Math.min(99, Math.floor((estimatedProgress / secondsNeeded) * 100));

                        updateProgressBar(quest.id, userId, percent);

                        if (liveProgress >= secondsNeeded) {
                            clearInterval(updateTicker);
                            debugLog(`${LOG_PREFIX} ${config.questType} quest completed on backend!`);
                            config.restoreStore(storeLocal, realFunc);
                            FluxDispatcherLocal.unsubscribe(
                                "QUESTS_SEND_HEARTBEAT_SUCCESS",
                                heartbeatHandler
                            );
                            const questName = getQuestName(quest, config.defaultQuestName);
                            completeQuestPill(quest.id, `${questName} Completed!`, "success");
                            cleanupQuest(quest.id, userId);
                            resolve(true);
                        }
                    } catch (e) {
                        debugLog(`${LOG_PREFIX} updateTicker error:`, e);
                    }
                }, 1000);

                const heartbeatHandler = (data: any) => {
                    try {
                        const questData = activeQuests.get(key);
                        if (!questData || !questData.isProcessing || isPluginStopping) {
                            clearInterval(updateTicker);
                            config.restoreStore(storeLocal, realFunc);
                            FluxDispatcherLocal.unsubscribe(
                                "QUESTS_SEND_HEARTBEAT_SUCCESS",
                                heartbeatHandler
                            );
                            removeProgressBar(quest.id, userId);
                            resolve(false);
                            return;
                        }

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
                            clearInterval(updateTicker);
                            debugLog(`${LOG_PREFIX} Quest completed!`);
                            config.restoreStore(storeLocal, realFunc);
                            FluxDispatcherLocal.unsubscribe(
                                "QUESTS_SEND_HEARTBEAT_SUCCESS",
                                heartbeatHandler
                            );
                            const questName = getQuestName(quest, config.defaultQuestName);
                            completeQuestPill(quest.id, `${questName} Completed!`, "success");
                            cleanupQuest(quest.id, userId);
                            resolve(true);
                        }
                    } catch (e) {
                        console.error(`${LOG_PREFIX} Heartbeat handler error:`, e);
                    }
                };

                FluxDispatcherLocal.subscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", heartbeatHandler);
                const cleanups = cleanupFunctions.get(key) || [];
                cleanups.push(() => {
                    try {
                        clearInterval(updateTicker);
                        config.restoreStore(storeLocal, realFunc);
                        FluxDispatcherLocal.unsubscribe(
                            "QUESTS_SEND_HEARTBEAT_SUCCESS",
                            heartbeatHandler
                        );
                    } catch (e) {
                        debugLog(`${LOG_PREFIX} Cleanup error:`, e);
                    }
                });
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
                resolve(false);
            }
        })();
    });
}
