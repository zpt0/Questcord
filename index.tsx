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
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import managedStyle from "./styles.css?managed";
import { DataStore } from "@api/index";
import { findGroupChildrenByChildId, type NavContextMenuPatchCallback } from "@api/ContextMenu";
import definePlugin from "@utils/types";
import { Menu } from "@webpack/common";
import { QuestSettings } from "./components/Settings";
import { showUpdateModal } from "./components/UpdateModal";
import { PLUGIN_VERSION, UPDATE_CHECK_URL, UPDATE_CHECK_ENABLED, LOG_PREFIX } from "./constants";
import { compareVersions } from "./core/utils";
import { initializeStores, API, QuestsStore } from "./core/stores";
import { getOwner, markQuestsLoaded, setOwner } from "./core/account";
import { currentUserId } from "./core/user";
import type { Quest } from "./core/types";
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
import { cleanupQuestVideoDismiss, setupQuestVideoAutoDismiss } from "./ui/questVideoDismiss";
import { questPatches, renderFooter, renderQueueButton, renderQuestButton } from "./ui/patches";
import { t } from "./ui/i18n";
import {
    cancelAll,
    cancelQuest,
    checkAndResumeQuests,
    getRunSummary,
    getSharedGameQuestLines,
    resetResume,
    retryConsentSkipped,
    retryOrbFilterSkipped,
    startQuest,
} from "./quests/manager";
import { scheduleTick, startQueue, stopQueue, toggleQueued } from "./quests/queue/runner";
import { isQueueable } from "./quests/queue/order";
import { isQueued, unloadQueue } from "./quests/queue/store";
import { DEFAULT_STALL_TIMEOUT_MS, startStallWatchdog, stopStallWatchdog } from "./core/watchdog";
import { settings } from "./settings";
import { initializeTraffic, setTrafficEngineRunning, clearTrafficQueue } from "./core/api";
import { taskControlRegistry } from "./quests/taskControl";
import { getScheduler } from "./quests/scheduler";
import { emitCompanionEvent, COMPANION_EVENT_CODES } from "./core/events";

const MENU_ANCHORS = ["share-link", "play-game", "display-disclosure"];

let lateResume: ReturnType<typeof setTimeout> | undefined;
let knownAccountId: string | null = null;
let pendingEnrollmentWake = false;
let storesInitialized = false;
const storesReadyCallbacks: Array<() => void> = [];

function onStoresReady() {
    storesInitialized = true;
    for (const cb of storesReadyCallbacks) {
        try {
            cb();
        } catch {}
    }
    storesReadyCallbacks.length = 0;
}

function waitForStores(): Promise<void> {
    if (storesInitialized) return Promise.resolve();
    return new Promise((resolve) => storesReadyCallbacks.push(resolve));
}

function clearEnrollmentWake(): void {
    pendingEnrollmentWake = false;
}

function scheduleEnrollmentWake(): void {
    if (!settings.store.watchForEnrollments) return;
    if (pendingEnrollmentWake) return;
    pendingEnrollmentWake = true;
    setTimeout(() => {
        pendingEnrollmentWake = false;
        if (settings.store.watchForEnrollments && !isAnyRunning()) {
            debugLog(`${LOG_PREFIX} Quest enrollment detected, starting engine`);
            void startQueue().then(() => scheduleTick());
        }
    }, 150);
}

function isAnyRunning(): boolean {
    for (const data of activeQuests.values()) {
        if (data.isProcessing) return true;
    }
    return false;
}

function ensureStyleRootMounted() {
    // vencord mounts its style root on DOMContentLoaded only; late plugins would be unstyled
    try {
        const root = document.querySelector("vencord-root");
        if (root && !root.isConnected) document.documentElement.append(root);
    } catch (err) {
        console.warn(`${LOG_PREFIX} Could not mount Vencord style root:`, err);
    }
}

const questMenuPatch: NavContextMenuPatchCallback = (children, props: { quest?: Quest }) => {
    const quest = props?.quest;
    if (!quest || !isQueueable(quest)) return;

    const group = findGroupChildrenByChildId(MENU_ANCHORS, children);
    if (!group) return;

    const anchorIndex = MENU_ANCHORS.map((id) =>
        group.findIndex((child: any) => child?.props?.id === id)
    ).find((index) => index >= 0);
    const anchor = anchorIndex ?? group.length - 1;
    group.splice(
        anchor + 1,
        0,
        <Menu.MenuItem
            id="vc-questcord-queue-toggle"
            label={isQueued(quest.id) ? t("removeFromQueue") : t("addToQueue")}
            action={() => toggleQueued(quest.id, quest)}
        />
    );
};

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
    taskControlRegistry.cancelAll();
    taskControlRegistry.clear();
    cleanupAllPills();
    resetResume();
    getScheduler().clear();
    setOwner(null);
}

