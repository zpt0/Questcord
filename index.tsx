import "./styles.css";
import { DataStore } from "@api/index";
import definePlugin from "@utils/types";
import { showUpdateModal } from "./components/UpdateModal";
import { QuestSettings } from "./components/Settings";
import { PLUGIN_VERSION, UPDATE_CHECK_URL, UPDATE_CHECK_ENABLED, LOG_PREFIX } from "./constants";
import { checkForUpdate } from "./core/utils";
import { initializeStores } from "./core/stores";
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
import { cancelQuest, checkAndResumeQuests } from "./quests/manager";
import { startStallWatchdog, stopStallWatchdog } from "./core/watchdog";
import { settings } from "./settings";

let updateCheckInterval: ReturnType<typeof setInterval> | null = null;

async function checkForUpdates(): Promise<void> {
    if (!UPDATE_CHECK_ENABLED) return;
    if (!settings.store.showUpdateNotifications) return;
    debugLog(`${LOG_PREFIX} Checking for updates...`);
    const result = await checkForUpdate(PLUGIN_VERSION, UPDATE_CHECK_URL, 10000);
    if (result.error) {
        console.error(`${LOG_PREFIX} Update check failed: ${result.error}`);
        return;
    }
    if (result.updateAvailable && result.latestVersion) {
        const dismissedVersion = await DataStore.get("Questcord-dismissed-version");
        if (dismissedVersion !== result.latestVersion) {
            showUpdateModal(
                result.latestVersion,
                result.releaseNotes || "No release notes available."
            );
        }
    }
}

function cleanupAll() {
    debugLog(`${LOG_PREFIX} Running full cleanup...`);
    setPluginStopping(true);
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
    settingsAboutComponent: () => <QuestSettings />,
    start() {
        initDebug(settings.store);
        debugLog(`${LOG_PREFIX} Plugin started - v${PLUGIN_VERSION}`);
        setPluginStopping(false);

        setTimeout(() => {
            if (initializeStores()) {
                setupQuestButtonObserver();
                debugLog(`${LOG_PREFIX} Ready!`);
                setTimeout(() => {
                    checkAndResumeQuests().catch((err) => {
                        console.warn(`${LOG_PREFIX} Resume check failed:`, err);
                    });
                }, 3000);
                setTimeout(() => {
                    checkForUpdates().catch((e) => {
                        debugLog(`${LOG_PREFIX} Update check error:`, e);
                    });
                }, 5000);
                updateCheckInterval = setInterval(
                    () => {
                        checkForUpdates().catch((e) => {
                            debugLog(`${LOG_PREFIX} Periodic update check error:`, e);
                        });
                    },
                    30 * 60 * 1000
                );
                startStallWatchdog();
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
        if (updateCheckInterval) {
            clearInterval(updateCheckInterval);
            updateCheckInterval = null;
        }
        stopStallWatchdog();
        cleanupAll();
    },
});
