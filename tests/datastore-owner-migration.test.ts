import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@api/index", () => {
    const mem = new Map<string, unknown>();
    const delCalls: string[] = [];
    return {
        DataStore: {
            get: async (key: string) => mem.get(key),
            set: async (key: string, value: unknown) => {
                mem.set(key, value);
            },
            del: async (key: string) => {
                delCalls.push(key);
                mem.delete(key);
            },
            delete: async (key: string) => {
                delCalls.push(key);
                mem.delete(key);
            },
        },
        __mem: mem,
        __delCalls: delCalls,
    };
});

vi.mock("../core/stores", () => ({
    questsLoaded: () => true,
}));

import { loadOwned, resetAccountState, setOwner } from "../core/account";

beforeEach(() => {
    resetAccountState();
});

describe("Questcord owner-scoped DataStore compatibility", () => {
    it("migrates legacy queue data to the owner key and deletes the unscoped key", async () => {
        const { DataStore, __mem, __delCalls } = (await import("@api/index")) as any;
        const legacyQueue = [{ questId: "123", addedAt: 1 }];
        await DataStore.set("questcord-queue", legacyQueue);
        setOwner("456789");

        const loaded = await loadOwned<typeof legacyQueue>("questcord-queue");

        expect(loaded).toEqual(legacyQueue);
        expect(__mem.get("questcord-queue:456789")).toEqual(legacyQueue);
        expect(__mem.has("questcord-queue")).toBe(false);
        expect(__delCalls).toContain("questcord-queue");
    });

    it("does not migrate when the owner changes during the read", async () => {
        const { DataStore, __mem, __delCalls } = (await import("@api/index")) as any;
        __delCalls.length = 0;
        const legacyState = [{ questId: "q", taskType: "WATCH_VIDEO", startedAt: 1 }];
        await DataStore.set("questcord-active-quests", legacyState);
        setOwner("owner-a");

        const pending = loadOwned("questcord-active-quests");
        setOwner("owner-b");
        const loaded = await pending;

        expect(loaded).toBeUndefined();
        expect(__mem.has("questcord-active-quests")).toBe(true);
        expect(__delCalls).not.toContain("questcord-active-quests");
    });
});
