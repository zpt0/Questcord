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

import { LOG_PREFIX } from "../../constants";
import { accountReady } from "../../core/account";
import { debugLog } from "../../core/state";
import { QuestsStore } from "../../core/stores";
import { getQuestName, type Quest } from "../../core/types";
import { UserStore } from "@webpack/common";
import { suppressConsole, restoreConsole } from "../../core/utils";
import { notify } from "../../ui/notifications";
import {
    acceptQuestById,
    cancelQuest,
    isAnyRunning,
    isAutoStarted,
    isRunning,
    onSessionEnded,
    startQuest,
} from "../manager";
import {
    describeEntry,
    pickNextOfKind,
    pickToAccept,
    type QueueKind,
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
// space out enroll calls or discord rate limits the whole queue
const ACCEPT_SPACING_MS = 2000;

let active = false;
let busy = false;
let accepting = false;
let hadWork = false;
let acceptPausedUntil = 0;
const pausedIds = new Set<string>();
const startingIds = new Set<string>();
const startingLanes = new Set<QueueKind>();
let pending: ReturnType<typeof setTimeout> | undefined;
let unsubscribers: Array<() => void> = [];

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
        // flag as paused so the session-end handler keeps it queued instead of dropping it
        pausedIds.add(row.entry.questId);
        try {
            const userId = UserStore.getCurrentUser()?.id;
            if (userId) cancelQuest(row.entry.questId, userId);
        } catch {}
        pausedIds.delete(row.entry.questId);
    }
}

async function acceptPending() {
    if (accepting) return;
    accepting = true;
    try {
        while (active && isQueueEnabled()) {
            if (Date.now() < acceptPausedUntil) return;
            // re-read rows after each accept so newly-ready quests are picked up
            const row = pickToAccept(getRows());
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

function startQueued(row: QueueRow): void {
    const questId = row.entry.questId;
    if (!row.kind || startingIds.has(questId) || startingLanes.has(row.kind)) return;

    startingIds.add(questId);
    startingLanes.add(row.kind);
    void startQuest(questId, {
        toggle: false,
        prompt: false,
        auto: true,
    })
        .then((result) => {
            if (result === "invalid") {
                removeFromQueue(questId);
                scheduleTick(SETTLE_MS);
            } else if (result === "conflict") {
                // The lane is still occupied. Say so once (notify dedupes) instead
                // of silently retrying every few seconds.
                notify(
                    "Quest waiting",
                    "Waiting for the current quest in this lane to finish.",
                    "info",
                    questId
                );
                scheduleTick(SETTLE_MS);
            } else if (result !== "started") {
                debugLog(`${LOG_PREFIX} Queued quest not started (${result}): ${questId}`);
                scheduleTick(SETTLE_MS);
            }
        })
        .catch((error) => {
            debugLog(`${LOG_PREFIX} Queued quest failed:`, error);
            scheduleTick(SETTLE_MS);
        })
        .finally(() => {
            startingIds.delete(questId);
            if (row.kind) startingLanes.delete(row.kind);
        });
}

async function tick() {
    if (!active || busy || !isQueueEnabled() || !accountReady()) return;
    busy = true;
    try {
        // remove unavailable entries first
        for (const row of getRows()) {
            if (row.state === "unavailable") removeFromQueue(row.entry.questId);
        }

        // accept any pending quests first, then re-read rows to see if they became ready
        await acceptPending();

        const rows = getRows();
        const occupied = new Set<QueueKind>();
        for (const row of rows) {
            if (row.kind && row.state === "running") occupied.add(row.kind);
        }
        for (const id of startingIds) {
            const row = rows.find((entry) => entry.entry.questId === id);
            if (row?.kind) occupied.add(row.kind);
        }

        // Each lane gets its own next quest. A running/blocked game never stops
        // the first video, and vice versa; entries still wait their own turn.
        for (const kind of ["video", "game"] as const) {
            if (occupied.has(kind)) continue;
            const next = pickNextOfKind(rows, kind);
            if (!next?.kind) continue;
            hadWork = true;
            startQueued(next);
            occupied.add(kind);
        }

        const remaining = getRows();
        if (hadWork && remaining.length === 0 && !isAnyRunning() && startingIds.size === 0) {
            hadWork = false;
            notify("All done", "The queue is empty.", "success");
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
    startingIds.clear();
    startingLanes.clear();
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
        debugLog(`${LOG_PREFIX} Unqueued ${name}`);
        return;
    }
    addToQueue(questId);
    debugLog(`${LOG_PREFIX} Queued ${name}`);
}
