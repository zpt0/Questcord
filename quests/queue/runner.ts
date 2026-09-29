import { LOG_PREFIX } from "../../constants";
import { accountReady } from "../../core/account";
import { debugLog } from "../../core/state";
import { QuestsStore } from "../../core/stores";
import { getQuestName, type Quest } from "../../core/types";
import { UserStore } from "@webpack/common";
import { suppressConsole, restoreConsole } from "../../core/utils";
import { settings } from "../../settings";
import { notify } from "../../ui/notifications";
import {
    acceptQuestById,
    cancelQuest,
    isAutoStarted,
    isRunning,
    onSessionEnded,
    startQuest,
} from "../manager";
import {
    describeEntry,
    getQuestName as getName,
    pickNext,
    pickToAccept,
    type QueuePreference,
    type QueueRow,
} from "./order";
import {
    addToQueue,
    getEntries,
    isQueued,
    isQueueEnabled,
    loadQueue,
    removeFromQueue,
    setAccepting,
    setQueueEnabled as setQueueEnabledStore,
    subscribe,
} from "./store";

const SETTLE_MS = 1500;
const ACCEPT_SPACING_MS = 2000;

let active = false;
let busy = false;
let accepting = false;
let hadWork = false;
let acceptPausedUntil = 0;
const pausedIds = new Set<string>();
let pending: ReturnType<typeof setTimeout> | undefined;
let unsubscribers: Array<() => void> = [];

export const getPreference = (): QueuePreference =>
    (settings.store as { queuePreference?: string }).queuePreference === "games"
        ? "games"
        : "videos";
export { isQueueEnabled };

function safeGetQuest(questId: string): Quest | undefined {
    try {
        if (!QuestsStore) return undefined;
        const orig = suppressConsole("log", "warn", "error");
        try {
            return QuestsStore.getQuest?.(questId) ?? undefined;
        } finally {
            restoreConsole(orig);
        }
    } catch {
        return undefined;
    }
}

export function getRows(): QueueRow[] {
    return getEntries().map((entry) =>
        describeEntry(entry, safeGetQuest(entry.questId), isRunning(entry.questId))
    );
}

export function scheduleTick(delay = 0) {
    if (!active) return;
    clearTimeout(pending);
    pending = setTimeout(() => void tick(), delay);
}

export function setQueueEnabled(enabled: boolean) {
    setQueueEnabledStore(enabled);
    if (enabled) {
        scheduleTick();
        return;
    }
    clearTimeout(pending);
    for (const row of getRows()) {
        if (row.state !== "running" || !isAutoStarted(row.entry.questId)) continue;
        pausedIds.add(row.entry.questId);
        try {
            const userId = UserStore.getCurrentUser()?.id;
            if (userId) cancelQuest(row.entry.questId, userId);
        } catch {
            // Fallback: cancel via running entry lookup happens on next tick.
        }
        pausedIds.delete(row.entry.questId);
    }
}

async function acceptPending() {
    if (accepting) return;
    accepting = true;
    try {
        while (active && isQueueEnabled()) {
            if (Date.now() < acceptPausedUntil) return;
            const row = pickToAccept(getRows(), getPreference());
            if (!row?.quest) return;
            const { questId } = row.entry;
            setAccepting(questId, true);
            const result = await acceptQuestById(questId);
            setAccepting(questId, false);
            if (!result.ok) {
                notify(
                    "Couldn't accept quest",
                    `${getQuestName(row.quest)}: ${result.reason ?? "failed"}`,
                    "error"
                );
                if (result.retryAt) {
                    acceptPausedUntil = result.retryAt;
                    scheduleTick(Math.max(0, result.retryAt - Date.now()) + 1000);
                    return;
                }
                removeFromQueue(questId);
            }
            await new Promise((r) => setTimeout(r, ACCEPT_SPACING_MS));
        }
    } finally {
        accepting = false;
    }
}

async function tick() {
    if (!active || busy || !isQueueEnabled() || !accountReady()) return;
    busy = true;
    try {
        for (const row of getRows()) {
            if (row.state === "unavailable") removeFromQueue(row.entry.questId);
        }
        void acceptPending();
        const rows = getRows();
        if (rows.some((r) => r.state === "running")) return;
        const next = pickNext(rows, getPreference());
        if (!next) {
            if (hadWork && getEntries().length === 0) {
                hadWork = false;
                notify("All done", "The queue is empty.", "success");
            }
            return;
        }
        hadWork = true;
        notify("Queue", `Now running: ${getName(next.quest!)}`, "info");
        const result = await startQuest(next.entry.questId, {
            toggle: false,
            prompt: false,
            auto: true,
        });
        if (result === "invalid" || result === "conflict") {
            if (result === "invalid") removeFromQueue(next.entry.questId);
            scheduleTick(SETTLE_MS);
        }
    } catch (e) {
        debugLog(`${LOG_PREFIX} Queue tick failed:`, e);
    } finally {
        busy = false;
    }
}

export async function startQueue() {
    stopQueue();
    active = true;
    hadWork = false;
    acceptPausedUntil = 0;
    await loadQueue();
    if (!active) return;
    unsubscribers = [
        subscribe(() => scheduleTick()),
        onSessionEnded((session) => {
            if (!pausedIds.has(session.id)) removeFromQueue(session.id);
            scheduleTick(SETTLE_MS);
        }),
    ];
    scheduleTick();
}

export function stopQueue() {
    active = false;
    pausedIds.clear();
    clearTimeout(pending);
    unsubscribers.forEach((u) => {
        try {
            u();
        } catch {}
    });
    unsubscribers = [];
}

export function toggleQueued(questId: string, quest?: Quest) {
    const name = quest ? getQuestName(quest) : questId;
    if (isQueued(questId)) {
        removeFromQueue(questId);
        notify("Queue", `${name} removed`, "info");
        return;
    }
    addToQueue(questId);
    notify("Queue", `${name} added`, "info");
}
