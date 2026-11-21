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
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { settings } from "../settings";
import { QuestsStore } from "../core/stores";
import { getQuestName, type Quest } from "../core/types";
import { createScopedLogger } from "../foundation/core/logging";
import { addToQueue, isQueued } from "./queue/store";
import { isQueueable } from "./queue/order";
import { isEnrollmentRequested, resetEnrollmentMemory } from "./enrollmentMemory";
import { scheduleTick } from "./queue/runner";
import { acceptQuestById } from "./manager";
import { notify } from "../ui/notifications";
import { saveOwned, loadOwned } from "../core/account";
import { calculateRetryDelay, hasTimestamp } from "../core/questLogic";

const log = createScopedLogger("quests/autoEnroll");

const RETRIES_KEY = "questcord-enroll-retries";
const BLOCKED_KEY = "questcord-enroll-blocked";
const SCAN_INTERVAL_MS = 60_000;
const ACTION_DELAY_MS = 750;

interface RetryEntry {
    failures: number;
    retryAt: number;
}

let retries: Record<string, RetryEntry> = {};
let blocked: string[] = [];
let running = false;
let generation = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let loaded = false;

function enabled(): boolean {
    return (settings.store as { autoEnrollQuests?: boolean }).autoEnrollQuests === true;
}

async function load(): Promise<void> {
    if (loaded) return;
    try {
        const [savedRetries, savedBlocked] = await Promise.all([
            loadOwned<Record<string, RetryEntry>>(RETRIES_KEY),
            loadOwned<string[]>(BLOCKED_KEY),
        ]);
        retries = savedRetries && typeof savedRetries === "object" ? savedRetries : {};
        blocked = Array.isArray(savedBlocked) ? savedBlocked : [];
    } catch {
        retries = {};
        blocked = [];
    }
    loaded = true;
}

function isBlocked(id: string): boolean {
    return blocked.includes(id);
}

function ready(id: string): boolean {
    const retry = retries[id];
    return !retry || retry.retryAt <= Date.now();
}

function markRetry(id: string): void {
    const failures = Math.min(10, (retries[id]?.failures ?? 0) + 1);
    retries[id] = {
        failures,
        retryAt: Date.now() + calculateRetryDelay(failures, 60_000, 15 * 60_000),
    };
    void saveOwned(RETRIES_KEY, retries);
}

function clearRetry(id: string): void {
    if (!retries[id]) return;
    delete retries[id];
    void saveOwned(RETRIES_KEY, retries);
}

function block(id: string): void {
    if (!blocked.includes(id)) {
        blocked.push(id);
        void saveOwned(BLOCKED_KEY, blocked);
    }
    clearRetry(id);
}

function allQuests(): Quest[] {
    const store = QuestsStore;
    if (!store) return [];
    try {
        if (typeof store.getQuests === "function") {
            const result = store.getQuests();
            if (result instanceof Map) return [...result.values()] as Quest[];
            const list = Array.isArray(result)
                ? result
                : result && typeof result === "object"
                  ? Object.values(result as Record<string, unknown>)
                  : [];
            return list.filter((q): q is Quest => !!q && typeof (q as Quest).id === "string");
        }
        if (store.quests instanceof Map) return [...store.quests.values()] as Quest[];
    } catch {}
    return [];
}

