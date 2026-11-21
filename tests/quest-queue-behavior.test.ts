import { describe, expect, it } from "vitest";

import type { Quest } from "../core/types";
import { checkTaskCapacity } from "../quests/taskCapacity";
import { describeEntry, pickNextOfKind, sortRows, type QueueRow } from "../quests/queue/order";

function quest(id: string, taskType: string, expiresAt: string): Quest {
    return {
        id,
        config: {
            expiresAt,
            taskConfig: {
                tasks: {
                    [taskType]: { target: 1 },
                },
            },
        },
        userStatus: { enrolledAt: "2026-01-01T00:00:00.000Z" },
    } as Quest;
}

function row(id: string, taskType: string, expiresAt: string, addedAt: number): QueueRow {
    const q = quest(id, taskType, expiresAt);
    return describeEntry({ questId: id, addedAt }, q, false);
}

describe("Questcord queue ordering and lane capacity", () => {
    it("sorts each lane by expiry, then alternates video and game", () => {
        const rows = [
            row("video-late", "WATCH_VIDEO", "2027-12-31T00:00:00.000Z", 1),
            row("game-late", "PLAY_ON_DESKTOP", "2027-12-31T00:00:00.000Z", 2),
            row("video-soon", "WATCH_VIDEO", "2027-01-02T00:00:00.000Z", 3),
            row("game-soon", "PLAY_ON_DESKTOP", "2027-01-01T00:00:00.000Z", 4),
        ];

        expect(sortRows(rows).map((entry) => entry.entry.questId)).toEqual([
            "video-soon",
            "game-soon",
            "video-late",
            "game-late",
        ]);
    });

    it("picks the soonest-expiring quest inside the requested lane", () => {
        const rows = [
            row("video-late", "WATCH_VIDEO", "2027-12-31T00:00:00.000Z", 1),
            row("game-soon", "PLAY_ON_DESKTOP", "2027-01-01T00:00:00.000Z", 2),
            row("video-soon", "WATCH_VIDEO", "2027-01-02T00:00:00.000Z", 3),
        ];

        expect(pickNextOfKind(rows, "video")?.entry.questId).toBe("video-soon");
        expect(pickNextOfKind(rows, "game")?.entry.questId).toBe("game-soon");
    });

    it("allows one game and one video, but blocks a second quest in the same lane", () => {
        const oneVideo = [{ questId: "v1", taskType: "WATCH_VIDEO" }];
        const oneGame = [{ questId: "g1", taskType: "PLAY_ON_DESKTOP" }];

        expect(checkTaskCapacity("PLAY_ON_DESKTOP", oneVideo, { game: 1, video: 1 })).toEqual({
            canRun: true,
            conflictQuestId: null,
        });
        expect(checkTaskCapacity("WATCH_VIDEO", oneGame, { game: 1, video: 1 })).toEqual({
            canRun: true,
            conflictQuestId: null,
        });
        expect(checkTaskCapacity("WATCH_VIDEO", oneVideo, { game: 1, video: 1 })).toEqual({
            canRun: false,
            conflictQuestId: "v1",
        });
        expect(checkTaskCapacity("PLAY_ON_DESKTOP", oneGame, { game: 1, video: 1 })).toEqual({
            canRun: false,
            conflictQuestId: "g1",
        });
    });

    it("respects a raised video limit without changing the game limit", () => {
        const oneVideo = [{ questId: "v1", taskType: "WATCH_VIDEO" }];

        expect(checkTaskCapacity("WATCH_VIDEO", oneVideo, { game: 1, video: 2 })).toEqual({
            canRun: true,
            conflictQuestId: null,
        });
        expect(checkTaskCapacity("PLAY_ON_DESKTOP", oneVideo, { game: 1, video: 2 })).toEqual({
            canRun: true,
            conflictQuestId: null,
        });
    });
});
