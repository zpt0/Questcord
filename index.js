import { jsx as _jsx } from "react/jsx-runtime";
import "./styles.css";
import { DataStore } from "@api/index";
import definePlugin from "@utils/types";
import { showUpdateModal } from "./components/UpdateModal";
import { QuestSettings } from "./components/Settings";
import { PLUGIN_VERSION, UPDATE_CHECK_URL, UPDATE_CHECK_ENABLED } from "./constants";
import { compareVersions } from "./core/utils";
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
import { settings } from "./settings";
let updateCheckInterval = null;
async function checkForUpdates() {
    if (!UPDATE_CHECK_ENABLED) return;
    if (!settings.store.showUpdateNotifications) return;
    try {
        debugLog("[Questcord] Checking for updates...");
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(UPDATE_CHECK_URL, {
            signal: controller.signal,
            headers: {
                Accept: "application/vnd.github.v3+json",
            },
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
            console.error(`[Questcord] GitHub API returned status: ${response.status}`);
            return;
        }
        const data = await response.json();
        let latestVersion = data.tag_name || data.name || "";
        latestVersion = latestVersion.replace(/^v/i, "").trim();
        if (!latestVersion) {
            console.error("[Questcord] No valid version found in GitHub response");
            return;
        }
        const comparison = compareVersions(latestVersion, PLUGIN_VERSION);
        if (comparison > 0) {
            const dismissedVersion = await DataStore.get("Questcord-dismissed-version");
            if (dismissedVersion !== latestVersion) {
                const releaseNotes = data.body || "No release notes available.";
                showUpdateModal(latestVersion, releaseNotes);
            }
        }
    } catch (error) {
        if (error.name === "AbortError") {
            console.error("[Questcord] Update check timed out");
        } else {
            console.error("[Questcord] Update check error:", error);
        }
    }
}
function cleanupAll() {
    debugLog("[Questcord] Running full cleanup...");
    setPluginStopping(true);
    const questEntries = Array.from(activeQuests.entries());
    questEntries.forEach(([key, _]) => {
        const parsed = parseProgressBarKey(key);
        if (parsed) {
            try {
                cancelQuest(parsed.questId, parsed.userId);
            } catch (error) {}
        }
    });
    activeQuests.clear();
    progressBars.forEach((bar) => {
        try {
            bar.remove();
        } catch (error) {}
    });
    progressBars.clear();
    cleanupFunctions.forEach((cleanups) => {
        cleanups.forEach((fn) => {
            try {
                fn();
            } catch (error) {}
        });
    });
    cleanupFunctions.clear();
    cleanupQuestButtonObserver();
    cleanupAllPills();
    debugLog("[Questcord] Cleanup completed");
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
    settingsAboutComponent: () => _jsx(QuestSettings, {}),
    start() {
        initDebug(settings.store);
        debugLog(`[Questcord] Plugin started - v${PLUGIN_VERSION}`);
        setPluginStopping(false);
        setTimeout(() => {
            if (initializeStores()) {
                setupQuestButtonObserver();
                debugLog("[Questcord] Ready!");
                setTimeout(() => {
                    checkAndResumeQuests().catch((err) => {
                        console.warn("[Questcord] Resume check failed:", err);
                    });
                }, 3000);
                setTimeout(() => {
                    checkForUpdates().catch((err) => {});
                }, 5000);
                updateCheckInterval = setInterval(
                    () => {
                        checkForUpdates().catch((err) => {});
                    },
                    30 * 60 * 1000
                );
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
        debugLog("[Questcord] Plugin stopping...");
        if (updateCheckInterval) {
            clearInterval(updateCheckInterval);
            updateCheckInterval = null;
        }
        cleanupAll();
    },
});
