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

import { describe, expect, it } from "vitest";

import {
    describeEntry,
    kindOf,
    isCompleted,
    isEnrolled,
    isExpired,
    isQueueable,
    pickTask,
    sortRows,
} from "./order";

function makeQuest(
    overrides: Partial<{
        id: string;
        userStatus?: { completedAt?: string; enrolledAt?: string };
        config?: { expiresAt?: string; taskConfig?: { tasks: Record<string, { target: number }> } };
    }> = {}
) {
    return {
        id: overrides.id ?? "q1",
        userStatus: overrides.userStatus ?? {},
        config: overrides.config ?? {
            taskConfig: { tasks: { WATCH_VIDEO: { target: 100 } } },
        },
    } as any;
}

function makeVideoQuest(id: string, addedAt: number) {
    return describeEntry(
        { questId: id, addedAt },
        makeQuest({ id, config: { taskConfig: { tasks: { WATCH_VIDEO: { target: 100 } } } } }),
        false
    );
}

function makeGameQuest(id: string, addedAt: number) {
    return describeEntry(
        { questId: id, addedAt },
        makeQuest({ id, config: { taskConfig: { tasks: { PLAY_ON_DESKTOP: { target: 100 } } } } }),
        false
    );
}

describe("queue/order", () => {
    it("sortRows puts running quests first, then alternates video/game", () => {
        const rows = [
            makeVideoQuest("v1", 1),
            makeGameQuest("g1", 2),
            describeEntry({ questId: "running1", addedAt: 3 }, makeQuest({ id: "running1" }), true),
            makeVideoQuest("v2", 4),
            makeGameQuest("g2", 5),
        ];
        const sorted = sortRows(rows);
        // running first, then alternating video/game
        expect(sorted.map((r) => r.entry.questId)).toEqual(["running1", "v1", "g1", "v2", "g2"]);
    });

    it("sortRows alternates starting with video", () => {
        const rows = [
            makeGameQuest("g1", 1),
            makeVideoQuest("v1", 2),
            makeGameQuest("g2", 3),
            makeVideoQuest("v2", 4),
        ];
        const sorted = sortRows(rows);
        // alternates: first video, then game, then video, then game
        // v1 comes before g1 because video alternation starts first
        expect(sorted.map((r) => r.entry.questId)).toEqual(["v1", "g1", "v2", "g2"]);
    });

    it("sortRows handles only videos or only games", () => {
        const videoRows = [makeVideoQuest("v1", 1), makeVideoQuest("v2", 2)];
        expect(sortRows(videoRows).map((r) => r.entry.questId)).toEqual(["v1", "v2"]);

        const gameRows = [makeGameQuest("g1", 1), makeGameQuest("g2", 2)];
        expect(sortRows(gameRows).map((r) => r.entry.questId)).toEqual(["g1", "g2"]);
    });

    it("pickTask returns first matching task type", () => {
        const quest = makeQuest({
            config: {
                taskConfig: {
                    tasks: { STREAM_ON_DESKTOP: { target: 100 }, WATCH_VIDEO: { target: 50 } },
                },
            },
        });
        // ALL_TASK_TYPES order: VIDEO tasks first, so WATCH_VIDEO wins
        expect(pickTask(quest)).toBe("WATCH_VIDEO");
    });

    it("pickTask returns null when no tasks", () => {
        expect(pickTask(makeQuest({ config: { taskConfig: { tasks: {} } } }))).toBeNull();
        expect(pickTask(makeQuest({ config: {} }))).toBeNull();
    });

    it("isCompleted checks userStatus.completedAt", () => {
        expect(isCompleted(makeQuest({ userStatus: { completedAt: "2026-01-01" } }))).toBe(true);
        expect(isCompleted(makeQuest({ userStatus: {} }))).toBe(false);
    });

    it("isEnrolled checks userStatus.enrolledAt", () => {
        expect(isEnrolled(makeQuest({ userStatus: { enrolledAt: "2026-01-01" } }))).toBe(true);
        expect(isEnrolled(makeQuest({ userStatus: {} }))).toBe(false);
    });

    it("isExpired checks config.expiresAt", () => {
        const past = new Date(Date.now() - 1000).toISOString();
        const future = new Date(Date.now() + 10000).toISOString();
        expect(isExpired(makeQuest({ config: { expiresAt: past } }))).toBe(true);
        expect(isExpired(makeQuest({ config: { expiresAt: future } }))).toBe(false);
        expect(isExpired(makeQuest({ config: {} }))).toBe(false);
    });

    it("isQueueable checks task, completed, expired", () => {
        expect(isQueueable(makeQuest())).toBe(true);
        expect(isQueueable(makeQuest({ userStatus: { completedAt: "2026-01-01" } }))).toBe(false);
        expect(isQueueable(undefined)).toBe(false);
    });

    it("kindOf maps video tasks correctly", () => {
        expect(kindOf("WATCH_VIDEO" as any)).toBe("video");
        expect(kindOf("PLAY_ON_DESKTOP" as any)).toBe("game");
    });
});
