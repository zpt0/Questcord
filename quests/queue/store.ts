/*!
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
import { LOG_PREFIX, QUEUE_ENABLED_KEY, QUEUE_KEY } from "../../constants";
import { getOwner, keyFor, loadOwned } from "../../core/account";
import { debugLog } from "../../core/state";
import { settings } from "../../settings";
import type { QueueEntry } from "./order";

let entries: readonly QueueEntry[] = [];
let enabled = true;
let version = 0;
const listeners = new Set<() => void>();
const accepting = new Set<string>();

function changed() {
    version++;
    listeners.forEach((l) => {
        try {
            l();
        } catch (e) {
            debugLog(`${LOG_PREFIX} Queue listener error:`, e);
        }
    });
}

function persist() {
    const key = keyFor(QUEUE_KEY);
    if (!key) return;
    DataStore.set(key, entries).catch((e) => debugLog(`${LOG_PREFIX} Queue save failed:`, e));
}

function persistEnabled() {
    const key = keyFor(QUEUE_ENABLED_KEY);
    if (!key) return;
    DataStore.set(key, enabled).catch((e) =>
        debugLog(`${LOG_PREFIX} Queue enabled save failed:`, e)
    );
}

const isEntry = (v: unknown): v is QueueEntry =>
    typeof (v as QueueEntry)?.questId === "string" &&
    typeof (v as QueueEntry)?.addedAt === "number";

export async function loadQueue() {
    const loadedFor = getOwner();
    let loadedEntries: readonly QueueEntry[] = [];
    let loadedEnabled = settings.store.queueEnabled !== false;
    try {
        const saved = await loadOwned<unknown>(QUEUE_KEY);
        loadedEntries = Array.isArray(saved) ? saved.filter(isEntry) : [];
        const savedEnabled = await loadOwned<boolean>(QUEUE_ENABLED_KEY);
        if (typeof savedEnabled === "boolean") loadedEnabled = savedEnabled;
    } catch (e) {
        debugLog(`${LOG_PREFIX} Queue load failed:`, e);
    }
    if (getOwner() !== loadedFor) return;
    entries = loadedEntries;
    enabled = loadedEnabled;
    changed();
}

export function unloadQueue() {
    entries = [];
    enabled = true;
    accepting.clear();
    changed();
}

export const isQueueEnabled = () => enabled;

export function setQueueEnabled(value: boolean) {
    if (enabled === value) return;
    enabled = value;
    try {
        (settings.store as { queueEnabled?: boolean }).queueEnabled = value;
    } catch {}
    persistEnabled();
    changed();
}

export const isAccepting = (questId: string) => accepting.has(questId);

export function setAccepting(questId: string, value: boolean) {
    if (accepting.has(questId) === value) return;
    if (value) accepting.add(questId);
    else accepting.delete(questId);
    changed();
}

export function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export const getVersion = () => version;
export const getEntries = () => entries;
export const isQueued = (questId: string) => entries.some((e) => e.questId === questId);

export function addToQueue(questId: string): boolean {
    if (!questId || isQueued(questId)) return false;
    entries = [...entries, { questId, addedAt: Date.now() }];
    persist();
    changed();
    return true;
}

export function removeFromQueue(questId: string): boolean {
    if (!isQueued(questId)) return false;
    entries = entries.filter((e) => e.questId !== questId);
    persist();
    changed();
    return true;
}

export function clearQueue() {
    if (entries.length === 0) return;
    entries = [];
    persist();
    changed();
}
