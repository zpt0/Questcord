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

import { disableStyle, enableStyle } from "@api/Styles";
import foundationManagedStyle from "./foundation/ui/styles.css?managed";
import questcordStyle from "./styles.css?managed";
import { findGroupChildrenByChildId, type NavContextMenuPatchCallback } from "@api/ContextMenu";
import definePlugin from "@utils/types";
import { Menu } from "@webpack/common";
import { QuestcordUnifiedSettings } from "./components/UnifiedSettings";
import { PLUGIN_VERSION } from "./constants";
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
    isPluginStopping,
    progressBars,
    setPluginStopping,
} from "./core/state";
import { cancelManagedTimeout, scheduleManagedTimeout } from "./core/ownership";
import { cleanupAllPills, notify } from "./ui/notifications";
import {
    cleanupQuestVideoDismiss,
    noteQuestEnrollment,
    resetQuestEnrollmentGuard,
    setupQuestVideoAutoDismiss,
    tryDismissQuestVideo,
} from "./ui/questVideoDismiss";
import { renderFooter, renderQueueButton, renderQuestButton } from "./ui/patches";
import { t } from "./ui/i18n";
import {
    cancelAll,
    cancelQuest,
    checkAndResumeQuests,
    isRunning,
    resetResume,
    retryConsentSkipped,
    retryOrbFilterSkipped,
    startQuest,
} from "./quests/manager";
import { scheduleTick, startQueue, stopQueue, toggleQueued } from "./quests/queue/runner";
import { isQueueable } from "./quests/queue/order";
import { addToQueue, isQueued, unloadQueue } from "./quests/queue/store";
import { DEFAULT_STALL_TIMEOUT_MS, startStallWatchdog, stopStallWatchdog } from "./core/watchdog";
import { definition, settings } from "./settings";
import { patchManifest } from "./patches";
import { startRuntime, stopRuntime } from "./pluginRuntime";
import { initializeTraffic, setTrafficEngineRunning, clearTrafficQueue } from "./core/api";
import { taskControlRegistry } from "./quests/taskControl";
import { getScheduler } from "./quests/scheduler";
import { emitCompanionEvent, COMPANION_EVENT_CODES } from "./core/events";
import { createSettingsMonitor } from "./foundation";
import { createScopedLogger } from "./foundation/core/logging";
import {
    startAutoClaim,
    stopAutoClaim,
    resetClaimRuntime,
    claimQuest,
    canClaimQuest,
} from "./quests/claim";
import {
    startAutoEnroll,
    stopAutoEnroll,
    refreshAutoEnroll,
    resetAutoEnrollRuntime,
    clearEnrollmentBlockForQuest,
} from "./quests/autoEnroll";
import {
    resetConsoleGeneration,
    stopConsoleTracking,
    maybeAutoStartConsole,
    startConsoleTracking,
    isConsoleTask,
} from "./quests/consoleTracking";
import { loadStats, resetStatsLoaded } from "./core/history";
import { getEventQuestId } from "./core/questLogic";

