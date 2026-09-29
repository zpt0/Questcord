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
    // Migrate legacy global key once.
    const legacy = await DataStore.get<T>(base);
    if (legacy === undefined || keyFor(base) !== key) return undefined;
    try {
        await DataStore.set(key, legacy);
        await DataStore.del(base);
    } catch {
        // Best effort migration; return legacy value anyway.
    }
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
