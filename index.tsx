import managedStyle from "./styles.css?managed";
import { DataStore } from "@api/index";
import definePlugin from "@utils/types";
import { QuestSettings } from "./components/Settings";
import { navigateToUpdatesChannel, showUpdateModal } from "./components/UpdateModal";
import { PLUGIN_VERSION, UPDATE_CHECK_URL, UPDATE_CHECK_ENABLED, LOG_PREFIX } from "./constants";
import { compareVersions } from "./core/utils";
import { initializeStores } from "./core/stores";
import { getOwner, markQuestsLoaded, setOwner } from "./core/account";
import { currentUserId } from "./core/user";
import {
    activeQuests,
    cleanupFunctions,
    debugLog,
    initDebug,
    parseProgressBarKey,
    progressBars,
    setPluginStopping,
} from "./core/state";
import { cleanupAllPills, notify } from "./ui/notifications";
import { cleanupQuestButtonObserver, setupQuestButtonObserver } from "./ui/questButtons";
import {
    cancelAll,
    cancelQuest,
    checkAndResumeQuests,
    resetResume,
    startQuest,
} from "./quests/manager";
import { scheduleTick, startQueue, stopQueue } from "./quests/queue/runner";
import { unloadQueue } from "./quests/queue/store";
import { DEFAULT_STALL_TIMEOUT_MS, startStallWatchdog, stopStallWatchdog } from "./core/watchdog";
import { settings } from "./settings";

let lateResume: ReturnType<typeof setTimeout> | undefined;

async function checkForUpdates(): Promise<void> {
    if (!UPDATE_CHECK_ENABLED) return;
    if (!settings.store.showUpdateNotifications) return;

    try {
        const lastDismissed = (await DataStore.get("Questcord-dismissed-version")) as
            string | undefined;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(UPDATE_CHECK_URL, {
            signal: controller.signal,
            headers: { Accept: "application/vnd.github.v3+json" },
        });

        clearTimeout(timeoutId);

        if (!response.ok) return;

        const data = await response.json();
        let latestVersion = data.tag_name || data.name || "";
        latestVersion = latestVersion.replace(/^v/i, "").trim();

        if (!latestVersion) return;

        const comparison = compareVersions(latestVersion, PLUGIN_VERSION);

        if (comparison > 0 && lastDismissed !== latestVersion) {
            const releaseNotes = data.body || "No release notes available.";
            showUpdateModal(latestVersion, releaseNotes);
        }
    } catch {}
}

export function leaveAccount() {
    debugLog(`${LOG_PREFIX} Account switch: leaving ${getOwner() ?? "unknown"}`);
    stopQueue();
    unloadQueue();
    cancelAll();
    cleanupAllPills();
    resetResume();
    setOwner(null);
}

export function enterAccount(userId: string) {
    debugLog(`${LOG_PREFIX} Account switch: entering ${userId}`);
    setOwner(userId);
    resetResume();
    void startQueue().then(() => scheduleTick());
}

function cleanupAll() {
    debugLog(`${LOG_PREFIX} Running full cleanup...`);
    setPluginStopping(true);
    stopQueue();
    const questEntries = Array.from(activeQuests.entries());
    questEntries.forEach(([key]) => {
        const parsed = parseProgressBarKey(key);
        if (parsed) {
            try {
                cancelQuest(parsed.questId, parsed.userId);
            } catch (e) {
                debugLog(`${LOG_PREFIX} Cancel quest error during cleanup:`, e);
            }
        }
    });
    activeQuests.clear();
    progressBars.forEach((bar) => {
        try {
            bar.remove();
        } catch {}
    });
    progressBars.clear();
    cleanupFunctions.forEach((cleanups) => {
        cleanups.forEach((fn) => {
            try {
                fn();
            } catch (e) {
                debugLog(`${LOG_PREFIX} Cleanup function error:`, e);
            }
        });
    });
    cleanupFunctions.clear();
    cleanupQuestButtonObserver();
    cleanupAllPills();
    debugLog(`${LOG_PREFIX} Cleanup completed`);
}

export default definePlugin({
    name: "Questcord",
    description: "Complete Discord quests with smart automation and real-time progress tracking",
    authors: [
        {
            id: 299670891875270656n,
            name: "zpt0.dev",
        },
    ],
    tags: ["Activity", "Utility", "Fun"],
    settings,
    managedStyle,
    settingsAboutComponent: () => <QuestSettings />,
    flux: {
        LOGOUT() {
            leaveAccount();
        },
        CONNECTION_OPEN({ user }: { user?: { id?: string } }) {
            const id = user?.id ?? currentUserId();
            if (id && id !== getOwner()) enterAccount(id);
        },
        QUESTS_FETCH_CURRENT_QUESTS_SUCCESS() {
            markQuestsLoaded();
            void checkAndResumeQuests()
                .catch((err) => {
                    console.warn(`${LOG_PREFIX} Resume check failed:`, err);
                })
                .finally(() => scheduleTick());
        },
        QUESTS_ENROLL_SUCCESS() {
            scheduleTick(500);
        },
    },
    start() {
        initDebug(settings.store);
        debugLog(`${LOG_PREFIX} Plugin started - v${PLUGIN_VERSION}`);
        setPluginStopping(false);
        resetResume();

        setTimeout(() => {
            if (initializeStores()) {
                setOwner(currentUserId(), { storeMayBeLoaded: true });
                setupQuestButtonObserver();
                debugLog(`${LOG_PREFIX} Ready!`);
                void startQueue();
                setTimeout(() => {
                    // Skip if account already resolved via flux; checkAndResumeQuests
                    // self-defers when no owner is set yet.
                    void checkAndResumeQuests()
                        .catch((err) => {
                            console.warn(`${LOG_PREFIX} Resume check failed:`, err);
                        })
                        .finally(() => scheduleTick());
                }, 3000);
                lateResume = setTimeout(() => {
                    void checkAndResumeQuests()
                        .catch(() => {})
                        .finally(() => scheduleTick());
                }, 10_000);
                setTimeout(() => checkForUpdates(), 5000);
                setTimeout(() => navigateToUpdatesChannel().catch(() => {}), 3000);
                startStallWatchdog(DEFAULT_STALL_TIMEOUT_MS, {
                    shouldAutoRestart: () => settings.store.autoRestartStalled === true,
                    onRestart: (questId: string) => {
                        const data = [...activeQuests.values()].find((d) => d.questId === questId);
                        if (!data || !data.isProcessing) return;
                        const userId = data.userId;
                        cancelQuest(questId, userId);
                        setTimeout(() => {
                            startQuest(questId).catch((err) => {
                                console.warn(`${LOG_PREFIX} Stall restart failed:`, err);
                            });
                        }, 1000);
                    },
                });
            } else {
                notify(
                    "Initialization Failed",
                    "Could not initialize quest stores. Please reload Discord.",
                    "error"
                );
            }
        }, 2000);
    },
    stop() {
        debugLog(`${LOG_PREFIX} Plugin stopping...`);
        if (lateResume) clearTimeout(lateResume);
        stopStallWatchdog();
        cleanupAll();
        setOwner(null);
    },
});