function expiresAtOf(quest: Quest): number {
    const raw = quest.config?.expiresAt ?? quest.expiresAt;
    if (!hasTimestamp(raw)) return Number.POSITIVE_INFINITY;
    const value = new Date(raw as string | number | Date).getTime();
    return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function isQuestActive(quest: Quest, now = Date.now()): boolean {
    const expiresAt = expiresAtOf(quest);
    if (!Number.isFinite(expiresAt) || expiresAt <= now) return false;
    const startsAt = (quest.config as any)?.startsAt ?? (quest as any).startsAt;
    if (hasTimestamp(startsAt) && new Date(startsAt).getTime() > now) return false;
    return true;
}

/** Matches the reference plugin: only live, unfinished, runnable quests are enrolled. */
function isEnrollmentEligible(quest: Quest): boolean {
    return (
        (quest as any).preview !== true &&
        !isEnrollmentRequested(quest.id) &&
        !hasTimestamp(quest.userStatus?.enrolledAt) &&
        !hasTimestamp(quest.userStatus?.completedAt) &&
        isQuestActive(quest) &&
        isQueueable(quest)
    );
}

function enrollmentGloballyBlocked(): boolean {
    const until = QuestsStore?.questEnrollmentBlockedUntil;
    return hasTimestamp(until) && new Date(until).getTime() > Date.now();
}

/** Adds every eligible, unenrolled quest to Questcord's queue (manual queue path). */
export function enqueueEligibleQuests(): number {
    if (enrollmentGloballyBlocked()) return 0;

    let added = 0;
    for (const quest of allQuests()) {
        if (isQueued(quest.id) || isBlocked(quest.id) || !ready(quest.id)) continue;
        if (!isEnrollmentEligible(quest)) continue;
        addToQueue(quest.id);
        added++;
    }
    return added;
}

async function scan(current: number): Promise<void> {
    if (current !== generation || !enabled() || running) return;
    running = true;
    try {
        if (enrollmentGloballyBlocked()) return;

        const quests = allQuests()
            .filter(isEnrollmentEligible)
            .filter((quest) => !isQueued(quest.id) && !isBlocked(quest.id) && ready(quest.id))
            .sort((a, b) => expiresAtOf(a) - expiresAtOf(b));

        let enrolled = 0;
        for (const quest of quests) {
            if (current !== generation || !enabled()) return;
            if (enrollmentGloballyBlocked()) break;

            const result = await acceptQuestById(quest.id);
            if (current !== generation) return;

            if (result.ok) {
                handleEnrollResult(quest.id, true);
                // Enrolled first, so the queue runner sees a ready row and does not
                // send a second enrollment request.
                addToQueue(quest.id);
                scheduleTick();
                enrolled++;
                log.info(`Auto-enrolled in quest: ${getQuestName(quest)}`);
            } else {
                handleEnrollResult(quest.id, false, result.retryAt);
                if (
                    !result.retryAt &&
                    /not found|forbidden|expired|unavailable/i.test(result.reason ?? "")
                ) {
                    block(quest.id);
                }
                log.warn(
                    `Auto-enroll failed for ${getQuestName(quest)}: ${result.reason ?? "failed"}`
                );
            }

            await new Promise((r) => setTimeout(r, ACTION_DELAY_MS));
        }

        if (enrolled > 0) {
            notify("Auto-enrolled", `${enrolled} quest(s) accepted and queued.`, "success");
        }
    } finally {
        running = false;
    }
}

function runtimeGeneration(): number {
    return generation;
}

function schedule(current: number): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
        timer = null;
        if (current !== runtimeGeneration() || !enabled()) return;
        void scan(current).finally(() => schedule(current));
    }, SCAN_INTERVAL_MS);
}

export function startAutoEnroll(): void {
    if (timer) clearTimeout(timer);
    generation++;
    const current = generation;
    void load().then(() => {
        if (current !== generation) return;
        void scan(current).finally(() => {
            if (current === generation) schedule(current);
        });
    });
}

/** Re-scan when Discord refreshes its quest list without restarting the timer. */
export function refreshAutoEnroll(): void {
    if (!enabled()) return;
    if (!loaded) {
        startAutoEnroll();
        return;
    }
    void scan(generation);
}

export function stopAutoEnroll(): void {
    generation++;
    if (timer) clearTimeout(timer);
    timer = null;
    running = false;
}

/** Called when Discord's selected task platform changes for a quest. */
export function clearEnrollmentBlockForQuest(questId: string): void {
    const next = blocked.filter((id) => id !== questId);
    if (next.length !== blocked.length) {
        blocked = next;
        void saveOwned(BLOCKED_KEY, blocked);
    }
    clearRetry(questId);
}

export function handleEnrollResult(questId: string, ok: boolean, retryAt?: number): void {
    if (ok) {
        clearRetry(questId);
    } else if (retryAt) {
        retries[questId] = { failures: (retries[questId]?.failures ?? 0) + 1, retryAt };
        void saveOwned(RETRIES_KEY, retries);
    } else {
        markRetry(questId);
    }
}

export function resetAutoEnrollRuntime(): void {
    stopAutoEnroll();
    resetEnrollmentMemory();
    retries = {};
    blocked = [];
    loaded = false;
    void Promise.all([saveOwned(RETRIES_KEY, retries), saveOwned(BLOCKED_KEY, blocked)]);
}

export function manuallyEnqueue(questId: string): void {
    if (isQueued(questId)) {
        notify("Already queued", "This quest is already in the queue.", "info");
        return;
    }
    addToQueue(questId);
    notify("Added to queue", "Quest added to the Questcord queue.", "info");
}
