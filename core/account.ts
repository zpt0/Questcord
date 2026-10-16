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
import { questsLoaded } from "./stores";

let owner: string | null = null;
let questsState: "loading" | "loaded" | "check" = "loading";

export const getOwner = () => owner;

export function setOwner(id: string | null, opts: { storeMayBeLoaded?: boolean } = {}) {
    owner = id;
    questsState = opts.storeMayBeLoaded ? "check" : "loading";
}

export function markQuestsLoaded() {
    if (owner != null) questsState = "loaded";
}

export function accountReady(): boolean {
    if (owner == null) return false;
    if (questsState === "check" && questsLoaded()) questsState = "loaded";
    return questsState === "loaded";
}

export const keyFor = (base: string): string | null => (owner == null ? null : `${base}:${owner}`);

export async function loadOwned<T>(base: string): Promise<T | undefined> {
    const key = keyFor(base);
    if (!key) return undefined;
    const owned = await DataStore.get<T>(key);
    if (owned !== undefined) return owned;

    const legacy = await DataStore.get<T>(base);
    // owner can switch across the await; re-check before migrating legacy data
    if (legacy === undefined || keyFor(base) !== key) return undefined;
    try {
        await DataStore.set(key, legacy);
        await DataStore.del(base);
    } catch {}
    return legacy;
}

export async function saveOwned(base: string, value: unknown): Promise<void> {
    const key = keyFor(base);
    if (!key) return;
    await DataStore.set(key, value);
}

export function resetAccountState() {
    owner = null;
    questsState = "loading";
}