const log = createScopedLogger("index");

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
    scheduleManagedTimeout(() => {
        pendingEnrollmentWake = false;
        if (settings.store.watchForEnrollments && !isAnyRunning()) {
            debugLog(`Quest enrollment detected, starting engine`);
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
        log.warn(`Could not mount Vencord style root:`, err);
    }
}

function consoleTaskName(quest: Quest): string | null {
    const tasks = quest.config?.taskConfigV2?.tasks ?? quest.config?.taskConfig?.tasks ?? {};
    return Object.keys(tasks).find(isConsoleTask) ?? null;
}

function maybeStartConsoleQuests(): void {
    if ((settings.store as { consoleQuestMode?: string }).consoleQuestMode !== "auto") return;
    let quests: unknown[];
    try {
        const result = QuestsStore?.getQuests?.();
        quests = Array.isArray(result)
            ? result
            : result && typeof result === "object"
              ? Object.values(result as Record<string, unknown>)
              : [];
    } catch {
        return;
    }
    for (const quest of quests) {
        if (!quest || typeof quest !== "object") continue;
        const candidate = quest as Quest;
        const task = consoleTaskName(candidate);
        if (task) maybeAutoStartConsole(candidate, task);
    }
}

const questMenuPatch: NavContextMenuPatchCallback = (children, props: { quest?: Quest }) => {
    const quest = props?.quest;
    if (!quest) return;

    const items: any[] = [];
    if (isQueueable(quest)) {
        items.push(
            <Menu.MenuItem
                id="vc-questcord-queue-toggle"
                label={isQueued(quest.id) ? t("removeFromQueue") : t("addToQueue")}
                action={() => toggleQueued(quest.id, quest)}
            />
        );
    }
    if (
        consoleTaskName(quest) &&
        (settings.store as { consoleQuestMode?: string }).consoleQuestMode !== "off"
    ) {
        items.push(
            <Menu.MenuItem
                id="vc-questcord-console-track"
                label="Track console quest"
                action={() => void startConsoleTracking(quest.id)}
            />
        );
    }
    if (
        (settings.store as { rewardClaimMode?: string }).rewardClaimMode === "manual" &&
        canClaimQuest(quest.id)
    ) {
        items.push(
            <Menu.MenuItem
                id="vc-questcord-claim-reward"
                label="Claim reward"
                action={() => {
                    void claimQuest(quest.id, { manual: true }).then((result) => {
                        notify(
                            result === "claimed" || result === "already-claimed"
                                ? "Reward claimed"
                                : "Claim not completed",
                            result === "claimed"
                                ? "Quest reward claimed in Discord."
                                : `Claim result: ${result}`,
                            result === "claimed" ? "success" : "info"
                        );
                    });
                }}
            />
        );
    }
    if (items.length === 0) return;

    const group = findGroupChildrenByChildId(MENU_ANCHORS, children);
    if (!group) return;

    const anchorIndex = MENU_ANCHORS.map((id) =>
        group.findIndex((child: any) => child?.props?.id === id)
    ).find((index) => index >= 0);
    const anchor = anchorIndex ?? group.length - 1;
    group.splice(anchor + 1, 0, ...items);
};

export function leaveAccount() {
    debugLog(`Account switch: leaving ${getOwner() ?? "unknown"}`);
    stopQueue();
    unloadQueue();
    cancelAll();
    taskControlRegistry.cancelAll();
    taskControlRegistry.clear();
    cleanupAllPills();
    resetResume();
    getScheduler().clear();
    stopAutoClaim();
    stopAutoEnroll();
    resetConsoleGeneration();
    resetStatsLoaded();
    setOwner(null);
}

export async function enterAccount(userId: string) {
    debugLog(`Account switch: entering ${userId}`);

    // Clear pending enrollment wake from previous account
    clearEnrollmentWake();

    if (knownAccountId && knownAccountId !== userId) {
        debugLog(`Account changed from ${knownAccountId} to ${userId}`);
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

    // Account-scoped feature runtimes: fresh generation so old requests can't touch this account.
    resetClaimRuntime();
    resetAutoEnrollRuntime();
    resetConsoleGeneration();
    void loadStats();
    if (settings.store.rewardClaimMode === "auto") startAutoClaim();
    if (settings.store.autoEnrollQuests === true) startAutoEnroll();

    // Wait for stores to be initialized before starting queue to avoid race condition
    await waitForStores();
    void startQueue().then(() => scheduleTick());

    if (settings.store.autoStart) {
        scheduleManagedTimeout(() => {
            if (!isAnyRunning()) {
                debugLog(`Auto-starting engine`);
                void startQueue().then(() => scheduleTick());
            }
        }, 1000);
    }
}

function cleanupAll() {
    debugLog(`Running full cleanup...`);
    setPluginStopping(true);
    stopQueue();
    const questEntries = Array.from(activeQuests.entries());
    questEntries.forEach(([key]) => {
        const parsed = parseProgressBarKey(key);
        if (parsed) {
            try {
                cancelQuest(parsed.questId, parsed.userId);
            } catch (e) {
                debugLog(`Cancel quest error during cleanup:`, e);
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
                debugLog(`Cleanup function error:`, e);
            }
        });
    });
    cleanupFunctions.clear();
    cleanupQuestVideoDismiss();
    resetQuestEnrollmentGuard();
    cleanupAllPills();
    debugLog(`Cleanup completed`);
}

let previousSettingValues: Record<string, unknown> = {};

/** Vencord has no onSettingChange hook, so this is driven by the foundation settings monitor. */
function handleSettingChange(key: string, value: unknown): void {
    debugLog(`Setting changed: ${key}`);

    if (key === "orbQuestsOnly" && value === false) {
        const restored = retryOrbFilterSkipped();
        if (restored > 0) {
            debugLog(`Orb-only filter disabled, restored ${restored} quest(s)`);
            notify("Orb Filter Off", `${restored} quest(s) re-added to queue`, "info");
            void startQueue().then(() => scheduleTick());
        }
    }
    if (key === "enableAchievementBypass" && value === true) {
        const restored = retryConsentSkipped();
        if (restored > 0) {
            debugLog(`Achievement bypass enabled, restored ${restored} quest(s)`);
            notify("Achievement Bypass On", `${restored} quest(s) re-added to queue`, "info");
            void startQueue().then(() => scheduleTick());
        }
    }
    if (key === "rewardClaimMode") {
        if (value === "auto") startAutoClaim();
        else stopAutoClaim();
    }
    if (key === "autoEnrollQuests") {
        if (value === true) startAutoEnroll();
        else stopAutoEnroll();
    }
    if (key === "consoleQuestMode") {
        if (value === "off") stopConsoleTracking();
        else if (value === "auto") maybeStartConsoleQuests();
    }
}

function monitorSettingChanges(scope: import("./foundation").ResourceScope): void {
    previousSettingValues = { ...(settings.store as unknown as Record<string, unknown>) };
    createSettingsMonitor(scope, definition, {
        // The foundation runtime already owns "settings:Questcord".
        id: "settings-observer:Questcord",
        onChange(change) {
            const previous = previousSettingValues;
            previousSettingValues = { ...change.values };
            for (const [key, value] of Object.entries(change.values)) {
                if (previous[key] === value) continue;
                try {
                    handleSettingChange(key, value);
                } catch (e) {
                    log.warn(`Setting change handler failed for ${key}:`, e);
                }
            }
        },
    });
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
    managedStyle: foundationManagedStyle,
    settingsAboutComponent: () => <QuestcordUnifiedSettings />,
    patches: patchManifest.toVencordPatches("Questcord"),
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
            maybeStartConsoleQuests();
            refreshAutoEnroll();
            void checkAndResumeQuests()
                .catch((err) => {
                    log.warn(`Resume check failed:`, err);
                })
                .finally(() => scheduleTick());
        },
        QUESTS_ENROLL_SUCCESS() {
            noteQuestEnrollment();
            // The popup can already be mounted before enrollment succeeds, so a
            // DOM-mutation observer alone will not necessarily run again.
            scheduleManagedTimeout(
                () => {
                    tryDismissQuestVideo();
                },
                300,
                "dismiss",
                "dismiss:after-enroll"
            );
            scheduleEnrollmentWake();
        },
        QUESTS_SELECT_TASK_PLATFORM(data: unknown) {
            // Discord emits this when the user switches Desktop/Console in the
            // quest modal. Re-evaluate the quest so the chosen platform is used.
            const questId = getEventQuestId(data);
            if (questId) {
                clearEnrollmentBlockForQuest(questId);
                if (isRunning(questId)) {
                    const userId = currentUserId();
                    if (userId) cancelQuest(questId, userId);
                    addToQueue(questId);
                }
                debugLog(`Task platform selected for ${questId}; re-evaluating quest`);
                refreshAutoEnroll();
            }
            scheduleTick(250);
        },
    },
    start() {
        enableStyle(questcordStyle);
        void startRuntime((scope) => {
            ensureStyleRootMounted();
            initDebug(settings.store);
            debugLog(`Plugin started - v${PLUGIN_VERSION}`);
            setPluginStopping(false);
            resetResume();
            monitorSettingChanges(scope);

            // popup dismissal must not depend on the lazy quest-store discovery below
            setupQuestVideoAutoDismiss();

            // discord fills its quest stores lazily, so the resume check runs staged with retries
            scheduleManagedTimeout(
                () => {
                    if (initializeStores()) {
                        // Initialize Traffic queue with Discord's API client
                        initializeTraffic(API);
                        setTrafficEngineRunning(true);

                        setOwner(currentUserId(), { storeMayBeLoaded: true });
                        knownAccountId = currentUserId();
                        onStoresReady(); // Signal that stores are ready for queue operations
                        debugLog(`Ready!`);

                        // Owner must be set first: stats/retry stores are account-scoped.
                        void loadStats();
                        if (settings.store.rewardClaimMode === "auto") startAutoClaim();
                        if (settings.store.autoEnrollQuests === true) startAutoEnroll();
                        maybeStartConsoleQuests();

                        // Wait for QuestStore to load first; an empty store looks like "all done"
                        const waitForQuests = async () => {
                            const maxWait = 25000;
                            const start = Date.now();
                            while (!isPluginStopping && Date.now() - start < maxWait) {
                                const store = QuestsStore;
                                if (store && typeof store.getQuests === "function") {
                                    const quests = store.getQuests();
                                    if (quests && Object.keys(quests).length > 0) {
                                        debugLog(
                                            `Quest list arrived after ${Date.now() - start}ms, ${Object.keys(quests).length} quest(s)`
                                        );
                                        break;
                                    }
                                }
                                await new Promise((r) => setTimeout(r, 200));
                            }
                            // Even if empty, don't treat as "all completed" - just proceed
                            debugLog(`Proceeding with engine start`);
                        };

                        void waitForQuests().then(() => {
                            if (isPluginStopping) return;
                            void startQueue();
                            scheduleManagedTimeout(
                                () => {
                                    void checkAndResumeQuests()
                                        .catch((err) => {
                                            log.warn(`Resume check failed:`, err);
                                        })
                                        .finally(() => scheduleTick());
                                },
                                3000,
                                "startup",
                                "startup:resume"
                            );
                        });

                        lateResume = scheduleManagedTimeout(
                            () => {
                                void checkAndResumeQuests()
                                    .catch(() => {})
                                    .finally(() => scheduleTick());
                            },
                            10_000,
                            "startup",
                            "startup:late-resume"
                        );
                        startStallWatchdog(DEFAULT_STALL_TIMEOUT_MS, {
                            shouldAutoRestart: () => settings.store.autoRestartStalled === true,
                            onRestart: (questId: string) => {
                                const data = [...activeQuests.values()].find(
                                    (d) => d.questId === questId
                                );
                                if (!data || !data.isProcessing) return;
                                const userId = data.userId;
                                cancelQuest(questId, userId);
                                scheduleManagedTimeout(
                                    () => {
                                        startQuest(questId).catch((err) => {
                                            log.warn(`Stall restart failed:`, err);
                                        });
                                    },
                                    1000,
                                    "watchdog",
                                    `watchdog:restart:${questId}`
                                );
                            },
                        });
                    } else {
                        notify(
                            "Initialization Failed",
                            "Could not initialize quest stores. Please reload Discord.",
                            "error"
                        );
                    }
                },
                2000,
                "startup",
                "startup:initialize"
            );
        });
    },
    stop() {
        disableStyle(questcordStyle);
        return stopRuntime(() => {
            debugLog(`Plugin stopping...`);
            stopAutoClaim();
            stopAutoEnroll();
            resetConsoleGeneration();
            cancelManagedTimeout(lateResume);
            lateResume = undefined;
            stopStallWatchdog();
            setTrafficEngineRunning(false);
            clearTrafficQueue();
            taskControlRegistry.cancelAll();
            taskControlRegistry.clear();
            cleanupAll();
            setOwner(null);
        });
    },
});
