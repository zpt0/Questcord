import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { activeQuests } from "../state";
import {
    findStalledQuests,
    checkStallsOnce,
    resetStallRestartCounts,
    DEFAULT_STALL_TIMEOUT_MS,
} from "../watchdog";
import { QuestData } from "../types";

vi.mock("../stores", () => ({
    QuestsStore: { getQuest: vi.fn() },
}));

vi.mock("../../ui/notifications", () => ({
    notify: vi.fn(),
}));

import { QuestsStore } from "../stores";
import { notify } from "../../ui/notifications";

function addQuest(overrides: Partial<QuestData> = {}): QuestData {
    const data: QuestData = {
        questId: "q1",
        userId: "u1",
        taskType: "WATCH_VIDEO",
        isProcessing: true,
        timeoutIds: [],
        intervalIds: [],
        lastProgress: 10,
        targetProgress: 100,
        lastProgressAt: Date.now(),
        stallWarned: false,
        ...overrides,
    };
    activeQuests.set(`${data.questId}:${data.userId}`, data);
    return data;
}

describe("findStalledQuests", () => {
    beforeEach(() => {
        activeQuests.clear();
        vi.clearAllMocks();
    });

    afterEach(() => {
        activeQuests.clear();
    });

    it("reports nothing for fresh quests", () => {
        addQuest({ lastProgressAt: Date.now() });
        expect(findStalledQuests()).toHaveLength(0);
    });

    it("flags quests idle longer than the timeout", () => {
        addQuest({ lastProgressAt: Date.now() - DEFAULT_STALL_TIMEOUT_MS - 1000 });
        (QuestsStore.getQuest as any).mockReturnValue({ userStatus: {} });
        const stalled = findStalledQuests();
        expect(stalled).toHaveLength(1);
        expect(stalled[0].questId).toBe("q1");
        expect(stalled[0].stillOpen).toBe(true);
    });

    it("skips already-warned quests", () => {
        addQuest({
            lastProgressAt: Date.now() - DEFAULT_STALL_TIMEOUT_MS - 1000,
            stallWarned: true,
        });
        expect(findStalledQuests()).toHaveLength(0);
    });

    it("skips non-processing and completed quests", () => {
        addQuest({
            lastProgressAt: Date.now() - DEFAULT_STALL_TIMEOUT_MS - 1000,
            isProcessing: false,
        });
        addQuest({
            questId: "q2",
            lastProgressAt: Date.now() - DEFAULT_STALL_TIMEOUT_MS - 1000,
            lastProgress: 100,
        });
        expect(findStalledQuests()).toHaveLength(0);
    });

    it("skips quests completed on the server", () => {
        addQuest({ lastProgressAt: Date.now() - DEFAULT_STALL_TIMEOUT_MS - 1000 });
        (QuestsStore.getQuest as any).mockReturnValue({
            userStatus: { completedAt: "2026-01-01" },
        });
        expect(findStalledQuests()).toHaveLength(0);
    });

    it("checkStallsOnce notifies and marks warned", () => {
        addQuest({ lastProgressAt: Date.now() - DEFAULT_STALL_TIMEOUT_MS - 1000 });
        (QuestsStore.getQuest as any).mockReturnValue({ userStatus: {} });
        expect(checkStallsOnce()).toBe(1);
        expect(notify).toHaveBeenCalledOnce();
        expect(findStalledQuests()).toHaveLength(0);
    });

    it("restarts stalled quest once when enabled, then only notifies", () => {
        resetStallRestartCounts();
        const quest = addQuest({
            lastProgressAt: Date.now() - DEFAULT_STALL_TIMEOUT_MS - 1000,
        });
        (QuestsStore.getQuest as any).mockReturnValue({ userStatus: {} });
        const onRestart = vi.fn();
        const options = { shouldAutoRestart: () => true, onRestart };
        expect(checkStallsOnce(DEFAULT_STALL_TIMEOUT_MS, options)).toBe(1);
        expect(onRestart).toHaveBeenCalledTimes(1);
        expect(onRestart).toHaveBeenCalledWith("q1");
        expect(notify).toHaveBeenCalledWith("Restarting Quest", expect.any(String), "info", "q1");
        // Simulate a fresh entry after the restart stalling again: no second restart.
        quest.stallWarned = false;
        quest.lastProgressAt = Date.now() - DEFAULT_STALL_TIMEOUT_MS - 1000;
        expect(checkStallsOnce(DEFAULT_STALL_TIMEOUT_MS, options)).toBe(1);
        expect(onRestart).toHaveBeenCalledTimes(1);
        expect(notify).toHaveBeenCalledWith("Quest Stalled?", expect.any(String), "error", "q1");
    });

    it("only notifies when auto-restart is disabled", () => {
        resetStallRestartCounts();
        addQuest({ lastProgressAt: Date.now() - DEFAULT_STALL_TIMEOUT_MS - 1000 });
        (QuestsStore.getQuest as any).mockReturnValue({ userStatus: {} });
        const onRestart = vi.fn();
        expect(
            checkStallsOnce(DEFAULT_STALL_TIMEOUT_MS, {
                shouldAutoRestart: () => false,
                onRestart,
            })
        ).toBe(1);
        expect(onRestart).not.toHaveBeenCalled();
        expect(notify).toHaveBeenCalledWith("Quest Stalled?", expect.any(String), "error", "q1");
    });
});