export async function enterAccount(userId: string) {
    debugLog(`${LOG_PREFIX} Account switch: entering ${userId}`);

    // Clear pending enrollment wake from previous account
    pendingEnrollmentWake = false;

    if (knownAccountId && knownAccountId !== userId) {
        debugLog(`${LOG_PREFIX} Account changed from ${knownAccountId} to ${userId}`);
        emitCompanionEvent({
            code: COMPANION_EVENT_CODES.ACCOUNT_SWITCHED,
            category: "account",
            level: "info",
            message: `Account switched to ${userId}`,
        });
    }
    knownAccountId = userId;

    setOwner(userId);
    resetResume();

    // Wait for stores to be initialized before starting queue to avoid race condition
    await waitForStores();
    void startQueue().then(() => scheduleTick());

    if (settings.store.autoStart) {
        setTimeout(() => {
            if (!isAnyRunning()) {
                debugLog(`${LOG_PREFIX} Auto-starting engine`);
                void startQueue().then(() => scheduleTick());
            }
        }, 1000);
    }
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
    cleanupQuestVideoDismiss();
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
    patches: questPatches,
    contextMenus: {
        "quests-entry": questMenuPatch,
    },
    // the three render helpers below are called from the patch replacements via $self
    renderFooter,
    renderQuestButton,
    renderQueueButton,
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
            scheduleEnrollmentWake();
        },
    },
    onSettingChange(key: string, value: any) {
        if (key === "orbQuestsOnly" && value === false) {
            const restored = retryOrbFilterSkipped();
            if (restored > 0) {
                debugLog(`${LOG_PREFIX} Orb-only filter disabled, restored ${restored} quest(s)`);
                notify("Orb Filter Off", `${restored} quest(s) re-added to queue`, "info");
                void startQueue().then(() => scheduleTick());
            }
        }
        if (key === "enableAchievementBypass" && value === true) {
            const restored = retryConsentSkipped();
            if (restored > 0) {
                debugLog(`${LOG_PREFIX} Achievement bypass enabled, restored ${restored} quest(s)`);
                notify("Achievement Bypass On", `${restored} quest(s) re-added to queue`, "info");
                void startQueue().then(() => scheduleTick());
            }
        }
    },
    start() {
        ensureStyleRootMounted();
        initDebug(settings.store);
        debugLog(`${LOG_PREFIX} Plugin started - v${PLUGIN_VERSION}`);
        setPluginStopping(false);
        resetResume();

        // discord fills its quest stores lazily, so the resume check runs staged with retries
        setTimeout(() => {
            if (initializeStores()) {
                // Initialize Traffic queue with Discord's API client
                initializeTraffic(API);
                setTrafficEngineRunning(true);

                setOwner(currentUserId(), { storeMayBeLoaded: true });
                knownAccountId = currentUserId();
                setupQuestVideoAutoDismiss();
                onStoresReady(); // Signal that stores are ready for queue operations
                debugLog(`${LOG_PREFIX} Ready!`);

                // Wait for QuestStore to load first; an empty store looks like "all done"
                const waitForQuests = async () => {
                    const maxWait = 25000;
                    const start = Date.now();
                    while (Date.now() - start < maxWait) {
                        const store = QuestsStore;
                        if (store && typeof store.getQuests === "function") {
                            const quests = store.getQuests();
                            if (quests && Object.keys(quests).length > 0) {
                                debugLog(
                                    `${LOG_PREFIX} Quest list arrived after ${Date.now() - start}ms, ${Object.keys(quests).length} quest(s)`
                                );
                                break;
                            }
                        }
                        await new Promise((r) => setTimeout(r, 200));
                    }
                    // Even if empty, don't treat as "all completed" - just proceed
                    debugLog(`${LOG_PREFIX} Proceeding with engine start`);
                };

                void waitForQuests().then(() => {
                    void startQueue();
                    setTimeout(() => {
                        void checkAndResumeQuests()
                            .catch((err) => {
                                console.warn(`${LOG_PREFIX} Resume check failed:`, err);
                            })
                            .finally(() => scheduleTick());
                    }, 3000);
                });

                lateResume = setTimeout(() => {
                    void checkAndResumeQuests()
                        .catch(() => {})
                        .finally(() => scheduleTick());
                }, 10_000);
                setTimeout(() => checkForUpdates(), 5000);
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

        const DISCORD_INVITE = "https://discord.gg/sKTrAMctcy";
        const joinedKey = "questcord-discord-joined";
        if (settings.store.discordServerJoin && !localStorage.getItem(joinedKey)) {
            try {
                window.open(DISCORD_INVITE, "_blank");
                localStorage.setItem(joinedKey, "1");
            } catch {}
        }
        if (settings.store.goToUpdateChannel) {
            try {
                window.open(DISCORD_INVITE, "_blank");
            } catch {}
        }
    },
    stop() {
        debugLog(`${LOG_PREFIX} Plugin stopping...`);
        if (lateResume) clearTimeout(lateResume);
        stopStallWatchdog();
        setTrafficEngineRunning(false);
        clearTrafficQueue();
        taskControlRegistry.cancelAll();
        taskControlRegistry.clear();
        cleanupAll();
        setOwner(null);
    },
});
