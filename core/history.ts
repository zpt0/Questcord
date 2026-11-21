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

import { DataStore } from "@api/index";
import { keyFor, loadOwned } from "./account";
import { createScopedLogger } from "../foundation/core/logging";
import { hasTimestamp } from "./questLogic";

const log = createScopedLogger("core/history");

const COUNT_KEY = "questcord-completed-count";
const HISTORY_KEY = "questcord-completed-history";
const HISTORY_MAX = 50;
const MAX_STORED_COUNT = 1_000_000;

export interface HistoryEntry {
    questId: string;
    questName: string;
    completedAt: number;
}

export interface QuestStats {
    count: number;
    history: HistoryEntry[];
}

const listeners = new Set<() => void>();
let cache: QuestStats = { count: 0, history: [] };
let loaded = false;
let writeTail: Promise<void> = Promise.resolve();

function sanitizeCount(value: unknown): number {
    const count = typeof value === "number" && Number.isFinite(value) ? value : 0;
    return Math.min(MAX_STORED_COUNT, Math.max(0, Math.floor(count)));
}

function isSnowflake(value: unknown): value is string {
    return typeof value === "string" && /^\d{5,32}$/.test(value);
}

function sanitizeHistory(value: unknown): HistoryEntry[] {
    if (!Array.isArray(value)) return [];
    const history: HistoryEntry[] = [];
    const seen = new Set<string>();
    const now = Date.now();

    for (const raw of value.slice(0, HISTORY_MAX * 4)) {
        if (!raw || typeof raw !== "object") continue;
        const entry = raw as Record<string, unknown>;
        const name =
            typeof entry.questName === "string" ? entry.questName.trim().slice(0, 200) : "";
        const completedAt = entry.completedAt;
        const questId = isSnowflake(entry.questId) ? entry.questId : null;

        if (
            !name ||
            typeof completedAt !== "number" ||
            !Number.isFinite(completedAt) ||
            completedAt <= 0 ||
            completedAt > now + 5 * 60_000
        ) {
            continue;
        }
        if (questId && seen.has(questId)) continue;
        if (questId) seen.add(questId);

        history.push({
            questId: questId ?? "",
            questName: name,
            completedAt: Math.floor(completedAt),
        });
        if (history.length >= HISTORY_MAX) break;
    }
    return history;
}

function emit() {
    listeners.forEach((l) => {
        try {
            l();
        } catch {}
    });
}

export function subscribeStats(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function getStats(): QuestStats {
    return cache;
}

export async function loadStats(): Promise<void> {
    try {
        const [rawCount, rawHistory] = await Promise.all([
            loadOwned<unknown>(COUNT_KEY),
            loadOwned<unknown>(HISTORY_KEY),
        ]);
        cache = { count: sanitizeCount(rawCount), history: sanitizeHistory(rawHistory) };
        loaded = true;
        emit();
    } catch (e) {
        log.warn("Failed to load stats:", e);
    }
}

export function resetStatsLoaded(): void {
    loaded = false;
    cache = { count: 0, history: [] };
    emit();
}

function serializeWrite<T>(operation: () => Promise<T>): Promise<T> {
    const result = writeTail.then(operation, operation);
    writeTail = result.then(
        () => undefined,
        () => undefined
    );
    return result;
}

async function persist(): Promise<void> {
    const key = keyFor(COUNT_KEY);
    const historyKey = keyFor(HISTORY_KEY);
    if (!key || !historyKey) return;
    await Promise.all([DataStore.set(key, cache.count), DataStore.set(historyKey, cache.history)]);
}

/** Records a confirmed completion. A quest ID is counted only once. */
export async function recordCompletion(questId: string, questName: string): Promise<void> {
    if (!loaded) await loadStats();
    if (!questId || !questName) return;
    if (cache.history.some((entry) => entry.questId === questId)) return;

    await serializeWrite(async () => {
        cache = {
            count: Math.min(MAX_STORED_COUNT, cache.count + 1),
            history: [
                {
                    questId,
                    questName: questName.slice(0, 200),
                    completedAt: Date.now(),
                },
                ...cache.history,
            ].slice(0, HISTORY_MAX),
        };
        try {
            await persist();
        } catch (e) {
            log.warn("Failed to persist stats:", e);
        }
        emit();
    });
}

export async function resetStats(): Promise<void> {
    await serializeWrite(async () => {
        cache = { count: 0, history: [] };
        try {
            await persist();
        } catch (e) {
            log.warn("Failed to reset stats:", e);
        }
        emit();
    });
}

/** Returns true if a completion was already recorded for this quest. */
export function isRecorded(questId: string): boolean {
    return cache.history.some((entry) => entry.questId === questId);
}

export function isCompletedInStore(quest: unknown): boolean {
    if (!quest || typeof quest !== "object") return false;
    const status = (quest as Record<string, unknown>).userStatus;
    if (!status || typeof status !== "object") return false;
    return hasTimestamp((status as Record<string, unknown>).completedAt);
}
