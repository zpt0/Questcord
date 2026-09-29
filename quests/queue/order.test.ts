import { describe, it, expect } from "vitest";
import {
    describeEntry,
    isExpired,
    isQueueable,
    kindOf,
    pickNext,
    pickToAccept,
    pickTask,
    sortRows,
    type QueueRow,
} from "./order";
import type { Quest } from "../../core/types";

function makeQuest(overrides: Partial<Quest> = {}): Quest {
    return {
        id: "1",
        config: {
            taskConfig: { tasks: { WATCH_VIDEO: { target: 10 } } },
            expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        },
        userStatus: { enrolledAt: new Date().toISOString() },
        ...overrides,
    } as Quest;
}

describe("queue/order", () => {
    it("picks task and kind", () => {
        const quest = makeQuest();
        expect(pickTask(quest)).toBe("WATCH_VIDEO");
        expect(kindOf("WATCH_VIDEO")).toBe("video");
        expect(kindOf("PLAY_ON_DESKTOP")).toBe("game");
    });

    it("rejects completed/expired/taskless quests", () => {
        expect(isQueueable(makeQuest())).toBe(true);
        expect(
            isQueueable(makeQuest({ userStatus: { completedAt: new Date().toISOString() } }))
        ).toBe(false);
        expect(
            isQueueable(
                makeQuest({
                    config: {
                        taskConfig: { tasks: { WATCH_VIDEO: { target: 1 } } },
                        expiresAt: new Date(Date.now() - 1000).toISOString(),
                    },
                })
            )
        ).toBe(false);
        expect(isQueueable(makeQuest({ config: {} } as Partial<Quest>))).toBe(false);
    });

    it("classifies row states", () => {
        const entry = { questId: "1", addedAt: 1 };
        expect(describeEntry(entry, makeQuest(), true).state).toBe("running");
        expect(describeEntry(entry, undefined, false).state).toBe("unavailable");
        expect(describeEntry(entry, makeQuest({ userStatus: {} }), false).state).toBe(
            "needs-accept"
        );
        expect(describeEntry(entry, makeQuest(), false).state).toBe("ready");
    });

    it("prefers configured kind then FIFO", () => {
        const video = describeEntry({ questId: "v", addedAt: 2 }, makeQuest({ id: "v" }), false);
        const game = describeEntry(
            { questId: "g", addedAt: 1 },
            makeQuest({
                id: "g",
                config: {
                    taskConfig: { tasks: { PLAY_ON_DESKTOP: { target: 5 } } },
                    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
                },
                userStatus: { enrolledAt: new Date().toISOString() },
            }),
            false
        );
        const rows: QueueRow[] = [video, game];
        expect(sortRows(rows, "videos")[0].entry.questId).toBe("v");
        expect(sortRows(rows, "games")[0].entry.questId).toBe("g");
        expect(pickNext(rows, "videos")?.entry.questId).toBe("v");
    });

    it("picks unenrolled quests for accept", () => {
        const unenrolled = describeEntry(
            { questId: "u", addedAt: 1 },
            makeQuest({ id: "u", userStatus: {} }),
            false
        );
        const enrolled = describeEntry({ questId: "e", addedAt: 0 }, makeQuest({ id: "e" }), false);
        expect(pickToAccept([unenrolled, enrolled], "videos")?.entry.questId).toBe("u");
        expect(isExpired(makeQuest(), Date.now())).toBe(false);
    });
});
